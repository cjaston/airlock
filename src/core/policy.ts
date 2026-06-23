import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Decision, Ecosystem, Verdict } from "./types.js";

type PolicyList = string[] | Partial<Record<Ecosystem, string[]>>;

interface PolicyFile {
  allow?: PolicyList;
  block?: PolicyList;
}

export interface PolicyHit {
  decision: Extract<Decision, "allow" | "block">;
  file: string;
  pattern: string;
}

const POLICY_FILES = [".airlock.json", ".airlockrc", ".airlockrc.json"];

export function policyVerdict(
  name: string,
  ecosystem: Ecosystem,
  cwd = process.cwd(),
): Verdict | null {
  const hit = policyDecision(name, ecosystem, cwd);
  if (!hit) return null;

  const message =
    hit.decision === "allow"
      ? `Allowed by local Airlock policy (${path.basename(hit.file)}: ${hit.pattern}).`
      : `Blocked by local Airlock policy (${path.basename(hit.file)}: ${hit.pattern}).`;

  return {
    name,
    ecosystem,
    decision: hit.decision,
    score: hit.decision === "block" ? 100 : 0,
    signals: [
      {
        level: hit.decision,
        code: `policy_${hit.decision}`,
        message,
      },
    ],
    facts: {
      name,
      ecosystem,
      exists: hit.decision === "allow",
      ageDays: null,
      weeklyDownloads: null,
      maintainerCount: null,
      hasRepository: null,
      deprecated: null,
      latestVersion: null,
    },
  };
}

export function policyDecision(
  name: string,
  ecosystem: Ecosystem,
  cwd = process.cwd(),
): PolicyHit | null {
  const found = findPolicy(cwd);
  if (!found) return null;

  const block = matchList(found.policy.block, name, ecosystem);
  if (block) return { decision: "block", file: found.file, pattern: block };

  const allow = matchList(found.policy.allow, name, ecosystem);
  if (allow) return { decision: "allow", file: found.file, pattern: allow };

  return null;
}

export function initPolicy(cwd = process.cwd()): string {
  const file = path.join(cwd, ".airlock.json");
  if (fs.existsSync(file)) return `${file} already exists`;
  const sample: PolicyFile = {
    allow: {
      npm: ["@your-org/*"],
      pypi: ["your-private-package"],
      cargo: ["your-private-crate"],
      rubygems: ["your-private-gem"],
      go: ["github.com/your-org/*"],
    },
    block: {
      npm: ["known-bad-package"],
      pypi: ["known-bad-package"],
      cargo: ["known-bad-crate"],
      rubygems: ["known-bad-gem"],
      go: ["github.com/bad/*"],
    },
  };
  fs.writeFileSync(file, JSON.stringify(sample, null, 2) + "\n");
  return `Wrote ${file}`;
}

function findPolicy(cwd: string): { file: string; policy: PolicyFile } | null {
  for (const dir of ancestors(cwd)) {
    for (const base of POLICY_FILES) {
      const file = path.join(dir, base);
      try {
        const policy = JSON.parse(fs.readFileSync(file, "utf8")) as PolicyFile;
        return { file, policy };
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

function ancestors(start: string): string[] {
  const out: string[] = [];
  let dir = path.resolve(start);
  const home = path.resolve(os.homedir());
  while (true) {
    out.push(dir);
    if (dir === home) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

function matchList(
  list: PolicyList | undefined,
  name: string,
  ecosystem: Ecosystem,
): string | null {
  if (!list) return null;
  const values = Array.isArray(list) ? list : (list[ecosystem] ?? []);
  const canonical = `${ecosystem}:${name.toLowerCase()}`;
  const plain = name.toLowerCase();

  for (const raw of values) {
    const pattern = raw.toLowerCase();
    if (globMatch(pattern, canonical) || globMatch(pattern, plain)) return raw;
  }
  return null;
}

function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern === value;
  const escaped = pattern
    .split("*")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}
