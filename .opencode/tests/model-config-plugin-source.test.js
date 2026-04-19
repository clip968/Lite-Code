import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model-config plugin imports the shared helper", async () => {
  const source = await readFile(new URL("../plugins/model-config.ts", import.meta.url), "utf8");

  assert.match(source, /from "\.\/model-config-shared\.js"/);
  assert.match(source, /buildModelConfigCommand\(/);
  assert.match(source, /resolveAgentModelState\(/);
  assert.match(source, /listMissingExplicitWorkerModels\(/);
  assert.doesNotMatch(source, /const ORCHESTRATION_AGENTS = \[/);
});
