import fs from "node:fs";
import path from "node:path";

export interface SecretFinding {
  code: string;
  label: string;
  file: string;
  line: number;
  preview: string;
}

export interface SecretScanResult {
  root: string;
  findings: SecretFinding[];
}

interface SecretRule {
  code: string;
  label: string;
  pattern: RegExp;
}

const RULES: SecretRule[] = [
  {
    code: "github_token",
    label: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|github_pat_[A-Za-z0-9_]{20,}/g,
  },
  {
    code: "openai_key",
    label: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g,
  },
  {
    code: "anthropic_key",
    label: "Anthropic API key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/g,
  },
  {
    code: "aws_access_key",
    label: "AWS access key ID",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    code: "slack_token",
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    code: "private_key",
    label: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
];

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
  ".airlock",
]);

const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".wasm",
  ".lock",
]);

const MAX_FILE_BYTES = 1_000_000;

export function scanSecrets(root = process.cwd()): SecretScanResult {
  const absoluteRoot = path.resolve(root);
  const findings: SecretFinding[] = [];
  for (const file of findFiles(absoluteRoot)) {
    scanFile(file, findings);
  }
  return { root: absoluteRoot, findings };
}

export function scanTextForSecrets(
  text: string,
  file = "<text>",
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of line.matchAll(rule.pattern)) {
        findings.push({
          code: rule.code,
          label: rule.label,
          file,
          line: i + 1,
          preview: redact(match[0] ?? ""),
        });
      }
    }
  }
  return findings;
}

function scanFile(file: string, findings: SecretFinding[]): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return;
  }
  if (stat.size > MAX_FILE_BYTES) return;

  let text = "";
  try {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) return;
    text = buf.toString("utf8");
  } catch {
    return;
  }
  findings.push(...scanTextForSecrets(text, file));
}

function findFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  if (depth > 8) return;
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
    } else if (entry.isFile() && !SKIP_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function redact(secret: string): string {
  if (secret.length <= 12) return "[redacted]";
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}
