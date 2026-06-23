import type { PackageFacts } from "../types.js";

const RUBYGEMS = "https://rubygems.org/api/v1/gems";

export async function fetchRubyGemsFacts(name: string): Promise<PackageFacts> {
  const facts: PackageFacts = emptyFacts(name);

  try {
    const res = await fetch(`${RUBYGEMS}/${encodeURIComponent(name)}.json`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404) return facts;
    if (!res.ok) {
      facts.error = `rubygems.org returned ${res.status}`;
      return facts;
    }
    const data: any = await res.json();
    facts.exists = Boolean(data?.name);
    facts.latestVersion = data?.version ?? null;
    facts.hasRepository = Boolean(
      data?.source_code_uri || data?.homepage_uri || data?.bug_tracker_uri,
    );
  } catch (err) {
    facts.error = `rubygems.org lookup failed: ${(err as Error).message}`;
  }

  return facts;
}

function emptyFacts(name: string): PackageFacts {
  return {
    name,
    ecosystem: "rubygems",
    exists: false,
    ageDays: null,
    weeklyDownloads: null,
    maintainerCount: null,
    hasRepository: null,
    deprecated: null,
    latestVersion: null,
  };
}
