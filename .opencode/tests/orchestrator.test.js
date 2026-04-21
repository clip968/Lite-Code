import test from "node:test";
import assert from "node:assert/strict";

import { detectCommand, OrchestratorPlugin, resolveKnowledgeStatus } from "../plugins/orchestrator.ts";
import { routeTicket } from "../plugins/routing.ts";

function makePrompt(packet) {
  return `workflow packet\n\n\`\`\`json\n${JSON.stringify(packet)}\n\`\`\``;
}

function createMemoryCtx(initialRunLog) {
  let state = initialRunLog;
  return {
    $: {
      file() {
        return {
          async text() {
            return state;
          },
          async write(content) {
            state = content;
          },
        };
      },
    },
    readState() {
      return state;
    },
  };
}

test("detectCommand ignores /lite-* strings embedded in prompt bodies", () => {
  assert.equal(
    detectCommand({
      prompt: "Please run /lite-fix after review, but this is just body text.",
      command: "task",
    }),
    "task",
  );
});

test("detectCommand still accepts explicit slash commands from args.command", () => {
  assert.equal(detectCommand({ command: "/lite-fix", prompt: "plain text" }), "/lite-fix");
});

// --- Reduced V1: orchestrator consumes routing freshness result ---

test("resolveKnowledgeStatus uses classifyKnowledgeFreshness for reviewer role", () => {
  const result = resolveKnowledgeStatus({
    workerRole: "reviewer",
    packet: {
      knowledge_status: undefined,
      knowledge_refs: ["wiki/concepts/testing.md"],
    },
    preflightUsed: true,
  });
  assert.equal(result, "fresh");
});

test("resolveKnowledgeStatus returns 'none' for non-reviewer without packet status", () => {
  const result = resolveKnowledgeStatus({
    workerRole: "coder",
    packet: {},
    preflightUsed: false,
  });
  assert.equal(result, "none");
});

test("resolveKnowledgeStatus uses explicit packet knowledge_status for reviewer when provided", () => {
  const result = resolveKnowledgeStatus({
    workerRole: "reviewer",
    packet: {
      knowledge_status: "stale",
      knowledge_refs: ["wiki/concepts/testing.md"],
    },
    preflightUsed: true,
  });
  assert.equal(result, "stale");
});

test("resolveKnowledgeStatus returns 'unknown' when freshness is ambiguous", () => {
  const result = resolveKnowledgeStatus({
    workerRole: "reviewer",
    packet: {
      knowledge_status: undefined,
    },
    preflightUsed: true,
    knowledgeRefsCount: 0,
  });
  assert.equal(result, "unknown");
});

test("resolveKnowledgeStatus returns 'stale' when refs exist without an actual curator preflight", () => {
  const result = resolveKnowledgeStatus({
    workerRole: "reviewer",
    packet: {
      knowledge_status: undefined,
      knowledge_refs: ["wiki/concepts/testing.md"],
    },
    preflightUsed: false,
  });
  assert.equal(result, "stale");
});

test("OrchestratorPlugin live path uses ticket-level preflight context for reviewer freshness", async () => {
  const ctx = createMemoryCtx(JSON.stringify({
    schemaVersion: "2.0.0",
    purpose: "Lite-Code orchestration run/event ledger with metric-ready fields.",
    updatedAt: "2026-04-20T00:00:00Z",
    fields: {},
    allowedStatus: [],
    entries: [],
  }));

  const plugin = await OrchestratorPlugin(ctx);

  const curatorPacket = {
    packet_version: "1",
    request_id: "req-cur",
    schema_version: "1",
    run_id: "run-cur",
    ticket_id: "T-LIVE-CTX",
    worker_role: "curator",
    goal: "preflight",
    allowed_files: [".opencode/plugins/orchestrator.ts"],
    constraints: [],
    acceptance_criteria: ["record preflight"],
    non_scope: [],
    risk_level: "low",
    knowledge_refs: ["wiki/concepts/testing.md"],
  };

  await plugin["tool.execute.before"]({ tool: "task", args: { command: "/lite-triage", prompt: makePrompt(curatorPacket) } });
  await plugin["tool.execute.after"]({ tool: "task", args: { command: "/lite-triage", prompt: makePrompt(curatorPacket) } });

  const reviewerPacket = {
    packet_version: "1",
    request_id: "req-rev",
    schema_version: "1",
    run_id: "run-rev",
    ticket_id: "T-LIVE-CTX",
    worker_role: "reviewer",
    goal: "review",
    allowed_files: [".opencode/plugins/orchestrator.ts"],
    constraints: [],
    acceptance_criteria: ["record review freshness"],
    non_scope: [],
    risk_level: "low",
    knowledge_refs: ["wiki/concepts/testing.md"],
  };

  await plugin["tool.execute.before"]({ tool: "task", args: { command: "/lite-review", prompt: makePrompt(reviewerPacket) } });
  await plugin["tool.execute.after"]({ tool: "task", args: { command: "/lite-review", prompt: makePrompt(reviewerPacket) } });

  const runLog = JSON.parse(ctx.readState());
  const reviewerEntry = runLog.entries.find((entry) => entry.runId === "run-rev");

  assert.ok(reviewerEntry, "reviewer entry should be recorded");
  assert.equal(reviewerEntry.knowledge_preflight_used, false);
  assert.equal(reviewerEntry.knowledge_status_at_review, "fresh");
  assert.equal(reviewerEntry.knowledge_refs_attached_count, 1);
});

test("OrchestratorPlugin live path keeps refs-only entries from consuming preflight", async () => {
  const ctx = createMemoryCtx(JSON.stringify({
    schemaVersion: "2.0.0",
    purpose: "Lite-Code orchestration run/event ledger with metric-ready fields.",
    updatedAt: "2026-04-20T00:00:00Z",
    fields: {},
    allowedStatus: [],
    entries: [],
  }));

  const plugin = await OrchestratorPlugin(ctx);

  const coderPacket = {
    packet_version: "1",
    request_id: "req-code",
    schema_version: "1",
    run_id: "run-code",
    ticket_id: "T-LIVE-REFS",
    worker_role: "coder",
    goal: "implement",
    allowed_files: [".opencode/plugins/orchestrator.ts"],
    constraints: [],
    acceptance_criteria: ["record refs-only entry"],
    non_scope: [],
    risk_level: "low",
    knowledge_refs: ["wiki/concepts/testing.md", "wiki/concepts/routing.md"],
  };

  await plugin["tool.execute.before"]({ tool: "task", args: { command: "/lite-implement", prompt: makePrompt(coderPacket) } });
  await plugin["tool.execute.after"]({ tool: "task", args: { command: "/lite-implement", prompt: makePrompt(coderPacket) } });

  const runLog = JSON.parse(ctx.readState());
  const coderEntry = runLog.entries.find((entry) => entry.runId === "run-code");

  assert.ok(coderEntry, "coder entry should be recorded");
  assert.equal(coderEntry.knowledge_preflight_used, false);
  assert.equal(coderEntry.knowledge_refs_attached_count, 2);
  assert.equal(coderEntry.knowledge_status_at_review, "none");
});

// --- Reduced V1: orchestrator preflight count integration ---

test("preflight counting blocks second curator in routeTicket via orchestrator live path", () => {
  // Simulate orchestrator counting preflights from entries before routing
  const existingEntries = [
    { ticketId: "T-LIVE", knowledge_preflight_used: true, worker_role: "curator" },
  ];
  const preflightCount = existingEntries.filter(
    (e) => e.ticketId === "T-LIVE" && e.knowledge_preflight_used,
  ).length;
  assert.equal(preflightCount, 1, "should count one existing preflight");

  // Orchestrator passes preflightCount to routeTicket
  const result = routeTicket(
    {
      ticketId: "T-LIVE",
      taskType: "feature",
      riskLevel: "high",
      interfaceChange: true,
      requiresRuntimeVerification: false,
      contextClarity: "high",
      priorFailureEvidence: false,
      scopeSize: 4,
    },
    preflightCount,
  );
  // Curator is removed from the sequence because preflight already used
  assert.deepEqual(result.sequence, ["coder", "tester", "reviewer"]);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("preflight counting allows first curator in routeTicket when no prior preflights", () => {
  const existingEntries = [
    { ticketId: "T-LIVE2", knowledge_preflight_used: false, worker_role: "coder" },
  ];
  const preflightCount = existingEntries.filter(
    (e) => e.ticketId === "T-LIVE2" && e.knowledge_preflight_used,
  ).length;
  assert.equal(preflightCount, 0, "should count zero preflights");

  const result = routeTicket(
    {
      ticketId: "T-LIVE2",
      taskType: "feature",
      riskLevel: "high",
      interfaceChange: true,
      requiresRuntimeVerification: false,
      contextClarity: "high",
      priorFailureEvidence: false,
      scopeSize: 4,
    },
    preflightCount,
  );
  assert.deepEqual(result.sequence, ["curator", "coder", "tester", "reviewer"]);
  assert.equal(result.reason, "high_risk_interface_change");
});

test("preflight counting ignores attached knowledge refs without curator preflight", () => {
  const existingEntries = [
    {
      ticketId: "T-LIVE3",
      knowledge_preflight_used: false,
      knowledge_refs_attached_count: 2,
      worker_role: "coder",
    },
  ];
  const preflightCount = existingEntries.filter(
    (e) => e.ticketId === "T-LIVE3" && e.knowledge_preflight_used,
  ).length;
  assert.equal(preflightCount, 0, "knowledge refs alone must not consume the curator preflight slot");

  const result = routeTicket(
    {
      ticketId: "T-LIVE3",
      taskType: "feature",
      riskLevel: "medium",
      interfaceChange: false,
      requiresRuntimeVerification: false,
      contextClarity: "low",
      priorFailureEvidence: false,
      scopeSize: 2,
    },
    preflightCount,
  );

  assert.deepEqual(result.sequence, ["curator", "coder"]);
  assert.equal(result.reason, "context_clarity_low");
});
