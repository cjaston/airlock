import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ecosystem, PackageFacts } from "./types.js";

const CACHE_DIR = path.join(os.homedir(), ".airlock", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "facts.json");
const OK_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  savedAt: number;
  facts: PackageFacts;
}

type CacheShape = Record<string, CacheEntry>;

let memo: CacheShape | null = null;

export async function cachedFacts(
  name: string,
  ecosystem: Ecosystem,
  fetcher: () => Promise<PackageFacts>,
): Promise<PackageFacts> {
  if (process.env.AIRLOCK_NO_CACHE === "1") return fetcher();

  const cache = readCache();
  const key = `${ecosystem}:${name.toLowerCase()}`;
  const entry = cache[key];
  if (entry && !isExpired(entry)) return entry.facts;

  const facts = await fetcher();
  cache[key] = { savedAt: Date.now(), facts };
  writeCache(cache);
  return facts;
}

export function clearCache(): void {
  memo = {};
  try {
    fs.rmSync(CACHE_FILE, { force: true });
  } catch {
    // ignore
  }
}

export function cacheStats(): { file: string; entries: number } {
  return { file: CACHE_FILE, entries: Object.keys(readCache()).length };
}

function isExpired(entry: CacheEntry): boolean {
  const ttl = entry.facts.error ? ERROR_TTL_MS : OK_TTL_MS;
  return Date.now() - entry.savedAt > ttl;
}

function readCache(): CacheShape {
  if (memo) return memo;
  try {
    memo = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CacheShape;
  } catch {
    memo = {};
  }
  return memo;
}

function writeCache(cache: CacheShape): void {
  memo = cache;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
  } catch {
    // Cache must never break a safety check.
  }
}
