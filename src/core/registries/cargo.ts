import type { PackageFacts } from "../types.js";

const CRATES = "https://crates.io/api/v1/crates";

export async function fetchCargoFacts(name: string): Promise<PackageFacts> {
  const facts: PackageFacts = emptyFacts(name);

  try {
    const res = await fetch(`${CRATES}/${encodeURIComponent(name)}`, {
      headers: {
        accept: "application/json",
        "user-agent": "airlock-cli",
      },
    });
    if (res.status === 404) return facts;
    if (!res.ok) {
      facts.error = `crates.io returned ${res.status}`;
      return facts;
    }
    const data: any = await res.json();
    const crate = data?.crate;
    facts.exists = Boolean(crate?.id);
    facts.latestVersion = crate?.newest_version ?? crate?.max_version ?? null;
    facts.hasRepository = Boolean(crate?.repository || crate?.homepage);
    if (crate?.created_at) facts.ageDays = daysSince(crate.created_at);
  } catch (err) {
    facts.error = `crates.io lookup failed: ${(err as Error).message}`;
  }

  return facts;
}

function emptyFacts(name: string): PackageFacts {
  return {
    name,
    ecosystem: "cargo",
    exists: false,
    ageDays: null,
    weeklyDownloads: null,
    maintainerCount: null,
    hasRepository: null,
    deprecated: null,
    latestVersion: null,
  };
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}
