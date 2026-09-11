import "server-only";
import { z } from "zod";
// Every wire property is required; optional domain address parts are nullable here.
const evidence = z.strictObject({ section: z.enum(["assumptions", "requirementHandling", "classes", "relationships", "normalScenario", "failureScenario", "tradeoff", "clarification"]), objectId: z.string().nullable(), field: z.string(), quote: z.string().nullable() });
const criterion = z.enum(["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"]);
export const WireSchema = z.strictObject({
  kind: z.enum(["report", "clarification"]),
  assessment: z.strictObject({
    criteria: z.array(z.strictObject({ criterionId: criterion, rating: z.number().int().min(0).max(4), rationale: z.string(), evidence: z.array(evidence) })),
    strengths: z.array(z.strictObject({ text: z.string(), evidence: z.array(evidence) })),
    findings: z.array(z.strictObject({ id: z.string(), criterionId: criterion, requirementIds: z.array(z.string()), kind: z.enum(["contradiction", "not_demonstrated", "tradeoff"]), evidence: z.array(evidence), judgment: z.string(), consequence: z.string(), suggestion: z.string() })),
    priorityFindingIds: z.array(z.string()),
  }).nullable(),
  questions: z.array(z.strictObject({ text: z.string(), reference: evidence })),
});
export const wireJsonSchema = z.toJSONSchema(WireSchema);
export function normalizeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeEvidence);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key, item]) => !(item === null && (key === "objectId" || key === "quote"))).map(([key, item]) => [key, normalizeEvidence(item)]));
  return value;
}
