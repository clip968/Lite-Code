import test from "node:test";
import assert from "node:assert/strict";

import { detectCommand } from "../plugins/orchestrator.ts";

test("detectCommand ignores /lite-* strings embedded in prompt bodies", () => {
  assert.equal(
    detectCommand({
      prompt: "Please run /lite-fix after review, but this is just body text.",
      command: "task",
    }),
    "task",
  );
});

test("detectCommand still accepts explicit slash commands from args.command", () => {
  assert.equal(detectCommand({ command: "/lite-fix", prompt: "plain text" }), "/lite-fix");
});