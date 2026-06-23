import type { Ecosystem, SimilarityHit } from "./types.js";
import { POPULAR_NPM, POPULAR_PYPI } from "./data/popular.js";

// Tokens that are typically appended to a real package name to make a
// plausible-but-fake one (e.g. "lodash-utils", "requests-helper").
const FILLER = new Set<string>([
  "helper", "helpers", "utils", "util", "sdk", "client", "clients", "api",
  "apis", "js", "ts", "cli", "core", "tools", "tool", "lib", "libs",
  "plugin", "plugins", "official", "wrapper", "http", "https", "async",
  "sync", "node", "nodejs", "py", "python", "fix", "fixed", "new", "pro",
  "plus", "extra", "ext", "module", "modules", "package", "pkg", "free",
  "secure", "fast", "easy", "simple", "modern",
]);

export function checkSimilarity(
  name: string,
  ecosystem: Ecosystem,
): SimilarityHit | null {
  const popular = ecosystem === "npm" ? POPULAR_NPM : POPULAR_PYPI;
  const norm = normalize(name, ecosystem);
  if (popular.has(norm)) return null; // it IS a known-good package

  const mashup = checkMashup(norm, popular);
  if (mashup) return { kind: "mashup", target: mashup };

  const typo = checkTyposquat(norm, popular);
  if (typo) return { kind: "typosquat", target: typo };

  return null;
}

function normalize(name: string, ecosystem: Ecosystem): string {
  let n = name.toLowerCase().trim();
  if (ecosystem === "npm" && n.startsWith("@")) {
    const slash = n.indexOf("/");
    if (slash !== -1) n = n.slice(slash + 1);
  }
  if (ecosystem === "pypi") n = n.replace(/_/g, "-");
  return n;
}

function tokens(name: string): string[] {
  return name.split(/[-_.]/).filter(Boolean);
}

/** name == <popular> + only filler tokens (prefix or suffix). */
function checkMashup(name: string, popular: Set<string>): string | null {
  const t = tokens(name);
  if (t.length < 2) return null;

  for (let take = Math.min(t.length - 1, 3); take >= 1; take--) {
    const prefix = t.slice(0, take).join("-");
    if (popular.has(prefix) && t.slice(take).every((x) => FILLER.has(x))) {
      return prefix;
    }
    const suffix = t.slice(t.length - take).join("-");
    if (
      popular.has(suffix) &&
      t.slice(0, t.length - take).every((x) => FILLER.has(x))
    ) {
      return suffix;
    }
  }
  return null;
}

/** name is a 1–2 character edit away from a popular name. */
function checkTyposquat(name: string, popular: Set<string>): string | null {
  for (const p of popular) {
    if (p === name) continue;
    if (Math.abs(p.length - name.length) > 2) continue;
    if (p.length < 5 || name.length < 5) continue;
    const d = editDistance(name, p, 2);
    if (d === 1) return p;
    if (p.length >= 8 && d === 2) return p;
  }
  return null;
}

/** Levenshtein distance, with early-out once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Infinity): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;

  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl];
}
