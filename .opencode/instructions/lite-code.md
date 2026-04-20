# Lite-Code Orchestration Policy

This document defines **shared orchestration rules** for Lite-Code. It is not project-specific so it can be reused across repositories. It is auto-loaded via the `instructions` field in `opencode.jsonc`.

---

## 🛑 Build Agent Exploration Prohibition (applies only to the build agent)

> **This section applies only to the `build` agent. Other subagents (`curator`, `coder`, `tester`, `fixer`, `reviewer`) should ignore it.**

`build` is an expensive, high-level agent. Codebase exploration and understanding is the job of the **low-cost `curator` subagent**.

### What build must NOT do

When the user's request involves "understanding / explaining / status / analysis / summarizing / checking structure / what exists / what's missing", or is in an early exploration phase where the scope is not yet defined:

- Do **not** call `Read`, `Grep`, or `Glob` two or more times in a row directly.
- Do **not** read "structure overview" file sets such as `README`, `package.json`, entry-point files, `routes/`, `controllers/`, `src/`, `app/` directly.
- The moment you think "let me check the structure first", **stop** and delegate to curator.

### What build MUST do

1. Your **first action** must be to **call `curator` via the `task` tool**.
2. Payload:
   - `mode`: `"exploration"` (for understanding/explaining requests) or `"structured"` (for context collection before implementation)
   - `user_request`: the user's original text
   - `hints`: suspected relevant keywords/directories (or leave empty)
3. Answer the user based **only** on curator's result (Markdown report or JSON packet).
4. Only when curator's result is clearly insufficient may you read **1–2 files** directly; if you need more, delegate to curator again.

### Exceptions where build may read directly

- The user specified an explicit path for 1–2 files
- Curator just pointed to a specific file + line range that you need to confirm
- A single-file, single-function question

---

## Purpose

1. Separate high-level judgment (planning/review) from execution (implementation/verification/fixing).
2. Minimize expensive model usage to control costs.
3. Allow `build` to directly invoke subagents as **skills** and delegate work.

---

## Agent Structure

### Main agents (switch via tab)
| Agent | Role |
|---|---|
| `plan` | Requirements analysis, ticket decomposition, acceptance criteria drafting (read-only) |
| `build` | Implementation orchestration. Handles simple tasks directly; delegates complex ones to subagents |

### Subagents (invoked by build via the task tool)
| Agent | Role | Model policy |
|---|---|---|
| `coder` | Code implementation within a single ticket scope | Low-cost/fast |
| `tester` | Verification against acceptance criteria | Low-cost/fast |
| `fixer` | Minimal-scope fix after verification failure | Low-cost/fast |
| `reviewer` | Final quality gate, approve/reject | High-performance |

---

## Delegation Rules

### Mandatory pre-delegation decision gate

Before `build` invokes any subagent, it must explicitly decide execution mode: `SEQUENTIAL` or `PARALLEL`. This decision is for internal reasoning/orchestration only and should not be surfaced in user-visible output unless the user explicitly asks for it.

Required gate checks (in order):
1. **Dependency check** — confirm there is no dependency edge if considering parallel execution.
2. **Scope-overlap check** — confirm there is no read/write overlap (including file overlap) across packets.
3. **Merge plan for parallel branches** — define how outputs are reconciled and what to do if one branch fails or is malformed.
4. **Fallback rule** — if any check is uncertain or cannot be verified safely, default to `SEQUENTIAL`.

No delegation should start until this decision gate is completed.

### When build should call a subagent
- **Code understanding / exploration / status summary (requests requiring 3+ file reads)** → `curator` (mode: exploration)
- Complex implementation involving 3+ target files → `curator` → `coder`
- Verification needed after implementation → `tester`
- Fix needed after test failure → `fixer`
- Code review / design review needed → `curator` → `reviewer`

### When build should handle directly
- Simple file edits (1–2 files, context already provided)
- Answering questions when context is already sufficient
- Checking the content of a specific 1–2 files
- Simple bug fixes

> **Prohibition:** `build` must not broadly scan the codebase using `Read`/`Grep`/`Glob` while running an expensive model. This work must always be delegated to curator.

### Mandatory rules for delegation
1. Parallel delegation is allowed **only** for independent work packets (no read/write overlap and no dependency edge).
2. Dependent chains must stay sequential (for example: `coder → tester`, `tester FAIL → fixer`, `reviewer` after implementation/verification evidence).
3. Include **goal, target files, constraints, and acceptance criteria** in every delegation prompt.
4. Direct calls between subagents are prohibited (must go through build).
5. If a subagent reports a failure, notify the user and ask about next steps.
6. All instructions sent to subagents must be in English. Do not send subagent prompts in any other language unless the user explicitly instructs you to do so.

### Parallel-safe combinations (policy)

- ✅ Allowed in parallel:
  - multiple `curator` runs on non-overlapping file scopes
  - independent tickets with isolated file scopes (outside single-ticket loops)
  - other independent worker packets with explicit non-overlapping scopes
- ⛔ Must remain sequential:
  - `coder` before `tester` for the same change scope
  - `fixer` only after a `tester` failure for that scope
  - `reviewer` only after required upstream worker outputs are complete

---

## Role Permissions

| Role | File editing | Code execution | Scope |
|---|---|---|---|
| `plan` | ❌ | ❌ | Read/analyze only |
| `build` | ✅ | ✅ | Full orchestration |
| `coder` | ✅ | Limited | Within ticket scope |
| `tester` | ❌ | ✅ (for verification) | Verification only |
| `fixer` | ✅ | Limited | Within failure cause scope |
| `reviewer` | ❌ | ❌ | Read/judge only |

---

## Model Usage Policy

```
opencode.jsonc structure:
  "model": "..."              ← main (build/plan) default model
  "agent.coder.model": "..."  ← coder-specific (low-cost)
  "agent.tester.model": "..." ← tester-specific (low-cost)
  "agent.fixer.model": "..."  ← fixer-specific (low-cost)
  "agent.reviewer.model": "..." ← reviewer-specific (high-performance)
```

- **High-performance models**: Judgment/planning/review points (`plan`, `reviewer`)
- **Low-cost/fast models**: Implementation/verification/fix loops (`coder`, `tester`, `fixer`)
- Actual model IDs are stored in `.opencode/scripts/presets.json` as the single source of truth.
- To switch presets: `node .opencode/scripts/switch-preset.js <preset>`
- To override a specific model in your personal environment, use `agent.<name>.model` in `~/.config/opencode/opencode.json`.

---

## Change Control

- Implement/modify only one ticket at a time.
- Editing files outside the ticket scope is prohibited.
- "Nice-to-have improvements" are prohibited.
- If requirements are ambiguous, ask the user instead of guessing.

---

## Commands

### Automatic delegation (build decides)
When you make a request to build in normal conversation, it delegates automatically based on complexity.

### Manual orchestration (when needed)
| Command | Role |
|---|---|
| `/lite-triage` | Planning/analysis (plan) |
| `/lite-implement` | Implementation (build) |
| `/lite-verify` | Verification (tester) |
| `/lite-fix` | Fix (fixer) |
| `/lite-review` | Review (reviewer) |
| `/lite-auto` | Full automatic loop |
| `/switch-preset` | Switch worker model preset |
| `/subagent-model` | Change individual subagent model |

---

## External Compatibility

- This policy coexists with external skills/plugins (e.g., superpowers).
- If a skill's instructions conflict with this document, the priority order is: **explicit user instruction > this document > skill defaults**.
- When subagents are invoked via the `task` tool, they follow the `agent.<name>.model` setting in `opencode.jsonc`.
