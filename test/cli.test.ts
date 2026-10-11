import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");

test("cloud resource dry-run shows intent without exposing credentials", () => {
  const output = execFileSync(process.execPath, [
    cli,
    "cloud-resources",
    "list",
    "--q",
    "vendor_name:AWS",
    "--api-key",
    "key-id",
    "--api-secret",
    "key-secret",
    "--dry-run",
  ], { encoding: "utf8" });
  const parsed = JSON.parse(output) as { method: string; url: string };
  assert.equal(parsed.method, "GET");
  assert.equal(
    parsed.url,
    "https://api.secureframe.com/cloud_resources?q=vendor_name%3AAWS",
  );
  assert.match(output, /\[redacted\]/);
  assert.doesNotMatch(output, /key-id|key-secret/);
});

test("raw API mutations require confirmation", () => {
  const result = spawnSync(process.execPath, [
    cli,
    "api",
    "request",
    "PUT",
    "/tests/123",
    "--api-key",
    "key-id",
    "--api-secret",
    "key-secret",
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--dry-run or --yes/);
});

test("raw API mutations reject ambiguous confirmation values", () => {
  const result = spawnSync(process.execPath, [
    cli,
    "api",
    "request",
    "PUT",
    "/tests/123",
    "--api-key",
    "key-id",
    "--api-secret",
    "key-secret",
    "--yes=no",
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--yes must be true or false, got "no"/);
});

test("setup writes profile credentials with mode 0600", () => {
  const configRoot = mkdtempSync(join(tmpdir(), "secureframe-cli-"));
  try {
    execFileSync(process.execPath, [
      cli,
      "setup",
      "test",
      "--api-key",
      "key-id",
      "--api-secret",
      "key-secret",
    ], {
      encoding: "utf8",
      env: { ...process.env, XDG_CONFIG_HOME: configRoot },
    });
    const path = join(configRoot, "secureframe", "profiles", "test.json");
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      apiKey: "key-id",
      apiSecret: "key-secret",
      region: "us",
    });
  } finally {
    chmodSync(configRoot, 0o700);
    rmSync(configRoot, { recursive: true, force: true });
  }
});
