import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SHIM_DIR } from "./runtime.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorResult {
  cwd: string;
  checks: DoctorCheck[];
}

export function runDoctor(cwd = process.cwd()): DoctorResult {
  const checks: DoctorCheck[] = [];
  checks.push(checkShims());
  checks.push(checkGitHook(cwd));
  checks.push(checkFile("Claude Code MCP", path.join(cwd, ".mcp.json"), "project MCP config"));
  checks.push(
    checkFile(
      "Claude Code hook",
      path.join(cwd, ".claude", "settings.json"),
      "project hook config",
      "hook claude-code",
    ),
  );
  checks.push(
    checkFile(
      "Cursor MCP",
      path.join(cwd, ".cursor", "mcp.json"),
      "project Cursor MCP config",
    ),
  );
  checks.push(
    checkFile(
      "Codex MCP",
      path.join(os.homedir(), ".codex", "config.toml"),
      "user Codex config",
      "airlock",
    ),
  );
  checks.push(
    checkFile(
      "Gemini MCP",
      path.join(os.homedir(), ".gemini", "settings.json"),
      "user Gemini config",
      "airlock",
    ),
  );
  return { cwd: path.resolve(cwd), checks };
}

function checkShims(): DoctorCheck {
  const installed = fs.existsSync(SHIM_DIR);
  const onPath = (process.env.PATH ?? "")
    .split(path.delimiter)
    .some((dir) => dir && path.resolve(dir) === path.resolve(SHIM_DIR));
  return {
    name: "Shell shims",
    ok: installed && onPath,
    detail: installed
      ? onPath
        ? `${SHIM_DIR} is installed and on PATH`
        : `${SHIM_DIR} is installed but not on PATH`
      : "not installed; run airlock guard install",
  };
}

function checkGitHook(cwd: string): DoctorCheck {
  const file = path.join(cwd, ".git", "hooks", "pre-commit");
  const content = read(file);
  return {
    name: "Git pre-commit hook",
    ok: content.includes("airlock-pre-commit:start"),
    detail: content
      ? content.includes("airlock-pre-commit:start")
        ? `${file} contains Airlock hook`
        : `${file} exists but does not contain Airlock hook`
      : "not installed; run airlock init git",
  };
}

function checkFile(
  name: string,
  file: string,
  label: string,
  requiredText = "airlock",
): DoctorCheck {
  const content = read(file);
  return {
    name,
    ok: content.includes(requiredText),
    detail: content
      ? content.includes(requiredText)
        ? `${label} includes Airlock (${file})`
        : `${label} exists but does not mention Airlock (${file})`
      : `not configured (${file})`,
  };
}

function read(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
