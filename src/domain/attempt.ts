import { AttemptDataSchema, EditableStructuredDesignSchema, findIncompleteSections, StructuredDesignSchema, SubmissionSnapshotSchema } from "./schemas";
import type {
  Attempt as AttemptContract,
  AttemptData,
  Clock,
  EvidenceReference,
  Id,
  IdGenerator,
  IsoTime,
  SectionId,
  StructuredDesign,
  SubmissionAcknowledgments,
  SubmissionSnapshot,
  SubmissionValidator,
  ValidationResult,
} from "./types";

const SECTION_ORDER: SectionId[] = [
  "assumptions",
  "requirementHandling",
  "classes",
  "relationships",
  "normalScenario",
  "failureScenario",
  "tradeoff",
];

const clone = <T>(value: T): T => structuredClone(value);
const exactSet = (actual: string[], expected: string[]) =>
  actual.length === expected.length && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export class DefaultSubmissionValidator implements SubmissionValidator {
  validate(attempt: AttemptData): ValidationResult {
    const blocking: { reference: EvidenceReference; message: string }[] = [];
    const incomplete = new Set<SectionId>();
    const contentVariantIds = new Set(attempt.content.questions.map(({ variant }) => variant.id));
    const unansweredQuestionIds = attempt.content.questions
      .filter(({ variant }) => attempt.draftAnswers[variant.id] == null)
      .map(({ variant }) => variant.id);

    for (const answerId of Object.keys(attempt.draftAnswers)) {
      if (!contentVariantIds.has(answerId)) {
        blocking.push({ reference: { section: "assumptions", field: "$section" }, message: `Unknown question variant ${answerId}.` });
      }
    }
    for (const { variant } of attempt.content.questions) {
      const selected = attempt.draftAnswers[variant.id];
      if (selected != null && !variant.options.some(({ id }) => id === selected)) {
        blocking.push({ reference: { section: "assumptions", field: "$section" }, message: `Option ${selected} does not belong to ${variant.id}.` });
      }
    }
    if (attempt.mode === "mcq_only") return { blocking, incompleteSections: [], unansweredQuestionIds };
    const design = attempt.draftDesign;
    if (!design) {
      blocking.push({ reference: { section: "classes", field: "$section" }, message: "A comprehensive draft requires a structured design value." });
      return { blocking, incompleteSections: [...SECTION_ORDER], unansweredQuestionIds };
    }
    const parsed = StructuredDesignSchema.safeParse(design);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const section = SECTION_ORDER.find((candidate) => issue.path[0] === candidate) ?? "classes";
        blocking.push({ reference: { section, field: "$section" }, message: issue.message });
      }
    }

    for (const section of findIncompleteSections(design)) incomplete.add(section);

    const requirementIds = new Set(attempt.content.requirements.map(({ id }) => id));
    for (const handling of design.requirementHandling) {
      if (!requirementIds.has(handling.requirementId)) blocking.push({
        reference: { section: "requirementHandling", objectId: handling.requirementId, field: "response" },
        message: `Unknown requirement ${handling.requirementId}.`,
      });
    }
    if (attempt.content.requirements.some(({ id }) => !design.requirementHandling.some(({ requirementId }) => requirementId === id))) incomplete.add("requirementHandling");
    return {
      blocking,
      incompleteSections: SECTION_ORDER.filter((section) => incomplete.has(section)),
      unansweredQuestionIds,
    };
  }
}

export class Attempt implements AttemptContract {
  private data: AttemptData;

  constructor(
    data: AttemptData,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly validator: SubmissionValidator = new DefaultSubmissionValidator(),
  ) {
    this.data = AttemptDataSchema.parse(clone(data));
  }

  toData(): AttemptData {
    return clone(this.data);
  }

  editDesign(design: StructuredDesign): void {
    this.assertDraft();
    if (this.data.mode !== "comprehensive") throw new Error("MCQ-only attempts do not have a structured design.");
    this.data.draftDesign = EditableStructuredDesignSchema.parse(clone(design));
    this.data.updatedAt = this.clock.now();
  }

  answer(variantId: Id, optionId: Id | null): void {
    this.assertDraft();
    const question = this.data.content.questions.find(({ variant }) => variant.id === variantId);
    if (!question) throw new Error(`Unknown question variant ${variantId}.`);
    if (optionId !== null && !question.variant.options.some(({ id }) => id === optionId)) {
      throw new Error(`Option ${optionId} does not belong to ${variantId}.`);
    }
    this.data.draftAnswers[variantId] = optionId;
    this.data.updatedAt = this.clock.now();
  }

  prepareSubmission(ack: SubmissionAcknowledgments): SubmissionSnapshot {
    this.assertDraft();
    const result = this.validator.validate(this.data);
    if (result.blocking.length) throw new Error(`Submission is structurally invalid: ${result.blocking.map(({ message }) => message).join(" ")}`);
    if (!exactSet(ack.incompleteSections, result.incompleteSections) || !exactSet(ack.unansweredQuestionIds, result.unansweredQuestionIds)) {
      throw new Error("Submission acknowledgments do not match the current omissions.");
    }
    const snapshot: SubmissionSnapshot = {
      id: this.ids.next(),
      attemptId: this.data.id,
      submittedAt: this.clock.now(),
      problemId: this.data.content.problemId,
      contentVersion: this.data.content.contentVersion,
      language: this.data.content.language,
      mode: this.data.mode,
      design: this.data.mode === "comprehensive" ? clone(this.data.draftDesign) : null,
      answers: clone(this.data.draftAnswers),
      acknowledgments: clone(ack),
    };
    return deepFreeze(SubmissionSnapshotSchema.parse(snapshot));
  }

  createRevision(newId: Id, now: IsoTime): AttemptData {
    if (this.data.status !== "submitted" || !this.data.snapshot) throw new Error("Only a submitted attempt can be revised.");
    const answers = Object.fromEntries(this.data.content.questions.map(({ variant }) => [variant.id, null]));
    return AttemptDataSchema.parse({
      id: newId,
      parentAttemptId: this.data.id,
      createdAt: now,
      updatedAt: now,
      status: "draft",
      mode: this.data.mode,
      content: clone(this.data.content),
      draftDesign: this.data.mode === "comprehensive" ? clone(this.data.snapshot.design) : null,
      draftAnswers: answers,
      learnerRequirementNotes: clone(this.data.learnerRequirementNotes),
      scratchpad: this.data.scratchpad,
      scratchpadCanvas: clone(this.data.scratchpadCanvas),
      snapshot: null,
      mcq: { status: "pending" },
      design: this.data.mode === "comprehensive" ? { status: "pending" } : { status: "not_required" },
      reviewSession: null,
      runs: [],
    });
  }

  private assertDraft(): void {
    if (this.data.status !== "draft") throw new Error("A submitted attempt is immutable; create a revision to edit it.");
  }
}
