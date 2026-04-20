import test from "node:test";
import assert from "node:assert/strict";

import { parseTicketMeta, requiresReviewer, routeTicket, shouldCallCurator } from "../plugins/routing.ts";

test("routeTicket returns curator->coder for low context clarity", () => {
  const result = routeTicket({
    ticketId: "T-1",
    taskType: "feature",
    riskLevel: "medium",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "low",
    priorFailureEvidence: false,
    scopeSize: 2,
  });
  assert.deepEqual(result.sequence, ["curator", "coder"]);
});

test("routeTicket returns curator->reviewer for review_only", () => {
  const result = routeTicket({
    ticketId: "T-2",
    taskType: "review_only",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "high",
    priorFailureEvidence: false,
    scopeSize: 1,
  });
  assert.deepEqual(result.sequence, ["curator", "reviewer"]);
});

test("routeTicket returns curator for exploration tasks", () => {
  const result = routeTicket({
    ticketId: "T-EXPLORE",
    taskType: "exploration",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "medium",
    priorFailureEvidence: false,
    scopeSize: 5,
  });
  assert.deepEqual(result.sequence, ["curator"]);
  assert.equal(result.reason, "exploration_task");
});

test("requiresReviewer enforces interface change", () => {
  assert.equal(
    requiresReviewer(
      {
        ticketId: "T-3",
        taskType: "feature",
        riskLevel: "medium",
        interfaceChange: true,
        requiresRuntimeVerification: false,
        contextClarity: "high",
        priorFailureEvidence: false,
        scopeSize: 2,
      },
      [],
    ),
    true,
  );
});

test("shouldCallCurator is true for high risk and large scope", () => {
  assert.equal(
    shouldCallCurator({
      ticketId: "T-4",
      taskType: "feature",
      riskLevel: "high",
      interfaceChange: false,
      requiresRuntimeVerification: false,
      contextClarity: "high",
      priorFailureEvidence: false,
      scopeSize: 5,
    }),
    true,
  );
});

test("parseTicketMeta normalizes unknown values", () => {
  const meta = parseTicketMeta({ task_type: "unknown", risk_level: "extreme", context_clarity: "??" });
  assert.equal(meta.taskType, "feature");
  assert.equal(meta.riskLevel, "medium");
  assert.equal(meta.contextClarity, "medium");
});
