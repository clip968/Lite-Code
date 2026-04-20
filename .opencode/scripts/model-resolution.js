const PROVIDER_MODEL_RE = /^[^/]+\/.+$/;

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function normalizeLoose(text) {
  return normalize(text).replace(/[-_./\s]+/g, "");
}

export function isFullModelId(spec) {
  return PROVIDER_MODEL_RE.test(String(spec || "").trim());
}

export function buildAliasReverseMap(aliases = {}) {
  const reverse = new Map();
  for (const [name, fullId] of Object.entries(aliases)) {
    if (!isFullModelId(fullId)) continue;
    if (!reverse.has(fullId)) reverse.set(fullId, []);
    reverse.get(fullId).push(name);
  }
  return reverse;
}

export function collectCatalogModelIds(catalog = {}) {
  if (Array.isArray(catalog.models)) {
    return catalog.models.map((item) => item.id).filter(Boolean);
  }

  const ids = [];
  for (const [providerId, provider] of Object.entries(catalog.providers || {})) {
    for (const modelId of Object.keys(provider.models || {})) {
      ids.push(`${providerId}/${modelId}`);
    }
  }
  return ids;
}

function fuzzyCandidates(spec, aliases = {}, catalog = {}, limit = 8) {
  const q = normalize(spec);
  const qLoose = normalizeLoose(spec);
  const out = [];

  for (const [alias, value] of Object.entries(aliases)) {
    const a = normalize(alias);
    const aLoose = normalizeLoose(alias);
    if (a.includes(q) || q.includes(a) || aLoose.includes(qLoose) || qLoose.includes(aLoose)) {
      out.push({ type: "alias", spec: alias, resolvedId: value, score: a === q ? 0 : 1 });
    }
  }

  const modelIds = collectCatalogModelIds(catalog);
  for (const id of modelIds) {
    const n = normalize(id);
    const loose = normalizeLoose(id);
    if (n.includes(q) || q.includes(n) || loose.includes(qLoose) || qLoose.includes(loose)) {
      out.push({ type: "model", spec: id, resolvedId: id, score: n === q ? 0 : 2 });
    }
  }

  return out
    .sort((a, b) => a.score - b.score || a.spec.localeCompare(b.spec))
    .slice(0, limit);
}

export function resolveModelSpec(spec, { aliases = {}, catalog = {}, allowUnknownFullId = true } = {}) {
  const rawSpec = String(spec || "").trim();
  if (!rawSpec) {
    const error = new Error("모델 spec이 비어 있습니다.");
    error.code = "EMPTY_SPEC";
    throw error;
  }

  if (isFullModelId(rawSpec)) {
    const catalogIds = new Set(collectCatalogModelIds(catalog));
    const inCatalog = catalogIds.size === 0 ? null : catalogIds.has(rawSpec);

    if (inCatalog === false && !allowUnknownFullId) {
      const error = new Error(`카탈로그에 없는 모델입니다: ${rawSpec}`);
      error.code = "MODEL_NOT_IN_CATALOG";
      error.spec = rawSpec;
      error.suggestions = fuzzyCandidates(rawSpec, aliases, catalog);
      throw error;
    }

    return {
      kind: "full-id",
      input: rawSpec,
      resolvedId: rawSpec,
      alias: null,
      inCatalog,
      warnings: inCatalog === false ? [`카탈로그에 없는 모델입니다: ${rawSpec}`] : [],
    };
  }

  const key = Object.keys(aliases).find((name) => normalize(name) === normalize(rawSpec));
  if (key) {
    return {
      kind: "alias",
      input: rawSpec,
      resolvedId: aliases[key],
      alias: key,
      inCatalog: collectCatalogModelIds(catalog).includes(aliases[key]),
      warnings: [],
    };
  }

  const candidates = fuzzyCandidates(rawSpec, aliases, catalog);
  const error = new Error(`알 수 없는 alias/spec: ${rawSpec}`);
  error.code = "UNKNOWN_MODEL_SPEC";
  error.spec = rawSpec;
  error.suggestions = candidates;
  throw error;
}

export function chooseAliasForModelId(fullId, aliases = {}) {
  const matched = Object.entries(aliases)
    .filter(([, value]) => value === fullId)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  return matched[0] || null;
}

export function replaceProvider(modelId, fromProvider, toProvider) {
  if (!isFullModelId(modelId)) return null;
  const prefix = `${fromProvider}/`;
  if (!modelId.startsWith(prefix)) return null;
  const suffix = modelId.slice(prefix.length);
  return `${toProvider}/${suffix}`;
}
