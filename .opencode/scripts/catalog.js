import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultCacheDir() {
  return process.env.OPENCODE_CACHE_DIR || join(homedir(), ".cache", "lite-code");
}

function getCachePath(cacheDir = defaultCacheDir()) {
  return resolve(cacheDir, "models.dev.json");
}

function normalizeCatalog(raw) {
  const providers = raw?.providers || raw || {};
  const models = [];

  for (const [providerId, providerData] of Object.entries(providers)) {
    for (const [modelId, modelData] of Object.entries(providerData?.models || {})) {
      const id = `${providerId}/${modelId}`;
      models.push({
        id,
        provider: providerId,
        model: modelId,
        name: modelData?.name || id,
        context: modelData?.limits?.context || modelData?.contextWindow || null,
        costInput: modelData?.cost?.input ?? null,
        costOutput: modelData?.cost?.output ?? null,
        supportsToolCall: Boolean(modelData?.capabilities?.tool_call || modelData?.tools),
        supportsReasoning: Boolean(modelData?.capabilities?.reasoning),
      });
    }
  }

  return { providers, models, fetchedAt: Date.now() };
}

function readCache(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export async function loadCatalog({
  refresh = false,
  fetchImpl = globalThis.fetch,
  nowFn = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  cacheDir,
} = {}) {
  const cachePath = getCachePath(cacheDir);
  const now = nowFn();
  const cached = readCache(cachePath);
  const isFresh = cached?.fetchedAt && now - cached.fetchedAt < ttlMs;

  if (!refresh && isFresh) {
    return { catalog: cached, source: "cache", cachePath };
  }

  try {
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch 구현이 없습니다.");
    }
    const res = await fetchImpl(MODELS_DEV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const normalized = normalizeCatalog(json);
    writeCache(cachePath, normalized);
    return { catalog: normalized, source: "network", cachePath };
  } catch (error) {
    if (cached) {
      return {
        catalog: cached,
        source: "cache-fallback",
        cachePath,
        warning: `네트워크 실패로 캐시 사용: ${error.message}`,
      };
    }
    const wrapped = new Error(
      `models.dev 카탈로그를 가져올 수 없고 캐시도 없습니다. (${error.message})`,
    );
    wrapped.code = "CATALOG_UNAVAILABLE";
    throw wrapped;
  }
}

export function filterCatalog(catalog, {
  keyword = "",
  provider,
  maxCost,
  toolCall,
  reasoning,
  context,
} = {}) {
  const key = String(keyword || "").trim().toLowerCase();
  return (catalog.models || []).filter((model) => {
    if (provider && model.provider !== provider) return false;
    if (typeof maxCost === "number") {
      const combined = (model.costInput ?? 0) + (model.costOutput ?? 0);
      if (combined > maxCost) return false;
    }
    if (toolCall && !model.supportsToolCall) return false;
    if (reasoning && !model.supportsReasoning) return false;
    if (typeof context === "number" && (model.context || 0) < context) return false;
    if (!key) return true;
    const hay = `${model.id} ${model.name}`.toLowerCase();
    return hay.includes(key);
  });
}

export function hasModelId(catalog, fullId) {
  return (catalog.models || []).some((model) => model.id === fullId);
}
