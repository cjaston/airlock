import type { Decision, PackageFacts, Signal, Verdict } from "./types.js";

// Tunable thresholds. Conservative by design — a noisy firewall gets uninstalled.
const NEW_AGE_DAYS = 30;
const LOW_WEEKLY_DOWNLOADS = 100;
// Window in which a look-alike name is treated as an active attack, not noise.
const SQUAT_NEW_AGE_DAYS = 90;
const SQUAT_LOW_DOWNLOADS = 1000;

export function scorePackage(facts: PackageFacts): Verdict {
  const signals: Signal[] = [];

  if (facts.error) {
    signals.push({
      level: "warn",
      code: "lookup_error",
      message: `${facts.error}. Could not fully verify — proceed with caution.`,
    });
    return finalize(facts, signals);
  }

  if (!facts.exists) {
    signals.push({
      level: "block",
      code: "not_found",
      message: `Package "${facts.name}" does not exist on ${facts.ecosystem}. This is the #1 sign of a hallucinated dependency — do not install.`,
    });
    return finalize(facts, signals);
  }

  // Look-alike of a popular package (typosquat / mashup). Most dangerous when
  // the impostor is real-but-newborn / low-adoption.
  const sim = facts.nameSimilarTo;
  if (sim) {
    const newish = facts.ageDays !== null && facts.ageDays < SQUAT_NEW_AGE_DAYS;
    const lowAdoption =
      facts.weeklyDownloads !== null &&
      facts.weeklyDownloads < SQUAT_LOW_DOWNLOADS;
    const verb = sim.kind === "typosquat" ? "is one character off from" : "looks like a look-alike of";
    if (newish || lowAdoption) {
      signals.push({
        level: "block",
        code: sim.kind,
        message: `"${facts.name}" ${verb} the popular package "${sim.target}", and is newly-published / low-adoption — the classic ${sim.kind} attack. Did you mean "${sim.target}"?`,
      });
    } else {
      signals.push({
        level: "warn",
        code: sim.kind,
        message: `"${facts.name}" resembles the popular package "${sim.target}". Confirm you meant this and not "${sim.target}".`,
      });
    }
  }

  if (facts.deprecated) {
    signals.push({
      level: "warn",
      code: "deprecated",
      message: "Package is marked deprecated by its maintainers.",
    });
  }

  const isNew = facts.ageDays !== null && facts.ageDays < NEW_AGE_DAYS;
  const lowDownloads =
    facts.weeklyDownloads !== null &&
    facts.weeklyDownloads < LOW_WEEKLY_DOWNLOADS;

  if (isNew && lowDownloads) {
    signals.push({
      level: "warn",
      code: "new_and_unpopular",
      message: `Published ${facts.ageDays} days ago with only ${facts.weeklyDownloads} downloads/week. Newly-registered, low-adoption packages are the classic slopsquatting pattern — confirm the name is exactly what you intended.`,
    });
  } else if (isNew) {
    signals.push({
      level: "warn",
      code: "new_package",
      message: `Published only ${facts.ageDays} days ago. Double-check this is the package you meant.`,
    });
  }

  if (facts.hasRepository === false) {
    signals.push({
      level: "warn",
      code: "no_repository",
      message: "No source repository is linked — limited provenance.",
    });
  }

  if (signals.length === 0) {
    const dl =
      facts.weeklyDownloads !== null
        ? `, ${facts.weeklyDownloads.toLocaleString()} downloads/week`
        : "";
    const age =
      facts.ageDays !== null ? `${facts.ageDays} days old${dl}` : `registry metadata verified${dl}`;
    signals.push({
      level: "allow",
      code: "ok",
      message: `Established package (${age}).`,
    });
  }

  return finalize(facts, signals);
}

function finalize(facts: PackageFacts, signals: Signal[]): Verdict {
  const decision: Decision = signals.some((s) => s.level === "block")
    ? "block"
    : signals.some((s) => s.level === "warn")
      ? "warn"
      : "allow";
  const score = decision === "block" ? 100 : decision === "warn" ? 50 : 0;
  return {
    name: facts.name,
    ecosystem: facts.ecosystem,
    decision,
    score,
    signals,
    facts,
  };
}
