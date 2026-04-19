/**
 * Thin Budget/Risk Guard Plugin (Stage 4 + Stage 5-lite alignment)
 *
 * Goals:
 * - warn-first policy (no hard blocking)
 * - minimal scope: high-cost model overuse + risky bash command warnings
 * - plugin removal must not break workflow
 *
 * Stage 5-lite (see docs/budget-risk-policy.md):
 * - Manager residing on a high-cost model is expected; do not treat it alone as misuse.
 * - Warn when high-cost usage suggests implement/verify/fix loops are stuck on the main
 *   expensive path instead of delegating to worker subagents via `/lite-auto`.
 *
 * Notes:
 * - This plugin is intentionally conservative and side-effect light.
 * - It relies on documented hook patterns where available.
 * - No fake budget precision; no workflow blocking.
 */

type AnyRecord = Record<string, any>;

type GuardConfig = {
  // Warn when high-cost model calls exceed this count in a session.
  // 0 or negative disables count warning.
  highModelWarnThreshold: number;

  // Stage 5-lite: warn when high-cost is used repeatedly for worker-like task roles
  // (build/tester/fixer) — suggests delegating via `/lite-auto` + workers.
  workerRoleDelegationWarnThreshold: number;

  // High-cost model identifiers (substring match, case-insensitive).
  highCostModelHints: string[];

  // Max number of recent history rows tracked in-memory.
  historyLimit: number;

  // Risky bash regex patterns (warn-only).
  riskyBashPatterns: RegExp[];

  // If true, print more diagnostics.
  debug: boolean;
};

type GuardState = {
  highModelCallCount: number;
  /** High-cost calls on roles where cheaper workers are preferred (build/tester/fixer). */
  highCostWorkerRoleCallCount: number;
  riskyBashWarnCount: number;
  history: Array<{
    at: string;
    type: "MODEL_WARNING" | "BASH_WARNING";
    message: string;
    meta?: AnyRecord;
  }>;
};

const DEFAULT_CONFIG: GuardConfig = {
  highModelWarnThreshold: 8,
  workerRoleDelegationWarnThreshold: 5,
  highCostModelHints: [
    "gpt-5",
    "xhigh",
    "sonnet",
    "opus",
    "reasoning",
    "o1",
    "o3",
  ],
  historyLimit: 200,
  riskyBashPatterns: [
    /\brm\s+-rf\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bchown\b/i,
    /\bchmod\s+7{3}\b/i,
    /\b(del|erase)\b/i,
    /\bgit\s+push\s+--force\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bnpm\s+publish\b/i,
    /\bcurl\b.*\|\s*(sh|bash|zsh|pwsh|powershell)\b/i,
    /\bwget\b.*\|\s*(sh|bash|zsh|pwsh|powershell)\b/i,
  ],
  debug: false,
};

function toIsoNow(): string {
  return new Date().toISOString();
}

function safeLower(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

function getByPath(obj: AnyRecord, paths: string[]): unknown {
  for (const p of paths) {
    const parts = p.split(".");
    let cur: any = obj;
    let ok = true;
    for (const key of parts) {
      if (cur && typeof cur === "object" && key in cur) {
        cur = cur[key];
      } else {
        ok = false;
        break;
      }
    }
    if (ok) return cur;
  }
  return undefined;
}

function pickModelString(payload: AnyRecord): string {
  const val = getByPath(payload, [
    "model",
    "modelID",
    "args.model",
    "args.modelID",
    "input.model",
    "input.modelID",
    "output.model",
    "output.modelID",
    "agent.model",
    "agent.modelID",
  ]);
  return String(val ?? "");
}

function isHighCostModel(modelString: string, hints: string[]): boolean {
  const m = safeLower(modelString);
  if (!m) return false;
  return hints.some((h) => m.includes(safeLower(h)));
}

function pickAgentRole(payload: AnyRecord): string {
  return safeLower(
    String(
      getByPath(payload, [
        "args.agent",
        "input.args.agent",
        "args.subagent",
      ]) ?? "",
    ),
  );
}

function pickPrompt(payload: AnyRecord): string {
  return String(getByPath(payload, ["args.prompt", "input.args.prompt"]) ?? "");
}

function isWorkerLikeAgent(agent: string): boolean {
  return (
    agent === "build" ||
    agent === "tester" ||
    agent === "fixer" ||
    agent === "coder"
  );
}

function isPlannerReviewerAgent(agent: string): boolean {
  return agent === "plan" || agent === "reviewer";
}

function pickBashCommand(payload: AnyRecord): string {
  // Common shapes observed in tool hooks
  const cmd = getByPath(payload, [
    "args.command",
    "input.args.command",
    "output.args.command",
    "command",
    "input.command",
    "output.command",
    "args.script",
    "input.args.script",
  ]);
  return String(cmd ?? "");
}

function detectRiskyBash(command: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(command)) return p;
  }
  return null;
}

function trimHistory(state: GuardState, limit: number) {
  if (state.history.length > limit) {
    state.history.splice(0, state.history.length - limit);
  }
}

function warnLine(tag: string, message: string): string {
  return `[budget-guard:${tag}] ${message}`;
}

function pushWarning(
  state: GuardState,
  type: "MODEL_WARNING" | "BASH_WARNING",
  message: string,
  meta?: AnyRecord,
) {
  state.history.push({
    at: toIsoNow(),
    type,
    message,
    meta,
  });
}

/**
 * Plugin export
 * Compatible with OpenCode-style async plugin factory.
 */
export const BudgetGuardPlugin = async (ctx: AnyRecord = {}) => {
  const state: GuardState = {
    highModelCallCount: 0,
    highCostWorkerRoleCallCount: 0,
    riskyBashWarnCount: 0,
    history: [],
  };

  const userConfig: Partial<GuardConfig> =
    (ctx?.project?.config?.budgetGuard as Partial<GuardConfig>) ||
    (ctx?.config?.budgetGuard as Partial<GuardConfig>) ||
    {};

  const config: GuardConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    workerRoleDelegationWarnThreshold:
      userConfig.workerRoleDelegationWarnThreshold ??
      DEFAULT_CONFIG.workerRoleDelegationWarnThreshold,
    riskyBashPatterns:
      userConfig.riskyBashPatterns && userConfig.riskyBashPatterns.length > 0
        ? userConfig.riskyBashPatterns
        : DEFAULT_CONFIG.riskyBashPatterns,
  };

  const logWarn = (msg: string) => {
    // Warn-only by policy
    try {
      console.warn(msg);
    } catch {
      // no-op
    }
  };

  const logDebug = (msg: string, extra?: unknown) => {
    if (!config.debug) return;
    try {
      if (extra === undefined) {
        console.debug(`[budget-guard:debug] ${msg}`);
      } else {
        console.debug(`[budget-guard:debug] ${msg}`, extra);
      }
    } catch {
      // no-op
    }
  };

  logDebug("initialized", {
    threshold: config.highModelWarnThreshold,
    hints: config.highCostModelHints,
  });

  async function checkHighCostModel(payload: AnyRecord) {
    const modelStr = pickModelString(payload);
    const high = isHighCostModel(modelStr, config.highCostModelHints);

    if (!high) return;

    const agentRole = pickAgentRole(payload);
    const prompt = pickPrompt(payload);

    // Stage 5-lite: planner/reviewer on high-cost is often intentional — weight less for generic threshold.
    const countTowardGeneric =
      !isPlannerReviewerAgent(agentRole) ||
      /\/lite-(triage|review)\b/i.test(prompt);

    if (countTowardGeneric) {
      state.highModelCallCount += 1;
    }

    // Stage 5-lite: expensive build/tester/fixer/coder loops should prefer worker delegation.
    if (isWorkerLikeAgent(agentRole)) {
      state.highCostWorkerRoleCallCount += 1;
    }

    if (
      config.workerRoleDelegationWarnThreshold > 0 &&
      isWorkerLikeAgent(agentRole) &&
      state.highCostWorkerRoleCallCount ===
        config.workerRoleDelegationWarnThreshold
    ) {
      const msg = warnLine(
        "delegation",
        `Stage 5-lite: high-cost model used repeatedly for worker-like role "${agentRole}". ` +
          `Prefer \`/lite-auto\` with \`coder\`/\`tester\`/\`fixer\` subagents instead of long main-session implement/verify loops. model="${modelStr || "unknown"}"`,
      );
      logWarn(msg);
      pushWarning(state, "MODEL_WARNING", msg, {
        model: modelStr || "unknown",
        agentRole,
        workerLoopCount: state.highCostWorkerRoleCallCount,
        threshold: config.workerRoleDelegationWarnThreshold,
        stage5Lite: true,
      });
      trimHistory(state, config.historyLimit);
    }

    if (
      config.highModelWarnThreshold > 0 &&
      state.highModelCallCount > config.highModelWarnThreshold
    ) {
      const msg = warnLine(
        "model",
        `High-cost model usage is above threshold (${state.highModelCallCount}/${config.highModelWarnThreshold}). ` +
          `Use lower-cost models for implement/verify/fix where possible; Stage 5-lite: use \`/lite-auto\` worker delegation. model="${modelStr || "unknown"}"`,
      );
      logWarn(msg);
      pushWarning(state, "MODEL_WARNING", msg, {
        model: modelStr || "unknown",
        count: state.highModelCallCount,
        threshold: config.highModelWarnThreshold,
      });
      trimHistory(state, config.historyLimit);
    } else {
      logDebug("high-cost model call observed", {
        model: modelStr || "unknown",
        count: state.highModelCallCount,
        agentRole,
      });
    }
  }

  return {
    /**
     * Experimental: Direct model execution hook.
     * Some runtimes may not support this.
     */
    "model.execute.before": async (input: AnyRecord = {}) => {
      await checkHighCostModel(input);
    },

    /**
     * Multi-purpose tool hook.
     * - 'task' tool: monitor high-cost model usage via input.args
     * - 'bash' tools: monitor risky commands.
     */
    "tool.execute.before": async (
      input: AnyRecord = {},
      output: AnyRecord = {},
    ) => {
      const toolName = safeLower(
        typeof input.tool === "string"
          ? input.tool
          : getByPath(input, ["tool", "name"]),
      );

      // 1. Model usage check via 'task' tool
      if (toolName === "task") {
        await checkHighCostModel(input.args || {});
        return;
      }

      // 2. Risky bash check
      if (toolName === "bash" || toolName === "sh" || toolName === "shell") {
        const cmd = pickBashCommand(output?.args ? output : input);
        if (!cmd) return;

        const matched = detectRiskyBash(cmd, config.riskyBashPatterns);
        if (!matched) return;

        state.riskyBashWarnCount += 1;

        const msg = warnLine(
          "bash",
          `Potentially risky bash command detected (warn-only). pattern="${matched}" command="${cmd}"`,
        );
        logWarn(msg);
        pushWarning(state, "BASH_WARNING", msg, {
          command: cmd,
          pattern: String(matched),
          warnCount: state.riskyBashWarnCount,
        });
        trimHistory(state, config.historyLimit);
      }
    },

    /**
     * Optional session summary hook (if runtime supports lifecycle hook).
     */
    "session.end": async () => {
      if (!state.history.length) return;
      logWarn(
        warnLine(
          "summary",
          `session finished. modelWarnings=${state.history.filter((h) => h.type === "MODEL_WARNING").length}, ` +
            `bashWarnings=${state.history.filter((h) => h.type === "BASH_WARNING").length}`,
        ),
      );
      logDebug("history", state.history);
    },
  };
};

export default BudgetGuardPlugin;
