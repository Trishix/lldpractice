import type {
  AssessmentBody,
  ClarificationAnswer,
  ClarificationRequest,
  EvidenceReference,
  Requirement,
  StructuredDesign,
} from "./types";

export interface EvidenceSource {
  design: StructuredDesign;
  requirements: Requirement[];
  clarification?: ClarificationRequest;
  clarificationAnswers?: ClarificationAnswer[];
}

export interface ResolvedEvidence {
  reference: EvidenceReference;
  value?: string;
}

export interface EvidenceValidationIssue {
  code:
    | "invalid_section_reference"
    | "object_not_found"
    | "field_not_allowed"
    | "quote_not_allowed"
    | "quote_not_found"
    | "unknown_requirement"
    | "contradiction_requires_quote";
  reference: EvidenceReference;
  message: string;
}

const scalar = (reference: EvidenceReference, value: string): ResolvedEvidence => ({ reference, value });

function resolveClassEvidence(reference: EvidenceReference, design: StructuredDesign): ResolvedEvidence | null {
  for (const item of design.classes) {
    if (item.id === reference.objectId) {
      if (reference.field === "name" || reference.field === "responsibility" || reference.field === "kind") {
        return scalar(reference, item[reference.field]);
      }
      return null;
    }
    for (const field of item.fields) {
      if (field.id === reference.objectId) {
        if (reference.field === "name" || reference.field === "type" || reference.field === "visibility") {
          return scalar(reference, field[reference.field]);
        }
        return null;
      }
    }
    for (const method of item.methods) {
      if (method.id === reference.objectId) {
        if (reference.field === "name" || reference.field === "returnType" || reference.field === "contract") {
          return scalar(reference, method[reference.field]);
        }
        return null;
      }
      for (const parameter of method.parameters) {
        if (parameter.id === reference.objectId) {
          if (reference.field === "name" || reference.field === "type") return scalar(reference, parameter[reference.field]);
          return null;
        }
      }
    }
  }
  return null;
}

export function resolveEvidenceReference(reference: EvidenceReference, source: EvidenceSource): ResolvedEvidence | null {
  if (reference.field === "$section") {
    if (reference.section === "clarification" && !source.clarification) return null;
    if (reference.objectId !== undefined || reference.quote !== undefined) return null;
    return { reference };
  }
  if (!reference.objectId) {
    if (reference.section === "assumptions" && reference.field === "text") return scalar(reference, source.design.assumptions);
    if (reference.section === "tradeoff" && (reference.field === "chosen" || reference.field === "alternative" || reference.field === "justification")) {
      return scalar(reference, source.design.tradeoff[reference.field]);
    }
    if ((reference.section === "normalScenario" || reference.section === "failureScenario") && reference.field === "title") {
      return scalar(reference, source.design[reference.section].title);
    }
    return null;
  }
  if (reference.section === "requirementHandling") {
    if (!source.requirements.some(({ id }) => id === reference.objectId)) return null;
    const handling = source.design.requirementHandling.find((item) => item.requirementId === reference.objectId);
    return handling && reference.field === "response" ? scalar(reference, handling.response) : null;
  }
  if (reference.section === "classes") return resolveClassEvidence(reference, source.design);
  if (reference.section === "relationships") {
    const relationship = source.design.relationships.find((item) => item.id === reference.objectId);
    if (!relationship) return null;
    if (["sourceClassId", "targetClassId", "kind", "multiplicity", "explanation"].includes(reference.field)) {
      return scalar(reference, relationship[reference.field as keyof typeof relationship]);
    }
    return null;
  }
  if (reference.section === "normalScenario" || reference.section === "failureScenario") {
    const step = source.design[reference.section].steps.find((item) => item.id === reference.objectId);
    if (!step) return null;
    if (["action", "expectedOutcome", "classId", "methodId"].includes(reference.field)) {
      return scalar(reference, step[reference.field as keyof typeof step]);
    }
    return null;
  }
  if (reference.section === "clarification") {
    const question = source.clarification?.questions.find((item) => item.id === reference.objectId);
    if (!question || reference.field !== "answer") return null;
    const answer = source.clarificationAnswers?.find((item) => item.questionId === question.id);
    return answer?.status === "answered" ? scalar(reference, answer.answer) : null;
  }
  return null;
}

export function validateEvidenceReference(reference: EvidenceReference, source: EvidenceSource): EvidenceValidationIssue[] {
  if (reference.field === "$section" && (reference.objectId !== undefined || reference.quote !== undefined)) {
    return [{ code: "invalid_section_reference", reference, message: "$section references cannot have an object ID or quote." }];
  }
  const resolved = resolveEvidenceReference(reference, source);
  if (!resolved) {
    return [{
      code: reference.objectId ? "object_not_found" : "field_not_allowed",
      reference,
      message: "The evidence object or field does not exist in the frozen submission.",
    }];
  }
  if (reference.quote !== undefined) {
    if (resolved.value === undefined) {
      return [{ code: "quote_not_allowed", reference, message: "This evidence address has no quotable value." }];
    }
    if (!resolved.value.includes(reference.quote)) {
      return [{ code: "quote_not_found", reference, message: "The quote is not an exact substring of the addressed value." }];
    }
  }
  return [];
}

export function validateAssessmentEvidence(body: AssessmentBody, source: EvidenceSource): EvidenceValidationIssue[] {
  const issues: EvidenceValidationIssue[] = [];
  const validateAll = (references: EvidenceReference[]) => {
    for (const reference of references) issues.push(...validateEvidenceReference(reference, source));
  };
  for (const criterion of body.criteria) validateAll(criterion.evidence);
  for (const strength of body.strengths) validateAll(strength.evidence);
  for (const finding of body.findings) {
    validateAll(finding.evidence);
    for (const requirementId of finding.requirementIds) {
      if (!source.requirements.some((requirement) => requirement.id === requirementId)) {
        issues.push({
          code: "unknown_requirement",
          reference: { section: "requirementHandling", objectId: requirementId, field: "response" },
          message: `Finding references unknown requirement ${requirementId}.`,
        });
      }
    }
    if (finding.kind === "contradiction" && !finding.evidence.some((reference) => reference.quote !== undefined)) {
      issues.push({
        code: "contradiction_requires_quote",
        reference: finding.evidence[0] ?? { section: "assumptions", field: "$section" },
        message: "A contradiction finding must quote concrete submitted behavior.",
      });
    }
  }
  return issues;
}
