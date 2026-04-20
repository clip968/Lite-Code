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
