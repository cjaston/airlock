import { execFileSync } from "node:child_process";
import path from "node:path";

export interface DiffFinding {
  code: string;
  file: string;
  line: number | null;
  message: string;
}

export interface DiffScanResult {
  root: string;
  staged: boolean;
  findings: DiffFinding[];
}

const ASSERTION_REMOVED =
  /\b(expect|assert|assertEqual|assertTrue|assertFalse|assertThat|should|pytest\.raises)\b|\.to(Equal|Be|Contain|Throw|Match)\b/;
const SKIP_ADDED =
  /\b(describe|it|test|context)\.skip\s*\(|\b(xdescribe|xit|xtest)\s*\(|\bskip\(["']|pytest\.mark\.skip/;
const ONLY_ADDED = /\b(describe|it|test|context)\.only\s*\(|\bfit\s*\(|\bfdescribe\s*\(/;

export function scanGitDiff(
  root = process.cwd(),
  options: { staged?: boolean } = {},
): DiffScanResult {
  const absoluteRoot = path.resolve(root);
  let diff = "";
  try {
    const args = ["diff", "--unified=0", "--no-ext-diff"];
    if (options.staged) args.splice(1, 0, "--staged");
    diff = execFileSync("git", args, {
      cwd: absoluteRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    diff = "";
  }
  return {
    root: absoluteRoot,
    staged: Boolean(options.staged),
    findings: scanDiffText(diff),
  };
}

export function scanDiffText(diff: string): DiffFinding[] {
  const findings: DiffFinding[] = [];
  let file = "";
  let oldLine: number | null = null;
  let newLine: number | null = null;
  let deletedFile = false;
  let removedAssertions: DiffFinding[] = [];
  let addedAssertions = 0;

  const flushAssertions = () => {
    const unbalanced = Math.max(0, removedAssertions.length - addedAssertions);
    findings.push(...removedAssertions.slice(0, unbalanced));
    removedAssertions = [];
    addedAssertions = 0;
  };

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      flushAssertions();
      file = fileMatch[2] ?? fileMatch[1] ?? "";
      deletedFile = false;
      oldLine = null;
      newLine = null;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      deletedFile = true;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      file = line.slice("+++ b/".length);
      continue;
    }
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      flushAssertions();
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      if (deletedFile && isTestFile(file)) {
        findings.push({
          code: "test_file_deleted",
          file,
          line: null,
          message: "A test file was deleted. Confirm the agent did not remove coverage to make a change pass.",
        });
      }
      continue;
    }
    if (!file || !isTestFile(file)) {
      advanceCounters(line, (v) => (oldLine = v), (v) => (newLine = v), oldLine, newLine);
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      const body = line.slice(1);
      if (ASSERTION_REMOVED.test(body)) {
        removedAssertions.push({
          code: "assertion_removed",
          file,
          line: oldLine,
          message: "An assertion was removed from a test file. Confirm this is not test-subversion.",
        });
      }
      if (oldLine !== null) oldLine++;
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const body = line.slice(1);
      if (ASSERTION_REMOVED.test(body)) addedAssertions++;
      if (SKIP_ADDED.test(body)) {
        findings.push({
          code: "test_skip_added",
          file,
          line: newLine,
          message: "A skipped test was added. Agents sometimes skip failing tests instead of fixing behavior.",
        });
      }
      if (ONLY_ADDED.test(body)) {
        findings.push({
          code: "focused_test_added",
          file,
          line: newLine,
          message: "A focused-only test was added. This can accidentally suppress the rest of the suite.",
        });
      }
      if (newLine !== null) newLine++;
      continue;
    }
    advanceCounters(line, (v) => (oldLine = v), (v) => (newLine = v), oldLine, newLine);
  }

  flushAssertions();
  return findings;
}

function advanceCounters(
  line: string,
  setOld: (n: number) => void,
  setNew: (n: number) => void,
  oldLine: number | null,
  newLine: number | null,
): void {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    if (newLine !== null) setNew(newLine + 1);
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    if (oldLine !== null) setOld(oldLine + 1);
  } else {
    if (oldLine !== null) setOld(oldLine + 1);
    if (newLine !== null) setNew(newLine + 1);
  }
}

function isTestFile(file: string): boolean {
  return /(^|\/)(test|tests|__tests__)\/|(\.test\.|\.spec\.|_test\.|Test\.)/.test(
    file,
  );
}
