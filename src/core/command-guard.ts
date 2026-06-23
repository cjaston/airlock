import type { Signal } from "./types.js";

interface Rule {
  code: string;
  level: "block" | "warn";
  test: RegExp;
  message: string;
}

// Block only on clearly catastrophic, irreversible operations.
// Warn on risky-but-sometimes-legitimate ones. Kept tight to avoid noise.
const RULES: Rule[] = [
  {
    code: "rm_rf_root",
    level: "block",
    test: /\brm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rf][a-zA-Z]*\b[^|;&]*\s(\/|~|\$HOME|\/\*)(\s|"|'|$)/,
    message:
      "Recursive force-delete targeting a root/home path (rm -rf on / ~ or $HOME). This can wipe your machine.",
  },
  {
    code: "rm_no_preserve_root",
    level: "block",
    test: /\brm\b[^|;&]*--no-preserve-root/,
    message: "rm --no-preserve-root removes the guard that stops you deleting /.",
  },
  {
    code: "fork_bomb",
    level: "block",
    test: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    message: "Fork bomb detected — exhausts system resources and hangs the machine.",
  },
  {
    code: "dd_device",
    level: "block",
    test: /\bdd\b[^|;&]*\bof=\/dev\/(sd|nvme|disk|hd|mmcblk)/,
    message: "dd writing directly to a block device — can irreversibly destroy a disk.",
  },
  {
    code: "mkfs",
    level: "block",
    test: /\bmkfs(\.\w+)?\b[^|;&]*\/dev\//,
    message: "mkfs formats a filesystem — will erase the target device.",
  },
  {
    code: "redirect_device",
    level: "block",
    test: />\s*\/dev\/(sd|nvme|disk|hd)/,
    message: "Redirecting output to a raw block device — can corrupt a disk.",
  },
  {
    code: "chmod_777_root",
    level: "warn",
    test: /\bchmod\s+(-[a-zA-Z]*\s+)*0?777\s+(\/|~|\$HOME)(\s|$)/,
    message: "chmod 777 on a system/home root makes everything world-writable.",
  },
  {
    code: "git_force_push",
    level: "warn",
    test: /\bgit\s+push\b[^|;&]*(--force(?!-with-lease)|\s-f\b)/,
    message:
      "Force-push can overwrite shared remote history. Prefer --force-with-lease.",
  },
  {
    code: "git_reset_hard",
    level: "warn",
    test: /\bgit\s+reset\s+--hard\b/,
    message: "git reset --hard discards uncommitted changes irreversibly.",
  },
  {
    code: "git_clean_force",
    level: "warn",
    test: /\bgit\s+clean\b[^|;&]*-[a-zA-Z]*f/,
    message: "git clean -f permanently deletes untracked files.",
  },
  {
    code: "sql_destructive",
    level: "warn",
    test: /\b(drop\s+(table|database|schema)|truncate\s+table)\b/i,
    message: "Destructive SQL (DROP/TRUNCATE) — confirm this isn't pointed at production.",
  },
  {
    code: "pipe_to_shell",
    level: "warn",
    test: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?)\b/,
    message: "Piping a downloaded script straight into a shell runs unvetted remote code.",
  },
  {
    code: "remote_exec_package",
    level: "warn",
    test: /\b(npx|bunx|uvx)\b[^|;&]*(https?:\/\/|git\+|github:)|\b(npm\s+(exec|x)|pnpm\s+dlx|yarn\s+dlx|bun\s+(x|dlx)|pipx\s+run)\b[^|;&]*(https?:\/\/|git\+|github:)/,
    message:
      "Executing a package from a URL/Git source bypasses registry provenance checks. Prefer a pinned registry package.",
  },
];

/** Scan a raw shell command for dangerous operations. */
export function guardCommand(command: string): Signal[] {
  const signals: Signal[] = [];
  for (const rule of RULES) {
    if (rule.test.test(command)) {
      signals.push({ level: rule.level, code: rule.code, message: rule.message });
    }
  }
  return signals;
}
