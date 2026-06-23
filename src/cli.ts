import { parseArgs } from "node:util";
import path from "node:path";
import type { CommandVerdict, Ecosystem, Verdict } from "./core/types.js";
import { vetPackage } from "./core/vet.js";
import { vetCommand } from "./core/vet-command.js";
import { scanProject, type ScanResult } from "./core/scan.js";
import { scanSecrets, type SecretScanResult } from "./core/secrets.js";
import { scanGitDiff, type DiffScanResult } from "./core/diff-guard.js";
import { runMcpServer } from "./mcp.js";
import { runClaudeCodeHook } from "./hooks/claude-code.js";
import { runShim, runGuard } from "./shim.js";
import { runInit } from "./integrations/init.js";
import { cacheStats, clearCache } from "./core/cache.js";
import { initPolicy } from "./core/policy.js";

const ECOSYSTEMS: Ecosystem[] = ["npm", "pypi", "cargo", "rubygems", "go"];

const RESET = "\x1b[0m";
const RED = "\x1b[41m\x1b[97m\x1b[1m";
const YELLOW = "\x1b[43m\x1b[30m\x1b[1m";
const GREEN = "\x1b[42m\x1b[30m\x1b[1m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const FG_RED = "\x1b[31m";
const FG_YELLOW = "\x1b[33m";
const FG_GREEN = "\x1b[32m";

export async function main(argv: string[]): Promise<number> {
  const command = argv[0];

  // Commands that take arbitrary trailing args must bypass option parsing.
  switch (command) {
    case "shim":
      return runShim(argv[1] ?? "", argv.slice(2));
    case "mcp":
      await runMcpServer();
      return 0;
    case "hook": {
      const agent = argv[1] ?? "claude-code";
      if (agent === "claude-code" || agent === "claude") {
        return runClaudeCodeHook();
      }
      console.error(`unknown hook target "${agent}" (supported: claude-code)`);
      return 2;
    }
    case "vet-command":
    case "vet":
      return runVetCommand(argv.slice(1).join(" "));
    case "init":
      for (const line of runInit(argv.slice(1))) console.log(line);
      return 0;
    case "guard":
      return runGuard(argv.slice(1));
    case "cache":
      return runCache(argv.slice(1));
    case "policy":
      return runPolicy(argv.slice(1));
    case "demo":
      return runDemo();
  }

  // Option-parsed commands (check, help).
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        ecosystem: { type: "string", short: "e" },
        json: { type: "boolean" },
        staged: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    console.error((err as Error).message);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help || !command || command === "help") {
    printHelp();
    return command && command !== "help" ? 2 : 0;
  }

  if (command === "check") {
    const names = positionals.slice(1);
    if (names.length === 0) {
      console.error("usage: airlock check <package> [...] [--ecosystem npm|pypi]");
      return 2;
    }
    const ecosystem = (values.ecosystem as Ecosystem | undefined) ?? "npm";
    if (!isEcosystem(ecosystem)) {
      console.error(
        `unknown ecosystem "${ecosystem}" (expected ${ECOSYSTEMS.join("|")})`,
      );
      return 2;
    }
    const verdicts = await Promise.all(
      names.map((n) => vetPackage(n, ecosystem)),
    );
    if (values.json) {
      console.log(JSON.stringify(verdicts, null, 2));
    } else {
      for (const v of verdicts) printVerdict(v);
      console.log("");
    }
    return verdicts.some((v) => v.decision === "block") ? 1 : 0;
  }

  if (command === "scan") {
    const root = positionals[1] ?? process.cwd();
    const result = await scanProject(root);
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printScan(result);
    }
    return result.verdicts.some(({ verdict }) => verdict.decision === "block")
      ? 1
      : 0;
  }

  if (command === "secrets") {
    const root = positionals[1] ?? process.cwd();
    const result = scanSecrets(root);
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printSecretScan(result);
    }
    return result.findings.length > 0 ? 1 : 0;
  }

  if (command === "diff") {
    const root = positionals[1] ?? process.cwd();
    const result = scanGitDiff(root, { staged: Boolean(values.staged) });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printDiffScan(result);
    }
    return result.findings.length > 0 ? 1 : 0;
  }

  if (command === "audit") {
    const root = positionals[1] ?? process.cwd();
    const result = {
      dependencies: await scanProject(root),
      secrets: scanSecrets(root),
      diff: scanGitDiff(root, { staged: Boolean(values.staged) }),
    };
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAudit(result);
    }
    return result.dependencies.verdicts.some(
      ({ verdict }) => verdict.decision === "block",
    ) ||
      result.secrets.findings.length > 0 ||
      result.diff.findings.length > 0
      ? 1
      : 0;
  }

  console.error(`unknown command "${command}". Run "airlock help".`);
  return 2;
}

function isEcosystem(value: unknown): value is Ecosystem {
  return typeof value === "string" && ECOSYSTEMS.includes(value as Ecosystem);
}

async function runVetCommand(commandStr: string): Promise<number> {
  if (!commandStr.trim()) {
    console.error('usage: airlock vet-command "<shell command>"');
    return 2;
  }
  const v = await vetCommand(commandStr);
  printCommandVerdict(v);
  console.log("");
  return v.decision === "block" ? 1 : 0;
}

function runCache(args: string[]): number {
  const sub = args[0] ?? "status";
  if (sub === "clear") {
    clearCache();
    console.log("Airlock cache cleared.");
    return 0;
  }
  if (sub === "status") {
    const stats = cacheStats();
    console.log(`cache file: ${stats.file}`);
    console.log(`entries: ${stats.entries}`);
    return 0;
  }
  console.error("usage: airlock cache <status|clear>");
  return 2;
}

function runPolicy(args: string[]): number {
  const sub = args[0] ?? "";
  if (sub === "init") {
    console.log(initPolicy());
    return 0;
  }
  console.error("usage: airlock policy init");
  return 2;
}

async function runDemo(): Promise<number> {
  console.log(`${BOLD}Airlock demo: AI agent wants to run this:${RESET}`);
  const command = "npx fast-csv-helper init && rm -rf ~";
  const v = await vetCommand(command);
  printCommandVerdict(v);
  console.log("");
  console.log(
    v.decision === "block"
      ? `${FG_RED}Stopped before anything executed.${RESET}`
      : `${FG_YELLOW}Demo did not block; check registry/network state.${RESET}`,
  );
  return v.decision === "block" ? 0 : 1;
}

function badge(decision: string): string {
  return decision === "block"
    ? `${RED} BLOCK ${RESET}`
    : decision === "warn"
      ? `${YELLOW} WARN  ${RESET}`
      : `${GREEN} ALLOW ${RESET}`;
}

function mark(level: string): string {
  return level === "block"
    ? `${FG_RED}✗${RESET}`
    : level === "warn"
      ? `${FG_YELLOW}!${RESET}`
      : `${FG_GREEN}✓${RESET}`;
}

function printVerdict(v: Verdict): void {
  console.log(`\n${badge(v.decision)} ${BOLD}${v.name}${RESET} ${DIM}(${v.ecosystem})${RESET}`);
  for (const s of v.signals) console.log(`  ${mark(s.level)} ${s.message}`);
}

function printCommandVerdict(v: CommandVerdict): void {
  console.log(`\n${badge(v.decision)} ${DIM}${v.command}${RESET}`);
  if (v.signals.length === 0) {
    console.log(`  ${mark("allow")} No install or destructive-operation risks detected.`);
    return;
  }
  for (const s of v.signals) console.log(`  ${mark(s.level)} ${s.message}`);
}

function printScan(result: ScanResult): void {
  console.log(`\n${BOLD}Airlock scan${RESET} ${DIM}${result.root}${RESET}`);
  if (result.targets.length === 0) {
    console.log(`  ${mark("allow")} No supported dependency manifests found.`);
    console.log("");
    return;
  }
  const blocked = result.verdicts.filter((r) => r.verdict.decision === "block");
  const warned = result.verdicts.filter((r) => r.verdict.decision === "warn");
  const allowed = result.verdicts.length - blocked.length - warned.length;
  console.log(
    `  checked ${result.verdicts.length} dependencies: ${allowed} allow, ${warned.length} warn, ${blocked.length} block`,
  );
  for (const { target, verdict } of result.verdicts) {
    if (verdict.decision === "allow") continue;
    const rel = path.relative(result.root, target.file) || path.basename(target.file);
    console.log(
      `\n${badge(verdict.decision)} ${BOLD}${target.name}${RESET} ${DIM}(${target.ecosystem}, ${rel})${RESET}`,
    );
    for (const s of verdict.signals) {
      if (s.level !== "allow") console.log(`  ${mark(s.level)} ${s.message}`);
    }
  }
  console.log("");
}

function printSecretScan(result: SecretScanResult): void {
  console.log(`\n${BOLD}Airlock secrets${RESET} ${DIM}${result.root}${RESET}`);
  if (result.findings.length === 0) {
    console.log(`  ${mark("allow")} No high-confidence secrets found.`);
    console.log("");
    return;
  }
  console.log(`  ${mark("block")} Found ${result.findings.length} high-confidence secret(s).`);
  for (const finding of result.findings) {
    const rel = path.relative(result.root, finding.file) || path.basename(finding.file);
    console.log(
      `  ${mark("block")} ${finding.label} at ${rel}:${finding.line} (${finding.preview})`,
    );
  }
  console.log("");
}

function printDiffScan(result: DiffScanResult): void {
  const scope = result.staged ? "staged git diff" : "git diff";
  console.log(`\n${BOLD}Airlock diff${RESET} ${DIM}${scope} in ${result.root}${RESET}`);
  if (result.findings.length === 0) {
    console.log(`  ${mark("allow")} No test-subversion patterns found.`);
    console.log("");
    return;
  }
  console.log(`  ${mark("warn")} Found ${result.findings.length} test-change warning(s).`);
  for (const finding of result.findings) {
    const loc = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    console.log(`  ${mark("warn")} ${loc} — ${finding.message}`);
  }
  console.log("");
}

function printAudit(result: {
  dependencies: ScanResult;
  secrets: SecretScanResult;
  diff: DiffScanResult;
}): void {
  console.log(`\n${BOLD}Airlock audit${RESET} ${DIM}${result.dependencies.root}${RESET}`);
  const depBlocks = result.dependencies.verdicts.filter(
    ({ verdict }) => verdict.decision === "block",
  ).length;
  const depWarns = result.dependencies.verdicts.filter(
    ({ verdict }) => verdict.decision === "warn",
  ).length;
  console.log(
    `  dependencies: ${result.dependencies.verdicts.length} checked, ${depWarns} warn, ${depBlocks} block`,
  );
  console.log(`  secrets: ${result.secrets.findings.length} finding(s)`);
  console.log(`  diff: ${result.diff.findings.length} test-change warning(s)`);

  for (const { target, verdict } of result.dependencies.verdicts) {
    if (verdict.decision === "allow") continue;
    const rel = path.relative(result.dependencies.root, target.file) || path.basename(target.file);
    console.log(`  ${mark(verdict.decision)} dependency ${target.name} (${target.ecosystem}, ${rel})`);
  }
  for (const finding of result.secrets.findings) {
    const rel =
      path.relative(result.secrets.root, finding.file) || path.basename(finding.file);
    console.log(`  ${mark("block")} secret ${finding.label} at ${rel}:${finding.line}`);
  }
  for (const finding of result.diff.findings) {
    const loc = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    console.log(`  ${mark("warn")} test change ${loc}`);
  }
  console.log("");
}

function printHelp(): void {
  console.log(`airlock — a firewall between AI agents and dangerous actions

usage:
  airlock check <package> [...]      Vet packages before installing
    -e, --ecosystem <name>           Ecosystem: ${ECOSYSTEMS.join("|")} (default: npm)
    --json                           Machine-readable output
  airlock vet-command "<cmd>"        Vet a full shell command (installs + destructive ops)
  airlock scan [path]                Vet supported dependency manifests in a repo
    --json                           Machine-readable output
  airlock secrets [path]             Scan files for high-confidence leaked secrets
  airlock diff [path] [--staged]     Scan git diff for suspicious test changes
  airlock audit [path] [--staged]    Run dependency, secret, and diff guards
  airlock init <agent> [...]         Wire Airlock into an agent:
                                       claude-code | codex | gemini | cursor | shell | git | all
  airlock guard <install|uninstall|status|path>
                                     Manage universal PATH shims (npm/pip/npx/uvx/...)
  airlock cache <status|clear>       Inspect or clear registry cache
  airlock policy init                Create .airlock.json allow/block policy
  airlock demo                       Run the scary 10-second demo
  airlock mcp                        Run as an MCP server (stdio)
  airlock hook claude-code           Run as a Claude Code PreToolUse hook (reads stdin)

exit codes: 0 = ok/warn, 1 = BLOCKED, 2 = usage error
`);
}
