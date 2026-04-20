export interface TicketMeta {
  ticketId: string;
  taskType:
    | "bugfix"
    | "feature"
    | "test_only"
    | "review_only"
    | "refactor"
    | "exploration";
  riskLevel: "low" | "medium" | "high" | "critical";
  interfaceChange: boolean;
  requiresRuntimeVerification: boolean;
  contextClarity: "low" | "medium" | "high";
  priorFailureEvidence: boolean;
  scopeSize: number;
}

export type WorkerRole = "curator" | "coder" | "tester" | "fixer" | "reviewer";

export function shouldCallCurator(meta: TicketMeta): boolean {
  return (
    meta.contextClarity === "low" ||
    ((meta.riskLevel === "high" || meta.riskLevel === "critical") && meta.scopeSize > 3)
  );
}

export function routeTicket(meta: TicketMeta): { sequence: WorkerRole[]; reason: string } {
  if (meta.taskType === "exploration") {
    return { sequence: ["curator"], reason: "exploration_task" };
  }
  if (meta.contextClarity === "low") {
    return { sequence: ["curator", "coder"], reason: "context_clarity_low" };
  }
  if (meta.taskType === "review_only") {
    return { sequence: ["curator", "reviewer"], reason: "review_only_task" };
  }
  if (meta.taskType === "test_only") {
    return { sequence: ["tester"], reason: "test_only_task" };
  }
  if ((meta.riskLevel === "high" || meta.riskLevel === "critical") && meta.interfaceChange) {
    return { sequence: ["curator", "coder", "tester", "reviewer"], reason: "high_risk_interface_change" };
  }
  if (meta.taskType === "bugfix" && meta.priorFailureEvidence) {
    return { sequence: ["curator", "fixer", "tester", "reviewer"], reason: "bugfix_with_failure_evidence" };
  }
  if (meta.requiresRuntimeVerification) {
    return { sequence: ["curator", "coder", "tester"], reason: "runtime_verification_required" };
  }
  return { sequence: ["coder"], reason: "default_coder_route" };
}

export function requiresReviewer(meta: TicketMeta, history: string[]): boolean {
  if (meta.interfaceChange) return true;
  if (meta.riskLevel === "critical") return true;
  if (history.some((item) => item === "fixer")) return true;
  return false;
}

export function parseTicketMeta(args?: Record<string, unknown>): TicketMeta {
  const risk = typeof args?.risk_level === "string" ? args.risk_level : "medium";
  const task = typeof args?.task_type === "string" ? args.task_type : "feature";
  const clarity = typeof args?.context_clarity === "string" ? args.context_clarity : "medium";
  const scopeSize = typeof args?.scope_size === "number" ? args.scope_size : 1;

  return {
    ticketId: typeof args?.ticket_id === "string" ? args.ticket_id : "UNKNOWN",
    taskType: ["bugfix", "feature", "test_only", "review_only", "refactor", "exploration"].includes(task)
      ? (task as TicketMeta["taskType"])
      : "feature",
    riskLevel: ["low", "medium", "high", "critical"].includes(risk)
      ? (risk as TicketMeta["riskLevel"])
      : "medium",
    interfaceChange: args?.interface_change === true,
    requiresRuntimeVerification: args?.requires_runtime_verification === true,
    contextClarity: ["low", "medium", "high"].includes(clarity)
      ? (clarity as TicketMeta["contextClarity"])
      : "medium",
    priorFailureEvidence: args?.prior_failure_evidence === true,
    scopeSize,
  };
}
