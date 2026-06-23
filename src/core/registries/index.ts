import type { Ecosystem, PackageFacts } from "../types.js";
import { fetchCargoFacts } from "./cargo.js";
import { fetchGoFacts } from "./go.js";
import { fetchNpmFacts } from "./npm.js";
import { fetchPypiFacts } from "./pypi.js";
import { fetchRubyGemsFacts } from "./rubygems.js";

export function fetchFacts(
  name: string,
  ecosystem: Ecosystem,
): Promise<PackageFacts> {
  switch (ecosystem) {
    case "npm":
      return fetchNpmFacts(name);
    case "pypi":
      return fetchPypiFacts(name);
    case "cargo":
      return fetchCargoFacts(name);
    case "rubygems":
      return fetchRubyGemsFacts(name);
    case "go":
      return fetchGoFacts(name);
  }
}
