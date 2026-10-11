#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Writable } from "node:stream";
import { getBoolean, getGlobalOptions, parseArgs } from "./args.js";
import { loadRuntimeContext, normalizeBaseUrl, parseRegion } from "./auth.js";
import { buildCloudResourceOperation } from "./cloud-resources.js";
import {
  configDir,
  configGet,
  configPath,
  configSet,
  configUnset,
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  profilePath,
  readConfig,
  requireProfile,
  setActiveProfileName,
  showProfile,
  writeProfile,
} from "./config.js";
import { buildRequestPlan, executeAllPages, executeRequest, renderDryRun } from "./http.js";
import { printJson, printRedacted, printResult, printText } from "./output.js";
import type { GlobalOptions, HttpMethod, ParsedArgs, Profile } from "./types.js";
import {
  applyAssignments,
  assignmentsToQuery,
  isObject,
  readJson,
  unknownFlagsToBody,
  unknownFlagsToQuery,
} from "./values.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const options = getGlobalOptions(parsed);

  if (options.version) {
    printText(version());
    return;
  }
  if (options.help || parsed.command.length === 0) {
    printText(help());
    return;
  }

  await dispatch(parsed, options);
}

async function dispatch(parsed: ParsedArgs, options: GlobalOptions): Promise<void> {
  const [group, action] = parsed.command;

  if (group === "setup") {
    await runSetup(parsed);
    return;
  }
  if (group === "profiles") {
    runProfiles(parsed, options);
    return;
  }
  if (group === "config") {
    runConfig(parsed);
    return;
  }
  if (group === "auth") {
    await runAuth(action, options);
    return;
  }
  if (group === "completions") {
    runCompletions(action);
    return;
  }
  if (group === "api" && action === "request") {
    await runApiRequest(parsed, options);
    return;
  }

  const context = loadRuntimeContext(options);
  const operation = buildCloudResourceOperation(parsed, options, context);
  if (!operation) {
    throw new Error(`Unknown command "${parsed.command.join(" ")}". Run secureframe --help.`);
  }
  if (options.all && !operation.paginated) {
    throw new Error(`--all is not supported by "${operation.name}"`);
  }

  if (options.dryRun) {
    printResult(renderDryRun(operation.plan));
    return;
  }
  printResult(options.all
    ? await executeAllPages(operation.plan)
    : await executeRequest(operation.plan));
}

async function runSetup(parsed: ParsedArgs): Promise<void> {
  if (parsed.command.length > 2) {
    throw new Error("Usage: secureframe setup [profile] --api-key KEY --api-secret SECRET [--region us|uk]");
  }
  const options = getGlobalOptions(parsed);
  const profileName = parsed.command[1] ?? options.profile ?? "default";
  const fromEnv = getBoolean(parsed.flags, "from-env");
  let apiKey = options.apiKey ?? (fromEnv ? process.env.SECUREFRAME_API_KEY : undefined);
  let apiSecret = options.apiSecret ?? (fromEnv ? process.env.SECUREFRAME_API_SECRET : undefined);
  const baseUrl = options.baseUrl ?? (fromEnv ? process.env.SECUREFRAME_BASE_URL : undefined);
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;
  const region = parseRegion(
    options.region
      ?? (fromEnv ? process.env.SECUREFRAME_REGION : undefined)
      ?? (normalizedBaseUrl && new URL(normalizedBaseUrl).hostname === "api-uk.secureframe.com" ? "uk" : undefined)
      ?? "us",
  );

  if (process.stdin.isTTY) {
    if (!apiKey) apiKey = (await askSecret("Secureframe API key: ")).trim() || undefined;
    if (!apiSecret) apiSecret = (await askSecret("Secureframe API secret: ")).trim() || undefined;
  }
  if (!apiKey || !apiSecret) {
    throw new Error("Setup needs both --api-key and --api-secret");
  }

  const profile: Profile = {
    apiKey,
    apiSecret,
    region,
    ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
  };
  writeProfile(profileName, profile);
  setActiveProfileName(profileName);
  printJson({ profile: profileName, path: profilePath(profileName), active: true, region });
}

function runProfiles(parsed: ParsedArgs, options: GlobalOptions): void {
  const action = parsed.command[1];
  const name = parsed.command[2] ?? options.profile;
  if (parsed.unknownFlags.length > 0) {
    throw new Error(`Unknown option --${parsed.unknownFlags[0]?.name}`);
  }

  switch (action) {
    case "list":
      printJson({ active: getActiveProfileName(), profiles: listProfiles() });
      return;
    case "show":
      if (!name) throw new Error("Usage: secureframe profiles show <name>");
      printRedacted(showProfile(name));
      return;
    case "create":
    case "update": {
      if (!name) {
        throw new Error(`Usage: secureframe profiles ${action} <name> [--api-key KEY] [--api-secret SECRET]`);
      }
      const fields = profileFields(options);
      if (Object.keys(fields).length === 0) {
        throw new Error(`secureframe profiles ${action} needs at least one profile option`);
      }
      const profile = { ...(action === "update" ? requireProfile(name) : {}), ...fields };
      if (!profile.apiKey || !profile.apiSecret) {
        throw new Error("Secureframe profiles must contain both an API key and API secret");
      }
      writeProfile(name, profile);
      printJson({ profile: name, path: profilePath(name) });
      return;
    }
    case "delete":
      if (!name) throw new Error("Usage: secureframe profiles delete <name>");
      deleteProfile(name);
      printJson({ deleted: name });
      return;
    case "use":
      if (!name) throw new Error("Usage: secureframe profiles use <name>");
      requireProfile(name);
      setActiveProfileName(name);
      printJson({ active: name });
      return;
    default:
      throw new Error("Usage: secureframe profiles <list|show|create|update|delete|use>");
  }
}

function runConfig(parsed: ParsedArgs): void {
  const action = parsed.command[1];
  const key = parsed.command[2];
  const value = parsed.command[3];
  switch (action) {
    case "path":
      printJson({ configDir: configDir(), configPath: configPath() });
      return;
    case "show":
      printRedacted(readConfig());
      return;
    case "get":
      if (!key) throw new Error("Usage: secureframe config get <key>");
      printResult(configGet(key) ?? null);
      return;
    case "set":
      if (!key || value === undefined) {
        throw new Error("Usage: secureframe config set <key> <value>");
      }
      printRedacted(configSet(key, value));
      return;
    case "unset":
      if (!key) throw new Error("Usage: secureframe config unset <key>");
      printRedacted(configUnset(key));
      return;
    default:
      throw new Error("Usage: secureframe config <path|show|get|set|unset>");
  }
}

async function runAuth(action: string | undefined, options: GlobalOptions): Promise<void> {
  if (action !== undefined && action !== "verify") {
    throw new Error("Usage: secureframe auth verify");
  }
  const context = loadRuntimeContext(options);
  const request = buildRequestPlan({
    method: "GET",
    path: "/cloud_resources",
    options,
    context,
    query: { page: "1", per_page: "1" },
  });
  const result = await executeRequest(request);
  const total = isObject(result) && isObject(result.meta) && typeof result.meta.total === "number"
    ? result.meta.total
    : undefined;
  printJson({
    ok: true,
    baseUrl: context.baseUrl,
    region: context.region,
    ...(total === undefined ? {} : { cloudResources: total }),
  });
}

async function runApiRequest(parsed: ParsedArgs, options: GlobalOptions): Promise<void> {
  const rawMethod = parsed.command[2];
  const method = rawMethod?.toUpperCase() as HttpMethod | undefined;
  const path = parsed.command[3];
  if (!method || !path || parsed.command.length !== 4) {
    throw new Error("Usage: secureframe api request <GET|POST|PUT|DELETE> </api/path>");
  }
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
    throw new Error(
      `HTTP method "${rawMethod}" is not supported. Expected GET, POST, PUT, or DELETE.`,
    );
  }
  if (options.all) {
    throw new Error("--all is only supported by first-class list commands");
  }
  const mutation = method !== "GET";
  assertMutationAllowed("api request", mutation, options);
  const context = loadRuntimeContext(options);
  const body = method === "GET" ? undefined : buildRawBody(options, parsed);
  const query = method === "GET"
    ? { ...unknownFlagsToQuery(parsed.unknownFlags), ...assignmentsToQuery(options.query) }
    : assignmentsToQuery(options.query);
  const request = buildRequestPlan({ method, path, options, context, query, body });
  if (options.dryRun) {
    printResult(renderDryRun(request));
    return;
  }
  printResult(await executeRequest(request));
}

function buildRawBody(options: GlobalOptions, parsed: ParsedArgs): unknown {
  const body = readJson(options.data) ?? {};
  if (!isObject(body)) {
    if (options.set.length > 0 || parsed.unknownFlags.length > 0) {
      throw new Error("Cannot merge --set or field flags into an array body");
    }
    return body;
  }
  applyAssignments(body, options.set);
  Object.assign(body, unknownFlagsToBody(parsed.unknownFlags));
  return body;
}

function profileFields(options: GlobalOptions): Profile {
  return {
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.apiSecret ? { apiSecret: options.apiSecret } : {}),
    ...(options.region ? { region: parseRegion(options.region) } : {}),
    ...(options.baseUrl ? { baseUrl: normalizeBaseUrl(options.baseUrl) } : {}),
  };
}

function assertMutationAllowed(name: string, mutation: boolean, options: GlobalOptions): void {
  if (mutation && !options.yes && !options.dryRun) {
    throw new Error(`"${name}" changes Secureframe state. Re-run with --dry-run or --yes.`);
  }
}

async function askSecret(prompt: string): Promise<string> {
  let muted = false;
  const hiddenOutput = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) output.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input, output: hiddenOutput, terminal: true });
  try {
    const answer = rl.question(prompt);
    muted = true;
    return await answer;
  } finally {
    rl.close();
    output.write("\n");
  }
}

function runCompletions(shell: string | undefined): void {
  const commands = "setup profiles config auth cloud-resources cloud-resource api completions";
  if (shell === "bash") {
    printText(`complete -W "${commands}" secureframe`);
    return;
  }
  if (shell === "zsh") {
    printText(`#compdef secureframe\n_arguments '1:command:(${commands})'`);
    return;
  }
  throw new Error(
    `Completion shell "${shell ?? ""}" is not supported. Expected bash or zsh.`,
  );
}

function version(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const paths = [join(here, "..", "package.json"), join(here, "..", "..", "package.json")];
  for (const path of paths) {
    try {
      return (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;
    } catch {
      continue;
    }
  }
  throw new Error(`Could not read the CLI version from ${paths.join(" or ")}`);
}

function help(): string {
  return `secureframe - inspect and automate Secureframe compliance data

Setup
  secureframe setup [profile] --api-key KEY --api-secret SECRET [--region us|uk]
  secureframe setup [profile] --from-env
  secureframe auth verify
  secureframe profiles <list|show|create|update|delete|use>

Cloud resources
  secureframe cloud-resources list [--q QUERY] [--include owner,integration_connection] [--all]
  secureframe cloud-resource show <id> [--include owner,integration_connection]

Global options
  --profile NAME       Use a saved profile
  --region us|uk       Select the Secureframe API region
  --all                Follow every page for supported list commands
  --dry-run            Show the redacted API request without sending it
  --yes, -y            Confirm a mutation
  --help, -h           Show help
  --version, -v        Show version

Advanced
  secureframe api request GET /controls --per-page 100
  secureframe api request PUT /tests/ID --data @body.json --dry-run`;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
