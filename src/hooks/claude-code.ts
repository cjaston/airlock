import type { CommandVerdict } from "../core/types.js";
import { vetCommandInContext } from "../core/vet-command.js";

/**
 * Claude Code PreToolUse hook. Reads the tool-call payload on stdin; if the
 * command is dangerous it emits a deny (block) or ask (warn) decision. On a
 * clean command it emits nothing, so Claude Code's normal flow proceeds.
 */
export async function runClaudeCodeHook(): Promise<number> {
  const raw = await readStdin();
  let payload: any = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return 0; // malformed input — don't block the agent
  }

  const toolName = payload?.tool_name ?? payload?.toolName;
  const command =
    payload?.tool_input?.command ?? payload?.toolInput?.command ?? "";

  if (toolName && toolName !== "Bash") return 0;
  if (!command) return 0;

  const cwd = payload?.cwd ?? payload?.tool_input?.cwd ?? payload?.toolInput?.cwd;
  const verdict = await vetCommandInContext(String(command), {
    cwd: typeof cwd === "string" ? cwd : undefined,
  });
  if (verdict.decision === "block") {
    emit("deny", reason(verdict));
  } else if (verdict.decision === "warn") {
    emit("ask", reason(verdict));
  }
  return 0;
}

function emit(decision: "deny" | "ask", reasonText: string): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reasonText,
      },
    }) + "\n",
  );
}

function reason(v: CommandVerdict): string {
  const head =
    v.decision === "block"
      ? "🛟 Airlock blocked this command:"
      : "🛟 Airlock flagged this command:";
  const lines = v.signals
    .filter((s) => s.level !== "allow")
    .map((s) => `• ${s.message}`);
  return [head, ...lines].join("\n");
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
