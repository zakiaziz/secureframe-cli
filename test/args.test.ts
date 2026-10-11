import test from "node:test";
import assert from "node:assert/strict";
import { getGlobalOptions, parseArgs } from "../src/args.js";

test("parser keeps cloud filters separate from global options", () => {
  const parsed = parseArgs([
    "cloud-resources",
    "list",
    "--profile",
    "work",
    "--region",
    "uk",
    "--q",
    "vendor_name:AWS",
    "--relationships",
    "--all",
  ]);

  assert.deepEqual(parsed.command, ["cloud-resources", "list"]);
  assert.equal(getGlobalOptions(parsed).profile, "work");
  assert.equal(getGlobalOptions(parsed).region, "uk");
  assert.equal(getGlobalOptions(parsed).all, true);
  assert.deepEqual(parsed.unknownFlags, [
    { name: "q", value: "vendor_name:AWS" },
    { name: "relationships", value: true },
  ]);
});

test("parser supports exact raw query parameters", () => {
  const parsed = parseArgs([
    "api",
    "request",
    "GET",
    "/controls",
    "--query-param",
    "page[number]=2",
  ]);
  assert.deepEqual(getGlobalOptions(parsed).query, ["page[number]=2"]);
});
