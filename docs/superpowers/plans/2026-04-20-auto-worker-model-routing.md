# Auto Worker Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the per-agent model assignment path for Stage 5-lite so `plan`, `build`, `coder`, `tester`, `fixer`, and `reviewer` can be configured from OpenCode with stable slash/palette discoverability, honest `Use default` handling, and visible warnings when worker models are still inherited.

**Architecture:** Extract the pure model-config logic from `.opencode/plugins/model-config.ts` into a plain JavaScript helper that can be exercised with `node:test` without adding a TypeScript toolchain. Keep the TUI plugin responsible for dialog rendering, keep canonical worker names unchanged for `/lite-auto`, and use project command markdown files only as honest discoverability wrappers where direct UI invocation is unavailable. The picker must distinguish explicit overrides from inherited runtime/global resolution so workers without `agent.<name>.model` are visibly marked as `UNSET` and the model dialog keeps `Use default` selected until an explicit override is written.

**Tech Stack:** OpenCode TUI plugin API, plain JavaScript ESM, built-in `node:test`, Markdown project commands

---

> Note: `git rev-parse --is-inside-work-tree` currently fails in `/mnt/d/programming/Lite-Code`, so this plan intentionally omits commit steps and uses explicit verification checkpoints instead.

## File Map

- `.opencode/plugins/model-config.ts`
  - Existing TUI plugin entrypoint. After implementation it should keep only the dialog/runtime wiring and import testable pure helpers. The agent list should visibly flag unset worker models, and the model picker should leave `Use default` selected when there is no explicit override.
- `.opencode/plugins/model-config-shared.js`
  - New plain-JS helper for orchestration agent metadata, slash command metadata, config merge/removal logic, explicit-vs-inherited model state, and missing-worker notices.
- `.opencode/tests/model-config-shared.test.js`
  - New `node:test` coverage for helper behavior: stable agent list, stable slash metadata, fallback resolution, and safe per-agent model removal.
- `.opencode/tests/model-config-plugin-source.test.js`
  - New static smoke test that ensures `model-config.ts` imports the shared helper instead of re-declaring orchestration metadata inline.
- `.opencode/commands/agent-models.md`
  - Existing project command wrapper. Rewrite it to be an honest Korean discoverability/fallback entrypoint.
- `.opencode/commands/models.md`
  - New short alias wrapper so `/models` is discoverable even if plugin `slash.aliases` are not surfaced by the runtime.
- `.opencode/tests/command-wrapper.test.js`
  - New `node:test` coverage for wrapper existence and required guidance text.
- `opencode.jsonc`
  - Verification target only. No code change is planned here; manual validation confirms writes land under `agent.<name>.model`.

### Task 1: Extract Pure Model-Config Logic Into a Testable Helper

**Files:**
- Create: `.opencode/plugins/model-config-shared.js`
- Create: `.opencode/tests/model-config-shared.test.js`

- [ ] **Step 1: Write the failing helper test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  ORCHESTRATION_AGENTS,
  applyAgentModelSelection,
  buildModelConfigCommand,
  resolveCurrentModel,
  resolveCurrentModelRaw,
} from "../plugins/model-config-shared.js";

test("orchestration agents stay aligned with Stage 5-lite routing names", () => {
  assert.deepEqual(
    ORCHESTRATION_AGENTS.map((agent) => agent.name),
    ["plan", "build", "reviewer", "tester", "fixer", "coder"],
  );
});

test("model-config command exposes stable slash names", () => {
  const command = buildModelConfigCommand(() => {});

  assert.equal(command.value, "lite-model-config");
  assert.equal(command.title, "Configure Agent Models");
  assert.equal(command.slash.name, "agent-models");
  assert.deepEqual(command.slash.aliases, ["models", "configure-agent-models"]);
});

test("resolveCurrentModel falls back from explicit to runtime to global", () => {
  assert.equal(
    resolveCurrentModel(
      "tester",
      { model: "openai/gpt-5.4-mini", agent: {} },
      [{ name: "tester", model: { providerID: "openrouter", modelID: "qwen/qwen3-coder" } }],
    ),
    "openrouter/qwen/qwen3-coder",
  );

  assert.equal(
    resolveCurrentModel(
      "fixer",
      { model: "openai/gpt-5.4-mini", agent: {} },
      [],
    ),
    "openai/gpt-5.4-mini (global default)",
  );

  assert.equal(
    resolveCurrentModelRaw(
      "fixer",
      { model: "openai/gpt-5.4-mini", agent: {} },
      [],
    ),
    "openai/gpt-5.4-mini",
  );
});

test("clearing an agent model preserves sibling fields", () => {
  const nextAgent = applyAgentModelSelection(
    {
      coder: { model: "openai/gpt-5.4-mini", temperature: 0.1 },
      reviewer: { model: "openai/gpt-5.4" },
    },
    "coder",
    "",
  );

  assert.deepEqual(nextAgent, {
    coder: { temperature: 0.1 },
    reviewer: { model: "openai/gpt-5.4" },
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test .opencode/tests/model-config-shared.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `.opencode/plugins/model-config-shared.js` does not exist yet.

- [ ] **Step 3: Write the minimal shared helper**

```js
export const ORCHESTRATION_AGENTS = [
  { name: "plan", label: "Planner", role: "계획/분석", costTier: "high" },
  { name: "build", label: "Coder (build)", role: "구현", costTier: "low" },
  { name: "reviewer", label: "Reviewer", role: "최종 검수", costTier: "high" },
  { name: "tester", label: "Tester", role: "검증", costTier: "low" },
  { name: "fixer", label: "Fixer", role: "수정", costTier: "low" },
  { name: "coder", label: "Coder (auto)", role: "자동 모드 구현", costTier: "low" },
];

export function buildModelConfigCommand(onSelect) {
  return {
    title: "Configure Agent Models",
    value: "lite-model-config",
    description: "에이전트별 모델/프로바이더 설정",
    category: "Lite-Code",
    suggested: true,
    slash: {
      name: "agent-models",
      aliases: ["models", "configure-agent-models"],
    },
    onSelect,
  };
}

export function resolveCurrentModel(agentName, config, agents) {
  const explicit = config?.agent?.[agentName]?.model;
  if (explicit) return explicit;

  const runtimeAgent = agents?.find((agent) => agent.name === agentName);
  const runtimeModel = runtimeAgent?.model;
  if (runtimeModel?.providerID && runtimeModel?.modelID) {
    return `${runtimeModel.providerID}/${runtimeModel.modelID}`;
  }

  if (config?.model) return `${config.model} (global default)`;
  return "(not set)";
}

export function resolveCurrentModelRaw(agentName, config, agents) {
  const explicit = config?.agent?.[agentName]?.model;
  if (explicit) return explicit;

  const runtimeAgent = agents?.find((agent) => agent.name === agentName);
  const runtimeModel = runtimeAgent?.model;
  if (runtimeModel?.providerID && runtimeModel?.modelID) {
    return `${runtimeModel.providerID}/${runtimeModel.modelID}`;
  }

  return config?.model ?? "";
}

export function applyAgentModelSelection(currentAgentConfig, agentName, modelValue) {
  const nextAgent = { ...(currentAgentConfig ?? {}) };

  if (modelValue === "") {
    const existing = nextAgent[agentName];
    if (existing && typeof existing === "object") {
      const { model: _removedModel, ...rest } = existing;
      if (Object.keys(rest).length === 0) delete nextAgent[agentName];
      else nextAgent[agentName] = rest;
    }
    return nextAgent;
  }

  nextAgent[agentName] = {
    ...(nextAgent[agentName] ?? {}),
    model: modelValue,
  };
  return nextAgent;
}
```

- [ ] **Step 4: Run the helper test again**

Run: `node --test .opencode/tests/model-config-shared.test.js`

Expected: PASS with all helper tests green.

### Task 2: Rewire the TUI Plugin to Use the Shared Helper

**Files:**
- Modify: `.opencode/plugins/model-config.ts`
- Create: `.opencode/tests/model-config-plugin-source.test.js`
- Test: `.opencode/tests/model-config-shared.test.js`

- [ ] **Step 1: Write the failing plugin-source smoke test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model-config plugin imports the shared helper", async () => {
  const source = await readFile(new URL("../plugins/model-config.ts", import.meta.url), "utf8");

  assert.match(source, /from "\.\/model-config-shared\.js"/);
  assert.match(source, /buildModelConfigCommand\(/);
  assert.doesNotMatch(source, /const ORCHESTRATION_AGENTS = \[/);
});
```

- [ ] **Step 2: Run the plugin-source test to verify it fails**

Run: `node --test .opencode/tests/model-config-plugin-source.test.js`

Expected: FAIL because `.opencode/plugins/model-config.ts` still declares `ORCHESTRATION_AGENTS` inline and does not import the shared helper.

- [ ] **Step 3: Replace inline metadata/merge logic with shared imports**

```ts
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Agent, Config, Model } from "@opencode-ai/sdk/v2/client";

import {
  ORCHESTRATION_AGENTS,
  applyAgentModelSelection,
  buildModelConfigCommand,
  resolveCurrentModel,
  resolveCurrentModelRaw,
} from "./model-config-shared.js";

// ... keep formatCost() and directoryQuery() as local runtime helpers

export const tui: TuiPlugin = async (api) => {
  async function applyModelConfig(agentName: string, modelValue: string) {
    try {
      const getRes = await api.client.config.get(directoryQuery(api));
      const prev = getRes.data;
      if (!prev) throw new Error("Configuration unavailable");

      const nextAgent = applyAgentModelSelection(prev.agent ?? {}, agentName, modelValue);

      await api.client.config.update({
        ...directoryQuery(api),
        config: { agent: nextAgent },
      });

      api.ui.toast({
        variant: "success",
        title: "Model updated",
        message: `${agentName} -> ${modelValue || "default"}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Configuration update failed";
      api.ui.toast({ variant: "error", title: "Failed to update", message: msg });
    } finally {
      await showAgentSelect();
    }
  }

  // ... keep the existing dialog flow, but rely on imported resolveCurrentModel* helpers

  api.command.register(() => [
    buildModelConfigCommand(() => {
      void showAgentSelect();
    }),
  ]);
};
```

- [ ] **Step 4: Run both automated tests after the plugin refactor**

Run: `node --test .opencode/tests/model-config-shared.test.js .opencode/tests/model-config-plugin-source.test.js`

Expected: PASS with both test files green.

### Task 3: Make Slash Discoverability Honest and Stable

**Files:**
- Modify: `.opencode/commands/agent-models.md`
- Create: `.opencode/commands/models.md`
- Create: `.opencode/tests/command-wrapper.test.js`

- [ ] **Step 1: Write the failing wrapper test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function loadCommandDoc(name) {
  return readFile(new URL(`../commands/${name}.md`, import.meta.url), "utf8");
}

test("agent-models wrapper references the palette entry", async () => {
  const doc = await loadCommandDoc("agent-models");

  assert.match(doc, /Configure Agent Models/);
  assert.match(doc, /Ctrl\+Shift\+P/);
  assert.match(doc, /opencode\.jsonc/);
});

test("models wrapper exists as a short alias", async () => {
  const doc = await loadCommandDoc("models");

  assert.match(doc, /agent-models/);
  assert.match(doc, /Configure Agent Models/);
});
```

- [ ] **Step 2: Run the wrapper test to verify it fails**

Run: `node --test .opencode/tests/command-wrapper.test.js`

Expected: FAIL with `ENOENT` because `.opencode/commands/models.md` does not exist yet.

- [ ] **Step 3: Rewrite the main wrapper and add the short alias wrapper**

```md
---
description: Open the agent model configuration guidance for orchestration agents
subtask: false
---

사용자가 이 명령을 실행하면, 실제 모델 선택은 `Configure Agent Models` TUI에서 하도록 안내한다.

반드시 아래 순서로 안내한다.

1. `Ctrl+Shift+P`(macOS는 `Cmd+Shift+P`)로 Command Palette를 연다.
2. `Configure Agent Models`를 검색해서 실행한다.
3. `plan`, `build`, `coder`, `tester`, `fixer`, `reviewer` 중 하나를 고른다.
4. 원하는 `provider/model`을 선택한다.

추가로 아래 사실을 함께 설명한다.

- 현재 저장 위치는 `opencode.jsonc`의 `agent.<name>.model`이다.
- 런타임이 plugin `slash` 메타데이터를 연결하는 경우에는 plugin slash entry가 같은 UI를 바로 열 수 있다.
- 그렇지 않은 경우 이 project command는 discoverability/fallback 역할만 하며, 성공한 척하지 않는다.
```

```md
---
description: Short alias for /agent-models
subtask: false
---

이 명령은 `/agent-models`의 짧은 별칭이다.

사용자가 실행하면 `/agent-models`와 동일한 안내를 제공한다.

1. Command Palette를 연다.
2. `Configure Agent Models`를 검색한다.
3. 같은 TUI picker에서 에이전트별 모델을 설정한다.
```

- [ ] **Step 4: Run the full automated check set**

Run: `node --test .opencode/tests/model-config-shared.test.js .opencode/tests/model-config-plugin-source.test.js .opencode/tests/command-wrapper.test.js`

Expected: PASS with all three test files green.

### Task 4: Manual Runtime Verification in OpenCode

**Files:**
- Verify: `opencode.jsonc`
- Verify: `.opencode/state/run-log.json` (optional smoke-check only)

- [ ] **Step 1: Re-run the full automated checks before opening the TUI**

Run: `node --test .opencode/tests/model-config-shared.test.js .opencode/tests/model-config-plugin-source.test.js .opencode/tests/command-wrapper.test.js`

Expected: PASS.

- [ ] **Step 2: Verify palette and slash discoverability manually**

Run OpenCode in `/mnt/d/programming/Lite-Code`, then confirm all of the following:

1. Slash autocomplete lists `/agent-models`.
2. Slash autocomplete lists `/models`.
3. Command Palette shows `Configure Agent Models`.
4. The palette command opens the two-step picker without errors.

- [ ] **Step 3: Verify model persistence for two different agents**

Inside `Configure Agent Models`:

1. Set `coder` to `openai/gpt-5.4-mini`.
2. Set `reviewer` to `openai/gpt-5.4`.

Then inspect `opencode.jsonc` and verify it contains this shape:

```jsonc
{
  "agent": {
    "coder": { "model": "openai/gpt-5.4-mini" },
    "reviewer": { "model": "openai/gpt-5.4" }
  }
}
```

- [ ] **Step 4: Verify `Use default` only clears the model override**

In the picker, choose `Use default` for `coder`, then confirm `opencode.jsonc` removes only `agent.coder.model` and leaves any sibling keys untouched. The expected shape after clearing is:

```jsonc
{
  "agent": {
    "reviewer": { "model": "openai/gpt-5.4" }
  }
}
```

- [ ] **Step 5: Optional Stage 5-lite smoke test**

Use a safe no-edit prompt such as:

```text
/lite-auto 현재 저장소의 Stage 5-lite 목적만 간단히 요약해줘. 파일 수정은 하지 마.
```

Expected:

1. No unknown-agent or missing-command error appears.
2. The session completes normally.
3. If `.opencode/state/run-log.json` is updated, the newest entry still records `"command": "/lite-auto"` and `"agent": "manager"` without any worker-name mismatch.

## Self-Review Checklist

- Spec coverage:
  - AC-1 discoverability is covered by Task 3 and Task 4 step 2.
  - AC-2 orchestration-agent support is covered by Task 1 helper tests and Task 2 plugin refactor.
  - AC-3 `agent.<name>.model` persistence is covered by Task 2 helper reuse and Task 4 step 3.
  - AC-4 `Use default` safety is covered by Task 1 helper tests and Task 4 step 4.
  - AC-5 worker-name compatibility is covered by Task 1 stable-name test and Task 4 step 5.
  - AC-6 bounded `subagent` scope is preserved because this plan never edits `.opencode/agents/*.md`.
- Known constraint:
  - This plan guarantees the real picker opens from the command palette and from plugin slash metadata when the runtime wires it up.
  - The `.opencode/commands/*.md` wrappers are still honest discoverability/fallback entries, because markdown project commands do not have a proven direct path to `api.command.trigger()` in the current runtime.
  - If strict “project slash command always opens the same picker UI directly” behavior is non-negotiable, the design/spec must be narrowed or revised before implementation starts.
- Placeholder scan: no `TODO`, `TBD`, or implied “implement later” language remains.
- Type/property consistency: the plan uses `agent.<name>.model`, `lite-model-config`, `agent-models`, and the fixed worker names consistently.
