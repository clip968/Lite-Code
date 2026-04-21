# Lite-Code Orchestration

Lite-Code is a lightweight orchestration and subagent model management system built on top of OpenCode. It strategically assigns high-cost and low-cost models to support more cost-efficient development.

## ✨ Key Features

- **Intelligent delegation (skill dispatch)**: The main agent (`build`) evaluates task complexity and automatically delegates work to the `curator`, `coder`, `tester`, `fixer`, and `reviewer` subagents.
- **Curator-first knowledge reuse (Reduced V1)**: One sequential `curator` preflight can produce compact reusable knowledge that the manager attaches to downstream `coder` / `reviewer` packets (`knowledge_refs`, `knowledge_summary`, `knowledge_status`) so workers consult it before broad repository reads.
- **Deterministic staleness rule**: The manager resolves `knowledge_status` (`fresh | stale | unknown | none`) by comparing each source file's git commit time against the curator's `last_verified_at`, so reviewers can explicitly reject on `stale_knowledge`.
- **Model preset management**: Instantly switch the entire set of subagent models depending on your working mode, such as cost-saving or high-quality execution.
- **AGENTS.md-based policy**: Maintain a consistent collaboration structure through clearly defined roles and delegation rules.

## 📦 Using It in Other Environments

This repository works as a **reproducible OpenCode profile**. You can use it on another computer or in another environment in one of the following ways.

### Method 0: Let an AI install it for you (recommended)

Just paste this one line into OpenCode or another AI agent chat:

```
Fetch and follow instructions from https://raw.githubusercontent.com/<OWNER>/<REPO>/main/.opencode/INSTALL.md
```

The AI can handle cloning, environment variable setup, and verification steps (`lcp --list`, `lcp status`, and test execution) automatically.
Replace `<OWNER>/<REPO>` with the actual GitHub repository path. If you need a manual setup, see Methods A and B below.

### Method A: Use this repository as the project root

```bash
git clone <this-repo> my-project
cd my-project
# Authenticate your provider (e.g. OpenAI, DeepInfra, GitHub Copilot)
opencode
# Then run: /connect
```

`opencode.jsonc` and `.opencode/` are detected automatically. Authentication data is not stored in the repository; it is saved in `~/.local/share/opencode/auth.json`.

### Method B: Share one common profile across multiple repositories

If you want to keep Lite-Code in a central location and reuse it across multiple projects, set these environment variables:

```bash
# In ~/.bashrc or ~/.zshrc
export OPENCODE_CONFIG="$HOME/lite-code/opencode.jsonc"
export OPENCODE_CONFIG_DIR="$HOME/lite-code/.opencode"
```

With this setup, running `opencode` in any directory will apply the Lite-Code orchestration policy. Keep project-specific rules only in that project's `AGENTS.md` file.

### Personal settings vs repository settings

| Item | Location | Commit? |
|---|---|---|
| Provider auth (API keys) | `~/.local/share/opencode/auth.json` | ❌ |
| Personal model preferences (overrides) | `~/.config/opencode/opencode.json` | ❌ |
| Team-shared per-role model mapping | repository `opencode.jsonc` | ✅ |
| Model presets | `.opencode/scripts/presets.json` | ✅ |
| Orchestration policy | `.opencode/instructions/lite-code.md` | ✅ |
| Runtime state (tickets/run-log) | `.opencode/state/*.json` | ❌ (gitignored) |

---

## 🚀 Getting Started

### 1. Switch model presets

Apply the model set that fits your current situation immediately.

```bash
# Recommended: use the short execution wrapper
# (run once in the repository root)
chmod +x ./lcp

# Show preset list and current configuration
./lcp --list

# Apply low-cost mode (e.g. GPT-4 mini)
./lcp economy

# Apply balanced mode (advanced model only for Reviewer)
./lcp quality

# Apply maximum-quality mode (advanced models for all workers)
./lcp full
```

### switch-preset cheat sheet

```bash
# Apply a preset (backward compatible: preset name also works without 'apply')
./lcp apply default

# Search the catalog, then select a model (stores set/alias)
./lcp search gpt-5.4 --provider=openai
./lcp search gpt-5.4 --connected-only
./lcp search gpt-5.4 --limit=50
./lcp search gpt-5.4 --limit=all

# Set a model for an individual agent (alias or full ID)
./lcp set reviewer smart
./lcp set fixer deepinfra/zai-org/GLM-5.1

# Bulk-swap providers (only for targets available in the catalog)
./lcp swap-provider openai openrouter

# Manage aliases (team: .opencode/scripts/aliases.json, personal: ~/.config/opencode/lite-aliases.json)
./lcp alias ls
./lcp alias add my-mini openai/gpt-5.4-mini
./lcp alias rm my-mini

# Show current status summary
./lcp status
```

### 2. Change an individual subagent model

Use this when you want to fine-tune the model for a specific agent only.

- In the OpenCode command bar, run `/subagent-model` and follow the prompts.

## 🛠️ Main Components

| File/Directory | Role |
|---|---|
| `AGENTS.md` | Repository-specific rules (pointer file) |
| `.opencode/instructions/lite-code.md` | Shared Lite-Code orchestration policy (reusable), including Reduced V1 knowledge preflight rules |
| `.opencode/commands/lite-auto.md` | Auto orchestration command; defines the sequential curator preflight step (Step 4.5) |
| `.opencode/agents/` | Agent definition files (`build`, `curator`, `coder`, `tester`, `fixer`, `reviewer`) loaded automatically by OpenCode |
| `.opencode/schemas/` | Packet and output JSON schemas (context / task / reviewer) including optional `knowledge_*` fields |
| `.opencode/plugins/` | Local plugins, including `orchestrator.ts` which records Reduced V1 metric fields in `run-log.json` |
| `.opencode/scripts/` | Model preset management scripts and data |
| `.opencode/commands/` | Custom commands such as `/switch-preset` and `/subagent-model` |
| `.opencode/prompts/` | Reference design documents. **Not automatically loaded at OpenCode runtime** (you must update files under `agents/` for actual behavior changes) |
| `.opencode/state/run-log.json` | Append-oriented run ledger; records Reduced V1 fields `knowledge_preflight_used`, `knowledge_refs_attached_count`, `knowledge_status_at_review`, `ticket_cycle_ms` |
| `wiki/concepts/` | Stable architecture concept documents referenced by curator's `knowledge_candidates.doc_ref` |
| `plan/` | Design plans, including `2026-04-21-lc-reduced-curator-reuse-v1.md` (the active Reduced V1 spec) |
| `opencode.jsonc` | Core project configuration and per-agent model assignments |

## 📚 Curator Knowledge Reuse (Reduced V1)

Reduced V1 adds a minimal knowledge-reuse loop on top of the existing role-based delegation. It is designed to prove reuse value before scaling to parallel fan-out or automated wiki writes.

- **Trigger**: When context clarity is low, scope is likely broad (3+ reads), or review sensitivity is high, the manager runs **one sequential `curator` preflight** per ticket.
- **Curator output** (optional extensions to `.opencode/schemas/context-packet.schema.json`):
  - `knowledge_candidates` — up to 3 compact summaries, each pointing to an existing `wiki/concepts/*.md` via `doc_ref`, with `source_files`, ISO-8601 `last_verified_at`, and `confidence`.
  - `knowledge_gaps` — short strings describing unresolved context gaps.
- **Manager responsibility**:
  - Validate candidates, drop invalid `doc_ref`s individually.
  - Resolve freshness per source file via `git log -1 --format=%cI -- <path>` and aggregate packet-level `knowledge_status` conservatively (`stale` > `unknown` > `fresh` > `none`).
  - Attach compact `knowledge_refs`, `knowledge_summary` (≤ 600 chars), `knowledge_status` to downstream packets.
- **Worker responsibility**:
  - `coder` reads `knowledge_summary` / `knowledge_refs` before broad repository scans and narrows file selection first.
  - `reviewer` treats `knowledge_status` as authoritative and rejects with `stale_knowledge` in `rejection_causes` when acceptance materially depends on stale knowledge.
- **Out of scope in Reduced V1**: parallel curator fan-out, runtime wiki body writes, refresh-preflight within the same ticket.

See `plan/2026-04-21-lc-reduced-curator-reuse-v1.md` for the full spec and Definition of Done.

## 📝 Adding a Custom Preset

You can create your own model combination by adding a new preset object to `.opencode/scripts/presets.json`.

```json
"my-custom-preset": {
  "description": "Description",
  "agents": {
    "coder": { "model": "provider/model-id" },
    ...
  }
}
```

---

*Note: You may need to restart OpenCode for model changes to take effect.*
