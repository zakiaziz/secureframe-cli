import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Profile, Region } from "./types.js";
import { isObject, parseValue, redact, setPath } from "./values.js";

export interface AppConfig {
  readonly activeProfile?: string;
  readonly baseUrl?: string;
  readonly region?: Region;
  readonly [key: string]: unknown;
}

export function configDir(): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "secureframe");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function profilesDir(): string {
  return join(configDir(), "profiles");
}

export function profilePath(name: string): string {
  assertProfileName(name);
  return join(profilesDir(), `${name}.json`);
}

export function readConfig(): AppConfig {
  return existsSync(configPath()) ? readJsonFile<AppConfig>(configPath()) : {};
}

export function writeConfig(config: AppConfig): void {
  writeSecureJson(configPath(), config);
}

export function getActiveProfileName(): string | undefined {
  return readConfig().activeProfile;
}

export function setActiveProfileName(name: string): void {
  assertProfileName(name);
  writeConfig({ ...readConfig(), activeProfile: name });
}

export function listProfiles(): string[] {
  if (!existsSync(profilesDir())) return [];
  return readdirSync(profilesDir())
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -5))
    .sort();
}

export function readProfile(name: string | undefined): Profile | undefined {
  if (!name || !existsSync(profilePath(name))) return undefined;
  return readJsonFile<Profile>(profilePath(name));
}

export function requireProfile(name: string): Profile {
  const profile = readProfile(name);
  if (!profile) throw new Error(`Profile "${name}" does not exist`);
  return profile;
}

export function writeProfile(name: string, profile: Profile): void {
  writeSecureJson(profilePath(name), profile);
}

export function deleteProfile(name: string): void {
  const path = profilePath(name);
  if (!existsSync(path)) throw new Error(`Profile "${name}" does not exist`);
  rmSync(path);
}

export function showProfile(name: string): unknown {
  return redact(requireProfile(name));
}

export function configGet(path: string): unknown {
  let current: unknown = readConfig();
  for (const part of path.split(".").filter(Boolean)) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

export function configSet(path: string, raw: string): AppConfig {
  const config = { ...readConfig() };
  setPath(config, path, parseValue(raw));
  writeConfig(config);
  return config;
}

export function configUnset(path: string): AppConfig {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Config key cannot be empty");
  const config = { ...readConfig() };
  let cursor: Record<string, unknown> = config;
  for (const part of parts.slice(0, -1)) {
    if (!isObject(cursor[part])) return config;
    cursor = cursor[part] as Record<string, unknown>;
  }
  delete cursor[parts.at(-1) as string];
  writeConfig(config);
  return config;
}

function writeSecureJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertProfileName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(
      `Profile name "${name}" is invalid. Use only letters, numbers, dots, underscores, and hyphens.`,
    );
  }
}
