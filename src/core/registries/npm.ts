import type { PackageFacts } from "../types.js";

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";

export async function fetchNpmFacts(name: string): Promise<PackageFacts> {
  const facts: PackageFacts = {
    name,
    ecosystem: "npm",
    exists: false,
    ageDays: null,
    weeklyDownloads: null,
    maintainerCount: null,
    hasRepository: null,
    deprecated: null,
    latestVersion: null,
  };

  try {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404) {
      facts.exists = false;
      return facts;
    }
    if (!res.ok) {
      facts.error = `npm registry returned ${res.status}`;
      return facts;
    }
    const data: any = await res.json();
    facts.exists = true;

    const created: string | undefined = data?.time?.created;
    if (created) facts.ageDays = daysSince(created);

    const latest: string | undefined = data?.["dist-tags"]?.latest;
    facts.latestVersion = latest ?? null;

    const versionMeta: any = latest ? data?.versions?.[latest] : undefined;
    facts.deprecated = versionMeta?.deprecated ? true : false;
    facts.maintainerCount = Array.isArray(data?.maintainers)
      ? data.maintainers.length
      : null;

    const repo = versionMeta?.repository ?? data?.repository;
    facts.hasRepository = repo ? true : false;
  } catch (err) {
    facts.error = `npm lookup failed: ${(err as Error).message}`;
    return facts;
  }

  // Download counts come from a separate endpoint; best-effort.
  try {
    const res = await fetch(`${DOWNLOADS}/${encodeURIComponent(name)}`);
    if (res.ok) {
      const d: any = await res.json();
      if (typeof d?.downloads === "number") facts.weeklyDownloads = d.downloads;
    }
  } catch {
    // ignore — downloads are a signal, not a requirement
  }

  return facts;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}
