# Lite-Code Orchestration Policy

This document defines **shared orchestration rules** for Lite-Code. It is not project-specific so it can be reused across repositories. It is auto-loaded via the `instructions` field in `opencode.jsonc`.

---

## 🛑 Build Agent Exploration Prohibition (applies only to the build agent)

> **This section applies only to the `build` agent. Other subagents (`curator`, `coder`, `tester`, `fixer`, `reviewer`) should ignore it.**

`build` is an expensive, high-level agent. Direct `build -> coder` delegation is the default for small explicit implementation tickets; curator preflight is a gated exception.

### Direct-path gate

`build` must first decide whether the ticket is direct-path eligible or needs curator preflight.

Direct path is the default for small explicit implementation tickets. Use direct `build -> coder` when one or more is true:

- explicit file path provided
- explicit symbol/function/class target provided
- change naturally converges to a 1-2 file edit
- known bugfix / trivial config change / rename / wording fix / similar narrow change
- build can identify scope after one narrow confirmation read

Use curator only when one or more is true:

- request is broad or ambiguous enough that 3+ file exploration is likely
- task is review-sensitive enough that reviewer path is highly likely
- existing knowledge reference is likely to reduce scope materially
- build still cannot identify scope after one narrow read

### What build must not do

When the user's request is broad, ambiguous, or still lacks a narrow scope:

- Do **not** call `Read`, `Grep`, or `Glob` two or more times in a row directly.
- Do **not** read "structure overview" file sets such as `README`, `package.json`, entry-point files, `routes/`, `controllers/`, `src/`, `app/` directly.
- The moment you think "let me check the structure first", **stop** and gate to curator.

### What build MUST do

1. Decide direct path versus curator preflight before any delegation.
2. If direct path applies, delegate directly to `coder`.
3. If curator preflight applies, use `task` with `mode` `"exploration"` or `"structured"` as appropriate, then proceed only from curator's result.
4. After a valid curator preflight, build must not broadly re-explore; it may only validate returned scope, resolve authoritative `knowledge_status`, assemble compact downstream `knowledge_refs` / `knowledge_summary`, and delegate.

### Exceptions where build may read directly

- The user specified an explicit path for 1–2 files
- Curator just pointed to a specific file + line range that you need to confirm
- A single-file, single-function question

After a valid curator preflight, build must not broadly re-explore; it may only validate returned scope, resolve authoritative `knowledge_status`, assemble compact downstream `knowledge_refs` / `knowledge_summary`, and delegate.

---

## Purpose

1. Separate high-level judgment (planning/review) from execution (implementation/verification/fixing).
2. Minimize expensive model usage to control costs.
3. Allow `build` to directly delegate work to subagents via the **task tool**.

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
| `curator` | Read-only context collection and reuse-oriented preflight context packets | Low-cost/fast |
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
- Small explicit implementation tickets → `coder` directly
- **Code understanding / exploration / status summary (requests requiring 3+ file reads)** → `curator` (mode: exploration)
- Complex implementation involving 3+ target files → `curator` → `coder`
- Verification needed after implementation → `tester`
- Fix needed after test failure → `fixer`
- Code review / design review needed → `curator` → `reviewer`

### When build may answer directly
- Questions that do not require code changes
- Confirming an already-decided routing or scope choice
- Short acknowledgements and status responses

> **Prohibition:** `build` must not broadly scan the codebase using `Read`/`Grep`/`Glob` while running an expensive model. This work must always be delegated to curator.

### Mandatory rules for delegation
1. Parallel delegation is allowed **only** for independent work packets (no read/write overlap and no dependency edge).
2. Dependent chains must stay sequential (for example: `coder → tester`, `tester FAIL → fixer`, `reviewer` after implementation/verification evidence).
3. Include **goal, `allowed_files`, constraints, and acceptance criteria** in every delegation prompt.
4. Direct calls between subagents are prohibited (must go through build).
5. If a subagent reports a failure, notify the user and ask about next steps.
6. All instructions sent to subagents must be in English. Do not send subagent prompts in any other language unless the user explicitly instructs you to do so.

### Knowledge preflight policy (Reduced V1)
- For implementation or review tasks likely to require broad reads (for example low context clarity, review-sensitive work, or expected 3+ repository reads), run **one sequential `curator` preflight** before delegating to `coder` or `reviewer`.
- Reduced V1 allows **at most one curator preflight per ticket**. If knowledge becomes stale mid-loop, do not run refresh preflight in the same ticket.
- Preflight output is attached to downstream packets via canonical fields: `knowledge_refs`, `knowledge_summary`, `knowledge_status`.
- `knowledge_status` is manager-resolved (`fresh | stale | unknown | none`), not worker-guessed.
- Do not perform runtime wiki body writes in Reduced V1. `knowledge_refs` are read references to existing concept documents only.
- Note: `wiki/concepts/*.md` is the current Lite-Code convention for concept documents. Repository adapters may map this to an equivalent concept-document path.

### Parallel-safe combinations (policy)

- ✅ Allowed in parallel:
  - `curator` runs for independent tickets with isolated file scopes (max one preflight per ticket)
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
