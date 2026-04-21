import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts/switch-preset.js");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "switch-preset-regression-"));
}

function countTopLevelAgentBlocks(raw) {
  return raw.split("\n").filter((line) => line === '  "agent": {').length;
}

test("set flow updates the agent model without duplicating the top-level agent block", () => {
  const dir = makeTempDir();
  const configPath = join(dir, "opencode.jsonc");
  const cacheDir = join(dir, "cache");
  const cachePath = join(cacheDir, "models.dev.json");

  try {
    mkdirSync(cacheDir, { recursive: true });

    writeFileSync(
      configPath,
      `{
  // this comment contains a brace { so the parser must ignore it
  "model": "openai/gpt-5.4-mini",
  "agent": {
    "coder": {
      "model": "openai/gpt-4o-mini",
      "temperature": 0.2
    }
  }
}
`,
      "utf8",
    );

    writeFileSync(
      cachePath,
      JSON.stringify(
        {
          providers: {},
          models: [
            {
              id: "openai/gpt-5.4-mini",
              provider: "openai",
              model: "gpt-5.4-mini",
            },
          ],
          fetchedAt: Date.now(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const env = {
      ...process.env,
      OPENCODE_CONFIG: configPath,
      OPENCODE_CACHE_DIR: cacheDir,
      NODE_NO_WARNINGS: "1",
    };

    execFileSync(process.execPath, [SCRIPT, "set", "coder", "openai/gpt-5.4-mini"], {
      env,
      stdio: "pipe",
    });
    execFileSync(process.execPath, [SCRIPT, "set", "coder", "openai/gpt-5.4-mini"], {
      env,
      stdio: "pipe",
    });

    const raw = readFileSync(configPath, "utf8");
    assert.equal(countTopLevelAgentBlocks(raw), 1);
    assert.match(raw, /"coder": \{\n\s+"model": "openai\/gpt-5\.4-mini"/);
    assert.match(raw, /"temperature": 0\.2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
