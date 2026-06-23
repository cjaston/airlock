import fs from "node:fs";
import path from "node:path";
import type { Ecosystem, Verdict } from "./types.js";
import { vetPackage } from "./vet.js";

export interface ManifestTarget {
  name: string;
  ecosystem: Ecosystem;
  file: string;
  source: string;
}

export interface ScanResult {
  root: string;
  targets: ManifestTarget[];
  verdicts: Array<{ target: ManifestTarget; verdict: Verdict }>;
}

const MANIFEST_NAMES = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "Gemfile",
  "go.mod",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
]);

export async function scanProject(root = process.cwd()): Promise<ScanResult> {
  const absoluteRoot = path.resolve(root);
  const files = findManifestFiles(absoluteRoot);
  const targets = dedupe(files.flatMap((file) => parseManifest(file)));
  const verdicts = await Promise.all(
    targets.map(async (target) => ({
      target,
      verdict: await vetPackage(target.name, target.ecosystem, {
        cwd: absoluteRoot,
      }),
    })),
  );
  return { root: absoluteRoot, targets, verdicts };
}

export function parseManifest(file: string): ManifestTarget[] {
  const base = path.basename(file);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }

  if (base === "package.json") return parsePackageJson(file, text);
  if (base === "requirements.txt") return parseRequirements(file, text);
  if (base === "pyproject.toml") return parsePyproject(file, text);
  if (base === "Cargo.toml") return parseCargoToml(file, text);
  if (base === "Gemfile") return parseGemfile(file, text);
  if (base === "go.mod") return parseGoMod(file, text);
  return [];
}

function findManifestFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  if (depth > 5) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out, depth + 1);
    } else if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) {
      out.push(full);
    }
  }
}

function parsePackageJson(file: string, text: string): ManifestTarget[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const out: ManifestTarget[] = [];
  for (const field of fields) {
    const deps = json?.[field];
    if (!deps || typeof deps !== "object") continue;
    for (const name of Object.keys(deps)) {
      out.push({ name, ecosystem: "npm", file, source: field });
    }
  }
  return out;
}

function parseRequirements(file: string, text: string): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line || line.startsWith("-") || line.includes("://")) continue;
    const name = line.match(/^[A-Za-z0-9._-]+/)?.[0];
    if (name) out.push({ name, ecosystem: "pypi", file, source: "requirements" });
  }
  return out;
}

function parsePyproject(file: string, text: string): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  for (const match of text.matchAll(/["']([A-Za-z0-9._-]+)(?:\[.*?\])?(?:[<>=!~ ].*?)?["']/g)) {
    const name = match[1];
    if (name && likelyPythonDependencyContext(text, match.index ?? 0)) {
      out.push({ name, ecosystem: "pypi", file, source: "pyproject" });
    }
  }
  for (const match of text.matchAll(/^\s*([A-Za-z0-9._-]+)\s*=\s*(?:["'{]|$)/gm)) {
    const name = match[1];
    if (name && inTomlSection(text, match.index ?? 0, "tool.poetry.dependencies")) {
      if (name !== "python") out.push({ name, ecosystem: "pypi", file, source: "poetry" });
    }
  }
  return out;
}

function parseCargoToml(file: string, text: string): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  for (const section of [
    "dependencies",
    "dev-dependencies",
    "build-dependencies",
  ]) {
    for (const match of sectionBody(text, section).matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)) {
      out.push({ name: match[1]!.replace(/_/g, "-"), ecosystem: "cargo", file, source: section });
    }
  }
  return out;
}

function parseGemfile(file: string, text: string): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  for (const match of text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)) {
    out.push({ name: match[1]!, ecosystem: "rubygems", file, source: "Gemfile" });
  }
  return out;
}

function parseGoMod(file: string, text: string): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  for (const match of text.matchAll(/^\s*require\s+([^\s()]+)\s+v/mg)) {
    out.push({ name: match[1]!, ecosystem: "go", file, source: "go.mod" });
  }
  const block = text.match(/^\s*require\s+\(([\s\S]*?)^\s*\)/m)?.[1] ?? "";
  for (const match of block.matchAll(/^\s*([^\s]+)\s+v/gm)) {
    out.push({ name: match[1]!, ecosystem: "go", file, source: "go.mod" });
  }
  return out;
}

function sectionBody(text: string, section: string): string {
  const re = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$`, "m");
  const match = re.exec(text);
  if (!match) return "";
  const start = (match.index ?? 0) + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^\s*\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function inTomlSection(text: string, index: number, section: string): boolean {
  const before = text.slice(0, index);
  const headers = [...before.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)];
  return headers.at(-1)?.[1] === section;
}

function likelyPythonDependencyContext(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 300), index);
  return /dependencies\s*=\s*\[[^\]]*$|optional-dependencies[\s\S]*\[[^\]]*$/.test(before);
}

function dedupe(targets: ManifestTarget[]): ManifestTarget[] {
  const seen = new Set<string>();
  const out: ManifestTarget[] = [];
  for (const target of targets) {
    const key = `${target.ecosystem}:${target.name.toLowerCase()}:${target.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
