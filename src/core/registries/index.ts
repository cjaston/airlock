import type { Ecosystem, PackageFacts } from "../types.js";
import { fetchNpmFacts } from "./npm.js";
import { fetchPypiFacts } from "./pypi.js";

export function fetchFacts(
  name: string,
  ecosystem: Ecosystem,
): Promise<PackageFacts> {
  return ecosystem === "npm" ? fetchNpmFacts(name) : fetchPypiFacts(name);
}
