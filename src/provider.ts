import type { Pagination, PageInfo, Provider, ProviderErrorDetail } from "./core/provider.js";
import { HTTP_METHODS } from "./core/types.js";
import { isRecord, visibleAsciiConstraint } from "./core/values.js";
import { commands, groups } from "./registry.js";

const MAX_MESSAGE_LENGTH = 500;

export const provider: Provider = {
  bin: "secureframe",
  name: "Secureframe",
  secrets: [
    { key: "apiKey", label: "API key", validate: visibleAsciiConstraint },
    { key: "apiSecret", label: "API secret", validate: visibleAsciiConstraint },
  ],
  authScheme: "an Authorization header holding the API key and the API secret separated by a space",
  authorize: (credential) => ({ Authorization: `${credential.apiKey} ${credential.apiSecret}` }),
  baseUrl: { default: "https://api.secureframe.com", allowPath: false },
  endpointFields: [
    {
      key: "region",
      label: "region",
      choices: ["us", "uk"],
      baseUrl: (region) => (region === "uk" ? "https://api-uk.secureframe.com" : "https://api.secureframe.com"),
    },
  ],
  requestIdHeader: "x-request-id",
  errorDetail,
  pagination: pageNumbers(),
  verify: {
    method: "GET",
    path: "/cloud_resources",
    query: [
      ["page", "1"],
      ["per_page", "1"],
    ],
    effect:
      "Sends GET /cloud_resources?page=1&per_page=1. Success proves that Secureframe accepted the API key and API secret for that read. It does not prove identity, because the check returns none, or complete permission coverage.",
  },
  api: {
    methods: HTTP_METHODS,
    examples: [
      "secureframe api request GET /controls --query per_page=100",
      "secureframe api request PUT /tests/8f2a1c4d-5b6e-4f70-9a8b-0c1d2e3f4a5b --file ./request.json --dry-run",
    ],
  },
  groups,
  commands,
};

function errorDetail(body: unknown): ProviderErrorDetail {
  if (!isRecord(body)) return {};
  const entries = errorEntries(body);
  const first = entries[0];
  const code = isRecord(first) && isErrorCode(first.code) ? first.code : body.code;
  const message = errorMessage(body, entries);
  return {
    ...(message ? { message: message.slice(0, MAX_MESSAGE_LENGTH) } : {}),
    ...(isErrorCode(code) ? { code: String(code) } : {}),
  };
}

function isErrorCode(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function errorEntries(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.errors)) return body.errors;
  return isRecord(body.error) ? [body.error] : [];
}

function errorMessage(body: Record<string, unknown>, entries: unknown[]): string | undefined {
  const fromEntries = entries
    .map((entry) => (isRecord(entry) ? [entry.title, entry.detail, entry.message] : [entry]))
    .map((parts) => parts.filter((part): part is string => typeof part === "string").join(": "))
    .filter((text) => text !== "");
  if (fromEntries.length > 0) return fromEntries.join("; ");
  const text = [body.error, body.message, body.detail].filter((part): part is string => typeof part === "string").join(": ");
  return text === "" ? undefined : text;
}

/** Secureframe paginates by page number and reports an optional meta.total and the related resources of each page. */
function pageNumbers(): Pagination {
  return {
    detectRepeatedPages: true,
    apply({ query }, page) {
      query.set("page", String(page.cursor === null ? 1 : Number(page.cursor)));
      query.set("per_page", String(page.size));
    },
    read(payload, _collectionKey, page, items): PageInfo | undefined {
      if (!isRecord(payload)) return undefined;
      const total = isRecord(payload.meta) ? payload.meta.total : undefined;
      if (total !== undefined && !(typeof total === "number" && Number.isSafeInteger(total) && total >= 0)) return undefined;
      const number = page.cursor === null ? 1 : Number(page.cursor);
      const hasMore = total === undefined ? items.length === page.size : number * page.size < total;
      const expected = total === undefined ? 0 : Math.min(page.size, Math.max(0, total - (number - 1) * page.size));
      if (items.length < expected) return undefined;
      const included = uniqueIncluded(payload.included);
      const providerMeta = { ...(total === undefined ? {} : { total }), ...(included.length > 0 ? { included } : {}) };
      return { nextCursor: hasMore ? String(number + 1) : null, ...(Object.keys(providerMeta).length > 0 ? { provider: providerMeta } : {}) };
    },
    mergeProvider(previous, next) {
      const merged = uniqueIncluded([previous.included, next.included].flatMap((items) => (Array.isArray(items) ? items : [])));
      return { ...next, ...(merged.length > 0 ? { included: merged } : {}) };
    },
  };
}

/** The related resources without repeats: the same type and ID, or the same value, appears once, first occurrence kept. */
function uniqueIncluded(included: unknown): unknown[] {
  if (!Array.isArray(included)) return [];
  const found = new Map<string, unknown>();
  for (const item of included) {
    const key = isRecord(item) && typeof item.type === "string" && typeof item.id === "string" ? JSON.stringify([item.type, item.id]) : JSON.stringify(item);
    if (!found.has(key)) found.set(key, item);
  }
  return [...found.values()];
}
