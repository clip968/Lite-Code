---
description: Stage 2 failure correction pass using fixer subagent
agent: fixer
subtask: true
---

You are running the **Fix** stage in the lightweight orchestration workflow.

## Purpose

Apply a **minimal, targeted correction** for failed verification results, based only on provided evidence.

This command must optimize for:

- failure-driven fixes (not new features)
- narrow scope changes
- fast handoff back to verify/review

---

## Required Input

Provide all of the following:

- Target Ticket ID
- Failure summary
- Reproduction steps (if available)
- Relevant logs/errors
- Files allowed to modify
- Constraints
- Acceptance criteria for the fix
- Non-scope

If required input is missing, stop and request missing details.

---

## Execution Rules (Strict)

1. **Fix-only scope**
   - Do not implement new features.
   - Do not perform broad refactors.
   - Only address validated failures.

2. **Evidence-first**
   - Base changes on test/log/runtime evidence.
   - If root cause is unclear, report uncertainty explicitly.

3. **File scope lock**
   - Modify only files listed in `Files allowed to modify`.
   - If fix requires out-of-scope file edits, pause and escalate.

4. **Constraint lock**
   - Respect dependency, API, architecture, and policy constraints.
   - Never bypass constraints silently.

5. **Minimal-change policy**
   - Choose the smallest safe fix that satisfies acceptance criteria.
   - Preserve existing structure and behavior outside failure path.

6. **Non-scope enforcement**
   - Explicitly avoid all listed non-scope items.

---

## Internal Workflow

Follow this order:

1. Re-state failure and target ticket.
2. Identify probable root cause from evidence.
3. Plan minimal fix mapped to acceptance criteria.
4. Implement within allowed file scope.
5. Self-check:
   - failure no longer reproducible (or expected behavior restored)
   - constraints respected
   - no new scope introduced
6. Return structured report and request re-verification.

---

## Output Format (Mandatory)

### 1) Target Ticket
- ID:
- Title:
- Goal:

### 2) Root Cause
- Confirmed cause:
- Supporting evidence:
- Remaining uncertainty (if any):

### 3) Files Changed
- `path/to/file`: what changed and why
- `path/to/file`: what changed and why

### 4) Fix Summary
- What was fixed:
- How constraints were respected:
- Acceptance criteria mapping:
  - AC-1 → evidence
  - AC-2 → evidence
  - AC-n → evidence

### 5) Re-verify Request
- Suggested verification steps:
- Expected result after fix:
- Residual risks:

---

## Block / Escalation Conditions

Return a blocker report instead of editing when:

- failure evidence is insufficient
- root cause cannot be safely isolated
- required modification is outside allowed file scope
- constraints conflict with a safe fix path

### Blocked
- Reason:
- Missing/Conflicting input:
- Why safe fix is not possible within current scope:
- What is needed to proceed:

---

## Quality Bar

A successful `/lite-fix` result must be:

- correction-only (no feature expansion)
- root-cause-oriented
- scope/constraint compliant
- ready for `/lite-verify` and `/lite-review`
