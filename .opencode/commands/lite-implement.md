---
description: Implement exactly one scoped ticket using the native build flow
agent: build
subtask: false
---

You are running the **Implement** stage in the lightweight orchestration workflow.

## Purpose

Implement **exactly one ticket** while enforcing strict scope and constraint control.

This command must optimize for:

- single-ticket execution
- minimal, targeted file changes
- deterministic output for review handoff

---

## Required Input

Provide one ticket in this shape (or equivalent fields):

- Ticket ID
- Goal
- Files to modify
- Constraints
- Acceptance criteria
- Non-scope

If any required field is missing, stop and request the missing data before implementation.

---

## Execution Rules (Strict)

1. **One ticket only**
   - Do not combine multiple tickets.
   - If user input contains multiple tickets, ask which one to execute now.

2. **Scope lock**
   - Modify only files listed in `Files to modify`.
   - No extra feature work.
   - No opportunistic refactor.
   - No architecture changes unless explicitly required by the ticket.

3. **Constraint lock**
   - Respect every ticket constraint (dependency policy, API contracts, style, strict mode, etc.).
   - If a constraint blocks implementation, report the blocker rather than bypassing it.

4. **Non-scope enforcement**
   - Explicitly avoid all items in `Non-scope`.
   - If a non-scope change becomes unavoidable, pause and escalate with reason + impact.

5. **Minimal-change policy**
   - Prefer the smallest safe implementation that satisfies acceptance criteria.
   - Keep existing structure and conventions.

6. **No hidden assumptions**
   - If requirements are ambiguous, list assumptions clearly.
   - Do not silently invent behavior.

---

## Internal Workflow

Follow this order:

1. Re-state target ticket briefly.
2. Validate input completeness and detect conflicts.
3. Create a short implementation plan mapped to acceptance criteria.
4. Implement changes in the allowed files only.
5. Self-check against:
   - acceptance criteria
   - constraints
   - scope/non-scope
6. Return structured report for `/lite-review`.

---

## Output Format (Mandatory)

Use exactly this structure:

### 1) Target Ticket
- ID:
- Title:
- Goal:

### 2) Files Changed
- `path/to/file`: what changed and why
- `path/to/file`: what changed and why

### 3) Implementation Summary
- Key logic added/updated:
- How constraints were respected:
- Acceptance criteria mapping:
  - AC-1 → evidence
  - AC-2 → evidence
  - AC-n → evidence

### 4) Known Gaps / Follow-ups
- Remaining risks:
- Assumptions made:
- Blockers (if any):
- Suggested follow-up tickets (only if truly needed):

---

## Failure / Escalation Conditions

Do **not** continue implementation and instead return a blocker report if:

- ticket fields are incomplete
- constraints conflict with required behavior
- required file is outside allowed scope
- ticket requires architectural decision not provided in plan stage

Blocker report format:

### Blocked
- Reason:
- Missing/Conflicting input:
- Why safe implementation is not possible within current scope:
- What is needed to proceed:

---

## Quality Bar

A successful `/lite-implement` result must be:

- within ticket scope
- constraint-compliant
- acceptance-driven
- easy for reviewer to verify