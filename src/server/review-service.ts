import "server-only";
import { findIncompleteSections } from "../domain/schemas";
import { validateEvidenceReference } from "../domain/evidence";
import type { DesignReviewRequest } from "../domain/types";
import { getProblemPackage } from "./content";
import { pinnedConfiguration } from "./configuration";
import { credentials } from "./credentials";
import { GroqDesignEvaluator } from "./design-evaluator";
import { reviewAdmission, SafeError } from "./http";
export async function review(request: DesignReviewRequest, key: string | null, signal: AbortSignal) {
  const input = request.input;
  const pkg = getProblemPackage(input.problemId, input.contentVersion);
  if (!pkg) throw new SafeError("CONTENT_VERSION_UNAVAILABLE", "Saved content version is unavailable.", 410);
  pinnedConfiguration(pkg, input.configuration);
  const requirements = pkg.publicByLanguage.java.requirements;
  if (input.design.requirementHandling.some(({ requirementId }) => !requirements.some(({ id }) => id === requirementId))) throw new SafeError("INVALID_REQUEST", "The design references an unknown requirement.");
  const incomplete = new Set(findIncompleteSections(input.design));
  if (requirements.some(({ id }) => !input.design.requirementHandling.some(({ requirementId }) => requirementId === id))) incomplete.add("requirementHandling");
  if (incomplete.size !== input.acknowledgedIncompleteSections.length || input.acknowledgedIncompleteSections.some((section) => !incomplete.has(section))) throw new SafeError("INVALID_REQUEST", "Omission acknowledgments do not match the trusted problem requirements.");
  if (input.clarification?.questions.some(({ reference }) => validateEvidenceReference(reference, { design: input.design, requirements }).length)) throw new SafeError("INVALID_REQUEST", "Clarification references are invalid.");
  const release = reviewAdmission.admit(`${request.attemptId}:${request.snapshotId}:${input.sessionId}`);
  try {
    const credential = credentials.select(request.credentialMode, input.phase, key);
    return await new GroqDesignEvaluator(pkg, credential).evaluate(input, signal);
  } finally { release(); }
}
