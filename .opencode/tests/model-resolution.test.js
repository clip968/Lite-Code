import test from "node:test";
import assert from "node:assert/strict";

import { resolveModelSpec, replaceProvider } from "../scripts/model-resolution.js";

const catalog = {
  models: [
    { id: "openai/gpt-5.4-mini" },
    { id: "openai/gpt-5.4" },
    { id: "openrouter/gpt-5.4-mini" },
    { id: "deepinfra/zai-org/GLM-5.1" },
  ],
};

const aliases = {
  mini: "openai/gpt-5.4-mini",
  smart: "openai/gpt-5.4",
  "fixer-glm": "deepinfra/zai-org/GLM-5.1",
};

test("resolveModelSpec: alias를 full ID로 전개한다", () => {
  const out = resolveModelSpec("mini", { aliases, catalog });
  assert.equal(out.resolvedId, "openai/gpt-5.4-mini");
  assert.equal(out.alias, "mini");
  assert.equal(out.kind, "alias");
});

test("resolveModelSpec: 슬래시가 있으면 full ID로 처리한다", () => {
  const out = resolveModelSpec("openai/gpt-5.4", { aliases, catalog });
  assert.equal(out.resolvedId, "openai/gpt-5.4");
  assert.equal(out.kind, "full-id");
});

test("resolveModelSpec: 알 수 없는 spec은 후보를 제시한다", () => {
  assert.throws(
    () => resolveModelSpec("sma", { aliases, catalog }),
    (error) => {
      assert.equal(error.code, "UNKNOWN_MODEL_SPEC");
      assert.ok(Array.isArray(error.suggestions));
      assert.ok(error.suggestions.some((item) => item.spec === "smart"));
      return true;
    },
  );
});

test("resolveModelSpec: 카탈로그에 없는 full ID는 경고와 함께 허용한다", () => {
  const out = resolveModelSpec("private/local-model", { aliases, catalog, allowUnknownFullId: true });
  assert.equal(out.resolvedId, "private/local-model");
  assert.equal(out.inCatalog, false);
  assert.ok(out.warnings.length > 0);
});

test("replaceProvider: provider 교체는 suffix를 유지한다", () => {
  assert.equal(replaceProvider("openai/gpt-5.4-mini", "openai", "openrouter"), "openrouter/gpt-5.4-mini");
  assert.equal(replaceProvider("deepinfra/zai-org/GLM-5.1", "openai", "openrouter"), null);
});
