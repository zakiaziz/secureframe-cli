import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudResourceOperation } from "../src/cloud-resources.js";
import { getGlobalOptions, parseArgs } from "../src/args.js";
import type { RuntimeContext } from "../src/types.js";

const context: RuntimeContext = {
  baseUrl: "https://api.secureframe.com",
  region: "us",
};

test("cloud resource list maps human flags to the documented query names", () => {
  const parsed = parseArgs([
    "cloud-resources",
    "list",
    "--q",
    "vendor_name:AWS",
    "--include",
    "owner,integration_connection",
    "--relationships",
    "--per-page",
    "25",
    "--api-key",
    "key",
    "--api-secret",
    "secret",
  ]);
  const operation = buildCloudResourceOperation(parsed, getGlobalOptions(parsed), context);
  assert.ok(operation);
  assert.equal(
    operation.plan.url,
    "https://api.secureframe.com/cloud_resources?include=owner%2Cintegration_connection&relationships=true&per_page=25&q=vendor_name%3AAWS",
  );
});

test("--all starts on page one with Secureframe's documented page size", () => {
  const parsed = parseArgs([
    "cloud-resources",
    "list",
    "--all",
    "--api-key",
    "key",
    "--api-secret",
    "secret",
  ]);
  const operation = buildCloudResourceOperation(parsed, getGlobalOptions(parsed), context);
  assert.ok(operation);
  assert.equal(operation.plan.url, "https://api.secureframe.com/cloud_resources?page=1&per_page=100");
});

test("deprecated company vendor includes are rejected with the replacement", () => {
  const parsed = parseArgs([
    "cloud-resources",
    "list",
    "--include",
    "company_vendor_connection",
    "--api-key",
    "key",
    "--api-secret",
    "secret",
  ]);
  assert.throws(
    () => buildCloudResourceOperation(parsed, getGlobalOptions(parsed), context),
    /deprecated; use integration_connection/,
  );
});

test("a manual page cannot be combined with full pagination", () => {
  const parsed = parseArgs([
    "cloud-resources",
    "list",
    "--page",
    "2",
    "--all",
    "--api-key",
    "key",
    "--api-secret",
    "secret",
  ]);
  assert.throws(
    () => buildCloudResourceOperation(parsed, getGlobalOptions(parsed), context),
    /--page cannot be combined with --all/,
  );
});
