---
description: Stage 1 triage/planning entrypoint for lightweight orchestration
agent: plan
subtask: true
---

Run a **planning-only triage pass** for the incoming request.

## Purpose
Structure requirements before implementation, converting them into a set of tickets that `build` can execute immediately.  
This stage performs analysis and planning only — no implementation or modification.

## Execution Rules
- No code implementation
- No file modification
- No execution/testing
- Separate ambiguous requirements into assumptions and questions
- Break tickets into small, independent units
- Write measurable completion criteria for each ticket

## Output Format (mandatory)

### 1) Scope
- ...

### 2) Non-scope
- ...

### 3) Constraints
- ...

### 4) Tickets (with IDs)

#### T-XXX - <title>
- Goal:
- Files to modify:
- Constraints:
- Acceptance criteria:
- Test requirements:
- Non-scope:
- Dependencies:
- Risk level:
- Notes:

(Repeat as needed)

### 5) Acceptance Criteria (per ticket)
- T-XXX:
  - AC-1:
  - AC-2:

### 6) Risks / Assumptions
- Risk:
- Why it matters:
- Mitigation:

### 7) Blocking Questions (optional)
- ...

## Ticket Quality Standards
Each ticket must include:
- A clear Goal
- Specific file scope
- Constraints
- Verifiable Acceptance criteria
- Non-scope
- Preceding dependencies (if any)

## Final Check
Before outputting, verify:
- [ ] Scope/Non-scope are separated without conflict
- [ ] All tickets are actionable units
- [ ] Each ticket's acceptance criteria are measurable
- [ ] Risks and assumptions are stated