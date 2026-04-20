export type TicketStatus =
  | "PLANNED"
  | "CONTEXT_READY"
  | "IMPLEMENTING"
  | "VERIFYING"
  | "VERIFIED_FAIL"
  | "FIXING"
  | "REVIEWING"
  | "REVIEW_CHANGES"
  | "DONE"
  | "BLOCKED";

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PLANNED: ["CONTEXT_READY", "BLOCKED"],
  CONTEXT_READY: ["IMPLEMENTING", "BLOCKED"],
  IMPLEMENTING: ["VERIFYING", "REVIEWING", "BLOCKED"],
  VERIFYING: ["REVIEWING", "VERIFIED_FAIL", "BLOCKED"],
  VERIFIED_FAIL: ["FIXING", "BLOCKED"],
  FIXING: ["VERIFYING", "BLOCKED"],
  REVIEWING: ["DONE", "REVIEW_CHANGES", "BLOCKED"],
  REVIEW_CHANGES: ["IMPLEMENTING", "FIXING", "BLOCKED"],
  DONE: [],
  BLOCKED: ["CONTEXT_READY", "IMPLEMENTING", "FIXING", "BLOCKED"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateHistory(ticket: { id?: string; history?: Array<{ from?: string; to?: string }> }): string[] {
  const out: string[] = [];
  for (const item of ticket.history ?? []) {
    const from = item.from as TicketStatus;
    const to = item.to as TicketStatus;
    if (!from || !to) continue;
    if (!(from in TRANSITIONS)) {
      out.push(`Unknown from status: ${from}`);
      continue;
    }
    if (!(to in TRANSITIONS)) {
      out.push(`Unknown to status: ${to}`);
      continue;
    }
    if (!canTransition(from, to)) {
      out.push(`Illegal transition ${from} -> ${to} for ${ticket.id ?? "UNKNOWN"}`);
    }
  }
  return out;
}
