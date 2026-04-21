import test from "node:test";
import assert from "node:assert/strict";

import { parseTicketMeta, requiresReviewer, routeTicket, shouldCallCurator, classifyKnowledgeFreshness, isCuratorPreflightAllowed } from "../plugins/routing.ts";

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

// --- Reduced V1 freshness classification tests ---

test("classifyKnowledgeFreshness returns 'none' when no preflight and no refs", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: false,
    knowledgeRefsCount: 0,
    knowledgeStatusFromPacket: undefined,
  });
  assert.equal(result, "none");
});

test("classifyKnowledgeFreshness returns 'fresh' when preflight used and refs present", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: true,
    knowledgeRefsCount: 3,
    knowledgeStatusFromPacket: undefined,
  });
  assert.equal(result, "fresh");
});

test("classifyKnowledgeFreshness returns 'stale' when refs exist but no preflight", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: false,
    knowledgeRefsCount: 2,
    knowledgeStatusFromPacket: undefined,
  });
  assert.equal(result, "stale");
});

test("classifyKnowledgeFreshness returns 'unknown' when preflight used but no refs (ambiguous)", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: true,
    knowledgeRefsCount: 0,
    knowledgeStatusFromPacket: undefined,
  });
  assert.equal(result, "unknown");
});

test("classifyKnowledgeFreshness prefers explicit packet knowledge_status (manager-resolved)", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: true,
    knowledgeRefsCount: 5,
    knowledgeStatusFromPacket: "stale",
  });
  assert.equal(result, "stale");
});

test("classifyKnowledgeFreshness uses packet knowledge_status 'fresh' over inferred", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: false,
    knowledgeRefsCount: 0,
    knowledgeStatusFromPacket: "fresh",
  });
  assert.equal(result, "fresh");
});

test("classifyKnowledgeFreshness uses packet knowledge_status 'unknown'", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: false,
    knowledgeRefsCount: 0,
    knowledgeStatusFromPacket: "unknown",
  });
  assert.equal(result, "unknown");
});

test("classifyKnowledgeFreshness ignores invalid packet knowledge_status", () => {
  const result = classifyKnowledgeFreshness({
    preflightUsed: true,
    knowledgeRefsCount: 2,
    knowledgeStatusFromPacket: "invalid_status",
  });
  assert.equal(result, "fresh");
});

// --- Reduced V1 preflight enforcement tests ---

test("isCuratorPreflightAllowed returns true when preflightCount is 0", () => {
  assert.equal(isCuratorPreflightAllowed(0), true);
});

test("isCuratorPreflightAllowed returns false when preflightCount is 1 (max one rule)", () => {
  assert.equal(isCuratorPreflightAllowed(1), false);
});

test("isCuratorPreflightAllowed returns false for higher counts (no refresh loop)", () => {
  assert.equal(isCuratorPreflightAllowed(2), false);
  assert.equal(isCuratorPreflightAllowed(5), false);
});

// --- Reduced V1: routeTicket enforces max-one-preflight through live path ---

test("routeTicket includes curator when preflightCount is 0", () => {
  const result = routeTicket({
    ticketId: "T-PF0",
    taskType: "feature",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "low",
    priorFailureEvidence: false,
    scopeSize: 2,
  }, 0);
  assert.deepEqual(result.sequence, ["curator", "coder"]);
  assert.equal(result.reason, "context_clarity_low");
});

test("routeTicket removes curator when preflightCount is 1 (max-one rule)", () => {
  const result = routeTicket({
    ticketId: "T-PF1",
    taskType: "feature",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "low",
    priorFailureEvidence: false,
    scopeSize: 2,
  }, 1);
  assert.deepEqual(result.sequence, ["coder"]);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("routeTicket blocks curator refresh loop with preflightCount >= 2", () => {
  const result = routeTicket({
    ticketId: "T-PF2",
    taskType: "feature",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "low",
    priorFailureEvidence: false,
    scopeSize: 2,
  }, 2);
  assert.deepEqual(result.sequence, ["coder"]);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("routeTicket leaves exploration blocked when preflight reached", () => {
  const result = routeTicket({
    ticketId: "T-EXPL",
    taskType: "exploration",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "medium",
    priorFailureEvidence: false,
    scopeSize: 1,
  }, 1);
  assert.deepEqual(result.sequence, []);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("routeTicket removes curator from high-risk route when preflight already used", () => {
  const result = routeTicket({
    ticketId: "T-HI",
    taskType: "bugfix",
    riskLevel: "high",
    interfaceChange: true,
    requiresRuntimeVerification: false,
    contextClarity: "high",
    priorFailureEvidence: false,
    scopeSize: 4,
  }, 1);
  assert.deepEqual(result.sequence, ["coder", "tester", "reviewer"]);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("routeTicket removes curator from bugfix-with-evidence route when preflight reached", () => {
  const result = routeTicket({
    ticketId: "T-BUG",
    taskType: "bugfix",
    riskLevel: "medium",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "high",
    priorFailureEvidence: true,
    scopeSize: 2,
  }, 1);
  assert.deepEqual(result.sequence, ["fixer", "tester", "reviewer"]);
  assert.equal(result.reason, "preflight_limit_reached");
});

test("routeTicket with no curator in sequence ignores preflightCount", () => {
  const result = routeTicket({
    ticketId: "T-NO-CUR",
    taskType: "feature",
    riskLevel: "medium",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "high",
    priorFailureEvidence: false,
    scopeSize: 2,
  }, 1);
  assert.deepEqual(result.sequence, ["coder"]);
  assert.equal(result.reason, "default_coder_route");
});

test("routeTicket defaults preflightCount to 0 (backward compatible)", () => {
  const result = routeTicket({
    ticketId: "T-DEF",
    taskType: "feature",
    riskLevel: "low",
    interfaceChange: false,
    requiresRuntimeVerification: false,
    contextClarity: "low",
    priorFailureEvidence: false,
    scopeSize: 2,
  });
  assert.deepEqual(result.sequence, ["curator", "coder"]);
  assert.equal(result.reason, "context_clarity_low");
});
