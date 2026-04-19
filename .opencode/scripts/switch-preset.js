#!/usr/bin/env node
/**
 * switch-preset.js — 서브에이전트 모델 프리셋 전환 스크립트
 *
 * 사용법:
 *   node .opencode/scripts/switch-preset.js <preset>
 *   node .opencode/scripts/switch-preset.js --list
 *
 * 예시:
 *   node .opencode/scripts/switch-preset.js economy
 *   node .opencode/scripts/switch-preset.js quality
 *   node .opencode/scripts/switch-preset.js full
 *   node .opencode/scripts/switch-preset.js default
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = resolve(__dirname, "../../opencode.jsonc");
const PRESETS_PATH = resolve(__dirname, "presets.json");

// ── JSONC helpers ──────────────────────────────────────────────

function stripJsoncComments(text) {
  // 문자열 리터럴 안의 // 는 건드리지 않고, 줄 코멘트만 제거
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
      // 줄 끝까지 스킵
      while (i < text.length && text[i] !== "\n") i++;
      result += "\n";
      continue;
    }

    result += ch;
  }

  return result;
}

function readJsonc(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(stripJsoncComments(raw));
}

function writeJsonc(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// ── Main ───────────────────────────────────────────────────────

function loadPresets() {
  try {
    return JSON.parse(readFileSync(PRESETS_PATH, "utf8"));
  } catch (e) {
    console.error(`❌ 프리셋 파일을 읽을 수 없습니다: ${PRESETS_PATH}`);
    console.error(e.message);
    process.exit(1);
  }
}

function listPresets(presets) {
  console.log("\n📋 사용 가능한 프리셋:\n");
  for (const [name, preset] of Object.entries(presets)) {
    console.log(`  ${name.padEnd(12)} ${preset.description}`);
    for (const [agent, cfg] of Object.entries(preset.agents)) {
      const model = cfg.model || "(global default)";
      console.log(`    ${agent.padEnd(10)} → ${model}`);
    }
    console.log();
  }
  console.log("사용법: node .opencode/scripts/switch-preset.js <preset>");
}

function applyPreset(presetName, presets) {
  const preset = presets[presetName];
  if (!preset) {
    console.error(`❌ 알 수 없는 프리셋: "${presetName}"`);
    console.error(`   사용 가능: ${Object.keys(presets).join(", ")}`);
    process.exit(1);
  }

  // 현재 opencode.jsonc 읽기
  let config;
  try {
    config = readJsonc(CONFIG_PATH);
  } catch (e) {
    console.error(`❌ opencode.jsonc를 읽을 수 없습니다: ${CONFIG_PATH}`);
    console.error(e.message);
    process.exit(1);
  }

  // agent 블록 업데이트
  if (!config.agent) config.agent = {};

  for (const [agentName, agentCfg] of Object.entries(preset.agents)) {
    if (agentCfg.model === null) {
      // 명시적 모델 제거
      if (config.agent[agentName]) {
        const { model: _removed, ...rest } = config.agent[agentName];
        if (Object.keys(rest).length === 0) {
          delete config.agent[agentName];
        } else {
          config.agent[agentName] = rest;
        }
      }
    } else {
      // 모델 설정 (기존 다른 속성은 유지)
      config.agent[agentName] = {
        ...(config.agent[agentName] || {}),
        model: agentCfg.model,
      };
    }
  }

  // agent 블록이 비었으면 제거
  if (Object.keys(config.agent).length === 0) {
    delete config.agent;
  }

  // 저장
  writeJsonc(CONFIG_PATH, config);

  // 결과 출력
  console.log(`\n✅ 프리셋 "${presetName}" 적용 완료!`);
  console.log(`   ${preset.description}\n`);

  for (const [agentName, agentCfg] of Object.entries(preset.agents)) {
    const model = agentCfg.model || "(global default)";
    const indicator = agentCfg.model ? "→" : "⤵";
    console.log(`   ${agentName.padEnd(10)} ${indicator} ${model}`);
  }

  console.log(`\n   저장됨: ${CONFIG_PATH}`);
  console.log("   ⚠️  OpenCode를 재시작해야 변경 사항이 반영됩니다.\n");
}

// ── CLI ────────────────────────────────────────────────────────

const arg = process.argv[2];

if (!arg || arg === "--help" || arg === "-h") {
  const presets = loadPresets();
  listPresets(presets);
  process.exit(0);
}

if (arg === "--list" || arg === "-l") {
  const presets = loadPresets();
  listPresets(presets);
  process.exit(0);
}

const presets = loadPresets();
applyPreset(arg, presets);
