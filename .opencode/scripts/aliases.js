import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

const TEAM_ALIAS_PATH = resolve(process.cwd(), ".opencode", "scripts", "aliases.json");
const USER_ALIAS_PATH = resolve(homedir(), ".config", "opencode", "lite-aliases.json");

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function loadAliases({ teamPath = TEAM_ALIAS_PATH, userPath = USER_ALIAS_PATH } = {}) {
  const team = readJson(teamPath);
  const user = readJson(userPath);
  return {
    teamPath,
    userPath,
    team,
    user,
    merged: { ...team, ...user },
  };
}

export function listAliases(options = {}) {
  const { merged } = loadAliases(options);
  return Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));
}

export function addAlias(name, fullId, { userPath = USER_ALIAS_PATH } = {}) {
  const user = readJson(userPath);
  user[name] = fullId;
  writeJson(userPath, user);
  return user;
}

export function removeAlias(name, { userPath = USER_ALIAS_PATH } = {}) {
  const user = readJson(userPath);
  if (!(name in user)) return false;
  delete user[name];
  writeJson(userPath, user);
  return true;
}
