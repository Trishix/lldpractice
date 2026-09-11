import { describe, expect, it } from "vitest";

import { Attempt, DefaultSubmissionValidator } from "./attempt";
import { resolveEvidenceReference, validateAssessmentEvidence } from "./evidence";
import {
  AttemptDataSchema,
  BackupSchema,
  DesignReportSchema,
  ProblemPackageSchema,
  PublicProblemSnapshotSchema,
  ReviewInputSchema,
  StructuredDesignSchema,
} from "./schemas";
import { DefaultScorePolicy } from "./score-policy";
import type {
  AssessmentBody,
  AttemptData,
  DesignReport,
  PublicProblemSnapshot,
  ReviewInput,
  StructuredDesign,
} from "./types";

const NOW = "2026-09-11T00:00:00.000Z";
const LATER = "2026-09-12T00:00:00.000Z";
const CLASS_GAME = "00000000-0000-4000-8000-000000000010";
const CLASS_BOARD = "00000000-0000-4000-8000-000000000011";
const FIELD_TURN = "00000000-0000-4000-8000-000000000012";
const METHOD_MOVE = "00000000-0000-4000-8000-000000000013";
const PARAM_CELL = "00000000-0000-4000-8000-000000000014";
const RELATIONSHIP_GAME_BOARD = "00000000-0000-4000-8000-000000000015";
const STEP_NORMAL = "00000000-0000-4000-8000-000000000016";
const STEP_FAILURE = "00000000-0000-4000-8000-000000000017";
const FINDING_TRADEOFF = "00000000-0000-4000-8000-000000000018";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000020";
const SESSION_ID = "00000000-0000-4000-8000-000000000021";
const RUN_ID = "00000000-0000-4000-8000-000000000022";
const QUESTION_ID = "00000000-0000-4000-8000-000000000023";
const FINAL_RUN_ID = "00000000-0000-4000-8000-000000000025";

const configuration = {
  provider: "groq" as const,
  model: "openai/gpt-oss-120b",
  reasoningEffort: "medium" as const,
  evaluatorVersion: "review-groq-v1",
  promptVersion: "design-groq-v1",
  rubricVersion: "rubric-v1",
};

function content(): PublicProblemSnapshot {
  return {
    problemId: "problem:tictactoe",
    contentVersion: "1.0.0",
    title: "Tic-Tac-Toe",
    introduction: "Design a local two-player game.",
    requirements: [
      { id: "req:legal-move", text: "Reject moves to occupied cells." },
      { id: "req:turn", text: "Alternate turns after valid moves." },
    ],
    exclusions: ["Networking"],
    example: "X wins across the first row.",
    faq: [{ question: "Board size?", answer: "Exactly 3 by 3." }],
    scenarioPrompts: { normal: "Play a winning game.", failure: "Try an occupied cell." },
    language: "java",
    questions: Array.from({ length: 10 }, (_, index) => ({
      conceptId: `concept:${index}`,
      conceptTag: `tag-${index}`,
      track: "problem_oop" as const,
      variant: {
        id: `variant:${index}`,
        language: "java" as const,
        snippet: `class Example${index} {}`,
        assumptions: "The board starts empty.",
        prompt: `What happens in case ${index}?`,
        options: [
          { id: `option:${index}:a`, text: "First outcome" },
          { id: `option:${index}:b`, text: "Second outcome" },
        ],
      },
    })),
    attribution: { url: "https://example.com/source", commit: "abc123", adaptations: ["Scoped for practice"] },
  };
}

function design(): StructuredDesign {
  return {
    assumptions: "Two players share one process.",
    requirementHandling: [
      { requirementId: "req:legal-move", response: "Board rejects an occupied cell." },
      { requirementId: "req:turn", response: "Game advances only after a valid move." },
    ],
    classes: [
      {
        id: CLASS_GAME,
        kind: "class",
        name: "Game",
        responsibility: "Coordinates turns.",
        fields: [{ id: FIELD_TURN, name: "turn", type: "Player", visibility: "private" }],
        methods: [{
          id: METHOD_MOVE,
          name: "move",
          parameters: [{ id: PARAM_CELL, name: "cell", type: "Cell" }],
          returnType: "MoveResult",
          contract: "Reject an occupied cell before advancing the turn.",
        }],
      },
      {
        id: CLASS_BOARD,
        kind: "class",
        name: "Board",
        responsibility: "Owns cells.",
        fields: [],
        methods: [],
      },
    ],
    relationships: [{
      id: RELATIONSHIP_GAME_BOARD,
      sourceClassId: CLASS_GAME,
      targetClassId: CLASS_BOARD,
      kind: "composition",
      multiplicity: "1 to 1",
      explanation: "A game owns its board.",
    }],
    normalScenario: {
      title: "Legal move",
      steps: [{
        id: STEP_NORMAL,
        classId: CLASS_GAME,
        methodId: METHOD_MOVE,
        action: "Submit an empty cell.",
        expectedOutcome: "The mark is placed and the turn advances.",
      }],
    },
    failureScenario: {
      title: "Occupied cell",
      steps: [{
        id: STEP_FAILURE,
        classId: CLASS_GAME,
        methodId: METHOD_MOVE,
        action: "Submit an occupied cell.",
        expectedOutcome: "The move is rejected and the turn stays unchanged.",
      }],
    },
    tradeoff: {
      chosen: "Keep rules in Game.",
      alternative: "Use one command class per move.",
      justification: "The fixed rules do not need command history.",
    },
  };
}

function draft(mode: AttemptData["mode"] = "comprehensive"): AttemptData {
  const snapshot = content();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    parentAttemptId: null,
    createdAt: NOW,
    updatedAt: NOW,
    status: "draft",
    mode,
    content: snapshot,
    draftDesign: mode === "comprehensive" ? design() : null,
    draftAnswers: Object.fromEntries(snapshot.questions.map(({ variant }) => [variant.id, null])),
    learnerRequirementNotes: [],
    scratchpad: "Remember the invalid-move case.",
    scratchpadCanvas: [],
    snapshot: null,
    mcq: { status: "pending" },
    design: mode === "comprehensive" ? { status: "pending" } : { status: "not_required" },
    reviewSession: null,
    runs: [],
  };
}

function submitted(): AttemptData {
  const state = draft();
  return {
    ...state,
    status: "submitted",
    draftDesign: null,
    draftAnswers: {},
    snapshot: {
      id: SNAPSHOT_ID,
      attemptId: state.id,
      submittedAt: NOW,
      problemId: state.content.problemId,
      contentVersion: state.content.contentVersion,
      language: state.content.language,
      mode: state.mode,
      design: state.draftDesign,
      answers: state.draftAnswers,
      acknowledgments: {
        incompleteSections: [],
        unansweredQuestionIds: state.content.questions.map(({ variant }) => variant.id),
      },
    },
  };
}

function awaitingClarification(): AttemptData {
  const state = submitted();
  const request = {
    id: QUESTION_ID,
    sessionId: SESSION_ID,
    snapshotId: SNAPSHOT_ID,
    configuration,
    questions: [{
      id: "00000000-0000-4000-8000-000000000024",
      text: "Where is invalid move handling defined?",
      reference: { section: "classes" as const, objectId: METHOD_MOVE, field: "contract", quote: "occupied cell" },
    }],
  };
  return {
    ...state,
    design: { status: "awaiting_clarification", runId: RUN_ID, request },
    reviewSession: { id: SESSION_ID, configuration, credentialMode: "platform", clarification: request },
    runs: [{
      id: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      phase: "initial",
      sessionId: SESSION_ID,
      credentialMode: "platform",
      configuration,
      startedAt: NOW,
      endedAt: LATER,
      outcome: "awaiting_clarification",
    }],
  };
}

function assessment(): AssessmentBody {
  const ids = ["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"] as const;
  return {
    criteria: ids.map((criterionId) => ({
      criterionId,
      rating: 3,
      rationale: "Supported by the submitted method contract.",
      evidence: [{ section: "classes", objectId: METHOD_MOVE, field: "contract", quote: "occupied cell" }],
    })),
    strengths: [{
      text: "The invalid move behavior is explicit.",
      evidence: [{ section: "failureScenario", objectId: STEP_FAILURE, field: "expectedOutcome", quote: "turn stays unchanged" }],
    }],
    findings: [{
      id: FINDING_TRADEOFF,
      criterionId: "tradeoffs",
      requirementIds: [],
      kind: "tradeoff",
      evidence: [{ section: "tradeoff", field: "justification", quote: "fixed rules" }],
      judgment: "The simpler choice fits the scope.",
      consequence: "Adding undo later would require a new abstraction.",
      suggestion: "Revisit commands if undo enters scope.",
    }],
    priorityFindingIds: [FINDING_TRADEOFF],
  };
}

describe("strict boundary schemas", () => {
  it("rejects unknown keys and mismatched selected-language variants", () => {
    expect(PublicProblemSnapshotSchema.safeParse({ ...content(), privateKey: "leak" }).success).toBe(false);
    const wrongLanguage = content();
    wrongLanguage.questions[0]!.variant.language = "python";
    expect(PublicProblemSnapshotSchema.safeParse(wrongLanguage).success).toBe(false);
  });

  it("rejects duplicate design IDs and references to a method on another class", () => {
    const duplicate = design();
    duplicate.classes[1]!.id = CLASS_GAME;
    expect(StructuredDesignSchema.safeParse(duplicate).success).toBe(false);

    const wrongOwner = design();
    wrongOwner.normalScenario.steps[0]!.classId = CLASS_BOARD;
    expect(StructuredDesignSchema.safeParse(wrongOwner).success).toBe(false);
  });

  it("enforces attempt lifecycle and pinned answer references", () => {
    const invalid = draft();
    invalid.snapshot = {
      id: "00000000-0000-4000-8000-000000000002",
      attemptId: invalid.id,
      submittedAt: NOW,
      problemId: invalid.content.problemId,
      contentVersion: invalid.content.contentVersion,
      language: invalid.content.language,
      mode: invalid.mode,
      design: invalid.draftDesign,
      answers: invalid.draftAnswers,
      acknowledgments: { incompleteSections: [], unansweredQuestionIds: [] },
    };
    expect(AttemptDataSchema.safeParse(invalid).success).toBe(false);

    const badAnswer = draft();
    badAnswer.draftAnswers["variant:0"] = "option:9:a";
    expect(AttemptDataSchema.safeParse(badAnswer).success).toBe(false);
  });

  it("persists an unfinished draft selector while submission validation blocks it", () => {
    const unfinished = draft();
    unfinished.draftDesign!.relationships[0]!.targetClassId = "";
    expect(AttemptDataSchema.safeParse(unfinished).success).toBe(true);
    expect(new DefaultSubmissionValidator().validate(unfinished).blocking).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/relationship target|invalid uuid/i) }),
    );
  });

  it("rejects report arithmetic and unsupported evidence", () => {
    const report: DesignReport = {
      assessment: assessment(),
      marks: 40,
      configuration: {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        reasoningEffort: "medium",
        evaluatorVersion: "review-groq-v1",
        promptVersion: "design-groq-v1",
        rubricVersion: "rubric-v1",
      },
      evaluatedAt: NOW,
    };
    expect(DesignReportSchema.safeParse(report).success).toBe(false);
    report.marks = 37.5;
    expect(DesignReportSchema.safeParse(report).success).toBe(true);
    expect(validateAssessmentEvidence(report.assessment, { design: design(), requirements: content().requirements })).toEqual([]);
    report.assessment.criteria[0]!.evidence[0]!.quote = "invented quotation";
    expect(validateAssessmentEvidence(report.assessment, { design: design(), requirements: content().requirements })).toContainEqual(
      expect.objectContaining({ code: "quote_not_found" }),
    );
  });

  it("validates private package keys against all language variants", () => {
    const java = content();
    const makeLanguage = (language: "java" | "python" | "cpp") => ({
      ...structuredClone(java),
      language,
      questions: java.questions.map((entry) => ({
        ...structuredClone(entry),
        variant: { ...structuredClone(entry.variant), id: `${entry.variant.id}:${language}`, language },
      })),
    });
    const publicByLanguage = { java: makeLanguage("java"), python: makeLanguage("python"), cpp: makeLanguage("cpp") };
    const concepts = java.questions.map((entry, index) => ({
      id: entry.conceptId,
      track: entry.track,
      category: (["trace", "defect", "responsibility", "contract", "change"] as const)[index % 5]!,
      conceptTag: entry.conceptTag,
      marks: 5 as const,
      variants: {
        java: publicByLanguage.java.questions[index]!.variant,
        python: publicByLanguage.python.questions[index]!.variant,
        cpp: publicByLanguage.cpp.questions[index]!.variant,
      },
    }));
    const allVariants = concepts.flatMap((concept) => Object.values(concept.variants));
    const keysByVariantId = Object.fromEntries(allVariants.map((variant) => [variant.id, {
      correctOptionId: variant.options[0]!.id,
      rationaleByOptionId: Object.fromEntries(variant.options.map((option) => [option.id, `Rationale for ${option.id}`])),
    }]));
    const anchors = { 0: "Absent", 1: "Major gaps", 2: "Partial", 3: "Coherent", 4: "Well supported" };
    const valid = {
      problemId: java.problemId,
      contentVersion: java.contentVersion,
      publicByLanguage,
      concepts,
      keysByVariantId,
      rubricVersion: "rubric-v1",
      rubric: (["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"] as const).map((id) => ({ id, description: id, anchors })),
      referenceDesign: "One valid design.",
    };
    const packageResult = ProblemPackageSchema.safeParse(valid);
    expect(packageResult.success, packageResult.error?.message).toBe(true);
    delete valid.keysByVariantId[allVariants[0]!.id];
    expect(ProblemPackageSchema.safeParse(valid).success).toBe(false);
  });

  it("rejects dangling and cyclic backup lineage", () => {
    const child = draft();
    child.parentAttemptId = "00000000-0000-4000-8000-000000000099";
    expect(BackupSchema.safeParse({ format: "lldpractice-backup", schemaVersion: 1, exportedAt: NOW, data: { attempts: [child] } }).success).toBe(false);

    const first = draft();
    const second = draft();
    second.id = "00000000-0000-4000-8000-000000000002";
    first.parentAttemptId = second.id;
    second.parentAttemptId = first.id;
    expect(BackupSchema.safeParse({ format: "lldpractice-backup", schemaVersion: 1, exportedAt: NOW, data: { attempts: [first, second] } }).success).toBe(false);
  });

  it("rejects clarification questions with missing objects or wrong object fields", () => {
    const missing = awaitingClarification();
    const missingClarification = missing.reviewSession!.clarification!;
    missingClarification.questions[0]!.reference.objectId = "00000000-0000-4000-8000-000000000099";
    if (missing.design.status !== "awaiting_clarification") throw new Error("fixture must await clarification");
    missing.design.request = missingClarification;
    expect(AttemptDataSchema.safeParse(missing).success).toBe(false);

    const wrongField = awaitingClarification();
    const wrongFieldClarification = wrongField.reviewSession!.clarification!;
    wrongFieldClarification.questions[0]!.reference.field = "responsibility";
    if (wrongField.design.status !== "awaiting_clarification") throw new Error("fixture must await clarification");
    wrongField.design.request = wrongFieldClarification;
    expect(AttemptDataSchema.safeParse(wrongField).success).toBe(false);
  });

  it("validates final-review clarification evidence against the unchanged design", () => {
    const attempt = awaitingClarification();
    const request = attempt.reviewSession!.clarification!;
    const input: ReviewInput = {
      problemId: attempt.content.problemId,
      contentVersion: attempt.content.contentVersion,
      snapshotId: SNAPSHOT_ID,
      design: attempt.snapshot!.design!,
      acknowledgedIncompleteSections: [],
      phase: "final" as const,
      sessionId: SESSION_ID,
      configuration,
      clarification: request,
      answers: [{ questionId: request.questions[0]!.id, status: "skipped" as const }],
    };
    expect(ReviewInputSchema.safeParse(input).success).toBe(true);
    request.questions[0]!.reference.field = "responsibility";
    expect(ReviewInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects stale omission acknowledgments at the design-review boundary", () => {
    const incomplete = design();
    incomplete.relationships = [];
    const input: ReviewInput = {
      problemId: content().problemId,
      contentVersion: content().contentVersion,
      snapshotId: SNAPSHOT_ID,
      design: incomplete,
      acknowledgedIncompleteSections: [],
      phase: "initial" as const,
      sessionId: SESSION_ID,
      configuration,
    };
    expect(ReviewInputSchema.safeParse(input).success).toBe(false);
    input.acknowledgedIncompleteSections = ["relationships"];
    expect(ReviewInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects unowned active runs and incoherent design sessions", () => {
    const orphanMcq = submitted();
    orphanMcq.runs = [{ id: RUN_ID, snapshotId: SNAPSHOT_ID, phase: "mcq", startedAt: NOW, outcome: "running" }];
    expect(AttemptDataSchema.safeParse(orphanMcq).success).toBe(false);

    const missingSession = submitted();
    missingSession.design = { status: "running", runId: RUN_ID };
    missingSession.runs = [{ id: RUN_ID, snapshotId: SNAPSHOT_ID, phase: "initial", sessionId: SESSION_ID, credentialMode: "platform", configuration, startedAt: NOW, outcome: "running" }];
    expect(AttemptDataSchema.safeParse(missingSession).success).toBe(false);

    const mismatchedConfiguration = awaitingClarification();
    mismatchedConfiguration.runs[0]!.configuration = { ...configuration, model: "openai/gpt-oss-20b" };
    expect(AttemptDataSchema.safeParse(mismatchedConfiguration).success).toBe(false);

    const finalWithoutAnswers = awaitingClarification();
    finalWithoutAnswers.design = { status: "running", runId: RUN_ID };
    finalWithoutAnswers.runs[0] = { ...finalWithoutAnswers.runs[0]!, phase: "final", outcome: "running", endedAt: undefined };
    expect(AttemptDataSchema.safeParse(finalWithoutAnswers).success).toBe(false);

    const validFinal = awaitingClarification();
    validFinal.design = { status: "running", runId: FINAL_RUN_ID };
    validFinal.reviewSession!.frozenAnswers = [{ questionId: validFinal.reviewSession!.clarification!.questions[0]!.id, status: "skipped" }];
    validFinal.runs.push({
      id: FINAL_RUN_ID,
      snapshotId: SNAPSHOT_ID,
      phase: "final",
      sessionId: SESSION_ID,
      credentialMode: "platform",
      configuration,
      startedAt: LATER,
      outcome: "running",
    });
    expect(AttemptDataSchema.safeParse(validFinal).success).toBe(true);

    validFinal.runs[1] = { ...validFinal.runs[1]!, outcome: "succeeded", endedAt: LATER };
    validFinal.design = {
      status: "succeeded",
      runId: FINAL_RUN_ID,
      report: { assessment: assessment(), marks: 37.5, configuration, evaluatedAt: LATER },
    };
    expect(AttemptDataSchema.safeParse(validFinal).success).toBe(true);

    const quick = draft("mcq_only");
    quick.reviewSession = { id: SESSION_ID, configuration, credentialMode: "platform" };
    expect(AttemptDataSchema.safeParse(quick).success).toBe(false);
  });

  it("accepts historical design runs from an earlier restarted session", () => {
    const state = awaitingClarification();
    const currentRun = state.runs[0]!;
    currentRun.outcome = "failed";
    currentRun.error = { code: "FAILED", message: "Provider unavailable.", retryable: true };
    const oldConfiguration = { ...configuration, model: "openai/gpt-oss-20b" };
    currentRun.configuration = oldConfiguration;
    currentRun.sessionId = "00000000-0000-4000-8000-000000000030";
    state.reviewSession = { id: SESSION_ID, configuration, credentialMode: "platform" };
    state.design = { status: "running", runId: "00000000-0000-4000-8000-000000000031" };
    state.runs.push({
      id: "00000000-0000-4000-8000-000000000031",
      snapshotId: SNAPSHOT_ID,
      phase: "initial",
      sessionId: SESSION_ID,
      credentialMode: "platform",
      configuration,
      startedAt: LATER,
      outcome: "running",
    });
    expect(AttemptDataSchema.safeParse(state).success).toBe(true);
  });
});

describe("stable evidence", () => {
  it("continues resolving after a class rename because references use IDs", () => {
    const submitted = design();
    submitted.classes[0]!.name = "MatchCoordinator";
    expect(resolveEvidenceReference(
      { section: "classes", objectId: METHOD_MOVE, field: "contract", quote: "occupied cell" },
      { design: submitted, requirements: content().requirements },
    )).toEqual(expect.objectContaining({ value: "Reject an occupied cell before advancing the turn." }));
  });

  it("requires concrete contradiction findings to quote submitted behavior", () => {
    const body = assessment();
    body.findings[0] = { ...body.findings[0]!, kind: "contradiction", evidence: [{ section: "tradeoff", field: "justification" }] };
    expect(validateAssessmentEvidence(body, { design: design(), requirements: content().requirements })).toContainEqual(
      expect.objectContaining({ code: "contradiction_requires_quote" }),
    );
  });
});

describe("submission and revision behavior", () => {
  const clock = { now: () => LATER };
  let nextId = 2;
  const ids = { next: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}` };

  it("reports completeness separately from structural blockers", () => {
    const incomplete = draft();
    incomplete.draftDesign!.relationships = [];
    incomplete.draftDesign!.tradeoff.justification = "   ";
    incomplete.draftAnswers["variant:3"] = null;
    const result = new DefaultSubmissionValidator().validate(incomplete);
    expect(result.blocking).toEqual([]);
    expect(result.incompleteSections).toEqual(["relationships", "tradeoff"]);
    expect(result.unansweredQuestionIds).toEqual(["variant:0", "variant:1", "variant:2", "variant:3", "variant:4", "variant:5", "variant:6", "variant:7", "variant:8", "variant:9"]);
  });

  it("flags requirement handling when one trusted requirement is omitted", () => {
    const incomplete = draft();
    incomplete.draftDesign!.requirementHandling.pop();
    expect(new DefaultSubmissionValidator().validate(incomplete).incompleteSections).toContain("requirementHandling");
    const snapshot = new Attempt(incomplete, clock, ids).prepareSubmission({
      incompleteSections: ["requirementHandling"],
      unansweredQuestionIds: incomplete.content.questions.map(({ variant }) => variant.id),
    });
    expect(AttemptDataSchema.safeParse({
      ...incomplete,
      status: "submitted",
      draftDesign: null,
      draftAnswers: {},
      snapshot,
    }).success).toBe(true);
  });

  it("requires acknowledgments to exactly match current omissions", () => {
    const attempt = new Attempt(draft(), clock, ids);
    expect(() => attempt.prepareSubmission({ incompleteSections: [], unansweredQuestionIds: [] })).toThrow(/acknowledgments/i);
  });

  it("creates an immutable snapshot candidate without submitting the draft", () => {
    const state = draft();
    const attempt = new Attempt(state, clock, ids);
    const unansweredQuestionIds = state.content.questions.map(({ variant }) => variant.id);
    const snapshot = attempt.prepareSubmission({ incompleteSections: [], unansweredQuestionIds });
    expect(snapshot.submittedAt).toBe(LATER);
    expect(attempt.toData().status).toBe("draft");
    state.draftDesign!.classes[0]!.name = "Changed outside";
    expect(snapshot.design!.classes[0]!.name).toBe("Game");
    expect(() => { snapshot.design!.classes[0]!.name = "Changed snapshot"; }).toThrow();
  });

  it("rejects editing submitted work and preserves its snapshot", () => {
    const state = draft();
    const candidate = new Attempt(state, clock, ids).prepareSubmission({
      incompleteSections: [],
      unansweredQuestionIds: state.content.questions.map(({ variant }) => variant.id),
    });
    const submitted: AttemptData = {
      ...state,
      status: "submitted",
      updatedAt: LATER,
      draftDesign: null,
      draftAnswers: {},
      snapshot: structuredClone(candidate),
    };
    const attempt = new Attempt(submitted, clock, ids);
    expect(() => attempt.editDesign(design())).toThrow(/submitted/i);
    expect(() => attempt.answer("variant:0", "option:0:a")).toThrow(/submitted/i);
    expect(attempt.toData().snapshot).toEqual(candidate);
  });

  it("creates a clean draft revision while preserving pinned content and copied design IDs", () => {
    const state = draft();
    const candidate = new Attempt(state, clock, ids).prepareSubmission({
      incompleteSections: [],
      unansweredQuestionIds: state.content.questions.map(({ variant }) => variant.id),
    });
    const submitted: AttemptData = { ...state, status: "submitted", draftDesign: null, draftAnswers: {}, snapshot: candidate };
    const revision = new Attempt(submitted, clock, ids).createRevision("00000000-0000-4000-8000-000000000099", LATER);
    expect(revision).toEqual(expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000099",
      parentAttemptId: submitted.id,
      status: "draft",
      content: submitted.content,
      snapshot: null,
      mcq: { status: "pending" },
      design: { status: "pending" },
      runs: [],
      reviewSession: null,
    }));
    expect(revision.draftDesign!.classes[0]!.id).toBe(CLASS_GAME);
    expect(Object.values(revision.draftAnswers).every((answer) => answer === null)).toBe(true);
    revision.draftDesign!.classes[0]!.name = "Revision name";
    expect(submitted.snapshot!.design!.classes[0]!.name).toBe("Game");
  });
});

describe("score policy", () => {
  const policy = new DefaultScorePolicy();

  it.each([
    [0, { marks: 0, percentage: 0 }],
    [7, { marks: 35, percentage: 35 }],
    [20, { marks: 100, percentage: 100 }],
  ])("scores %i correct answers", (correct, expected) => {
    expect(policy.mcq(correct)).toEqual(expected);
  });

  it("scores five rubric ratings and combines only successful components", () => {
    expect(policy.design([3, 3, 2, 4, 2])).toBe(35);
    const mcq = { status: "succeeded", runId: "run:mcq", result: { marks: 35 } } as AttemptData["mcq"];
    const report = { marks: 35 } as DesignReport;
    expect(policy.overall(mcq, { status: "succeeded", runId: "run:design", report })).toBe(70);
    expect(policy.overall(mcq, { status: "failed", error: { code: "DOWN", message: "Unavailable", retryable: true } })).toBeNull();
  });

  it("rejects invalid counts and rating sets instead of clamping", () => {
    expect(() => policy.mcq(21)).toThrow();
    expect(() => policy.mcq(2.5)).toThrow();
    expect(() => policy.design([3, 3, 2, 4])).toThrow();
    expect(() => policy.design([3, 3, 2, 4, 5 as never])).toThrow();
  });
});

it("normalizes legacy attempts with empty learner notes and canvas state", () => {
  const legacy = structuredClone(draft()) as unknown as Record<string, unknown>;
  delete legacy.learnerRequirementNotes;
  delete legacy.scratchpadCanvas;
  const parsed = AttemptDataSchema.parse(legacy);
  expect(parsed.learnerRequirementNotes).toEqual([]);
  expect(parsed.scratchpadCanvas).toEqual([]);
});

it("bounds learner requirement notes and private canvas items", () => {
  const tooManyNotes = draft();
  tooManyNotes.learnerRequirementNotes = Array.from({ length: 51 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, text: "Note" }));
  expect(AttemptDataSchema.safeParse(tooManyNotes).success).toBe(false);

  const invalidCanvas = draft();
  invalidCanvas.scratchpadCanvas = [{ id: "00000000-0000-4000-8000-000000000099", kind: "sticky", x: 0, y: 0, width: 0, height: 100, text: "Idea", color: "yellow" }];
  expect(AttemptDataSchema.safeParse(invalidCanvas).success).toBe(false);
});


it("rejects clarification section evidence when no clarification was asked", () => {
  expect(resolveEvidenceReference({ section: "clarification", field: "$section" }, { design: design(), requirements: content().requirements })).toBeNull();
});
