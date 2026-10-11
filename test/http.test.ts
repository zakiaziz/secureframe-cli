import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { buildRequestPlan, executeAllPages, renderDryRun } from "../src/http.js";
import type { GlobalOptions, RuntimeContext } from "../src/types.js";

const options: GlobalOptions = {
  apiKey: "key-id",
  apiSecret: "key-secret",
  set: [],
  query: [],
  yes: false,
  dryRun: true,
  all: false,
  help: false,
  version: false,
};

test("dry runs redact the complete authorization value", () => {
  const context: RuntimeContext = {
    baseUrl: "https://api.secureframe.com",
    region: "us",
  };
  const request = buildRequestPlan({
    method: "GET",
    path: "/cloud_resources",
    options,
    context,
  });
  assert.deepEqual(renderDryRun(request), {
    method: "GET",
    url: "https://api.secureframe.com/cloud_resources",
    auth: { source: "command line" },
    headers: {
      Accept: "application/json",
      Authorization: "[redacted]",
    },
  });
});

test("dry runs redact sensitive query parameters", () => {
  const context: RuntimeContext = {
    baseUrl: "https://api.secureframe.com",
    region: "us",
  };
  const request = buildRequestPlan({
    method: "GET",
    path: "/controls",
    options,
    context,
    query: { api_key: "query-secret", q: "enabled:true" },
  });
  const dryRun = renderDryRun(request) as { url: string };
  const url = new URL(dryRun.url);
  assert.equal(url.searchParams.get("api_key"), "[redacted]");
  assert.equal(url.searchParams.get("q"), "enabled:true");
  assert.doesNotMatch(dryRun.url, /query-secret/);
});

test("full pagination trusts meta.total over a short page and deduplicates includes", async (t) => {
  const requestedPages: string[] = [];
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "key-id key-secret");
    requestedPages.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    const page = new URL(request.url ?? "/", "http://localhost").searchParams.get("page");
    response.end(page === "1"
      ? JSON.stringify({
          data: [{ id: "resource-1", type: "cloud_resource" }],
          included: [{ id: "owner-1", type: "user" }],
          meta: { total: 2 },
        })
      : JSON.stringify({
          data: [{ id: "resource-2", type: "cloud_resource" }],
          included: [
            { id: "owner-1", type: "user" },
            { id: "owner-2", type: "user" },
          ],
          meta: { total: 2 },
        }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const port = (server.address() as { port: number }).port;
  const context: RuntimeContext = {
    baseUrl: `http://127.0.0.1:${port}`,
    region: "us",
  };
  const request = buildRequestPlan({
    method: "GET",
    path: "/cloud_resources",
    options,
    context,
    query: { page: "1", per_page: "2" },
  });
  const result = await executeAllPages(request);

  assert.deepEqual(requestedPages, [
    "/cloud_resources?page=1&per_page=2",
    "/cloud_resources?page=2&per_page=2",
  ]);
  assert.deepEqual(result, {
    data: [
      { id: "resource-1", type: "cloud_resource" },
      { id: "resource-2", type: "cloud_resource" },
    ],
    included: [
      { id: "owner-1", type: "user" },
      { id: "owner-2", type: "user" },
    ],
    meta: { total: 2, pages: 2 },
  });
});

test("request paths cannot replace the configured API origin", () => {
  const context: RuntimeContext = {
    baseUrl: "https://api.secureframe.com",
    region: "us",
  };
  assert.throws(
    () => buildRequestPlan({
      method: "GET",
      path: "//attacker.example/cloud_resources",
      options,
      context,
    }),
    /cannot be an absolute URL/,
  );
});
