import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CommandVerdict, Decision, Ecosystem, Verdict } from "./core/types.js";
import { vetPackage } from "./core/vet.js";
import { vetCommandInContext } from "./core/vet-command.js";
import { scanProject, type ScanResult } from "./core/scan.js";
import { scanSecrets, type SecretScanResult } from "./core/secrets.js";
import { scanGitDiff, type DiffScanResult } from "./core/diff-guard.js";

/**
 * Run Airlock as a Model Context Protocol server over stdio.
 * Works with any MCP host: Claude Code, Codex, Gemini CLI, Cursor, Copilot, …
 */
export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: "airlock", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vet_package",
        description:
          "Verify a software package is safe to install BEFORE installing it. Detects hallucinated (non-existent), typosquatted, and slopsquatted packages. ALWAYS call this before running npm/pip/yarn/pnpm/uv install on a package you are not 100% sure exists.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "The package name to verify." },
            ecosystem: {
              type: "string",
              enum: ["npm", "pypi", "cargo", "rubygems", "go"],
              description: "Package registry (default: npm).",
            },
            cwd: {
              type: "string",
              description:
                "Optional project directory. Airlock uses this to find .airlock.json policy files.",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "vet_command",
        description:
          "Vet a full shell command before running it. Checks any package installs for hallucination/typosquatting AND flags destructive operations (rm -rf, git push --force, disk format, SQL DROP, fork bombs). Call before executing shell commands that install packages or touch the filesystem/VCS/database.",
        inputSchema: {
          type: "object" as const,
          properties: {
            command: { type: "string", description: "The exact shell command." },
            cwd: {
              type: "string",
              description:
                "Optional project directory. Airlock uses this to find .airlock.json policy files.",
            },
          },
          required: ["command"],
        },
      },
      {
        name: "scan_project",
        description:
          "Scan supported dependency manifests in a project (package.json, requirements.txt, pyproject.toml, Cargo.toml, Gemfile, go.mod) and report blocked/warned dependencies. Call before making dependency-heavy changes or when entering an unfamiliar repo.",
        inputSchema: {
          type: "object" as const,
          properties: {
            cwd: {
              type: "string",
              description: "Project directory to scan (default: current directory).",
            },
          },
        },
      },
      {
        name: "scan_secrets",
        description:
          "Scan a project for high-confidence leaked secrets (GitHub tokens, OpenAI/Anthropic API keys, AWS keys, Slack tokens, private keys). Call before committing generated config, tests, or environment files.",
        inputSchema: {
          type: "object" as const,
          properties: {
            cwd: {
              type: "string",
              description: "Project directory to scan (default: current directory).",
            },
          },
        },
      },
      {
        name: "scan_diff",
        description:
          "Scan the current git diff for suspicious test changes: removed assertions, skipped tests, focused-only tests, or deleted test files. Call before committing agent-generated changes.",
        inputSchema: {
          type: "object" as const,
          properties: {
            cwd: {
              type: "string",
              description: "Project directory to scan (default: current directory).",
            },
            staged: {
              type: "boolean",
              description: "Scan staged changes instead of unstaged changes.",
            },
          },
        },
      },
      {
        name: "audit_project",
        description:
          "Run Airlock's full local audit: dependency manifest scan, secret scan, and git diff test-subversion scan. Call before finishing or committing agent-generated work.",
        inputSchema: {
          type: "object" as const,
          properties: {
            cwd: {
              type: "string",
              description: "Project directory to audit (default: current directory).",
            },
            staged: {
              type: "boolean",
              description: "Scan staged git changes instead of unstaged changes.",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (name === "vet_package") {
        const pkg = String(args.name ?? "");
        if (!pkg) return toolError("Missing required argument: name");
        const ecosystem = parseEcosystem(args.ecosystem);
        const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
        const v = await vetPackage(pkg, ecosystem, { cwd });
        return toolResult(formatPackage(v), v.decision === "block");
      }
      if (name === "vet_command") {
        const command = String(args.command ?? "");
        if (!command) return toolError("Missing required argument: command");
        const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
        const v = await vetCommandInContext(command, { cwd });
        return toolResult(formatCommand(v), v.decision === "block");
      }
      if (name === "scan_project") {
        const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
        const scan = await scanProject(cwd);
        return toolResult(
          formatScan(scan),
          scan.verdicts.some(({ verdict }) => verdict.decision === "block"),
        );
      }
      if (name === "scan_secrets") {
        const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
        const result = scanSecrets(cwd);
        return toolResult(formatSecrets(result), result.findings.length > 0);
      }
      if (name === "scan_diff") {
        const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
        const staged = Boolean(args.staged);
        const result = scanGitDiff(cwd, { staged });
        return toolResult(formatDiff(result), result.findings.length > 0);
      }
      if (name === "audit_project") {
        const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
        const staged = Boolean(args.staged);
        const deps = await scanProject(cwd);
        const secrets = scanSecrets(cwd);
        const diff = scanGitDiff(cwd, { staged });
        const failed =
          deps.verdicts.some(({ verdict }) => verdict.decision === "block") ||
          secrets.findings.length > 0 ||
          diff.findings.length > 0;
        return toolResult(formatAudit(deps, secrets, diff), failed);
      }
      return toolError(`Unknown tool: ${name}`);
    } catch (err) {
      return toolError(`airlock error: ${(err as Error).message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; the stdio transport drives it.
  await new Promise<void>(() => {});
}

function formatDiff(result: DiffScanResult): string {
  const lines = [
    `AIRLOCK DIFF: ${result.staged ? "staged" : "unstaged"} changes in ${result.root}`,
    `found ${result.findings.length} test-change warning(s)`,
  ];
  for (const finding of result.findings) {
    const loc = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    lines.push(`- ${loc}: ${finding.message}`);
  }
  if (result.findings.length > 0) {
    lines.push(`\nDo not commit until the user confirms these test changes are intentional.`);
  }
  return lines.join("\n");
}

function formatAudit(
  deps: ScanResult,
  secrets: SecretScanResult,
  diff: DiffScanResult,
): string {
  const depBlocks = deps.verdicts.filter(({ verdict }) => verdict.decision === "block");
  const depWarns = deps.verdicts.filter(({ verdict }) => verdict.decision === "warn");
  const lines = [
    `AIRLOCK AUDIT: ${deps.root}`,
    `dependencies: ${deps.verdicts.length} checked (${depBlocks.length} block, ${depWarns.length} warn)`,
    `secrets: ${secrets.findings.length} finding(s)`,
    `diff: ${diff.findings.length} test-change warning(s)`,
  ];
  for (const { target, verdict } of [...depBlocks, ...depWarns]) {
    lines.push(`- dependency ${verdict.decision}: ${target.name} (${target.ecosystem}) in ${target.file}`);
  }
  for (const finding of secrets.findings) {
    lines.push(`- secret: ${finding.label} at ${finding.file}:${finding.line}`);
  }
  for (const finding of diff.findings) {
    const loc = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
    lines.push(`- test-change: ${loc}: ${finding.message}`);
  }
  if (depBlocks.length || secrets.findings.length || diff.findings.length) {
    lines.push(`\nDo not finish or commit until blocked dependencies, secrets, and suspicious test changes are resolved or explicitly approved.`);
  }
  return lines.join("\n");
}

function formatSecrets(result: SecretScanResult): string {
  const lines = [
    `AIRLOCK SECRETS: ${result.root}`,
    `found ${result.findings.length} high-confidence secret(s)`,
  ];
  for (const finding of result.findings) {
    lines.push(
      `- ${finding.label} at ${finding.file}:${finding.line} (${finding.preview})`,
    );
  }
  if (result.findings.length > 0) {
    lines.push(`\nDo not commit these values. Remove them, rotate the secret, and use environment/config injection instead.`);
  }
  return lines.join("\n");
}

function parseEcosystem(value: unknown): Ecosystem {
  return value === "pypi" ||
    value === "cargo" ||
    value === "rubygems" ||
    value === "go"
    ? value
    : "npm";
}

function verdictWord(d: Decision): string {
  return d === "block" ? "BLOCK ⛔" : d === "warn" ? "WARN ⚠️" : "ALLOW ✅";
}

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function formatPackage(v: Verdict): string {
  const lines = [
    `AIRLOCK VERDICT: ${verdictWord(v.decision)} — ${v.name} (${v.ecosystem})`,
  ];
  for (const s of v.signals) lines.push(`- ${s.message}`);
  if (v.decision === "block") {
    lines.push(
      `\nDO NOT install "${v.name}". It is unsafe. Stop and confirm the correct package name with the user before proceeding.`,
    );
  }
  return lines.join("\n");
}

function formatCommand(v: CommandVerdict): string {
  const lines = [`AIRLOCK VERDICT: ${verdictWord(v.decision)}`, `command: ${v.command}`];
  for (const s of v.signals) lines.push(`- ${s.message}`);
  if (v.decision === "block") {
    lines.push(`\nDO NOT run this command. It is unsafe. Stop and confirm with the user.`);
  } else if (v.decision === "allow") {
    lines.push(`\nNo install or destructive-operation risks detected.`);
  }
  return lines.join("\n");
}

function formatScan(scan: ScanResult): string {
  const blocked = scan.verdicts.filter((r) => r.verdict.decision === "block");
  const warned = scan.verdicts.filter((r) => r.verdict.decision === "warn");
  const lines = [
    `AIRLOCK SCAN: ${scan.root}`,
    `checked ${scan.verdicts.length} dependencies (${blocked.length} block, ${warned.length} warn)`,
  ];
  for (const { target, verdict } of scan.verdicts) {
    if (verdict.decision === "allow") continue;
    lines.push(`\n${verdictWord(verdict.decision)} — ${target.name} (${target.ecosystem})`);
    lines.push(`file: ${target.file}`);
    for (const s of verdict.signals) {
      if (s.level !== "allow") lines.push(`- ${s.message}`);
    }
  }
  if (blocked.length > 0) {
    lines.push(`\nDo not install or keep blocked dependencies. Confirm the intended package names before proceeding.`);
  }
  return lines.join("\n");
}
