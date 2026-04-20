import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

test("all gold tickets satisfy required fields", async () => {
  const dir = new URL("../eval/gold-tickets/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 5);

  for (const name of files) {
    const raw = await readFile(new URL(name, dir), "utf8");
    const ticket = JSON.parse(raw);
    assert.equal(typeof ticket.id, "string", `${name}: id`);
    assert.equal(typeof ticket.category, "string", `${name}: category`);
    assert.equal(typeof ticket.goal, "string", `${name}: goal`);
    assert.ok(Array.isArray(ticket.allowed_files), `${name}: allowed_files`);
    assert.ok(Array.isArray(ticket.acceptance_criteria), `${name}: acceptance_criteria`);
    assert.ok(Array.isArray(ticket.non_scope), `${name}: non_scope`);
    assert.ok(Array.isArray(ticket.expected_path), `${name}: expected_path`);
    assert.equal(typeof ticket.expected_outcome, "string", `${name}: expected_outcome`);
  }
});
