# Orchestrator Command Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `.opencode/plugins/orchestrator.ts` from treating `/lite-*` strings inside `task` prompt bodies as real lifecycle commands.

**Architecture:** Narrow command detection to the explicit `args.command` field only. Add a regression test that proves prompt-body mentions like `/lite-fix` do not trigger detection, then make the minimal implementation change required to pass.

**Tech Stack:** Node.js, ESM, `node:test`, `node:assert/strict`, TypeScript source plugin

---

### Task 1: Lock Command Detection To Explicit Command Field

**Files:**
- Create: `.opencode/tests/orchestrator.test.js`
- Modify: `.opencode/plugins/orchestrator.ts`
- Verify: `node --test .opencode/tests/orchestrator.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .opencode/tests/orchestrator.test.js`
Expected: FAIL because current `detectCommand()` prefers slash-command matches from `args.prompt` and returns `/lite-fix` for the first test.

- [ ] **Step 3: Write minimal implementation**

```ts
function detectCommand(args?: Record<string, unknown>): string {
  const cmd = typeof args?.command === "string" ? args.command : "";
  return cmd || "unknown";
}
```

If the test needs importing support, export `detectCommand` from `.opencode/plugins/orchestrator.ts` without changing any other runtime behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test .opencode/tests/orchestrator.test.js`
Expected: PASS

- [ ] **Step 5: Run broader regression check**

Run: `node --test .opencode/tests/*.test.js`
Expected: PASS with the new orchestrator test plus the existing `.opencode/tests/*.test.js` suite.

- [ ] **Step 6: Commit**

Skip commit for this repository unless the human explicitly requests one; the workspace is currently not a git repository.
