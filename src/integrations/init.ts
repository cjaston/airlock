import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installShims } from "../shim.js";
import { selfCommand, shellCommand } from "../runtime.js";

function mcpSpec(): { command: string; args: string[] } {
  return selfCommand(["mcp"]);
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

const ALL = ["claude-code", "codex", "gemini", "cursor", "shell", "git"];

export function runInit(agents: string[], cwd = process.cwd()): string[] {
  const list = agents.includes("all")
    ? ALL
    : agents.filter((a) => a.length > 0);
  if (list.length === 0) {
    return ["usage: airlock init <claude-code|codex|gemini|cursor|shell|all> [...]"];
  }
  const out: string[] = [];
  for (const a of list) {
    switch (a) {
      case "claude":
      case "claude-code":
        out.push(...initClaudeCode(cwd));
        break;
      case "codex":
        out.push(...initCodex());
        break;
      case "gemini":
        out.push(...initGemini());
        break;
      case "cursor":
        out.push(...initCursor(cwd));
        break;
      case "shell":
        out.push(...installShims());
        break;
      case "git":
        out.push(...initGitHook(cwd));
        break;
      default:
        out.push(`(skipped unknown agent "${a}")`);
    }
  }
  return out;
}

function initClaudeCode(cwd: string): string[] {
  const out: string[] = [];

  // 1) MCP server via project .mcp.json
  const mcpFile = path.join(cwd, ".mcp.json");
  const mcp = readJson(mcpFile);
  mcp.mcpServers ??= {};
  mcp.mcpServers.airlock = mcpSpec();
  writeJson(mcpFile, mcp);
  out.push(`Claude Code: registered airlock MCP server in ${mcpFile}`);

  // 2) PreToolUse hook via .claude/settings.json
  const settingsFile = path.join(cwd, ".claude", "settings.json");
  const settings = readJson(settingsFile);
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  const hookCmd = shellCommand(selfCommand(["hook", "claude-code"]));
  const already = JSON.stringify(settings.hooks.PreToolUse).includes("hook claude-code");
  if (!already) {
    settings.hooks.PreToolUse.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: hookCmd }],
    });
    writeJson(settingsFile, settings);
    out.push(`Claude Code: added PreToolUse(Bash) hook in ${settingsFile}`);
  } else {
    out.push(`Claude Code: PreToolUse hook already present in ${settingsFile}`);
  }
  return out;
}

function initCodex(): string[] {
  const { command, args } = selfCommand(["mcp"]);
  const file = path.join(os.homedir(), ".codex", "config.toml");
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    /* file may not exist yet */
  }
  if (content.includes("[mcp_servers.airlock]")) {
    return [`Codex: airlock MCP already configured (${file})`];
  }
  const block = `\n[mcp_servers.airlock]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, block);
  return [`Codex: added airlock MCP server to ${file}`];
}

function initGemini(): string[] {
  const file = path.join(os.homedir(), ".gemini", "settings.json");
  const json = readJson(file);
  json.mcpServers ??= {};
  json.mcpServers.airlock = mcpSpec();
  writeJson(file, json);
  return [`Gemini CLI: registered airlock MCP server in ${file}`];
}

function initCursor(cwd: string): string[] {
  const file = path.join(cwd, ".cursor", "mcp.json");
  const json = readJson(file);
  json.mcpServers ??= {};
  json.mcpServers.airlock = mcpSpec();
  writeJson(file, json);
  return [`Cursor: registered airlock MCP server in ${file}`];
}

function initGitHook(cwd: string): string[] {
  const gitDir = path.join(cwd, ".git");
  if (!fs.existsSync(gitDir)) {
    return [`Git: ${cwd} is not a git repository (no .git directory)`];
  }
  const hookFile = path.join(gitDir, "hooks", "pre-commit");
  let content = "";
  try {
    content = fs.readFileSync(hookFile, "utf8");
  } catch {
    content = "#!/bin/sh\n";
  }
  if (content.includes("# airlock-pre-commit:start")) {
    return [`Git: Airlock pre-commit hook already present in ${hookFile}`];
  }
  const block = [
    "",
    "# airlock-pre-commit:start",
    "# Blocks high-confidence secrets and suspicious staged test changes.",
    `${shellCommand(selfCommand(["secrets", "."]))} || exit $?`,
    `${shellCommand(selfCommand(["diff", ".", "--staged"]))} || exit $?`,
    "# airlock-pre-commit:end",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(hookFile), { recursive: true });
  fs.writeFileSync(hookFile, content.trimEnd() + block);
  fs.chmodSync(hookFile, 0o755);
  return [`Git: added Airlock pre-commit hook to ${hookFile}`];
}
