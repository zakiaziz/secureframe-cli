import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeContext, normalizeBaseUrl, resolveAuth } from "../src/auth.js";
import type { GlobalOptions, RuntimeContext } from "../src/types.js";

const baseOptions: GlobalOptions = {
  set: [],
  query: [],
  yes: false,
  dryRun: false,
  all: false,
  help: false,
  version: false,
};

const context: RuntimeContext = {
  baseUrl: "https://api.secureframe.com",
  region: "us",
};

test("command credentials are encoded in Secureframe's key-secret header format", () => {
  const auth = resolveAuth(
    { ...baseOptions, apiKey: "key-id", apiSecret: "key-secret" },
    context,
  );
  assert.equal(auth.source, "command line");
  assert.equal(auth.authorization, "key-id key-secret");
});

test("credentials cannot be mixed across command and environment sources", { concurrency: false }, () => {
  const previous = process.env.SECUREFRAME_API_SECRET;
  process.env.SECUREFRAME_API_SECRET = "environment-secret";
  try {
    assert.throws(
      () => resolveAuth({ ...baseOptions, apiKey: "command-key" }, context),
      /Provide both --api-key and --api-secret/,
    );
  } finally {
    if (previous === undefined) delete process.env.SECUREFRAME_API_SECRET;
    else process.env.SECUREFRAME_API_SECRET = previous;
  }
});

test("UK region selects the documented UK API origin", { concurrency: false }, () => {
  const previousRegion = process.env.SECUREFRAME_REGION;
  const previousBaseUrl = process.env.SECUREFRAME_BASE_URL;
  delete process.env.SECUREFRAME_REGION;
  delete process.env.SECUREFRAME_BASE_URL;
  try {
    const runtime = loadRuntimeContext({ ...baseOptions, region: "uk" });
    assert.equal(runtime.region, "uk");
    assert.equal(runtime.baseUrl, "https://api-uk.secureframe.com");
  } finally {
    if (previousRegion === undefined) delete process.env.SECUREFRAME_REGION;
    else process.env.SECUREFRAME_REGION = previousRegion;
    if (previousBaseUrl === undefined) delete process.env.SECUREFRAME_BASE_URL;
    else process.env.SECUREFRAME_BASE_URL = previousBaseUrl;
  }
});

test("a command region overrides a stale environment base URL", { concurrency: false }, () => {
  const previousBaseUrl = process.env.SECUREFRAME_BASE_URL;
  process.env.SECUREFRAME_BASE_URL = "https://api.secureframe.com";
  try {
    const runtime = loadRuntimeContext({ ...baseOptions, region: "uk" });
    assert.equal(runtime.region, "uk");
    assert.equal(runtime.baseUrl, "https://api-uk.secureframe.com");
  } finally {
    if (previousBaseUrl === undefined) delete process.env.SECUREFRAME_BASE_URL;
    else process.env.SECUREFRAME_BASE_URL = previousBaseUrl;
  }
});

test("base URLs reject cleartext credential transport outside loopback", () => {
  assert.throws(() => normalizeBaseUrl("http://api.secureframe.com"), /must use HTTPS/);
  assert.equal(normalizeBaseUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
});
