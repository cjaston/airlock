import type { Ecosystem, Verdict } from "./types.js";
import { fetchFacts } from "./registries/index.js";
import { checkSimilarity } from "./similarity.js";
import { scorePackage } from "./score.js";

/** Vet a single package: gather registry facts + name similarity, then score. */
export async function vetPackage(
  name: string,
  ecosystem: Ecosystem,
): Promise<Verdict> {
  const facts = await fetchFacts(name, ecosystem);
  facts.nameSimilarTo = checkSimilarity(name, ecosystem);
  return scorePackage(facts);
}
