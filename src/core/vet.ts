import type { Ecosystem, Verdict } from "./types.js";
import { cachedFacts } from "./cache.js";
import { policyVerdict } from "./policy.js";
import { fetchFacts } from "./registries/index.js";
import { checkSimilarity } from "./similarity.js";
import { scorePackage } from "./score.js";

/** Vet a single package: gather registry facts + name similarity, then score. */
export async function vetPackage(
  name: string,
  ecosystem: Ecosystem,
  options: { cwd?: string } = {},
): Promise<Verdict> {
  const policy = policyVerdict(name, ecosystem, options.cwd);
  if (policy) return policy;

  const facts = await cachedFacts(name, ecosystem, () => fetchFacts(name, ecosystem));
  facts.nameSimilarTo = checkSimilarity(name, ecosystem);
  return scorePackage(facts);
}
