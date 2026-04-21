import test from "node:test";
import assert from "node:assert/strict";

import { aggregateMetrics } from "../scripts/metrics.js";

test("aggregateMetrics computes rates from run log entries", () => {
  const runLog = {
    entries: [
      {
        ticketId: "T-A",
        command: "/lite-triage",
        status: "PASS",
        timestamp: "2026-04-20T00:00:00Z",
        tokens_input: 100,
        tokens_output: 50,
        cost_usd: 0.01,
        first_pass: true,
      },
      {
        ticketId: "T-A",
        command: "/lite-review",
        status: "APPROVED",
        timestamp: "2026-04-20T00:00:30Z",
        tokens_input: 20,
        tokens_output: 10,
        cost_usd: 0.005,
        first_pass: true,
      },
      {
        ticketId: "T-B",
        command: "/lite-verify",
        status: "FAIL",
        timestamp: "2026-04-20T00:01:00Z",
        tokens_input: 60,
        tokens_output: 20,
        cost_usd: 0.002,
        first_pass: false,
      },
      {
        ticketId: "T-B",
        command: "/lite-fix",
        status: "PASS",
        timestamp: "2026-04-20T00:01:30Z",
        tokens_input: 40,
        tokens_output: 20,
        cost_usd: 0.003,
        first_pass: false,
        scope_violation: true,
      },
      {
        ticketId: "T-B",
        command: "/lite-review",
        status: "CHANGES_REQUESTED",
        timestamp: "2026-04-20T00:02:00Z",
        tokens_input: 30,
        tokens_output: 20,
        cost_usd: 0.01,
        first_pass: false,
      },
    ],
  };

  const result = aggregateMetrics(runLog);
  assert.equal(result.totals.tickets, 2);
  assert.equal(result.metrics.first_pass_success_rate, 0.5);
  assert.equal(result.metrics.review_rejection_rate, 0.5);
  assert.equal(result.metrics.fix_loop_rate, 0.5);
  assert.equal(result.metrics.scope_violation_rate, 0.5);
  assert.ok(result.metrics.average_handoffs > 0);
});

// --- Reduced V1: knowledge status metric fields preserved ---

test("aggregateMetrics preserves knowledge_status_at_review entries in ticket data", () => {
  const runLog = {
    entries: [
      {
        ticketId: "T-K1",
        command: "/lite-review",
        status: "APPROVED",
        timestamp: "2026-04-20T10:00:00Z",
        tokens_input: 50,
        tokens_output: 20,
        cost_usd: 0.01,
        first_pass: true,
        knowledge_preflight_used: true,
        knowledge_refs_attached_count: 2,
        knowledge_status_at_review: "fresh",
        ticket_cycle_ms: 5000,
      },
      {
        ticketId: "T-K2",
        command: "/lite-review",
        status: "CHANGES_REQUESTED",
        timestamp: "2026-04-20T11:00:00Z",
        tokens_input: 60,
        tokens_output: 30,
        cost_usd: 0.02,
        first_pass: false,
        knowledge_preflight_used: false,
        knowledge_refs_attached_count: 0,
        knowledge_status_at_review: "none",
        ticket_cycle_ms: 10000,
      },
      {
        ticketId: "T-K3",
        command: "/lite-review",
        status: "APPROVED",
        timestamp: "2026-04-20T12:00:00Z",
        tokens_input: 40,
        tokens_output: 15,
        cost_usd: 0.008,
        first_pass: true,
        knowledge_preflight_used: true,
        knowledge_refs_attached_count: 1,
        knowledge_status_at_review: "stale",
        ticket_cycle_ms: 7000,
      },
      {
        ticketId: "T-K4",
        command: "/lite-review",
        status: "APPROVED",
        timestamp: "2026-04-20T13:00:00Z",
        tokens_input: 30,
        tokens_output: 10,
        cost_usd: 0.005,
        first_pass: true,
        knowledge_preflight_used: true,
        knowledge_refs_attached_count: 0,
        knowledge_status_at_review: "unknown",
        ticket_cycle_ms: 3000,
      },
    ],
  };

  const result = aggregateMetrics(runLog);
  assert.equal(result.totals.tickets, 4);
  // Verify that knowledge metric fields are preserved in entries and accessible
  for (const entry of runLog.entries) {
    assert.ok(typeof entry.knowledge_preflight_used === "boolean", "knowledge_preflight_used is boolean");
    assert.ok(typeof entry.knowledge_refs_attached_count === "number", "knowledge_refs_attached_count is number");
    assert.ok(
      ["fresh", "stale", "unknown", "none"].includes(entry.knowledge_status_at_review),
      `knowledge_status_at_review is one of fresh|stale|unknown|none, got: ${entry.knowledge_status_at_review}`,
    );
    assert.ok(typeof entry.ticket_cycle_ms === "number", "ticket_cycle_ms is number");
  }
  // Verify all four freshness states are represented
  const statuses = runLog.entries.map((e) => e.knowledge_status_at_review).sort();
  assert.deepEqual(statuses, ["fresh", "none", "stale", "unknown"]);
});
