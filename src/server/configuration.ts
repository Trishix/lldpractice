import "server-only";
import type { ProblemPackage, ReviewConfiguration } from "../domain/types";
import { getProblemPackage, listPublicProblems } from "./content";
import { SafeError } from "./http";
export const REVIEW_BASE = Object.freeze({ provider: "groq" as const, model: "openai/gpt-oss-120b", reasoningEffort: "medium" as const, evaluatorVersion: "design-v2", promptVersion: "review-v2" });
export function configurationFor(pkg: ProblemPackage): ReviewConfiguration { return { ...REVIEW_BASE, rubricVersion: pkg.rubricVersion }; }
export function pinnedConfiguration(pkg: ProblemPackage, configuration: ReviewConfiguration) {
  const expected = configurationFor(pkg);
  if (Object.keys(expected).some((key) => expected[key as keyof ReviewConfiguration] !== configuration[key as keyof ReviewConfiguration])) throw new SafeError("CONFIGURATION_UNAVAILABLE", "The saved review configuration is unavailable. Start a new review session.", 409);
}
export function supportedContent() {
  return ["1.0.0", "2.0.0", "3.0.0"].flatMap((contentVersion) => listPublicProblems().map(({ problemId }) => {
    const pkg = getProblemPackage(problemId, contentVersion)!;
    return { problemId, contentVersion, rubricVersion: pkg.rubricVersion };
  }));
}
