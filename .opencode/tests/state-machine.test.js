import test from "node:test";
import assert from "node:assert/strict";

import { canTransition, validateHistory } from "../plugins/state-machine.ts";

test("canTransition allows valid edge", () => {
  assert.equal(canTransition("PLANNED", "CONTEXT_READY"), true);
});

test("canTransition rejects invalid edge", () => {
  assert.equal(canTransition("PLANNED", "DONE"), false);
});

test("validateHistory reports illegal transitions", () => {
  const errors = validateHistory({
    id: "T-X",
    history: [{ from: "PLANNED", to: "DONE" }],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Illegal transition/);
});
