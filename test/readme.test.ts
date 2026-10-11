import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

test("README documents every first-class command", () => {
  for (const command of [
    "setup",
    "auth verify",
    "profiles list",
    "profiles show <name>",
    "profiles create <name>",
    "profiles update <name>",
    "profiles delete <name>",
    "profiles use <name>",
    "config path",
    "config show",
    "config get <key>",
    "config set <key> <value>",
    "config unset <key>",
    "completions bash",
    "completions zsh",
    "cloud-resources list",
    "cloud-resource show <id>",
    "api request",
  ]) {
    assert.match(
      readme,
      new RegExp(escapeRegExp(`secureframe ${command}`)),
      `missing secureframe ${command}`,
    );
  }
});

test("README documents credential storage and mutation safety", () => {
  assert.match(readme, /mode `0600`/);
  assert.match(readme, /require `--dry-run` or `--yes`/);
  assert.match(readme, /SECUREFRAME_API_SECRET/);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
