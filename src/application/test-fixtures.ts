import type { AttemptData, DesignReport, McqResult, PublicConfig, StructuredDesign } from "../domain/types";

export const NOW = "2026-09-11T00:00:00.000Z";

export const IDS = {
  attempt: "00000000-0000-4000-8000-000000000001",
  class: "00000000-0000-4000-8000-000000000010",
  method: "00000000-0000-4000-8000-000000000011",
  stepNormal: "00000000-0000-4000-8000-000000000012",
  stepFailure: "00000000-0000-4000-8000-000000000013",
};

export const configuration = {
  provider: "groq" as const,
  model: "openai/gpt-oss-120b",
  reasoningEffort: "medium" as const,
  evaluatorVersion: "design-groq-v1",
  promptVersion: "review-groq-v1",
  rubricVersion: "rubric-v1",
};

export const publicConfig: PublicConfig = {
  provider: "groq",
  model: configuration.model,
  reasoningEffort: "medium",
  platformAvailable: true,
  evaluatorVersion: configuration.evaluatorVersion,
  promptVersion: configuration.promptVersion,
  content: [{ problemId: "problem:test", contentVersion: "1.0.0", rubricVersion: configuration.rubricVersion }],
  limits: { reviewTimeoutMs: 60_000, maxBodyBytes: 262_144, maxDesignBytes: 65_536 },
};

export function design(): StructuredDesign {
  return {
    assumptions: "One local session.",
    requirementHandling: [{ requirementId: "requirement:one", response: "The game validates the move." }],
    classes: [{ id: IDS.class, kind: "class", name: "Game", responsibility: "Owns the rules.", fields: [], methods: [{ id: IDS.method, name: "move", parameters: [], returnType: "Result", contract: "Validate before changing state." }] }],
    relationships: [],
    normalScenario: { title: "Valid", steps: [{ id: IDS.stepNormal, classId: IDS.class, methodId: IDS.method, action: "Move", expectedOutcome: "State changes." }] },
    failureScenario: { title: "Invalid", steps: [{ id: IDS.stepFailure, classId: IDS.class, methodId: IDS.method, action: "Invalid move", expectedOutcome: "State stays unchanged." }] },
    tradeoff: { chosen: "One service", alternative: "Commands", justification: "The scope is small." },
  };
}

export function draft(mode: AttemptData["mode"] = "comprehensive"): AttemptData {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    conceptId: `concept:${index}`,
    conceptTag: `tag-${index}`,
    track: "problem_oop" as const,
    variant: { id: `variant:${index}`, language: "java" as const, snippet: `class C${index} {}`, assumptions: "None.", prompt: "Choose.", options: [{ id: `option:${index}:a`, text: "A" }, { id: `option:${index}:b`, text: "B" }] },
  }));
  return {
    id: IDS.attempt, parentAttemptId: null, createdAt: NOW, updatedAt: NOW, status: "draft", mode,
    content: { problemId: "problem:test", contentVersion: "1.0.0", title: "Problem", introduction: "Intro", requirements: [{ id: "requirement:one", text: "Validate a move." }], exclusions: [], example: "Example", faq: [], scenarioPrompts: { normal: "Normal", failure: "Failure" }, language: "java", questions, attribution: { url: "https://example.com", commit: "abc", adaptations: [] } },
    draftDesign: mode === "comprehensive" ? design() : null,
    draftAnswers: Object.fromEntries(questions.map(({ variant }) => [variant.id, null])), learnerRequirementNotes: [], scratchpad: "notes", scratchpadCanvas: [], snapshot: null,
    mcq: { status: "pending" }, design: mode === "comprehensive" ? { status: "pending" } : { status: "not_required" }, reviewSession: null, runs: [],
  };
}

export function mcqResult(): McqResult {
  return {
    evaluatorVersion: "mcq-v1", correctCount: 0, marks: 0, percentage: 0,
    questions: Array.from({ length: 10 }, (_, index) => ({ variantId: `variant:${index}`, track: "problem_oop" as const, selectedOptionId: null, correctOptionId: `option:${index}:a`, awardedMarks: 0 as const, rationaleByOptionId: { [`option:${index}:a`]: "A", [`option:${index}:b`]: "B" } })),
    referenceDesign: "Reference",
  };
}

export function report(): DesignReport {
  const criteria = ["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"] as const;
  return {
    assessment: { criteria: criteria.map((criterionId) => ({ criterionId, rating: 3 as const, rationale: "Supported.", evidence: [{ section: "classes" as const, objectId: IDS.method, field: "contract", quote: "Validate" }] })), strengths: [], findings: [], priorityFindingIds: [] },
    marks: 37.5, configuration, evaluatedAt: NOW,
  };
}
