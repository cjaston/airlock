import type { CommandVerdict, Decision, Signal } from "./types.js";
import { extractInstallTargets } from "./parse-command.js";
import { guardCommand } from "./command-guard.js";
import { vetPackage } from "./vet.js";

/**
 * Vet an entire shell command: destructive-operation guard (sync) plus
 * package-install vetting (async, hits registries). This is the single
 * entry point used by the MCP server, the Claude Code hook, and the shims.
 */
export async function vetCommand(command: string): Promise<CommandVerdict> {
  const signals: Signal[] = [];

  signals.push(...guardCommand(command));

  const targets = extractInstallTargets(command);
  const packages = await Promise.all(
    targets.map((t) => vetPackage(t.name, t.ecosystem)),
  );
  for (const pv of packages) {
    for (const s of pv.signals) {
      if (s.level === "allow") continue; // keep command output focused on risks
      signals.push({ ...s, message: `[${pv.name}] ${s.message}` });
    }
  }

  const decision: Decision = signals.some((s) => s.level === "block")
    ? "block"
    : signals.some((s) => s.level === "warn")
      ? "warn"
      : "allow";

  return { command, decision, signals, packages };
}
