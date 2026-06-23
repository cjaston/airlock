import { test } from "node:test";
import assert from "node:assert/strict";
import { guardCommand } from "../dist/core/command-guard.js";

const codes = (cmd) => guardCommand(cmd).map((s) => s.code);

test("rm -rf / is blocked", () => {
  assert.ok(codes("rm -rf /").includes("rm_rf_root"));
});

test("rm -rf $HOME is blocked", () => {
  assert.ok(codes("rm -rf $HOME").includes("rm_rf_root"));
});

test("force push warns", () => {
  assert.ok(codes("git push --force origin main").includes("git_force_push"));
});

test("force-with-lease is not flagged", () => {
  assert.deepEqual(codes("git push --force-with-lease origin main"), []);
});

test("fork bomb is blocked", () => {
  assert.ok(codes(":(){ :|:& };:").includes("fork_bomb"));
});

test("a normal install is clean", () => {
  assert.deepEqual(codes("npm install express"), []);
});

test("remote executable package specs warn", () => {
  assert.ok(codes("npx github:someone/tool").includes("remote_exec_package"));
  assert.ok(
    codes("pnpm dlx https://example.com/tool.tgz").includes(
      "remote_exec_package",
    ),
  );
});
