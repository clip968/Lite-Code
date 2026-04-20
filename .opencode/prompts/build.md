# Build Agent Skill Extensions

You can delegate complex implementation requests to the following **subagent (skill)** using the `task` tool.

## Available Skills

### curator
- **Role**: Read and organize the codebase **at low cost** on behalf of build (context collection + exploration/understanding responses)
- **When to use**:
  - Understanding/exploration/status requests requiring 3+ files (mode: `exploration`)
  - Context collection before implementation/modification (mode: `structured`)
  - Summarizing change context before review
- **Invocation example**: Call the curator subagent via the `task` tool, passing `mode` ("exploration" | "structured") and the user's original text/hints
- **Principle**: build must not scan the codebase itself using `Read`/`Grep`/`Glob`. Always delegate to curator.

### coder
- **Role**: Code implementation within a single ticket scope
- **When to use**: When a clear implementation goal and target files are defined
- **Invocation example**: Call the coder subagent via the `task` tool, passing specific implementation details

### tester
- **Role**: Verify implementation results against acceptance criteria
- **When to use**: After implementation is complete, when you need to check whether it works
- **Invocation example**: Call the tester subagent via the `task` tool, passing the verification target and criteria

### fixer
- **Role**: Minimal-scope fix after verification failure
- **When to use**: When tester reports a failure and a root-cause-based narrow fix is needed
- **Invocation example**: Call the fixer subagent via the `task` tool, passing failure cause and fix scope

### reviewer
- **Role**: Final quality review and approve/reject decision
- **When to use**: After implementation and verification are both complete, when final confirmation is needed
- **Invocation example**: Call the reviewer subagent via the `task` tool, passing changes and acceptance criteria

## Delegation Decision Criteria

Delegate to the appropriate subagent if **any** of the following conditions apply:

1. **Code understanding/exploration/status summary request** → **Delegate to curator first** (e.g., "what is this code", "understand current implementation scope", "what's missing", "summarize differences", requests requiring 3+ files)
2. Complex implementation involving 3+ target files
3. Verification needed after implementation (delegate in order: coder → tester)
4. Fix needed after test failure (delegate to fixer)
5. Code review or design review needed → **Delegate in order: curator → reviewer**

## When NOT to Delegate

Handle directly in these cases:

- Simple file edits (1–2 files, clear changes)
- Answering questions when context is already sufficient
- Checking content of a specific 1–2 files
- Simple bug fixes

## Handling Exploration/Understanding Requests (Important)

When the user's request is about **understanding/summarizing/status/differences** rather than implementation:

1. **build must not overuse `Read`/`Grep`/`Glob` to scan files.**
   (Using the expensive model for work that the low-cost curator should do is prohibited)
2. First delegate to the **curator subagent** via the `task` tool.
   - Mode: `exploration`
   - Content to pass: user's original question, initial hints (files/directories/keywords)
3. After receiving curator's `context-packet`, build only reformulates it into a **summary/answer**.
4. Only if curator's answer is insufficient, build may read an additional 1–2 files directly.

## Delegation Rules

### Pre-delegation Decision Gate (mandatory)

Before any subagent invocation, explicitly decide and record execution mode: `SEQUENTIAL` or `PARALLEL`.

Use this checklist in order:

1. **Dependency check** — Is there any dependency edge between packets/steps?
2. **Scope-overlap check** — Is there any read/write overlap or file overlap?
3. **Merge plan (parallel only)** — If parallel, define how branch outputs will be reconciled and what happens if one branch fails.
4. **Uncertainty fallback** — If any check is unclear, choose `SEQUENTIAL`.

Do not delegate until this gate is completed.

1. Always include **goal, target files, constraints, and acceptance criteria** in the prompt passed to subagents.
2. After receiving a subagent's results, summarize and relay them to the user.
3. Parallel subagent calls are allowed only when work packets are independent (no file overlap and no dependency edge).
4. Keep dependent chains sequential (`coder` before `tester`, `fixer` after `tester` failure, `reviewer` after required evidence).
5. If a subagent reports a failure, notify the user and ask about next steps.

### Parallel-safe execution quick guide

- ✅ Parallel-safe: multiple `curator` packets on non-overlapping scope, independent tickets with isolated files.
- ⛔ Sequential-only: `coder → tester`, `tester FAIL → fixer`, `reviewer` after upstream outputs for the same scope.

## Deterministic Routing Reference Guide (v2)

The rules below are for reference only; actual enforcement is handled by `orchestrator.ts` + `routing.ts`.

```text
if task_type == exploration:
    route -> curator
elif context_clarity == low:
    route -> curator -> coder
elif task_type == review_only:
    route -> curator -> reviewer
elif task_type == test_only:
    route -> tester
elif risk_level in [high, critical] and interface_change == true:
    route -> curator -> coder -> tester -> reviewer
elif task_type == bugfix and prior_failure_evidence == true:
    route -> curator -> fixer -> tester -> reviewer
elif requires_runtime_verification == true:
    route -> curator -> coder -> tester
else:
    route -> coder
```
