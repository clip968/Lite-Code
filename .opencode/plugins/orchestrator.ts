import { parseTicketMeta, routeTicket, type WorkerRole } from "./routing.ts";
import { validateHistory } from "./state-machine.ts";

type RunStatus =
  | "STARTED"
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "BLOCKED"
  | "RECORDED";

interface RunLogEntry {
  runId: string;
  ticketId: string;
  parallel_group_id: string | null;
  parent_parallel_group_id: string | null;
  sibling_workers: string[];
  stage: string;
  command: string;
  agent: string;
  status: RunStatus;
  timestamp: string;
  summary: string;
  evidenceRef: string[];
  nextAction: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model: string;
  worker_role: string;
  handoff_count: number;
  scope_violation: boolean;
  first_pass: boolean;
  notes: Record<string, unknown>;
}

interface RunLogFile {
  schemaVersion: string;
  purpose: string;
  updatedAt: string;
  fields: Record<string, string>;
  allowedStatus: string[];
  entries: RunLogEntry[];
}

interface PluginContext {
  $?: {
    file(path: string): {
      text(): Promise<string>;
      write(content: string): Promise<void>;
    };
  };
}

const STATE_PATH = ".opencode/state/run-log.json";
const TICKETS_PATH = ".opencode/state/tickets.json";
const REQUIRED_PACKET_FIELDS = [
  "packet_version",
  "request_id",
  "schema_version",
  "run_id",
  "ticket_id",
  "worker_role",
  "goal",
  "allowed_files",
  "constraints",
  "acceptance_criteria",
  "non_scope",
  "risk_level",
] as const;

const COMMAND_STATUS_MAP: Record<string, RunStatus> = {
  "/lite-triage": "PASS",
  "/lite-implement": "PASS",
  "/lite-verify": "PASS",
  "/lite-fix": "PASS",
  "/lite-review": "APPROVED",
};

function nowIso() {
  return new Date().toISOString();
}

function randomId(len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function detectCommand(args?: Record<string, unknown>) {
  const cmd = typeof args?.command === "string" ? args.command : "";
  return cmd || "unknown";
}

function detectTicketId(args?: Record<string, unknown>) {
  const prompt = typeof args?.prompt === "string" ? args.prompt : "";
  const match = prompt.match(/\bT-(?:FIX-)?\d+\b/i);
  return match?.[0]?.toUpperCase() ?? "UNKNOWN";
}

function detectStage(command: string) {
  if (command === "/lite-auto") return "stage5-lite";
  if (command === "/lite-verify" || command === "/lite-fix") return "stage2";
  if (command === "/lite-triage" || command === "/lite-implement" || command === "/lite-review") {
    return "stage1";
  }
  return "unknown";
}

function detectAgent(command: string) {
  switch (command) {
    case "/lite-triage":
      return "plan";
    case "/lite-implement":
      return "build";
    case "/lite-verify":
      return "tester";
    case "/lite-fix":
      return "fixer";
    case "/lite-review":
      return "reviewer";
    case "/lite-auto":
      return "manager";
    default:
      return "unknown";
  }
}

function terminalStatusForCommand(command: string): RunStatus {
  if (command === "/lite-auto") return "RECORDED";
  return COMMAND_STATUS_MAP[command] || "PASS";
}

function parseJsonPacketFromPrompt(prompt: string): { packet?: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const block = prompt.match(/```json\s*([\s\S]*?)```/i);
  if (!block) return { errors: ["json_block_not_found"] };
  try {
    const packet = JSON.parse(block[1]) as Record<string, unknown>;
    for (const key of REQUIRED_PACKET_FIELDS) {
      if (!(key in packet)) errors.push(`missing_${key}`);
    }
    return { packet, errors };
  } catch {
    return { errors: ["json_parse_error"] };
  }
}

function makeEntry(command: string, args?: Record<string, unknown>): RunLogEntry {
  return {
    runId: `run-${new Date().toISOString().slice(0, 10)}-${randomId(6)}`,
    ticketId: detectTicketId(args),
    parallel_group_id: null,
    parent_parallel_group_id: null,
    sibling_workers: [],
    stage: detectStage(command),
    command,
    agent: detectAgent(command),
    status: "STARTED",
    timestamp: nowIso(),
    summary: typeof args?.summary === "string" ? args.summary : `Lifecycle record for ${command}`,
    evidenceRef: [],
    nextAction: null,
    tokens_input: 0,
    tokens_output: 0,
    cost_usd: 0,
    model: "unknown",
    worker_role: "unknown",
    handoff_count: 0,
    scope_violation: false,
    first_pass: false,
    notes: {
      source: "orchestrator-v2",
      softValidation: true,
    },
  };
}

function bootstrapLog(): RunLogFile {
  return {
    schemaVersion: "2.0.0",
    purpose: "Lite-Code orchestration run/event ledger with metric-ready fields.",
    updatedAt: nowIso(),
    fields: {
      runId: "Unique identifier for a workflow run",
      ticketId: "Target ticket ID",
      parallel_group_id: "Parallel execution group identifier (null when sequential)",
      parent_parallel_group_id: "Optional parent parallel group identifier",
      sibling_workers: "Expected sibling workers in the same parallel group",
      stage: "Workflow stage label",
      command: "Executed command",
      agent: "Effective agent used",
      status: "Result status",
      timestamp: "RFC3339 UTC timestamp",
      summary: "Short human-readable summary",
      evidenceRef: "Optional paths to artifacts",
      nextAction: "Recommended next command",
      tokens_input: "Step input token estimate",
      tokens_output: "Step output token estimate",
      cost_usd: "Step cost estimate",
      model: "Model used",
      worker_role: "Worker role for this step",
      handoff_count: "Cumulative handoff count",
      scope_violation: "Whether scope violation was observed",
      first_pass: "Whether ticket passed without fixer loop",
      notes: "Structured routing/validation diagnostics",
    },
    allowedStatus: ["STARTED", "PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "APPROVED", "CHANGES_REQUESTED", "BLOCKED", "RECORDED"],
    entries: [],
  };
}

export const OrchestratorPlugin = async (ctx: PluginContext) => {
  async function readRunLog() {
    const file = ctx.$?.file(STATE_PATH);
    if (!file) return bootstrapLog();
    try {
      const raw = await file.text();
      if (!raw.trim()) return bootstrapLog();
      return JSON.parse(raw) as RunLogFile;
    } catch {
      return bootstrapLog();
    }
  }

  async function validateStateMachine() {
    const file = ctx.$?.file(TICKETS_PATH);
    if (!file) return [];
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { tickets?: Array<{ id?: string; history?: Array<{ from?: string; to?: string }> }> };
      const errors: string[] = [];
      for (const t of parsed.tickets ?? []) errors.push(...validateHistory(t));
      return errors;
    } catch {
      return ["tickets_parse_error"];
    }
  }

  async function updateLifecycleStatus(args: Record<string, unknown> | undefined, status?: RunStatus) {
    if (!ctx.$) return;
    const command = detectCommand(args);
    if (!command.startsWith("/lite-")) return;

    const file = ctx.$.file(STATE_PATH);
    const parsed = await readRunLog();
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

    const prompt = typeof args?.prompt === "string" ? args.prompt : "";
    const { packet, errors } = parseJsonPacketFromPrompt(prompt);
    const packetRunId = typeof packet?.run_id === "string" ? packet.run_id : null;

    if (!status) {
      const entry = makeEntry(command, args);

      if (packet) {
        entry.runId = packetRunId ?? entry.runId;
        entry.ticketId = typeof packet.ticket_id === "string" ? packet.ticket_id : entry.ticketId;
        entry.worker_role = typeof packet.worker_role === "string" ? packet.worker_role : "unknown";
        entry.parallel_group_id = typeof packet.parallel_group_id === "string" ? packet.parallel_group_id : null;
        entry.parent_parallel_group_id =
          typeof packet.parent_parallel_group_id === "string" ? packet.parent_parallel_group_id : null;
        entry.sibling_workers = Array.isArray(packet.sibling_workers)
          ? packet.sibling_workers.filter((v): v is string => typeof v === "string")
          : [];
        entry.notes.parallelExecution = entry.parallel_group_id !== null;
      }
      if (errors.length > 0) {
        entry.notes.taskPacketValid = false;
        entry.notes.taskPacketErrors = errors;
      } else {
        entry.notes.taskPacketValid = true;
      }

      const meta = parseTicketMeta({ ...(args ?? {}), ...(packet ?? {}) });
      const expected = routeTicket(meta);
      const actualWorker =
        (typeof args?.agent === "string" ? args.agent : undefined) ??
        (typeof packet?.worker_role === "string" ? packet.worker_role : "unknown");
      entry.notes.routeReason = expected.reason;
      entry.notes.expectedRoute = expected.sequence;
      entry.notes.actualWorker = actualWorker;
      entry.notes.routeDeviation = !expected.sequence.includes(actualWorker as WorkerRole);

      const stateErrors = await validateStateMachine();
      if (stateErrors.length > 0) {
        entry.notes.illegalTransition = true;
        entry.notes.stateErrors = stateErrors;
      }

      entries.push(entry);
    } else {
      let updated = false;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const sameRun = packetRunId ? entries[i].runId === packetRunId : entries[i].command === command;
        if (sameRun && entries[i].status === "STARTED") {
          entries[i].status = status;
          entries[i].timestamp = nowIso();
          if (status === "FAIL" || status === "INSUFFICIENT_EVIDENCE") entries[i].nextAction = "/lite-fix";
          if (status === "CHANGES_REQUESTED") entries[i].nextAction = "/lite-implement";
          updated = true;
          break;
        }
      }
      if (!updated && packetRunId) {
        const entry = makeEntry(command, args);
        entry.runId = packetRunId;
        entry.status = status;
        entry.timestamp = nowIso();
        entry.notes.missingStartRecovered = true;
        if (packet) {
          entry.ticketId = typeof packet.ticket_id === "string" ? packet.ticket_id : entry.ticketId;
          entry.worker_role = typeof packet.worker_role === "string" ? packet.worker_role : entry.worker_role;
          entry.parallel_group_id = typeof packet.parallel_group_id === "string" ? packet.parallel_group_id : null;
          entry.parent_parallel_group_id =
            typeof packet.parent_parallel_group_id === "string" ? packet.parent_parallel_group_id : null;
          entry.sibling_workers = Array.isArray(packet.sibling_workers)
            ? packet.sibling_workers.filter((v): v is string => typeof v === "string")
            : [];
        }
        if (status === "FAIL" || status === "INSUFFICIENT_EVIDENCE") entry.nextAction = "/lite-fix";
        if (status === "CHANGES_REQUESTED") entry.nextAction = "/lite-implement";
        entries.push(entry);
      }
    }

    parsed.entries = entries;
    parsed.updatedAt = nowIso();
    await file.write(`${JSON.stringify(parsed, null, 2)}\n`);
  }

  return {
    "tool.execute.before": async (input: { tool?: string; args?: Record<string, unknown> }) => {
      if (input.tool !== "task") return;
      await updateLifecycleStatus(input.args);
    },
    "tool.execute.after": async (input: { tool?: string; args?: Record<string, unknown> }) => {
      if (input.tool !== "task") return;
      const command = detectCommand(input.args);
      await updateLifecycleStatus(input.args, terminalStatusForCommand(command));
    },
  };
};

export default OrchestratorPlugin;
