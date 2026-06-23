import { parseArgs } from "node:util";
import type { CommandVerdict, Ecosystem, Verdict } from "./core/types.js";
import { vetPackage } from "./core/vet.js";
import { vetCommand } from "./core/vet-command.js";
import { runMcpServer } from "./mcp.js";
import { runClaudeCodeHook } from "./hooks/claude-code.js";
import { runShim, runGuard } from "./shim.js";
import { runInit } from "./integrations/init.js";

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
    if (ecosystem !== "npm" && ecosystem !== "pypi") {
      console.error(`unknown ecosystem "${ecosystem}" (expected npm or pypi)`);
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

  console.error(`unknown command "${command}". Run "airlock help".`);
  return 2;
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

function printHelp(): void {
  console.log(`airlock — a firewall between AI agents and dangerous actions

usage:
  airlock check <package> [...]      Vet packages before installing
    -e, --ecosystem <npm|pypi>       Ecosystem (default: npm)
    --json                           Machine-readable output
  airlock vet-command "<cmd>"        Vet a full shell command (installs + destructive ops)
  airlock init <agent> [...]         Wire Airlock into an agent:
                                       claude-code | codex | gemini | cursor | shell | all
  airlock guard <install|status|path>  Manage universal PATH shims (npm/pip/…)
  airlock mcp                        Run as an MCP server (stdio)
  airlock hook claude-code           Run as a Claude Code PreToolUse hook (reads stdin)

exit codes: 0 = ok/warn, 1 = BLOCKED, 2 = usage error
`);
}
