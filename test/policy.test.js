import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { policyDecision, policyVerdict } from "../dist/core/policy.js";

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "airlock-policy-"));
}

test("policy block beats everything else", () => {
  const dir = tmpProject();
  fs.writeFileSync(
    path.join(dir, ".airlock.json"),
    JSON.stringify({ block: { npm: ["left-pad"] } }),
  );
  assert.deepEqual(policyDecision("left-pad", "npm", dir), {
    decision: "block",
    file: path.join(dir, ".airlock.json"),
    pattern: "left-pad",
  });
});

test("policy allow supports private scoped package globs", () => {
  const dir = tmpProject();
  fs.writeFileSync(
    path.join(dir, ".airlock.json"),
    JSON.stringify({ allow: { npm: ["@acme/*"] } }),
  );
  const verdict = policyVerdict("@acme/internal", "npm", dir);
  assert.equal(verdict?.decision, "allow");
  assert.equal(verdict?.signals[0]?.code, "policy_allow");
});

test("policy can use ecosystem-prefixed flat entries", () => {
  const dir = tmpProject();
  fs.writeFileSync(
    path.join(dir, ".airlock.json"),
    JSON.stringify({ block: ["pypi:reqests"] }),
  );
  assert.equal(policyDecision("reqests", "pypi", dir)?.decision, "block");
});
