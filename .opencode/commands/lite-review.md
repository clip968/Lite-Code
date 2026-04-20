---
description: Stage 1/2 final quality gate review
agent: reviewer
subtask: true
---

Use the `reviewer` role to perform a strict, evidence-based final review of one implemented ticket.

## Purpose
This command is the final quality gate for Stage 1/2 orchestration.  
It must decide whether the implementation is ready to accept, or requires focused rework.

### Stage 5-lite note
In **auto mode** (`/lite-auto`), the main-session **manager** may perform a **manager-level** final check when risk is low; the **`reviewer` subagent** is still **mandatory** for high-risk paths and other triggers (see `docs/stage5-lite-supervisor-implementation-spec.md` §7.6, §10.4). This command remains the **manual** and **explicit** way to invoke the reviewer worker.

## Required Input
- Target Ticket ID
- Ticket Spec
  - Goal
  - Constraints
  - Acceptance Criteria
  - Non-scope
- Implementation Summary
  - Files changed
  - Key logic changes
- Verification Evidence (required for Stage 2)
  - `/lite-verify` results
  - Per-AC PASS/FAIL/INSUFFICIENT_EVIDENCE evidence
  - Test execution summary, logs, reproduction steps (if applicable)
- Fix Evidence (if applicable)
  - `/lite-fix` actions taken
  - Modified file scope
  - Re-verification request/results

## Review Rules
1. **Acceptance-first**
   - Judge whether ticket acceptance criteria are fulfilled as the top priority.
2. **Verify-evidence-first (Stage 2)**
   - Do not approve without `/lite-verify` evidence in Stage 2.
3. **Evidence-based only**
   - Use only verifiable evidence such as code changes, test results, logs, and reproduction information.
4. **Scope/constraint discipline**
   - Explicitly document out-of-ticket changes and constraint violations.
5. **Actionable rejection**
   - When rejecting, request only the minimum actionable rework needed (no broad refactoring).

## Output Format (Required)

### 1) Decision
- `APPROVED` | `CHANGES_REQUESTED`

### 2) Criteria Check
- AC-1: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — reason
- AC-2: `PASS` | `FAIL` | `INSUFFICIENT_EVIDENCE` — reason
- AC-n: ...

### 3) Verify/Fix Evidence Check
- Verify evidence present: `YES` | `NO` — details
- Verify verdict consistency: `CONSISTENT` | `INCONSISTENT` — details
- Fix loop handled correctly (if applicable): `YES` | `NO` — details

### 4) Design/Policy Violations
- Scope violation: `YES` | `NO` — details
- Constraint violation: `YES` | `NO` — details
- Risk notes:
  - Critical: <none or details>
  - Major: <none or details>
  - Minor: <none or details>

### 5) Required Follow-up Tickets
- If `CHANGES_REQUESTED`, provide only minimal required tickets:
  - `T-FIX-1`: <goal, files, acceptance criteria>
  - `T-FIX-2`: ...
- If `APPROVED`, write: `None`.

## Automatic Rejection Conditions
Return `CHANGES_REQUESTED` if any of the following is true:
- Any mandatory acceptance criterion is `FAIL`
- Core criterion is `INSUFFICIENT_EVIDENCE`
- In Stage 2 and verify evidence is missing
- Verify results contradict implementation/fix results
- Scope/constraint violation introduces meaningful risk
- Critical safety/stability/security concern exists
- Known reproducible defect remains unresolved

## Approval Conditions
Return `APPROVED` only when:
- All mandatory acceptance criteria are `PASS`
- Stage 2 verify evidence is sufficient and consistent
- No critical/major unresolved risk remains
- No meaningful scope/constraint violation exists

## Tone
- Be concise, direct, and actionable.
- Avoid vague statements.
- Focus on objective quality gate outcomes.