import type { PackageFacts } from "../types.js";

const GOPROXY = "https://proxy.golang.org";

export async function fetchGoFacts(name: string): Promise<PackageFacts> {
  const facts: PackageFacts = {
    name,
    ecosystem: "go",
    exists: false,
    ageDays: null,
    weeklyDownloads: null,
    maintainerCount: null,
    hasRepository: null,
    deprecated: null,
    latestVersion: null,
  };

  try {
    const res = await fetch(`${GOPROXY}/${escapeModule(name)}/@latest`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404 || res.status === 410) return facts;
    if (!res.ok) {
      facts.error = `Go module proxy returned ${res.status}`;
      return facts;
    }
    const data: any = await res.json();
    facts.exists = Boolean(data?.Version);
    facts.latestVersion = data?.Version ?? null;
    facts.hasRepository = looksLikeRepoPath(name);
  } catch (err) {
    facts.error = `Go module lookup failed: ${(err as Error).message}`;
  }

  return facts;
}

function escapeModule(name: string): string {
  // Go proxy escaping: uppercase letters become !lowercase.
  return name.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
}

function looksLikeRepoPath(name: string): boolean {
  return /^(github\.com|gitlab\.com|bitbucket\.org|golang\.org|go\.uber\.org|go\.opentelemetry\.io)\//.test(
    name,
  );
}
