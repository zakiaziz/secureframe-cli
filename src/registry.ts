import type { RequestSpec, ResourceCommand } from "./core/provider.js";
import { usageError, type CliError } from "./core/errors.js";
import type { ArgumentSpec, Context, GroupSpec, OptionSpec } from "./core/registry.js";
import { invalidValue, validateId } from "./core/values.js";

const PAGE_MAX = 100;
const PAGE_DEFAULT = 100;
const MAX_CURSOR_DIGITS = 15;
const MAX_CURSOR_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_MAX) - 1;

const CLOUD_RESOURCE_ID: ArgumentSpec = {
  name: "CLOUD_RESOURCE_ID",
  description: "Cloud resource ID.",
  check: (value) => validateId("CLOUD_RESOURCE_ID", value),
};

const INCLUDE_OPTION: OptionSpec = {
  name: "include",
  placeholder: "RESOURCE",
  type: "enum",
  choices: ["integration_connection", "owner"],
  repeatable: true,
  description: "Include related resources.",
};

const RELATIONSHIPS_OPTION: OptionSpec = {
  name: "relationships",
  type: "boolean",
  description: "Include each resource's relationships.",
};

export const groups: GroupSpec[] = [
  { path: ["cloud-resources"], summary: "List and get cloud resources.", title: "Inspect cloud resources." },
];

export const commands: ResourceCommand[] = [
  {
    path: ["cloud-resources", "list"],
    summary: "List cloud resources.",
    arguments: [],
    options: [
      {
        name: "filter",
        placeholder: "QUERY",
        type: "string",
        description: "Filter with Secureframe's Lucene query syntax, such as vendor_name:AWS.",
      },
      INCLUDE_OPTION,
      RELATIONSHIPS_OPTION,
    ],
    effects: { kind: "read", summary: "Sends GET /cloud_resources, one request per page." },
    output:
      "Collection envelope. data is an array of cloud resources; meta holds profile, next_cursor, has_more, and provider (total, and included when --include returns resources, deduplicated by type and id).",
    method: "GET",
    collectionKey: "data",
    pagination: { max: PAGE_MAX, default: PAGE_DEFAULT, ordering: "Order is set by Secureframe and is undocumented." },
    exceptions: [
      {
        rule: "CLI-PAGE-2",
        reason:
          "--max-items must be a multiple of --page-size, because Secureframe paginates by page number and a smaller final page would shift page boundaries.",
      },
    ],
    examples: [
      "secureframe cloud-resources list",
      "secureframe cloud-resources list --filter 'vendor_name:AWS AND region:us-east-1' --all",
      "secureframe cloud-resources list --include owner --include integration_connection --format json",
    ],
    request: listRequest,
  },
  {
    path: ["cloud-resources", "get"],
    summary: "Get one cloud resource.",
    arguments: [CLOUD_RESOURCE_ID],
    options: [INCLUDE_OPTION, RELATIONSHIPS_OPTION],
    effects: { kind: "read", summary: "Sends GET /cloud_resources/CLOUD_RESOURCE_ID." },
    output:
      "Resource envelope. data is the cloud resource object. Related resources requested with --include are in meta.provider.included. meta has profile.",
    method: "GET",
    resourceKey: "data",
    providerMeta: ["included"],
    emptyIsNotFound: true,
    examples: [
      "secureframe cloud-resources get 6f1c2d3e-8a4b-4c5d-9e0f-1a2b3c4d5e6f",
      "secureframe cloud-resources get 6f1c2d3e-8a4b-4c5d-9e0f-1a2b3c4d5e6f --include owner --format json",
    ],
    request: (context) => ({
      path: `/cloud_resources/${encodeURIComponent(context.args[0] ?? "")}`,
      query: resourceQuery(context),
    }),
  },
];

function resourceQuery(context: Context): [string, string][] {
  const query: [string, string][] = [];
  const include = [...new Set(context.options.strings("include"))];
  if (include.length > 0) query.push(["include", include.join(",")]);
  if (context.options.flag("relationships")) query.push(["relationships", "true"]);
  return query;
}

function listRequest(context: Context): RequestSpec {
  const { options } = context;
  const pageSize = options.number("page-size") ?? PAGE_DEFAULT;
  const maxItems = options.number("max-items");
  const cursor = options.string("cursor");
  if (cursor !== undefined) checkCursor(cursor);
  if (maxItems !== undefined && maxItems % pageSize !== 0) throw maxItemsError(maxItems, pageSize);
  const query = resourceQuery(context);
  const filter = options.string("filter");
  if (filter !== undefined) query.push(["q", filter]);
  return { path: "/cloud_resources", query };
}

function checkCursor(cursor: string): void {
  const page = /^[1-9][0-9]*$/.test(cursor) && cursor.length <= MAX_CURSOR_DIGITS ? Number(cursor) : Number.NaN;
  if (Number.isSafeInteger(page) && page <= MAX_CURSOR_PAGE) return;
  throw invalidValue(
    "--cursor",
    `be a page number from 1 to ${MAX_CURSOR_PAGE}`,
    cursor,
    "Use the meta.next_cursor value from a previous result.",
    `1-${MAX_CURSOR_PAGE}`,
  );
}

function maxItemsError(maxItems: number, pageSize: number): CliError {
  const hint =
    maxItems < pageSize ? `Use --page-size ${maxItems}.` : `Use --max-items ${Math.floor(maxItems / pageSize) * pageSize}.`;
  return usageError(
    `--max-items must be a multiple of the page size (${pageSize}) because Secureframe paginates by page number; received "${maxItems}".`,
    hint,
    { option: "--max-items", received: String(maxItems), allowed: `multiple of ${pageSize}` },
  );
}
