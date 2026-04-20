import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadCatalog } from "../scripts/catalog.js";

function fixture() {
  return {
    providers: {
      openai: {
        models: {
          "gpt-5.4-mini": {
            name: "GPT-5.4 mini",
            limits: { context: 128000 },
            cost: { input: 0.15, output: 0.6 },
          },
        },
      },
    },
  };
}

test("loadCatalog: cache miss이면 네트워크를 사용하고 캐시를 만든다", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "lite-code-catalog-"));
  let called = 0;

  const result = await loadCatalog({
    cacheDir,
    fetchImpl: async () => {
      called += 1;
      return { ok: true, status: 200, json: async () => fixture() };
    },
    nowFn: () => 1000,
  });

  assert.equal(called, 1);
  assert.equal(result.source, "network");
  assert.equal(result.catalog.models.length, 1);
});

test("loadCatalog: stale cache + 오프라인이면 cache-fallback 사용", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "lite-code-catalog-"));
  const stalePath = join(cacheDir, "models.dev.json");
  writeFileSync(
    stalePath,
    JSON.stringify({ fetchedAt: 1000, models: [{ id: "openai/gpt-5.4-mini" }], providers: {} }),
    "utf8",
  );

  const result = await loadCatalog({
    cacheDir,
    nowFn: () => 1000 + 8 * 24 * 60 * 60 * 1000,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.equal(result.source, "cache-fallback");
  assert.match(result.warning, /네트워크 실패/);
});

test("loadCatalog: 캐시도 없고 오프라인이면 명확한 에러", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "lite-code-catalog-"));
  await assert.rejects(
    () =>
      loadCatalog({
        cacheDir,
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    (error) => {
      assert.equal(error.code, "CATALOG_UNAVAILABLE");
      return true;
    },
  );
});
