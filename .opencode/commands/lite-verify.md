---
description: Run Stage 2 verification using the tester subagent
agent: tester
subtask: true
---

Run the **Verify** stage for exactly one implemented ticket using the `tester` role.

## Purpose
`/lite-verify` validates implementation results in Stage 2, structures failure causes and reproduction info, and hands off safely to `/lite-fix` or `/lite-review`.

## Required Input
The following information must be provided:

- Target Ticket ID
- Ticket Spec
  - Goal
  - Constraints
  - Acceptance Criteria
  - Non-scope
- Implementation Summary
  - Files changed
  - Key logic changes
- Validation Context
  - Executable tests/verification methods
  - Related logs/error info (if available)

If required input is missing, do not proceed with verification; request the missing items first.

## Verify Rules (Strict)

1. **Verification first**
   - Check acceptance criteria fulfillment as the top priority.
   - Report verification facts before suggesting implementation changes or refactoring.

2. **Scope discipline**
   - Judge only against the ticket's goal/constraints/non-scope.
   - Do not add feature expansion requests outside the ticket.

3. **Evidence-based**
   - Present verifiable evidence such as test results, execution logs, and reproduction steps.
   - Prohibit "probably passes" without evidence.

4. **No modification principle**
   - By default, perform verification only, without file modification.
   - On failure, structure cause/impact/reproduction info rather than making fixes.

5. **Handoff-friendly**
   - For failed items, write details specific enough for `/lite-fix` to act on immediately.
   - For passes, summarize at a level where `/lite-review` can make a judgment.

## Output Format (Mandatory)

### 1) Verification Target
- Ticket ID:
- Goal summary:
- Scope guard (constraints/non-scope key points):

### 2) Verification Results
- Overall: `PASS` | `FAIL` | `PARTIAL`
- Criteria checks:
  - AC-1: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — evidence
  - AC-2: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — evidence
  - AC-n: ...

### 3) Test & Evidence
- Executed checks:
  - check name / method / result
- Logs:
  - key lines or error signatures
- Reproduction steps:
  1. ...
  2. ...
  3. ...

### 4) Failure Analysis (if any)
- Suspected root cause:
- Impact scope:
- Why this fails acceptance criteria:
- Fix direction for `/lite-fix` (minimal and scoped):

### 5) Handoff Recommendation
- Next command: `/lite-fix` | `/lite-review`
- Reason:
- Blocking items (if any):

## Automatic Escalation Conditions

Set `Next command` to `/lite-fix` if any of the following is true:

- One or more mandatory acceptance criteria are `FAIL`
- A core criterion is `INSUFFICIENT_EVIDENCE`
- A constraint violation is confirmed
- A reproducible defect exists

## Completion Criteria

A `/lite-verify` result is considered complete only when:

- All acceptance criteria have an explicit status
- At least one piece of verification evidence (test/log/reproduction procedure) is included
- The next step (`/lite-fix` or `/lite-review`) is clearly stated