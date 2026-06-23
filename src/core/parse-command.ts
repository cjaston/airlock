import type { Ecosystem } from "./types.js";

export interface InstallTarget {
  name: string;
  ecosystem: Ecosystem;
  raw: string;
}

const NPM_TOOLS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PY_TOOLS = new Set(["pip", "pip3", "uv", "python", "python3", "poetry"]);

const FLAGS_WITH_VALUE = new Set([
  "--registry", "--prefix", "-r", "--requirement", "-c", "--constraint",
  "--index-url", "-i", "--extra-index-url", "--tag", "--workspace", "-w",
]);

/** Split a shell line into individual commands on &&, ||, ;, |, newline. */
export function splitPipeline(command: string): string[] {
  return command
    .split(/\n|&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tokenize a single command, honoring simple single/double quotes. */
export function tokenize(sub: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sub))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Find every package an install command would fetch from a registry. */
export function extractInstallTargets(command: string): InstallTarget[] {
  const targets: InstallTarget[] = [];

  for (const sub of splitPipeline(command)) {
    const toks = tokenize(sub);
    if (toks.length === 0) continue;

    let tool = basename(toks[0] ?? "");
    let rest = toks.slice(1);
    if (tool === "sudo" && rest.length) {
      tool = basename(rest[0] ?? "");
      rest = rest.slice(1);
    }

    if (NPM_TOOLS.has(tool)) {
      const sc = rest[0];
      const isInstall =
        ((tool === "npm" || tool === "pnpm" || tool === "bun") &&
          (sc === "install" || sc === "i" || sc === "add")) ||
        (tool === "yarn" && sc === "add");
      if (isInstall) collectSpecs(rest.slice(1), "npm", targets);
    } else if (PY_TOOLS.has(tool)) {
      let args = rest;
      let isInstall = false;
      if ((tool === "pip" || tool === "pip3") && args[0] === "install") {
        isInstall = true;
        args = args.slice(1);
      } else if (
        (tool === "python" || tool === "python3") &&
        args[0] === "-m" &&
        args[1] === "pip" &&
        args[2] === "install"
      ) {
        isInstall = true;
        args = args.slice(3);
      } else if (tool === "uv" && args[0] === "pip" && args[1] === "install") {
        isInstall = true;
        args = args.slice(2);
      } else if (tool === "uv" && args[0] === "add") {
        isInstall = true;
        args = args.slice(1);
      } else if (tool === "poetry" && args[0] === "add") {
        isInstall = true;
        args = args.slice(1);
      }
      if (isInstall) collectSpecs(args, "pypi", targets);
    }
  }

  return targets;
}

function collectSpecs(
  args: string[],
  ecosystem: Ecosystem,
  out: InstallTarget[],
): void {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a.startsWith("-")) {
      if (FLAGS_WITH_VALUE.has(a)) i++; // skip the flag's value too
      continue;
    }
    if (isNonPackageSpec(a)) continue;
    const name = specToName(a, ecosystem);
    if (name) out.push({ name, ecosystem, raw: a });
  }
}

function isNonPackageSpec(s: string): boolean {
  if (s === "." || s === "..") return true;
  if (s.startsWith(".") || s.startsWith("/") || s.startsWith("~")) return true;
  if (s.includes("://")) return true;
  if (s.startsWith("git+") || s.startsWith("github:") || s.startsWith("file:")) {
    return true;
  }
  if (/\.(tgz|tar\.gz|whl)$/.test(s)) return true;
  return false;
}

function specToName(spec: string, ecosystem: Ecosystem): string | null {
  if (ecosystem === "npm") {
    if (spec.startsWith("@")) {
      const at = spec.indexOf("@", 1); // version separator after scope
      return at === -1 ? spec : spec.slice(0, at);
    }
    const at = spec.indexOf("@");
    return at === -1 ? spec : spec.slice(0, at);
  }
  // pypi: strip version specifiers / extras (==, >=, ~=, [extra], etc.)
  const m = spec.match(/^[A-Za-z0-9._-]+/);
  return m ? m[0] : null;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}
