type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {}

/**
 * Run status values.
 * - RECORDED: Stage 5-lite `/lite-auto` manager turn ended without plugin-inferred PASS/FAIL
 *   (see stage5-lite-supervisor-implementation-spec §18.2)
 */
type RunStatus =
  | "STARTED"
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "BLOCKED"
  | "RECORDED";

interface RunLogEntry extends JsonObject {
  runId: string;
  ticketId: string;
  stage: string;
  command: string;
  agent: string;
  status: RunStatus;
  timestamp: string;
  summary: string;
  evidenceRef: JsonArray;
  nextAction: string | null;
  notes: JsonObject;
}

interface RunLogFile extends JsonObject {
  schemaVersion: string;
  purpose: string;
  updatedAt: string;
  fields: JsonObject;
  allowedStatus: JsonArray;
  entries: JsonArray;
}

interface PluginContext {
  project?: {
    root?: string;
    id?: string;
  };
  $?: {
    file(path: string): {
      text(): Promise<string>;
      write(content: string): Promise<void>;
      append(content: string): Promise<void>;
    };
    path(...parts: string[]): string;
  };
}

interface ToolBeforeInput {
  tool?: string;
  args?: Record<string, unknown>;
}

interface ToolBeforeOutput {
  args?: Record<string, unknown>;
}

interface ToolAfterInput {
  tool?: string;
  args?: Record<string, unknown>;
}

interface ToolAfterOutput {
  result?: unknown;
}

const STATE_PATH = ".opencode/state/run-log.json";

/** Terminal success statuses for manual /lite-* commands only. `/lite-auto` uses RECORDED. */
const COMMAND_STATUS_MAP: Record<string, RunStatus> = {
  "/lite-triage": "PASS",
  "/lite-implement": "PASS",
  "/lite-verify": "PASS",
  "/lite-fix": "PASS",
  "/lite-review": "APPROVED",
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function randomId(len = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function detectCommand(args?: Record<string, unknown>): string {
  const cmd = typeof args?.command === "string" ? args.command : "";
  return cmd || "unknown";
}

function detectStage(command: string, ticketId?: string): string {
  if (command === "/lite-auto") return "stage5-lite";
  if (command === "/lite-verify" || command === "/lite-fix") return "stage2";
  if (ticketId && ticketId.includes("FIX")) return "stage2";

  if (
    command === "/lite-triage" ||
    command === "/lite-implement" ||
    command === "/lite-review"
  ) {
    return ticketId && ticketId.includes("FIX") ? "stage2" : "stage1";
  }
  return "unknown";
}

function detectAgent(command: string): string {
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

function detectTicketId(args?: Record<string, unknown>): string {
  const prompt = typeof args?.prompt === "string" ? args.prompt : "";
  // Support T-101, T-601, T-FIX-1 formats
  const match = prompt.match(/\bT-(?:FIX-)?\d+\b/i);
  return match?.[0]?.toUpperCase() ?? "UNKNOWN";
}

function terminalStatusForCommand(command: string): RunStatus {
  if (command === "/lite-auto") return "RECORDED";
  return COMMAND_STATUS_MAP[command] || "PASS";
}

function makeEntry(
  command: string,
  args?: Record<string, unknown>,
): RunLogEntry {
  const ticketId = detectTicketId(args);
  const isAuto = command === "/lite-auto";

  return {
    runId: `run-${new Date().toISOString().slice(0, 10)}-${randomId(6)}`,
    ticketId,
    stage: detectStage(command, ticketId),
    command,
    agent: detectAgent(command),
    status: "STARTED",
    timestamp: nowIso(),
    summary: safeString(
      args?.summary,
      isAuto
        ? "Stage 5-lite /lite-auto manager turn started (no inferred worker outcomes)"
        : `Lifecycle record for ${command}`,
    ),
    evidenceRef: [],
    nextAction: isAuto
      ? null
      : command === "/lite-triage"
        ? "/lite-implement"
        : command === "/lite-implement"
          ? ticketId.includes("FIX")
            ? "/lite-verify"
            : "/lite-review"
          : command === "/lite-verify"
            ? "/lite-review"
            : command === "/lite-fix"
              ? "/lite-verify"
              : null,
    notes: isAuto
      ? {
          source: "thin-orchestrator-plugin",
          lightweight: true,
          mode: "auto",
          orchestratorPolicy:
            "no-fake-manual-command-success-for-auto; manager turn only",
          delegatedWorkers: [],
          routeReason: "",
          loopCount: 0,
          finalReviewMode: "",
          waitingForUser: false,
        }
      : {
          source: "thin-orchestrator-plugin",
          lightweight: true,
        },
  };
}

function bootstrapLog(): RunLogFile {
  return {
    schemaVersion: "1.1.0",
    purpose:
      "Lightweight orchestration run/event log for Stage 3 resume tracking; Stage 5-lite auto mode extensions in notes",
    updatedAt: nowIso(),
    fields: {
      runId: "Unique identifier for a workflow run",
      ticketId: "Target ticket ID",
      stage: "Workflow stage label",
      command: "Executed command",
      agent: "Effective agent used (manager for /lite-auto)",
      status: "Result status",
      timestamp: "RFC3339 UTC timestamp",
      summary: "Short human-readable summary",
      evidenceRef: "Optional paths to artifacts",
      nextAction: "Recommended next command",
      notes:
        "Structured notes; Stage 5-lite: mode, workerRole, routeReason, loopIteration, reviewMode, delegationCount, parentRunId, artifactSummary (optional)",
    },
    allowedStatus: [
      "STARTED",
      "PASS",
      "FAIL",
      "INSUFFICIENT_EVIDENCE",
      "APPROVED",
      "CHANGES_REQUESTED",
      "BLOCKED",
      "RECORDED",
    ],
    entries: [],
  };
}

export const OrchestratorPlugin = async (ctx: PluginContext) => {
  async function updateLifecycleStatus(
    args: Record<string, unknown> | undefined,
    status?: RunStatus,
  ) {
    if (!ctx.$) return;
    const command = detectCommand(args);
    if (!command.startsWith("/lite-")) return;

    const file = ctx.$.file(STATE_PATH);
    let parsed: RunLogFile = bootstrapLog();

    try {
      const raw = await file.text();
      if (raw && raw.trim()) {
        parsed = JSON.parse(raw) as RunLogFile;
      }
    } catch {
      // ignore
    }

    const entries = Array.isArray(parsed.entries)
      ? (parsed.entries as unknown as RunLogEntry[])
      : [];

    if (!status) {
      entries.push(makeEntry(command, args));
    } else {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].command === command && entries[i].status === "STARTED") {
          entries[i].status = status;
          entries[i].timestamp = nowIso();

          if (command === "/lite-auto" && status === "RECORDED") {
            entries[i].summary =
              "/lite-auto manager turn completed — plugin does not infer worker PASS/FAIL; confirm in transcript and state files.";
            entries[i].nextAction = null;
            const n = entries[i].notes as Record<string, unknown>;
            if (n && typeof n === "object") {
              n.orchestratorPolicy =
                "conservative: RECORDED replaces terminal PASS for auto pipeline";
            }
            break;
          }

          if (status === "FAIL" || status === "INSUFFICIENT_EVIDENCE") {
            entries[i].nextAction = "/lite-fix";
          } else if (status === "CHANGES_REQUESTED") {
            entries[i].nextAction = "/lite-implement";
          }
          break;
        }
      }
    }

    parsed.entries = entries as unknown as JsonArray;
    parsed.updatedAt = nowIso();

    await file.write(`${JSON.stringify(parsed, null, 2)}\n`);
  }

  return {
    "tool.execute.before": async (
      input: ToolBeforeInput,
      _output: ToolBeforeOutput,
    ) => {
      if (input.tool !== "task") return;
      await updateLifecycleStatus(input.args);
    },
    "tool.execute.after": async (
      input: ToolAfterInput,
      _output: ToolAfterOutput,
    ) => {
      if (input.tool !== "task") return;
      const command = detectCommand(input.args);
      const successStatus = terminalStatusForCommand(command);
      await updateLifecycleStatus(input.args, successStatus);
    },
  };
};

export default OrchestratorPlugin;
