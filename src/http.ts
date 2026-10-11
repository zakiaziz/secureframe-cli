import { resolveAuth } from "./auth.js";
import type { GlobalOptions, HttpMethod, RequestPlan, RuntimeContext } from "./types.js";
import { isObject, isSensitiveKey, redact } from "./values.js";

export function buildRequestPlan(input: {
  readonly method: HttpMethod;
  readonly path: string;
  readonly options: GlobalOptions;
  readonly context: RuntimeContext;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
}): RequestPlan {
  if (!input.path.startsWith("/") || input.path.startsWith("//")) {
    throw new Error(
      `API path "${input.path}" is invalid. It must start with one / and cannot be an absolute URL.`,
    );
  }
  const url = new URL(input.path, `${input.context.baseUrl}/`);
  if (url.origin !== input.context.baseUrl) {
    throw new Error("API path resolved outside the configured Secureframe origin");
  }
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const auth = resolveAuth(input.options, input.context);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: auth.authorization,
  };
  if (input.body !== undefined) headers["Content-Type"] = "application/json";

  return {
    method: input.method,
    url: url.toString(),
    auth,
    headers,
    ...(input.body === undefined ? {} : { body: input.body }),
  };
}

export function renderDryRun(plan: RequestPlan): unknown {
  return {
    method: plan.method,
    url: redactUrl(plan.url),
    auth: { source: plan.auth.source },
    headers: redact(plan.headers),
    ...(plan.body === undefined ? {} : { body: redact(plan.body) }),
  };
}

export async function executeRequest(plan: RequestPlan): Promise<unknown> {
  const response = await fetch(plan.url, {
    method: plan.method,
    headers: plan.headers,
    ...(plan.body === undefined ? {} : { body: JSON.stringify(plan.body) }),
  });
  const text = await response.text();
  const payload = parseResponse(text);

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    const retryAfter = response.headers.get("retry-after");
    const details = [
      describeError(payload),
      requestId ? `request id: ${requestId}` : undefined,
      retryAfter ? `retry after: ${retryAfter}s` : undefined,
    ].filter(Boolean).join("; ");
    const pathname = new URL(plan.url).pathname;
    throw new Error(
      `Secureframe API ${plan.method} ${pathname} failed (${response.status} ${response.statusText})${details ? `: ${details}` : ""}`,
    );
  }

  return payload;
}

export async function executeAllPages(plan: RequestPlan): Promise<unknown> {
  let current = plan;
  let combined: Record<string, unknown> | undefined;
  let pages = 0;
  const visited = new Set<string>();
  const includedKeys = new Set<string>();

  while (true) {
    if (visited.has(current.url)) {
      throw new Error(`Secureframe pagination repeated a page: ${current.url}`);
    }
    if (pages >= 10_000) {
      throw new Error("Secureframe pagination exceeded 10,000 pages");
    }
    visited.add(current.url);

    const payload = await executeRequest(current);
    pages += 1;
    if (!isObject(payload) || !Array.isArray(payload.data)) return payload;

    if (!combined) {
      combined = { ...payload, data: [] };
      if (Array.isArray(payload.included)) combined.included = [];
    }
    (combined.data as unknown[]).push(...payload.data);
    appendIncluded(combined, payload.included, includedKeys);

    const total = totalRecords(payload, combined);
    const perPage = pageSize(current.url);
    const received = (combined.data as unknown[]).length;
    if (total !== undefined && payload.data.length === 0 && received < total) {
      throw new Error(
        `Secureframe pagination ended after ${received} of ${total} records`,
      );
    }
    const complete = total !== undefined
      ? received >= total
      : payload.data.length < perPage;
    if (complete) {
      const meta = isObject(combined.meta) ? combined.meta : {};
      combined.meta = { ...meta, pages };
      return combined;
    }

    const next = new URL(current.url);
    next.searchParams.set("page", String(pageNumber(current.url) + 1));
    if (next.origin !== new URL(current.url).origin) {
      throw new Error(`Secureframe pagination returned an unexpected origin: ${next.origin}`);
    }
    current = { ...current, method: "GET", url: next.toString(), body: undefined };
  }
}

function appendIncluded(
  combined: Record<string, unknown>,
  included: unknown,
  seen: Set<string>,
): void {
  if (!Array.isArray(included)) return;
  if (!Array.isArray(combined.included)) combined.included = [];
  for (const item of included) {
    const key = isObject(item) && typeof item.type === "string" && typeof item.id === "string"
      ? `${item.type}:${item.id}`
      : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    (combined.included as unknown[]).push(item);
  }
}

function totalRecords(
  payload: Record<string, unknown>,
  combined: Record<string, unknown>,
): number | undefined {
  for (const meta of [payload.meta, combined.meta]) {
    if (isObject(meta) && typeof meta.total === "number" && Number.isFinite(meta.total)) {
      return meta.total;
    }
  }
  return undefined;
}

function pageNumber(url: string): number {
  return urlPositiveInteger(url, "page", 1);
}

function pageSize(url: string): number {
  return urlPositiveInteger(url, "per_page", 100);
}

function urlPositiveInteger(url: string, name: string, defaultValue: number): number {
  const raw = new URL(url).searchParams.get(name);
  if (raw === null) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Secureframe pagination parameter "${name}" must be a positive integer, got "${raw}"`);
  }
  return value;
}

function redactUrl(value: string): string {
  const url = new URL(value);
  for (const key of new Set(url.searchParams.keys())) {
    if (isSensitiveKey(key)) url.searchParams.set(key, "[redacted]");
  }
  return url.toString();
}

function parseResponse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function describeError(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.slice(0, 500);
  if (!isObject(payload)) return undefined;
  if (Array.isArray(payload.errors)) {
    const messages = payload.errors.map((error) => {
      if (!isObject(error)) return String(error);
      return [error.title, error.detail].filter((value): value is string => typeof value === "string").join(": ");
    }).filter(Boolean);
    if (messages.length > 0) return messages.join("; ").slice(0, 500);
  }
  const message = [payload.error, payload.message, payload.detail]
    .filter((value): value is string => typeof value === "string")
    .join(": ");
  return (message || JSON.stringify(payload)).slice(0, 500);
}
