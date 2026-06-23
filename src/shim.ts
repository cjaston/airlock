import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Verdict } from "./core/types.js";
import { extractInstallTargets } from "./core/parse-command.js";
import { vetPackage } from "./core/vet.js";
import { findOnPath, selfCommand, shellCommand, SHIM_DIR } from "./runtime.js";

const SHIMMED_TOOLS = [
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "bunx",
  "pip",
  "pip3",
  "pipx",
  "uv",
  "uvx",
  "poetry",
  "cargo",
  "gem",
  "bundle",
  "bundler",
  "go",
];

const RESET = "\x1b[0m";
const RED = "\x1b[41m\x1b[97m\x1b[1m";
const YELLOW = "\x1b[43m\x1b[30m\x1b[1m";
const FG_RED = "\x1b[31m";
const FG_YELLOW = "\x1b[33m";

/**
 * Invoked when a PATH shim is called (e.g. user/agent runs `npm install x`).
 * Vets any install targets, refuses on BLOCK, otherwise forwards to the real tool.
 */
export async function runShim(tool: string, args: string[]): Promise<number> {
  if (!tool) return 127;
  const command = [tool, ...args].join(" ");
  const targets = extractInstallTargets(command);

  if (targets.length > 0) {
    const verdicts = await Promise.all(
      targets.map((t) => vetPackage(t.name, t.ecosystem)),
    );
    const blocked = verdicts.filter((v) => v.decision === "block");
    const warned = verdicts.filter((v) => v.decision === "warn");

    for (const v of warned) printShimVerdict(v, "warn");
    if (blocked.length > 0) {
      for (const v of blocked) printShimVerdict(v, "block");
      process.stderr.write(
        `\n🛟 ${FG_RED}Airlock blocked this install.${RESET} If you're sure, run the real tool directly or add to your allowlist.\n`,
      );
      return 1;
    }
  }

  const real = findRealBinary(tool);
  if (!real) {
    process.stderr.write(`airlock: could not find the real "${tool}" on PATH\n`);
    return 127;
  }
  const res = spawnSync(real, args, { stdio: "inherit" });
  return res.status ?? 0;
}

function printShimVerdict(v: Verdict, level: "block" | "warn"): void {
  const badge = level === "block" ? `${RED} BLOCK ${RESET}` : `${YELLOW} WARN  ${RESET}`;
  process.stderr.write(`\n${badge} ${v.name} (${v.ecosystem})\n`);
  for (const s of v.signals) {
    if (s.level === "allow") continue;
    const mark = s.level === "block" ? `${FG_RED}✗${RESET}` : `${FG_YELLOW}!${RESET}`;
    process.stderr.write(`  ${mark} ${s.message}\n`);
  }
}

/** Resolve the real executable for a tool, skipping Airlock's own shim dir. */
function findRealBinary(tool: string): string | null {
  return findOnPath(tool, [SHIM_DIR]);
}

/** Install PATH shims for every supported install tool. */
export function installShims(): string[] {
  fs.mkdirSync(SHIM_DIR, { recursive: true });
  const self = selfCommand(["shim"]);
  for (const tool of SHIMMED_TOOLS) {
    const file = path.join(SHIM_DIR, tool);
    const script = `#!/bin/sh\nexec ${shellCommand(self)} ${tool} "$@"\n`;
    fs.writeFileSync(file, script);
    fs.chmodSync(file, 0o755);
  }
  return [
    `Installed ${SHIMMED_TOOLS.length} shims to ${SHIM_DIR}`,
    `(${SHIMMED_TOOLS.join(", ")})`,
    "",
    "Add this to the FRONT of your PATH (in ~/.zshrc or ~/.bashrc):",
    `  export PATH="${SHIM_DIR}:$PATH"`,
    "",
    "Then package installs/executions — by you OR any agent — are vetted first.",
  ];
}

export async function runGuard(args: string[]): Promise<number> {
  const sub = args[0] ?? "status";
  if (sub === "install") {
    for (const line of installShims()) console.log(line);
    return 0;
  }
  if (sub === "uninstall") {
    fs.rmSync(SHIM_DIR, { recursive: true, force: true });
    console.log(`Removed ${SHIM_DIR}`);
    return 0;
  }
  if (sub === "path") {
    console.log(SHIM_DIR);
    return 0;
  }
  if (sub === "status") {
    const installed = fs.existsSync(SHIM_DIR);
    const onPath = (process.env.PATH ?? "")
      .split(path.delimiter)
      .some((d) => d && path.resolve(d) === path.resolve(SHIM_DIR));
    console.log(`shims installed: ${installed ? "yes" : "no"} (${SHIM_DIR})`);
    console.log(`shim dir on PATH: ${onPath ? "yes" : "no"}`);
    if (!installed) console.log(`run: airlock guard install`);
    else if (!onPath) console.log(`add to PATH: export PATH="${SHIM_DIR}:$PATH"`);
    return 0;
  }
  console.error("usage: airlock guard <install|uninstall|status|path>");
  return 2;
}
