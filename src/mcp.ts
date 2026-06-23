import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CommandVerdict, Decision, Ecosystem, Verdict } from "./core/types.js";
import { vetPackage } from "./core/vet.js";
import { vetCommandInContext } from "./core/vet-command.js";

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
              enum: ["npm", "pypi"],
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (name === "vet_package") {
        const pkg = String(args.name ?? "");
        if (!pkg) return toolError("Missing required argument: name");
        const ecosystem: Ecosystem = args.ecosystem === "pypi" ? "pypi" : "npm";
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
