import type { GlobalOptions, ParsedArgs, UnknownFlag } from "./types.js";

const valueFlags = new Set([
  "profile",
  "api-key",
  "api-secret",
  "region",
  "base-url",
  "data",
  "set",
  "query-param",
]);

const booleanFlags = new Set(["yes", "force", "dry-run", "all", "help", "version", "from-env"]);

const aliases: Record<string, string> = {
  h: "help",
  v: "version",
  y: "yes",
};

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  const unknownFlags: UnknownFlag[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--") {
      command.push(...argv.slice(index + 1));
      break;
    }

    if (!arg.startsWith("-") || arg === "-") {
      command.push(arg);
      continue;
    }

    const token = parseFlagToken(arg);
    const name = aliases[token.name] ?? token.name;

    if (booleanFlags.has(name)) {
      setFlag(flags, name, token.value ?? true);
      continue;
    }

    if (valueFlags.has(name)) {
      const value = token.value ?? argv[index + 1];
      if (value === undefined || (token.value === undefined && value.startsWith("-"))) {
        throw new Error(`Missing value for --${name}`);
      }
      if (token.value === undefined) index += 1;
      setFlag(flags, name, value);
      continue;
    }

    const value = token.value ?? nextFlagValue(argv[index + 1]);
    if (token.value === undefined && value !== true) index += 1;
    unknownFlags.push({ name, value });
  }

  return { command, flags, unknownFlags };
}

export function getGlobalOptions(parsed: ParsedArgs): GlobalOptions {
  return {
    profile: getString(parsed.flags, "profile"),
    apiKey: getString(parsed.flags, "api-key"),
    apiSecret: getString(parsed.flags, "api-secret"),
    region: getString(parsed.flags, "region"),
    baseUrl: getString(parsed.flags, "base-url"),
    data: getString(parsed.flags, "data"),
    set: getStringArray(parsed.flags, "set"),
    query: getStringArray(parsed.flags, "query-param"),
    yes: getBoolean(parsed.flags, "yes") || getBoolean(parsed.flags, "force"),
    dryRun: getBoolean(parsed.flags, "dry-run"),
    all: getBoolean(parsed.flags, "all"),
    help: getBoolean(parsed.flags, "help"),
    version: getBoolean(parsed.flags, "version"),
  };
}

export function getString(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): string | undefined {
  const value = flags[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.at(-1);
  return undefined;
}

export function getBoolean(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): boolean {
  const value = flags[name];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false" || value === undefined) return false;
  if (typeof value === "string") {
    throw new Error(`--${name} must be true or false, got "${value}"`);
  }
  return false;
}

function getStringArray(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): string[] {
  const value = flags[name];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

function parseFlagToken(arg: string): { name: string; value?: string } {
  const trimmed = arg.replace(/^-+/, "");
  const separator = trimmed.indexOf("=");
  if (separator === -1) return { name: trimmed };
  return { name: trimmed.slice(0, separator), value: trimmed.slice(separator + 1) };
}

function nextFlagValue(value: string | undefined): string | boolean {
  if (value === undefined || value.startsWith("-")) return true;
  return value;
}

function setFlag(
  flags: Record<string, string | boolean | string[]>,
  name: string,
  value: string | boolean,
): void {
  if (name === "set" || name === "query-param") {
    const current = flags[name];
    if (Array.isArray(current)) {
      current.push(String(value));
      return;
    }
    flags[name] = [String(value)];
    return;
  }
  flags[name] = value;
}
