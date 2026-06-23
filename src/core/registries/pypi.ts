import type { PackageFacts } from "../types.js";

const PYPI = "https://pypi.org/pypi";

export async function fetchPypiFacts(name: string): Promise<PackageFacts> {
  const facts: PackageFacts = {
    name,
    ecosystem: "pypi",
    exists: false,
    ageDays: null,
    weeklyDownloads: null,
    maintainerCount: null,
    hasRepository: null,
    deprecated: null,
    latestVersion: null,
  };

  try {
    const res = await fetch(`${PYPI}/${encodeURIComponent(name)}/json`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404) {
      facts.exists = false;
      return facts;
    }
    if (!res.ok) {
      facts.error = `pypi returned ${res.status}`;
      return facts;
    }
    const data: any = await res.json();
    facts.exists = true;
    facts.latestVersion = data?.info?.version ?? null;

    // Earliest upload time across every release file = package birth date.
    const releases: Record<string, any[]> = data?.releases ?? {};
    let earliest: number | null = null;
    for (const files of Object.values(releases)) {
      for (const f of files ?? []) {
        const t: string | undefined = f?.upload_time_iso_8601 ?? f?.upload_time;
        if (t) {
          const ms = new Date(t).getTime();
          if (earliest === null || ms < earliest) earliest = ms;
        }
      }
    }
    if (earliest !== null) {
      facts.ageDays = Math.floor((Date.now() - earliest) / 86_400_000);
    }

    const info: any = data?.info ?? {};
    const projectUrls: Record<string, string> = info?.project_urls ?? {};
    facts.hasRepository = Boolean(
      info?.home_page || Object.keys(projectUrls).length > 0,
    );
    // PyPI's JSON API doesn't expose download counts; left for Day 3 (pypistats).
  } catch (err) {
    facts.error = `pypi lookup failed: ${(err as Error).message}`;
  }

  return facts;
}
