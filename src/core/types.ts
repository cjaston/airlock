export type Ecosystem = "npm" | "pypi" | "cargo" | "rubygems" | "go";

export type Decision = "block" | "warn" | "allow";

/** A name that looks like a popular package (typosquat / mashup). */
export interface SimilarityHit {
  kind: "typosquat" | "mashup";
  target: string;
}

/** Raw facts gathered about a package from its registry. */
export interface PackageFacts {
  name: string;
  ecosystem: Ecosystem;
  exists: boolean;
  /** Days since the package was first published, or null if unknown. */
  ageDays: number | null;
  /** Downloads in the last week, or null if unavailable. */
  weeklyDownloads: number | null;
  maintainerCount: number | null;
  hasRepository: boolean | null;
  deprecated: boolean | null;
  latestVersion: string | null;
  /** Resemblance to a popular package, computed locally. */
  nameSimilarTo?: SimilarityHit | null;
  /** Set when a lookup failed (network, registry error, etc.). */
  error?: string;
}

/** A single human-readable reason contributing to a verdict. */
export interface Signal {
  level: Decision;
  code: string;
  message: string;
}

/** The final decision for a single package. */
export interface Verdict {
  name: string;
  ecosystem: Ecosystem;
  decision: Decision;
  /** 0 (safe) – 100 (block). */
  score: number;
  signals: Signal[];
  facts: PackageFacts;
}

/** The verdict for an entire shell command (installs + destructive ops). */
export interface CommandVerdict {
  command: string;
  decision: Decision;
  signals: Signal[];
  /** Per-package verdicts for any installs found in the command. */
  packages: Verdict[];
}
