import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const flags = {
    preset: "all",
    curator: "all",
    wiki: "all",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--preset") flags.preset = argv[++i] ?? "all";
    if (arg === "--curator") flags.curator = argv[++i] ?? "all";
    if (arg === "--wiki") flags.wiki = argv[++i] ?? "all";
  }
  return flags;
}

function safeNum(n) {
  return Number.isFinite(n) ? n : 0;
}

function divide(a, b) {
  return b > 0 ? a / b : 0;
}

function buildMarkdown(report) {
  return [
    "# Lite-Code Metrics Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- preset: ${report.filters.preset}`,
    `- curator: ${report.filters.curator}`,
    `- wiki: ${report.filters.wiki}`,
    `- tickets: ${report.totals.tickets}`,
    "",
    "## Metrics",
    `- first_pass_success_rate: ${report.metrics.first_pass_success_rate.toFixed(4)}`,
    `- review_rejection_rate: ${report.metrics.review_rejection_rate.toFixed(4)}`,
    `- fix_loop_rate: ${report.metrics.fix_loop_rate.toFixed(4)}`,
    `- average_handoffs: ${report.metrics.average_handoffs.toFixed(4)}`,
    `- scope_violation_rate: ${report.metrics.scope_violation_rate.toFixed(4)}`,
    `- tokens_per_ticket: ${report.metrics.tokens_per_ticket.toFixed(2)}`,
    `- cost_per_success: ${report.metrics.cost_per_success.toFixed(6)}`,
    `- wall_time_per_ticket: ${report.metrics.wall_time_per_ticket.toFixed(2)}`,
    `- blocked_rate: ${report.metrics.blocked_rate.toFixed(4)}`,
    "",
  ].join("\n");
}

export function aggregateMetrics(runLog) {
  const entries = Array.isArray(runLog.entries) ? runLog.entries : [];
  const byTicket = new Map();

  for (const entry of entries) {
    if (!entry.ticketId) continue;
    if (!byTicket.has(entry.ticketId)) byTicket.set(entry.ticketId, []);
    byTicket.get(entry.ticketId).push(entry);
  }

  let firstPassCount = 0;
  let reviewRejectCount = 0;
  let fixLoopCount = 0;
  let scopeViolationCount = 0;
  let blockedCount = 0;
  let successCount = 0;
  let totalHandoffs = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let totalWallSec = 0;

  for (const ticketEntries of byTicket.values()) {
    const hasFix = ticketEntries.some((e) => e.command === "/lite-fix");
    const isFirstPass = ticketEntries.some((e) => e.first_pass === true);
    const hasReviewReject = ticketEntries.some((e) => e.status === "CHANGES_REQUESTED");
    const hasScopeViolation = ticketEntries.some((e) => e.scope_violation === true);
    const hasBlocked = ticketEntries.some((e) => e.status === "BLOCKED");
    const hasSuccess = ticketEntries.some((e) => e.status === "APPROVED" || e.status === "PASS");

    if (isFirstPass) firstPassCount += 1;
    if (hasReviewReject) reviewRejectCount += 1;
    if (hasFix) fixLoopCount += 1;
    if (hasScopeViolation) scopeViolationCount += 1;
    if (hasBlocked) blockedCount += 1;
    if (hasSuccess) successCount += 1;

    totalHandoffs += Math.max(0, ticketEntries.length - 1);
    totalTokens += ticketEntries.reduce(
      (acc, e) => acc + safeNum(e.tokens_input) + safeNum(e.tokens_output),
      0,
    );
    totalCost += ticketEntries.reduce((acc, e) => acc + safeNum(e.cost_usd), 0);

    const sorted = [...ticketEntries].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    if (sorted.length > 1) {
      const start = Date.parse(sorted[0].timestamp);
      const end = Date.parse(sorted[sorted.length - 1].timestamp);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        totalWallSec += (end - start) / 1000;
      }
    }
  }

  const ticketCount = byTicket.size;
  return {
    totals: { tickets: ticketCount, entries: entries.length },
    metrics: {
      first_pass_success_rate: divide(firstPassCount, ticketCount),
      review_rejection_rate: divide(reviewRejectCount, ticketCount),
      fix_loop_rate: divide(fixLoopCount, ticketCount),
      average_handoffs: divide(totalHandoffs, ticketCount),
      scope_violation_rate: divide(scopeViolationCount, ticketCount),
      tokens_per_ticket: divide(totalTokens, ticketCount),
      cost_per_success: divide(totalCost, successCount),
      wall_time_per_ticket: divide(totalWallSec, ticketCount),
      blocked_rate: divide(blockedCount, ticketCount),
    },
  };
}

async function main() {
  const flags = parseArgs(process.argv);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const runLogPath = path.join(root, "state", "run-log.json");
  const reportsDir = path.join(root, "eval", "reports");

  const raw = await readFile(runLogPath, "utf8");
  const runLog = JSON.parse(raw);
  const aggregated = aggregateMetrics(runLog);

  const report = {
    generatedAt: new Date().toISOString(),
    filters: flags,
    ...aggregated,
  };

  await mkdir(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(reportsDir, `${stamp}.json`);
  const mdPath = path.join(reportsDir, `${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${buildMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n${mdPath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err?.stack ?? err}\n`);
    process.exitCode = 1;
  });
}
