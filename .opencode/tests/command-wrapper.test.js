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