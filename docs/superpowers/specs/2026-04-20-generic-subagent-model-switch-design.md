# Generic Subagent Model Switch Plugin Design

## Summary

This design adds a plugin-only, reusable way to switch models for OpenCode `subagent` agents without patching OpenCode core.

The plugin does not replace native `switch agent`. Instead, it provides a native-like command dedicated to subagent model management:

- Command Palette entry: `Switch Subagent Model`
- Slash alias: `/subagent-model`
- Dynamic discovery of runtime agents where `mode === "subagent"`
- Writes explicit overrides to `opencode.jsonc` under `agent.<name>.model`
- Supports `Use default` by removing only the explicit `model` field

The goal is to make subagent model switching feel first-class while staying fully compatible with stock OpenCode and reusable across projects.

## Problem

OpenCode already supports explicit per-agent model assignment through `agent.<name>.model`, including for subagents.

However, from a user perspective, subagents are awkward to manage because:

1. Native `switch agent` behavior focuses on the current session agent, not subagent model management.
2. Subagents usually do not appear as selectable primary agents in the same way `plan` or `build` do.
3. The runtime capability exists, but the UX for editing subagent models is weak or absent.
4. Repo-local worker plugins solve only one project's conventions, not the general OpenCode problem.

The result is a mismatch between what OpenCode runtime can do and what the TUI makes convenient.

## Goals

1. Provide a plugin-only UX for switching explicit models on runtime-discovered subagents.
2. Keep the solution generic so it can be installed into other OpenCode workspaces.
3. Use OpenCode's existing `agent.<name>.model` mechanism instead of inventing a parallel execution path.
4. Preserve sibling `agent.<name>` fields when changing or clearing model config.
5. Clearly show whether a subagent is using an explicit model or falling back to inherited/global behavior.

## Non-goals

- Modifying OpenCode core `switch agent` behavior
- Making subagents appear as primary agents
- Replacing or overriding the native agent picker
- Adding worker category routing in this plugin
- Changing Stage 5-lite manager delegation logic
- Requiring repo-specific worker names like `coder` or `tester`

## Chosen Approach

Three approaches were considered:

1. Recommended: standalone generic subagent model switch plugin
2. Extend the existing repo-local `Configure Agent Models` plugin until it becomes generic
3. Combine generic subagent switching and category routing in one larger plugin

The chosen approach is 1.

Reasons:

- It solves the immediate UX gap with the smallest correct surface.
- It stays reusable across unrelated OpenCode repos.
- It does not entangle generic subagent switching with Stage 5-lite-specific routing policy.
- It avoids depending on unsupported plugin hooks for overriding native `switch agent`.

## Technical Constraints

Current plugin API findings matter to the design:

- TUI plugins can register commands, show dialogs, and update config.
- TUI plugins can call client APIs such as config and runtime agent listing.
- The available plugin API does not expose a supported way to replace the native `switch agent` option source or intercept that picker directly.
- SDK runtime agent data includes `name`, `description`, `mode`, `native`, `hidden`, and current `model`.

Therefore the plugin must act as a separate command-based UX, not as a patch layer on top of native agent switching.

## Architecture

The plugin should be implemented as a standalone pair of files:

- `.opencode/plugins/subagent-model-switch.ts`
- `.opencode/plugins/subagent-model-switch-shared.js`

### Responsibilities

`subagent-model-switch.ts`

- TUI command registration
- runtime data loading
- dialog orchestration
- toast/error handling
- config read/update calls

`subagent-model-switch-shared.js`

- filtering runtime agents to the supported subagent list
- sorting/grouping helper logic
- explicit model apply/remove logic
- current-state resolution helpers
- label and description formatting helpers

This separation mirrors the existing repo pattern used by `.opencode/plugins/model-config.ts` and keeps testable config logic out of the TUI file.

## Discovery Model

The plugin must discover candidate subagents dynamically from runtime inventory.

### Source

- `api.client.app.agents(...)`

### Filtering

Include agents where:

- `mode === "subagent"`

Exclude by default:

- agents marked `hidden: true`

### Display grouping

The list should be grouped for clarity:

- `Custom subagents`
- `Native subagents`

The plugin can derive this from `native === true | false`.

### Empty state

If no visible subagents are discovered, the plugin should show a clear toast or dialog explaining that no runtime subagents were found.

## UX Flow

### Entry points

- Command Palette: `Switch Subagent Model`
- Slash alias: `/subagent-model`
- Optional secondary alias: `/subagent-models`

### Step 1: Select subagent

Show a searchable list of discovered subagents.

Each option should display:

- agent name
- short description if available
- current effective state
- source badge

Example descriptions:

- `openai/gpt-5.4-mini (explicit) · custom subagent`
- `openai/gpt-5.4 (runtime) · native subagent`
- `openai/gpt-5.4-mini (global default) · inherited`
- `(not set) · inherited`

### Step 2: Select model

After a subagent is chosen, show the provider/model picker.

Options include:

- `Use default`
- all provider/model combinations returned from the provider config API

`Use default` means:

- remove only `agent.<subagent>.model`
- preserve other fields under `agent.<subagent>`

### Step 3: Persist and return

On selection:

- update config
- show a success toast
- return to the subagent list

Success examples:

- `coder -> openai/gpt-5.4-mini`
- `explore -> default`

## State Resolution Rules

The plugin should resolve state for display using this precedence:

1. explicit `agent.<name>.model`
2. runtime agent model from `app.agents()`
3. top-level global `model`
4. `(not set)`

### Meaning of sources

- `explicit`: set in `opencode.jsonc` under `agent.<name>.model`
- `runtime`: model currently reported by runtime agent inventory
- `global`: fallback from top-level `model`
- `unset`: no explicit or global value visible

The plugin does not need to guess the full upstream fallback chain beyond what runtime already reports.

## Config Writes

The plugin must write only to the existing OpenCode config shape.

### Set explicit model

```jsonc
{
  "agent": {
    "explore": {
      "model": "openai/gpt-5.4-mini"
    }
  }
}
```

### Clear explicit model

If `agent.explore` contains only `model`, remove the object entirely.

If `agent.explore` contains sibling fields, remove only `model` and keep the rest.

This behavior matches the existing repo-local model config plugin and prevents accidental loss of unrelated agent options.

## Compatibility With This Repo

This repo already contains `.opencode/plugins/model-config.ts`, which currently mixes:

- orchestration-agent model configuration
- Stage 5-lite worker-specific UX
- worker category routing support

The generic subagent plugin should remain separate.

Reasons:

- generic behavior should not inherit Stage 5-lite assumptions
- future reuse in other workspaces should be straightforward
- category routing and subagent switching are separate concerns

In this repo, both plugins can coexist:

- `model-config.ts` for repo-specific orchestration policy
- `subagent-model-switch.ts` for generic runtime subagent model control

## Error Handling

### Provider listing fails

- show an error toast
- return to the subagent list instead of leaving the dialog in a broken state

### Config load/update fails

- show an error toast with the exception message if available
- do not claim success

### Runtime agent listing fails

- show a load failure toast
- do not open an empty picker unless the failure is explicitly handled as empty state

### Stale runtime/config mismatch

If runtime no longer lists a subagent that still exists in config, the plugin may ignore it in v1. Manual config editing remains the fallback.

This mismatch handling is intentionally kept out of scope for v1.

## Testing Strategy

### Helper tests

Add `node:test` coverage for:

1. filtering only visible subagents from runtime inventory
2. grouping/sorting by native vs custom
3. resolving current state across explicit/runtime/global/unset
4. applying explicit model without losing sibling fields
5. clearing explicit model without deleting unrelated fields

### Plugin smoke tests

Add source-level tests verifying:

1. the plugin imports the shared helper
2. the plugin registers `Switch Subagent Model`
3. the plugin uses runtime agent discovery rather than a hardcoded worker list
4. the plugin writes through config update APIs

### Manual verification

1. Install/enable the plugin in a workspace with known subagents.
2. Run `/subagent-model`.
3. Confirm subagents with `mode: subagent` appear.
4. Change one subagent to an explicit model.
5. Confirm `opencode.jsonc` updates under `agent.<name>.model`.
6. Reopen the picker and confirm the explicit state is shown.
7. Select `Use default` and confirm only the `model` field is removed.

### Verification command

For this repo, final verification remains:

```bash
node --test .opencode/tests/*.test.js && npm run check --prefix .opencode
```

## Acceptance Criteria

- AC-1: A TUI command named `Switch Subagent Model` is available.
- AC-2: The command dynamically lists runtime agents where `mode === "subagent"`.
- AC-3: The plugin can set `agent.<name>.model` for any discovered visible subagent.
- AC-4: `Use default` removes only the explicit `model` field and preserves sibling config.
- AC-5: The picker clearly indicates whether the displayed state is `explicit`, `runtime`, `global`, or `unset`.
- AC-6: The plugin does not require Stage 5-lite worker names and remains reusable across other OpenCode workspaces.
- AC-7: The plugin does not patch or override native `switch agent`.

## Risks

### Risk 1: Users expect native `switch agent` integration

Mitigation:

- be explicit in naming and docs that this is a separate subagent model switch command
- use a native-like command name and slash alias for discoverability

### Risk 2: Runtime inventory can differ across OpenCode versions

Mitigation:

- depend only on documented runtime fields already exposed through SDK types
- keep helper logic tolerant to missing description/model/native fields

### Risk 3: Generic plugin overlaps with repo-local model configuration UI

Mitigation:

- keep scopes separate
- avoid hardcoded Stage 5-lite behavior in the generic plugin
- let local docs explain when to use each command

## Implementation Notes

- This design intentionally uses OpenCode's existing `agent.<name>.model` support rather than inventing a custom subagent routing layer.
- The plugin is generic by discovery, not by hardcoded agent registry.
- The plugin makes subagent model switching convenient, but it does not and cannot, within plugin-only scope, make subagents behave like primary agents in native `switch agent`.
