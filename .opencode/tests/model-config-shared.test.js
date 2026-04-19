import test from "node:test";
import assert from "node:assert/strict";

import {
  ORCHESTRATION_AGENTS,
  applyAgentModelSelection,
  buildModelConfigCommand,
  listMissingExplicitWorkerModels,
  resolveAgentModelState,
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
    "",
  );
});

test("worker state marks missing explicit models as requiring attention", () => {
  const state = resolveAgentModelState(
    "tester",
    { model: "openai/gpt-5.4-mini", agent: {} },
    [],
  );

  assert.equal(state.current, "openai/gpt-5.4-mini (global default)");
  assert.equal(state.raw, "");
  assert.equal(state.source, "global");
  assert.equal(state.needsAttention, true);
  assert.match(state.notice, /Explicit worker model not set/);
  assert.match(state.notice, /inherit the invoking primary agent/);
});

test("missing explicit worker list only includes unset Stage 5-lite workers", () => {
  assert.deepEqual(
    listMissingExplicitWorkerModels({
      agent: {
        plan: { model: "openai/gpt-5.4" },
        reviewer: { model: "openai/gpt-5.4" },
        fixer: { model: "openai/gpt-5.4-mini" },
      },
    }),
    ["tester", "coder"],
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
