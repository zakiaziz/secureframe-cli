import { buildRequestPlan } from "./http.js";
import type { GlobalOptions, ParsedArgs, RequestPlan, RuntimeContext } from "./types.js";
import {
  assertAllowedFlags,
  booleanValue,
  flagMap,
  optionalString,
  positiveInteger,
} from "./values.js";

export interface CloudResourceOperation {
  readonly name: string;
  readonly paginated: boolean;
  readonly plan: RequestPlan;
}

const includeValues = new Set(["integration_connection", "owner"]);

export function buildCloudResourceOperation(
  parsed: ParsedArgs,
  options: GlobalOptions,
  context: RuntimeContext,
): CloudResourceOperation | undefined {
  if (options.data || options.set.length > 0 || options.query.length > 0) {
    throw new Error("--data, --set, and --query-param are only supported by secureframe api request");
  }

  const [resource, action] = parsed.command;
  if (resource === "cloud-resources" && (action === undefined || action === "list")) {
    return listCloudResources(parsed, options, context);
  }
  if (resource === "cloud-resource" && action === "show") {
    return showCloudResource(parsed, options, context);
  }
  return undefined;
}

function listCloudResources(
  parsed: ParsedArgs,
  options: GlobalOptions,
  context: RuntimeContext,
): CloudResourceOperation {
  if (parsed.command.length > 2) {
    throw new Error("Usage: secureframe cloud-resources list [--q QUERY] [--all]");
  }
  const flags = flagMap(parsed.unknownFlags);
  assertAllowedFlags(flags, ["include", "page", "per-page", "q", "relationships"]);
  if (options.all && flags.has("page")) {
    throw new Error("--page cannot be combined with --all");
  }
  const query = commonQuery(flags);
  const page = options.all ? 1 : positiveInteger(flags, "page");
  const perPage = positiveInteger(flags, "per-page") ?? (options.all ? 100 : undefined);
  if (page !== undefined) query.page = String(page);
  if (perPage !== undefined) query.per_page = String(perPage);
  const q = optionalString(flags, "q");
  if (q !== undefined) query.q = q;

  return {
    name: "cloud-resources list",
    paginated: true,
    plan: buildRequestPlan({ method: "GET", path: "/cloud_resources", options, context, query }),
  };
}

function showCloudResource(
  parsed: ParsedArgs,
  options: GlobalOptions,
  context: RuntimeContext,
): CloudResourceOperation {
  const id = parsed.command[2];
  if (!id || parsed.command.length !== 3) {
    throw new Error(`Usage: secureframe cloud-resource ${parsed.command[1]} <id>`);
  }
  const flags = flagMap(parsed.unknownFlags);
  assertAllowedFlags(flags, ["include", "relationships"]);

  return {
    name: "cloud-resource show",
    paginated: false,
    plan: buildRequestPlan({
      method: "GET",
      path: `/cloud_resources/${encodeURIComponent(id)}`,
      options,
      context,
      query: commonQuery(flags),
    }),
  };
}

function commonQuery(flags: ReadonlyMap<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  const include = optionalString(flags, "include");
  if (include !== undefined) {
    const values = include.split(",").map((value) => value.trim()).filter(Boolean);
    if (values.includes("company_vendor_connection")) {
      throw new Error("--include company_vendor_connection is deprecated; use integration_connection");
    }
    const unknown = values.filter((value) => !includeValues.has(value));
    if (unknown.length > 0 || values.length === 0) {
      throw new Error(
        `--include value "${include}" is invalid. Expected integration_connection, owner, or both.`,
      );
    }
    query.include = values.join(",");
  }
  const relationships = booleanValue(flags, "relationships");
  if (relationships !== undefined) query.relationships = String(relationships);
  return query;
}
