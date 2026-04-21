import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

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

test("runSet rejects invalid agent names", () => {
  const dir = makeTempDir();
  const configPath = join(dir, "opencode.jsonc");
  const cacheDir = join(dir, "cache");
  const cachePath = join(cacheDir, "models.dev.json");

  try {
    mkdirSync(cacheDir, { recursive: true });

    writeFileSync(
      configPath,
      `{
  "model": "openai/gpt-5.4-mini"
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

    assert.throws(() => {
      execFileSync(process.execPath, [SCRIPT, "set", "invalidagent", "openai/gpt-5.4-mini"], {
        env,
        stdio: "pipe",
      });
    }, /unknown agent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("search interactive retries on invalid agent name", async () => {
  const dir = makeTempDir();
  const configPath = join(dir, "opencode.jsonc");
  const cacheDir = join(dir, "cache");
  const cachePath = join(cacheDir, "models.dev.json");

  try {
    mkdirSync(cacheDir, { recursive: true });

    writeFileSync(
      configPath,
      `{
  "model": "openai/gpt-5.4-mini"
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

    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, "search", "gpt"], { env });
      let stdout = "";
      let stderr = "";
      let step = 0;

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();

        if (step === 0 && stdout.includes("번호 선택 (엔터=취소):")) {
          child.stdin.write("1\n");
          step = 1;
          return;
        }

        if (step === 1 && stdout.includes("동작 선택: [1] set agent [2] alias 저장 [엔터 취소] :")) {
          child.stdin.write("1\n");
          step = 2;
          return;
        }

        if (step === 2 && stdout.includes("agent 이름 (curator, coder, tester, fixer, reviewer):")) {
          child.stdin.write("invalid\n");
          step = 3;
          return;
        }

        if (step === 3 && stderr.includes("unknown agent: invalid")) {
          child.stdin.write("coder\n");
          child.stdin.end();
          step = 4;
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();

        if (step === 3 && stderr.includes("unknown agent: invalid")) {
          child.stdin.write("coder\n");
          child.stdin.end();
          step = 4;
        }
      });

      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });

    assert.equal(result.status, 0);
    assert.match(result.stderr, /unknown agent: invalid/);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.agent.coder.model, "openai/gpt-5.4-mini");
    // Ensure invalid agent not added
    assert(!config.agent.invalid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
