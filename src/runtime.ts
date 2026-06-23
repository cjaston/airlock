import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CommandSpec {
  command: string;
  args: string[];
}

export const SHIM_DIR = path.join(os.homedir(), ".airlock", "shims");

/** Path to the compiled CLI entry (dist/index.js). */
export function entryPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.js");
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8"),
    );
    return String(pkg.version ?? "latest");
  } catch {
    return "latest";
  }
}

/**
 * `npx airlock-cli init ...` runs from npm's temporary cache. Generated agent
 * configs must not point at that temp path, because npm can delete it later.
 */
export function isEphemeralNpxPath(file: string): boolean {
  const normalized = file.split(path.sep).join("/");
  return normalized.includes("/_npx/") || normalized.includes("/.npm/_npx/");
}

/**
 * Stable way for generated configs to invoke this CLI. Source/global installs
 * use the absolute node+dist path; ephemeral npx installs use real npx with a
 * pinned package version so configs keep working after the temp cache vanishes.
 */
export function selfCommand(args: string[]): CommandSpec {
  const entry = entryPath();
  if (isEphemeralNpxPath(entry)) {
    const npx = findOnPath("npx", [SHIM_DIR]) ?? "npx";
    return { command: npx, args: ["-y", `airlock-cli@${packageVersion()}`, ...args] };
  }
  return { command: process.execPath, args: [entry, ...args] };
}

export function findOnPath(bin: string, excludeDirs: string[] = []): string | null {
  const excludes = excludeDirs.map((d) => path.resolve(d));
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!d) continue;
    const resolved = path.resolve(d);
    if (excludes.includes(resolved)) continue;
    const candidate = path.join(d, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

export function shellCommand(spec: CommandSpec): string {
  return [spec.command, ...spec.args].map(shq).join(" ");
}

/** Minimal POSIX shell-quote for embedding paths/args in generated scripts. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
