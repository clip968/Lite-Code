#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, parse as parsePath, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";

import { loadCatalog, filterCatalog, hasModelId } from "./catalog.js";
import { loadAliases, addAlias, removeAlias, listAliases } from "./aliases.js";
import { chooseAliasForModelId, resolveModelSpec, replaceProvider } from "./model-resolution.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_PATH = resolve(__dirname, "presets.json");
const CONFIG_FILENAMES = ["opencode.jsonc", "opencode.json"];
const KNOWN_AGENTS = ["curator", "coder", "tester", "fixer", "reviewer"];
const DEFAULT_AUTH_PATH = resolve(homedir(), ".local", "share", "opencode", "auth.json");

const PROVIDER_ALIAS_MAP = {
  "github-copilot": "githubcopilot",
  githubcopilot: "githubcopilot",
  "google-generativeai": "google",
  gemini: "google",
};

function findConfigUpwards(startDir) {
  let dir = startDir;
  const { root } = parsePath(dir);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveConfigPath() {
  const envConfig = process.env.OPENCODE_CONFIG;
  if (envConfig && existsSync(envConfig)) return { path: resolve(envConfig), source: "OPENCODE_CONFIG" };
  const found = findConfigUpwards(process.cwd());
  if (found) return { path: found, source: "cwd search" };
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (envDir) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(envDir, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return { path: resolve(candidate), source: "OPENCODE_CONFIG_DIR" };
      }
    }
  }
  return null;
}

function stripJsoncComments(text) {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      result += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString && ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      result += "\n";
      continue;
    }
    if (!inString && ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") result += "\n";
        i++;
      }
      i += 1;
      continue;
    }
    result += ch;
  }
  return result;
}

function stripTrailingCommas(text) {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      result += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString && ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    result += ch;
  }
  return result;
}

function readJsonc(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(stripTrailingCommas(stripJsoncComments(raw)));
}

function loadPresets() {
  return JSON.parse(readFileSync(PRESETS_PATH, "utf8"));
}

function modelLine(fullId, originalSpec) {
  if (!originalSpec || originalSpec === fullId) return `      "model": ${JSON.stringify(fullId)}`;
  return `      "model": ${JSON.stringify(fullId)} /* ${originalSpec} */`;
}

function buildAgentBlock(agent, modelSpecMap = {}) {
  const lines = [];
  const entries = Object.entries(agent || {});
  lines.push("{");
  for (let i = 0; i < entries.length; i++) {
    const [name, agentCfg] = entries[i];
    const keys = Object.keys(agentCfg || {});
    lines.push(`    ${JSON.stringify(name)}: {`);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const value = agentCfg[key];
      const isLast = j === keys.length - 1;
      if (key === "model") {
        const spec = modelSpecMap[name];
        lines.push(modelLine(value, spec) + (isLast ? "" : ","));
      } else {
        lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(value)}${isLast ? "" : ","}`);
      }
    }
    lines.push(`    }${i === entries.length - 1 ? "" : ","}`);
  }
  lines.push("  }");
  return lines.join("\n");
}

function locateTopLevelAgentBlock(raw) {
  let inString = false;
  let escape = false;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 1;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      const start = i;
      i += 1;
      while (i < raw.length && raw[i] !== "\"") {
        if (raw[i] === "\\") i += 1;
        i += 1;
      }
      inString = false;
      const key = raw.slice(start + 1, i);
      if (depth !== 1 || key !== "agent") continue;

      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (raw[j] !== ":") continue;
      j += 1;
      while (j < raw.length && /\s/.test(raw[j])) j++;
      if (raw[j] !== "{") continue;

      let d = 0;
      let k = j;
      let inObjString = false;
      let esc = false;
      for (; k < raw.length; k++) {
        const c = raw[k];
        if (esc) {
          esc = false;
          continue;
        }
        if (inObjString) {
          if (c === "\\") esc = true;
          else if (c === "\"") inObjString = false;
          continue;
        }
        if (c === "\"") {
          inObjString = true;
          continue;
        }
        if (c === "{") d++;
        if (c === "}") {
          d--;
          if (d === 0) break;
        }
      }
      return { start: j, end: k + 1 };
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
  }
  return null;
}

function writeConfigJsonc(path, config, modelSpecMap = {}) {
  const raw = readFileSync(path, "utf8");
  const agentBlock = buildAgentBlock(config.agent || {}, modelSpecMap);
  const located = locateTopLevelAgentBlock(raw);
  let next;
  if (located) {
    next = `${raw.slice(0, located.start)}${agentBlock}${raw.slice(located.end)}`;
  } else {
    const idx = raw.lastIndexOf("}");
    const prefix = raw.slice(0, idx).trimEnd();
    const comma = prefix.endsWith("{") ? "" : ",";
    next = `${prefix}${comma}\n  "agent": ${agentBlock}\n}\n`;
  }
  writeFileSync(path, next, "utf8");
}

function printHelp() {
  console.log(`\n사용법:
  node .opencode/scripts/switch-preset.js [preset]
  node .opencode/scripts/switch-preset.js apply <preset>
  node .opencode/scripts/switch-preset.js search <keyword> [--provider=X] [--connected-only] [--max-cost=N] [--tool-call] [--reasoning] [--context=N] [--limit=N|all] [--refresh]
  node .opencode/scripts/switch-preset.js set <agent> <spec> [--refresh]
  node .opencode/scripts/switch-preset.js swap-provider <from> <to> [--refresh]
  node .opencode/scripts/switch-preset.js alias <add|rm|ls> [...]
  node .opencode/scripts/switch-preset.js status [--refresh]\n`);
}

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    if (arg === "--refresh") flags.refresh = true;
    else if (arg === "--connected-only") flags.connectedOnly = true;
    else if (arg === "--tool-call") flags.toolCall = true;
    else if (arg === "--reasoning") flags.reasoning = true;
    else if (arg.startsWith("--provider=")) flags.provider = arg.split("=")[1];
    else if (arg.startsWith("--max-cost=")) flags.maxCost = Number(arg.split("=")[1]);
    else if (arg.startsWith("--context=")) flags.context = Number(arg.split("=")[1]);
    else if (arg.startsWith("--limit=")) {
      const raw = arg.split("=")[1];
      if (raw === "all") flags.limit = "all";
      else flags.limit = Number(raw);
    }
  }
  return flags;
}

function normalizeProviderName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return PROVIDER_ALIAS_MAP[base] || base;
}

function loadConnectedProviderSet() {
  const authPath = process.env.OPENCODE_AUTH_PATH || DEFAULT_AUTH_PATH;
  if (!existsSync(authPath)) {
    const err = new Error(`auth.json 파일이 없어 connected-only를 사용할 수 없습니다: ${authPath}`);
    err.code = "AUTH_FILE_MISSING";
    throw err;
  }

  const raw = JSON.parse(readFileSync(authPath, "utf8"));
  const connected = new Set();
  for (const key of Object.keys(raw || {})) {
    connected.add(normalizeProviderName(key));
  }
  return connected;
}

function formatPrice(model) {
  const i = model.costInput ?? "-";
  const o = model.costOutput ?? "-";
  return `${i}/${o}`;
}

async function applyPreset(presetName, { configPath, refresh = false }) {
  const presets = loadPresets();
  const preset = presets[presetName];
  if (!preset) throw new Error(`알 수 없는 프리셋: ${presetName}`);

  const { merged: aliases } = loadAliases();
  const { catalog, source } = await loadCatalog({ refresh });
  const config = readJsonc(configPath);
  config.agent = config.agent || {};
  const modelSpecMap = {};

  for (const [agent, cfg] of Object.entries(preset.agents || {})) {
    if (cfg.model === null) {
      if (config.agent[agent]) {
        const { model: _removed, ...rest } = config.agent[agent];
        config.agent[agent] = rest;
        if (Object.keys(rest).length === 0) delete config.agent[agent];
      }
      continue;
    }

    const resolved = resolveModelSpec(cfg.model, { aliases, catalog, allowUnknownFullId: true });
    modelSpecMap[agent] = cfg.model;
    config.agent[agent] = { ...(config.agent[agent] || {}), model: resolved.resolvedId };
  }

  writeConfigJsonc(configPath, config, modelSpecMap);
  console.log(`✅ 프리셋 적용 완료: ${presetName} (catalog: ${source})`);
}

function printPresetList() {
  const presets = loadPresets();
  for (const [name, preset] of Object.entries(presets)) {
    console.log(`- ${name}: ${preset.description}`);
  }
}

async function runSearch(keyword, flags, { configPath }) {
  const { catalog, source, warning } = await loadCatalog({ refresh: flags.refresh });
  if (warning) console.warn(`⚠️ ${warning}`);
  let items = filterCatalog(catalog, {
    keyword,
    provider: flags.provider,
    maxCost: Number.isFinite(flags.maxCost) ? flags.maxCost : undefined,
    toolCall: flags.toolCall,
    reasoning: flags.reasoning,
    context: Number.isFinite(flags.context) ? flags.context : undefined,
  });

  if (flags.connectedOnly) {
    const connectedSet = loadConnectedProviderSet();
    items = items.filter((item) => connectedSet.has(normalizeProviderName(item.provider)));
  }

  if (items.length === 0) {
    console.log("검색 결과가 없습니다.");
    return;
  }

  console.log(`\n🔎 검색 결과 (${items.length}개, source=${source})`);
  const rows =
    flags.limit === "all"
      ? items
      : items.slice(0, Number.isFinite(flags.limit) && flags.limit > 0 ? flags.limit : 20);
  rows.forEach((m, idx) => {
    console.log(`${String(idx + 1).padStart(2, " ")}. ${m.id.padEnd(42)} cost(in/out): ${formatPrice(m)} ctx: ${m.context ?? "-"}`);
  });

  if (rows.length < items.length) {
    console.log(`... ${items.length - rows.length}개 더 있음 (전체 출력: --limit=all)`);
  }

  const rl = readline.createInterface({ input, output });
  try {
    const choice = await rl.question("\n번호 선택 (엔터=취소): ");
    if (!choice.trim()) return;
    const selected = items[Number(choice.trim()) - 1];
    if (!selected) {
      console.log("잘못된 번호입니다.");
      return;
    }

    const action = await rl.question("동작 선택: [1] set agent [2] alias 저장 [엔터 취소] : ");
    const actionTrimmed = action.trim();
    if (actionTrimmed === "1") {
      let agent = await rl.question(`agent 이름 (${KNOWN_AGENTS.join(", ")}): `);
      let trimmed = agent.trim();
      while (!KNOWN_AGENTS.includes(trimmed)) {
        console.error(`unknown agent: ${trimmed}. Known agents: ${KNOWN_AGENTS.join(", ")}`);
        agent = await rl.question(`agent 이름 (${KNOWN_AGENTS.join(", ")}): `);
        trimmed = agent.trim();
      }
      await runSet(trimmed, selected.id, flags, { configPath });
    } else if (actionTrimmed === "2") {
      const name = await rl.question("alias 이름: ");
      if (!name.trim()) return;
      addAlias(name.trim(), selected.id);
      console.log(`✅ alias 저장: ${name.trim()} -> ${selected.id}`);
    }
  } finally {
    rl.close();
  }
}

async function runSet(agent, spec, flags, { configPath }) {
  if (!agent) throw new Error("agent가 필요합니다.");
  if (!KNOWN_AGENTS.includes(agent)) throw new Error(`unknown agent: ${agent}. Known agents: ${KNOWN_AGENTS.join(", ")}`);
  if (!spec) throw new Error("model spec이 필요합니다.");

  const { merged: aliases } = loadAliases();
  const { catalog, warning } = await loadCatalog({ refresh: flags.refresh });
  if (warning) console.warn(`⚠️ ${warning}`);

  let resolved;
  try {
    resolved = resolveModelSpec(spec, { aliases, catalog, allowUnknownFullId: true });
  } catch (error) {
    if (error.suggestions?.length) {
      console.error(`❌ ${error.message}`);
      console.error("   후보:");
      for (const item of error.suggestions) {
        console.error(`   - ${item.spec} -> ${item.resolvedId}`);
      }
      process.exit(1);
    }
    throw error;
  }

  const config = readJsonc(configPath);
  config.agent = config.agent || {};
  config.agent[agent] = { ...(config.agent[agent] || {}), model: resolved.resolvedId };
  writeConfigJsonc(configPath, config, { [agent]: spec });

  if (resolved.warnings.length) {
    console.warn(`⚠️ ${resolved.warnings.join("; ")}`);
  }
  console.log(`✅ ${agent} 모델 변경: ${resolved.resolvedId} (from: ${spec})`);
}

async function runSwapProvider(fromProvider, toProvider, flags, { configPath }) {
  const { catalog, warning } = await loadCatalog({ refresh: flags.refresh });
  if (warning) console.warn(`⚠️ ${warning}`);

  const config = readJsonc(configPath);
  const changed = [];
  const skipped = [];
  const modelSpecMap = {};

  for (const [agent, cfg] of Object.entries(config.agent || {})) {
    const current = cfg.model;
    const next = replaceProvider(current, fromProvider, toProvider);
    if (!next) {
      skipped.push({ agent, reason: "provider 불일치", model: current || "(unset)" });
      continue;
    }
    if (!hasModelId(catalog, next)) {
      skipped.push({ agent, reason: "대체 모델 없음", model: `${current} -> ${next}` });
      continue;
    }
    cfg.model = next;
    modelSpecMap[agent] = next;
    changed.push({ agent, from: current, to: next });
  }

  writeConfigJsonc(configPath, config, modelSpecMap);

  console.log("\n🔁 swap-provider 결과");
  for (const item of changed) {
    console.log(`- 변경: ${item.agent} ${item.from} -> ${item.to}`);
  }
  for (const item of skipped) {
    console.log(`- 유지: ${item.agent} (${item.reason}) ${item.model}`);
  }
  if (changed.length === 0) console.log("(변경 없음)");
}

function runAlias(args) {
  const action = args[0];
  if (action === "ls") {
    const rows = listAliases();
    if (rows.length === 0) {
      console.log("alias가 없습니다.");
      return;
    }
    for (const [name, fullId] of rows) {
      console.log(`- ${name.padEnd(16)} ${fullId}`);
    }
    return;
  }

  if (action === "add") {
    const [name, fullId] = [args[1], args[2]];
    if (!name || !fullId) throw new Error("alias add <name> <provider/model> 형식이 필요합니다.");
    addAlias(name, fullId);
    console.log(`✅ alias 저장: ${name} -> ${fullId}`);
    return;
  }

  if (action === "rm") {
    const name = args[1];
    if (!name) throw new Error("alias rm <name> 형식이 필요합니다.");
    const removed = removeAlias(name);
    console.log(removed ? `✅ alias 삭제: ${name}` : `ℹ️ alias 없음: ${name}`);
    return;
  }

  throw new Error("alias 서브커맨드는 add|rm|ls 중 하나여야 합니다.");
}

async function runStatus(flags, { configPath }) {
  const { merged: aliases } = loadAliases();
  const { catalog, warning } = await loadCatalog({ refresh: flags.refresh });
  if (warning) console.warn(`⚠️ ${warning}`);
  const config = readJsonc(configPath);
  console.log("\n현재 agent 모델 상태\n");
  console.log("agent      alias            full id                                   cost(in/out)   ctx");
  console.log("----------------------------------------------------------------------------------------------");

  for (const agent of Object.keys(config.agent || {})) {
    const fullId = config.agent[agent]?.model || "";
    const alias = chooseAliasForModelId(fullId, aliases) || "-";
    const model = (catalog.models || []).find((m) => m.id === fullId);
    const price = model ? formatPrice(model) : "-";
    const ctx = model?.context ?? "-";
    console.log(`${agent.padEnd(10)} ${alias.padEnd(16)} ${fullId.padEnd(42)} ${String(price).padEnd(14)} ${ctx}`);
  }
}

async function interactiveMenu({ configPath }) {
  const presets = loadPresets();
  const names = Object.keys(presets);
  console.log("프리셋을 선택하세요:");
  names.forEach((name, idx) => console.log(`${idx + 1}. ${name} - ${presets[name].description}`));
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("번호 (엔터 취소): ");
    if (!answer.trim()) return;
    const selected = names[Number(answer) - 1];
    if (!selected) throw new Error("잘못된 선택입니다.");
    await applyPreset(selected, { configPath });
  } finally {
    rl.close();
  }
}

async function main() {
  const resolved = resolveConfigPath();
  if (!resolved) {
    console.error("❌ opencode.jsonc/opencode.json 파일을 찾지 못했습니다.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    await interactiveMenu({ configPath: resolved.path });
    return;
  }

  if (["--help", "-h"].includes(cmd)) {
    printHelp();
    return;
  }

  if (["--list", "-l", "list"].includes(cmd)) {
    printPresetList();
    return;
  }

  if (cmd === "apply") {
    const preset = args[1];
    if (!preset) throw new Error("apply <preset> 형식이 필요합니다.");
    await applyPreset(preset, { configPath: resolved.path, refresh: args.includes("--refresh") });
    return;
  }

  if (cmd === "search") {
    const keyword = args[1] || "";
    const flags = parseFlags(args.slice(2));
    await runSearch(keyword, flags, { configPath: resolved.path });
    return;
  }

  if (cmd === "set") {
    const [agent, spec] = [args[1], args[2]];
    const flags = parseFlags(args.slice(3));
    await runSet(agent, spec, flags, { configPath: resolved.path });
    return;
  }

  if (cmd === "swap-provider") {
    const [fromProvider, toProvider] = [args[1], args[2]];
    if (!fromProvider || !toProvider) throw new Error("swap-provider <from> <to> 형식이 필요합니다.");
    const flags = parseFlags(args.slice(3));
    await runSwapProvider(fromProvider, toProvider, flags, { configPath: resolved.path });
    return;
  }

  if (cmd === "alias") {
    runAlias(args.slice(1));
    return;
  }

  if (cmd === "status") {
    const flags = parseFlags(args.slice(1));
    await runStatus(flags, { configPath: resolved.path });
    return;
  }

  // 하위 호환: 기존 방식(node switch-preset.js <preset>)
  await applyPreset(cmd, { configPath: resolved.path, refresh: args.includes("--refresh") });
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
