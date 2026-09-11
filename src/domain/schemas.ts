import { z } from "zod";

import { validateAssessmentEvidence, validateEvidenceReference } from "./evidence";
import type { AttemptData, Backup, DesignReport, ProblemPackage, PublicProblemSnapshot, SectionId, StructuredDesign } from "./types";

export const INPUT_BOUNDS = Object.freeze({
  jsonBodyBytes: 256 * 1024,
  structuredDesignBytes: 64 * 1024,
  classes: 30,
  fieldsPerClass: 20,
  methodsPerClass: 20,
  parametersPerMethod: 10,
  relationships: 60,
  walkthroughSteps: 30,
  labelCharacters: 120,
  proseCharacters: 2_000,
  longProseCharacters: 4_000,
  scratchpadCharacters: 16_000,
  learnerRequirementNotes: 50,
  scratchpadCanvasItems: 200,
  scratchpadCanvasTextCharacters: 2_000,
  clarificationQuestions: 2,
  clarificationQuestionCharacters: 1_000,
  clarificationAnswerCharacters: 2_000,
  providerJsonBytes: 128 * 1024,
  findings: 10,
  strengths: 5,
  priorities: 3,
  evidencePerItem: 5,
  quoteCharacters: 500,
  backupBytes: 10 * 1024 * 1024,
});

const label = z.string().min(1).max(INPUT_BOUNDS.labelCharacters);
const editableLabel = z.string().max(INPUT_BOUNDS.labelCharacters);
const prose = z.string().max(INPUT_BOUNDS.proseCharacters);
const authoredProse = prose.min(1);
const longProse = z.string().max(INPUT_BOUNDS.longProseCharacters);
const isoTime = z.iso.datetime();
const uuid = z.uuid();
const LanguageSchema = z.enum(["java", "python", "cpp"]);
const PracticeModeSchema = z.enum(["mcq_only", "comprehensive"]);
export const QuestionTrackSchema = z.enum(["system_design", "problem_oop"]);
const CredentialModeSchema = z.enum(["platform", "user"]);
const CriterionIdSchema = z.enum(["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"]);
const SectionIdSchema = z.enum(["assumptions", "requirementHandling", "classes", "relationships", "normalScenario", "failureScenario", "tradeoff"]);
const RatingSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const idRecord = <T extends z.ZodType>(value: T) => z.record(z.string().min(1).max(INPUT_BOUNDS.labelCharacters), value);

const unique = <T>(values: T[]) => new Set(values).size === values.length;
const sameMembers = (actual: string[], expected: string[]) =>
  actual.length === expected.length && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
const addIssue = (ctx: z.RefinementCtx, path: PropertyKey[], message: string) =>
  ctx.addIssue({ code: "custom", path, message });
const sameConfiguration = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function validateClarificationEvidence(
  ctx: z.RefinementCtx,
  clarification: z.infer<typeof ClarificationRequestSchema>,
  design: StructuredDesign,
  requirements: { id: string; text: string }[],
  path: PropertyKey[],
) {
  clarification.questions.forEach((question, index) => {
    const issues = validateEvidenceReference(question.reference, { design, requirements });
    for (const issue of issues) addIssue(ctx, [...path, "questions", index, "reference"], issue.message);
  });
}

export const RequirementSchema = z.strictObject({ id: label, text: authoredProse });
export const OptionSchema = z.strictObject({ id: label, text: authoredProse });
export const QuestionVariantSchema = z.strictObject({
  id: label,
  language: LanguageSchema,
  snippet: authoredProse,
  assumptions: authoredProse,
  prompt: authoredProse,
  options: z.array(OptionSchema).min(2).refine((options) => unique(options.map(({ id }) => id)), "Option IDs must be unique."),
});
export const ConceptQuestionSchema = z.strictObject({
  id: label,
  track: QuestionTrackSchema.default("problem_oop"),
  category: z.enum(["trace", "defect", "responsibility", "contract", "change"]),
  conceptTag: label,
  marks: z.literal(5),
  variants: z.record(LanguageSchema, QuestionVariantSchema),
}).superRefine((concept, ctx) => {
  for (const language of LanguageSchema.options) {
    if (concept.variants[language].language !== language) addIssue(ctx, ["variants", language, "language"], "Variant language must match its record key.");
  }
  if (!unique(Object.values(concept.variants).map(({ id }) => id))) addIssue(ctx, ["variants"], "Variant IDs must be unique.");
});

export const PublicProblemSnapshotSchema: z.ZodType<PublicProblemSnapshot> = z.strictObject({
  problemId: label,
  contentVersion: label,
  title: authoredProse,
  introduction: authoredProse,
  requirements: z.array(RequirementSchema).min(1).refine((requirements) => unique(requirements.map(({ id }) => id)), "Requirement IDs must be unique."),
  exclusions: z.array(authoredProse),
  example: authoredProse,
  faq: z.array(z.strictObject({ question: authoredProse, answer: authoredProse })),
  scenarioPrompts: z.strictObject({ normal: authoredProse, failure: authoredProse }),
  language: LanguageSchema,
  questions: z.array(z.strictObject({ conceptId: label, conceptTag: label, track: QuestionTrackSchema.default("problem_oop"), variant: QuestionVariantSchema })).refine((questions) => questions.length === 10 || questions.length === 20, "A problem snapshot must contain 10 legacy or 20 current questions."),
  attribution: z.strictObject({ url: z.url(), commit: label, adaptations: z.array(authoredProse) }),
}).superRefine((snapshot, ctx) => {
  if (snapshot.questions.length === 20 && (snapshot.questions.filter(({ track }) => track === "system_design").length !== 10 || snapshot.questions.filter(({ track }) => track === "problem_oop").length !== 10)) {
    addIssue(ctx, ["questions"], "Current snapshots must contain exactly ten questions in each track.");
  }
  if (!unique(snapshot.questions.map(({ conceptId }) => conceptId))) addIssue(ctx, ["questions"], "Concept IDs must be unique.");
  if (!unique(snapshot.questions.map(({ variant }) => variant.id))) addIssue(ctx, ["questions"], "Variant IDs must be unique.");
  snapshot.questions.forEach(({ variant }, index) => {
    if (variant.language !== snapshot.language) addIssue(ctx, ["questions", index, "variant", "language"], "Every variant must use the snapshot language.");
  });
});

export const RubricCriterionSchema = z.strictObject({
  id: CriterionIdSchema,
  description: authoredProse,
  anchors: z.strictObject({
    0: authoredProse,
    1: authoredProse,
    2: authoredProse,
    3: authoredProse,
    4: authoredProse,
  }),
});

export const ProblemPackageSchema: z.ZodType<ProblemPackage> = z.strictObject({
  problemId: label,
  contentVersion: label,
  publicByLanguage: z.record(LanguageSchema, PublicProblemSnapshotSchema),
  concepts: z.array(ConceptQuestionSchema).refine((concepts) => concepts.length === 10 || concepts.length === 20, "A package must contain 10 legacy or 20 current concepts."),
  keysByVariantId: idRecord(z.strictObject({ correctOptionId: label, rationaleByOptionId: idRecord(authoredProse) })),
  rubricVersion: label,
  rubric: z.array(RubricCriterionSchema).length(5),
  referenceDesign: authoredProse,
}).superRefine((pkg, ctx) => {
  const allVariants = pkg.concepts.flatMap((concept) => LanguageSchema.options.map((language) => concept.variants[language]));
  if (!unique(pkg.concepts.map(({ id }) => id))) addIssue(ctx, ["concepts"], "Concept IDs must be unique.");
  const isCurrent = pkg.concepts.length === 20;
  if (isCurrent && (pkg.concepts.filter(({ track }) => track === "system_design").length !== 10 || pkg.concepts.filter(({ track }) => track === "problem_oop").length !== 10)) {
    addIssue(ctx, ["concepts"], "Current packages must contain exactly ten questions in each track.");
  }
  for (const category of ["trace", "defect", "responsibility", "contract", "change"] as const) {
    const expected = isCurrent ? 4 : 2;
    if (pkg.concepts.filter((concept) => concept.category === category).length !== expected) addIssue(ctx, ["concepts"], `Package must contain exactly ${expected} ${category} concepts.`);
  }
  if (!unique(allVariants.map(({ id }) => id))) addIssue(ctx, ["concepts"], "Variant IDs must be unique across the package.");
  if (!sameMembers(Object.keys(pkg.keysByVariantId), allVariants.map(({ id }) => id))) addIssue(ctx, ["keysByVariantId"], "Answer keys must exactly match the package variants.");
  for (const variant of allVariants) {
    const key = pkg.keysByVariantId[variant.id];
    const optionIds = variant.options.map(({ id }) => id);
    if (!key) continue;
    if (!optionIds.includes(key.correctOptionId)) addIssue(ctx, ["keysByVariantId", variant.id, "correctOptionId"], "Correct option must belong to its variant.");
    if (!sameMembers(Object.keys(key.rationaleByOptionId), optionIds)) addIssue(ctx, ["keysByVariantId", variant.id, "rationaleByOptionId"], "Rationales must exactly match the variant options.");
  }
  const criterionIds = CriterionIdSchema.options;
  if (!sameMembers(pkg.rubric.map(({ id }) => id), criterionIds)) addIssue(ctx, ["rubric"], "Rubric must contain every criterion exactly once.");
  for (const language of LanguageSchema.options) {
    const projection = pkg.publicByLanguage[language];
    if (projection.problemId !== pkg.problemId || projection.contentVersion !== pkg.contentVersion || projection.language !== language) {
      addIssue(ctx, ["publicByLanguage", language], "Public projection identity must match its package and language.");
    }
    projection.questions.forEach((question, index) => {
      const concept = pkg.concepts[index];
      if (!concept || question.conceptId !== concept.id || question.conceptTag !== concept.conceptTag || question.track !== concept.track || JSON.stringify(question.variant) !== JSON.stringify(concept.variants[language])) {
        addIssue(ctx, ["publicByLanguage", language, "questions", index], "Public questions must project package concepts in package order.");
      }
    });
  }
});

export const DesignFieldSchema = z.strictObject({
  id: uuid,
  name: editableLabel,
  type: editableLabel,
  visibility: z.enum(["public", "protected", "private"]),
});
export const DesignMethodSchema = z.strictObject({
  id: uuid,
  name: editableLabel,
  parameters: z.array(z.strictObject({ id: uuid, name: editableLabel, type: editableLabel })).max(INPUT_BOUNDS.parametersPerMethod),
  returnType: editableLabel,
  contract: prose,
});
export const DesignClassSchema = z.strictObject({
  id: uuid,
  kind: z.enum(["class", "interface"]),
  name: editableLabel,
  responsibility: prose,
  fields: z.array(DesignFieldSchema).max(INPUT_BOUNDS.fieldsPerClass),
  methods: z.array(DesignMethodSchema).max(INPUT_BOUNDS.methodsPerClass),
});
export const RelationshipSchema = z.strictObject({
  id: uuid,
  sourceClassId: uuid,
  targetClassId: uuid,
  kind: z.enum(["association", "dependency", "aggregation", "composition", "inheritance", "implementation"]),
  multiplicity: editableLabel,
  explanation: prose,
});
export const WalkthroughSchema = z.strictObject({
  title: prose,
  steps: z.array(z.strictObject({ id: uuid, classId: uuid, methodId: uuid, action: prose, expectedOutcome: prose })).max(INPUT_BOUNDS.walkthroughSteps),
});

export const StructuredDesignSchema: z.ZodType<StructuredDesign> = z.strictObject({
  assumptions: longProse,
  requirementHandling: z.array(z.strictObject({ requirementId: label, response: prose })),
  classes: z.array(DesignClassSchema).max(INPUT_BOUNDS.classes),
  relationships: z.array(RelationshipSchema).max(INPUT_BOUNDS.relationships),
  normalScenario: WalkthroughSchema,
  failureScenario: WalkthroughSchema,
  tradeoff: z.strictObject({ chosen: longProse, alternative: longProse, justification: longProse }),
}).refine((design) => new TextEncoder().encode(JSON.stringify(design)).byteLength <= INPUT_BOUNDS.structuredDesignBytes, "Serialized design exceeds 64 KiB.").superRefine((design, ctx) => {
  const objectIds = design.classes.flatMap((item) => [
    item.id,
    ...item.fields.map(({ id }) => id),
    ...item.methods.flatMap((method) => [method.id, ...method.parameters.map(({ id }) => id)]),
  ]).concat(design.relationships.map(({ id }) => id), design.normalScenario.steps.map(({ id }) => id), design.failureScenario.steps.map(({ id }) => id));
  if (!unique(objectIds)) addIssue(ctx, [], "All object IDs in a design must be unique.");
  if (!unique(design.requirementHandling.map(({ requirementId }) => requirementId))) addIssue(ctx, ["requirementHandling"], "Requirement handling entries cannot repeat a requirement.");
  const classById = new Map(design.classes.map((item) => [item.id, item]));
  design.relationships.forEach((relationship, index) => {
    if (!classById.has(relationship.sourceClassId)) addIssue(ctx, ["relationships", index, "sourceClassId"], "Relationship source class does not exist.");
    if (!classById.has(relationship.targetClassId)) addIssue(ctx, ["relationships", index, "targetClassId"], "Relationship target class does not exist.");
  });
  for (const scenario of ["normalScenario", "failureScenario"] as const) {
    design[scenario].steps.forEach((step, index) => {
      const owner = classById.get(step.classId);
      if (!owner) addIssue(ctx, [scenario, "steps", index, "classId"], "Scenario class does not exist.");
      else if (!owner.methods.some(({ id }) => id === step.methodId)) addIssue(ctx, [scenario, "steps", index, "methodId"], "Scenario method does not belong to the referenced class.");
    });
  }
});

// Draft editors may temporarily hold empty selectors and duplicate/dangling
// references. Submission validation uses StructuredDesignSchema above.
export const EditableStructuredDesignSchema: z.ZodType<StructuredDesign> = z.strictObject({
  assumptions: longProse,
  requirementHandling: z.array(z.strictObject({ requirementId: editableLabel, response: prose })),
  classes: z.array(DesignClassSchema).max(INPUT_BOUNDS.classes),
  relationships: z.array(z.strictObject({
    id: uuid,
    sourceClassId: editableLabel,
    targetClassId: editableLabel,
    kind: z.enum(["association", "dependency", "aggregation", "composition", "inheritance", "implementation"]),
    multiplicity: editableLabel,
    explanation: prose,
  })).max(INPUT_BOUNDS.relationships),
  normalScenario: z.strictObject({
    title: prose,
    steps: z.array(z.strictObject({ id: uuid, classId: editableLabel, methodId: editableLabel, action: prose, expectedOutcome: prose })).max(INPUT_BOUNDS.walkthroughSteps),
  }),
  failureScenario: z.strictObject({
    title: prose,
    steps: z.array(z.strictObject({ id: uuid, classId: editableLabel, methodId: editableLabel, action: prose, expectedOutcome: prose })).max(INPUT_BOUNDS.walkthroughSteps),
  }),
  tradeoff: z.strictObject({ chosen: longProse, alternative: longProse, justification: longProse }),
});

const substantive = (value: string) => value.trim().length > 0;

export function findIncompleteSections(design: StructuredDesign): SectionId[] {
  const incomplete = new Set<SectionId>();
  if (!substantive(design.assumptions)) incomplete.add("assumptions");
  if (design.requirementHandling.length === 0 || design.requirementHandling.some(({ response }) => !substantive(response))) incomplete.add("requirementHandling");
  if (design.classes.length === 0 || design.classes.some((item) =>
    !substantive(item.name) || !substantive(item.responsibility) ||
    item.fields.some((field) => !substantive(field.name) || !substantive(field.type)) ||
    item.methods.some((method) => !substantive(method.name) || !substantive(method.returnType) || !substantive(method.contract) || method.parameters.some((parameter) => !substantive(parameter.name) || !substantive(parameter.type))),
  )) incomplete.add("classes");
  if (design.relationships.length === 0 || design.relationships.some((relationship) => !substantive(relationship.multiplicity) || !substantive(relationship.explanation))) incomplete.add("relationships");
  for (const scenario of ["normalScenario", "failureScenario"] as const) {
    const walkthrough = design[scenario];
    if (!substantive(walkthrough.title) || walkthrough.steps.length === 0 || walkthrough.steps.some((step) => !substantive(step.action) || !substantive(step.expectedOutcome))) incomplete.add(scenario);
  }
  if (!substantive(design.tradeoff.chosen) || !substantive(design.tradeoff.alternative) || !substantive(design.tradeoff.justification)) incomplete.add("tradeoff");
  return SectionIdSchema.options.filter((section) => incomplete.has(section));
}

export const EvidenceReferenceSchema = z.strictObject({
  section: z.union([SectionIdSchema, z.literal("clarification")]),
  objectId: label.optional(),
  field: label,
  quote: z.string().min(1).max(INPUT_BOUNDS.quoteCharacters).optional(),
}).superRefine((reference, ctx) => {
  if (reference.field === "$section" && (reference.objectId !== undefined || reference.quote !== undefined)) addIssue(ctx, [], "$section cannot include objectId or quote.");
});
export const SubmissionAcknowledgmentsSchema = z.strictObject({
  incompleteSections: z.array(SectionIdSchema).refine(unique, "Incomplete sections must be unique."),
  unansweredQuestionIds: z.array(label).refine(unique, "Unanswered question IDs must be unique."),
});
export const SubmissionSnapshotSchema = z.strictObject({
  id: uuid,
  attemptId: uuid,
  submittedAt: isoTime,
  problemId: label,
  contentVersion: label,
  language: LanguageSchema,
  mode: PracticeModeSchema,
  design: StructuredDesignSchema.nullable(),
  answers: idRecord(label.nullable()),
  acknowledgments: SubmissionAcknowledgmentsSchema,
}).superRefine((snapshot, ctx) => {
  if (snapshot.mode === "mcq_only" && snapshot.design !== null) addIssue(ctx, ["design"], "MCQ-only snapshots cannot include a design.");
  if (snapshot.mode === "comprehensive" && snapshot.design === null) addIssue(ctx, ["design"], "Comprehensive snapshots require a design, even when incomplete.");
});

export const EvaluationErrorSchema = z.strictObject({
  code: label,
  message: authoredProse,
  retryable: z.boolean(),
  requestId: label.optional(),
  fieldErrors: z.array(z.strictObject({ reference: EvidenceReferenceSchema, message: authoredProse })).optional(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});
export const McqResultSchema = z.strictObject({
  evaluatorVersion: z.literal("mcq-v1"),
  correctCount: z.number().int().min(0).max(20),
  marks: z.number().int().min(0).max(100),
  percentage: z.number().int().min(0).max(100),
  questions: z.array(z.strictObject({
    variantId: label,
    track: QuestionTrackSchema.default("problem_oop"),
    selectedOptionId: label.nullable(),
    correctOptionId: label,
    awardedMarks: z.union([z.literal(0), z.literal(5)]),
    rationaleByOptionId: idRecord(authoredProse),
  })).refine((questions) => questions.length === 10 || questions.length === 20, "MCQ results must contain 10 legacy or 20 current questions."),
  tracks: z.record(QuestionTrackSchema, z.strictObject({
    correctCount: z.number().int().min(0).max(10),
    questionCount: z.number().int().min(0).max(10),
    marks: z.number().int().min(0).max(50),
    percentage: z.number().int().min(0).max(100),
  })).optional(),
  referenceDesign: authoredProse,
}).superRefine((result, ctx) => {
  const correct = result.questions.filter(({ awardedMarks }) => awardedMarks === 5).length;
  const expectedPercentage = Math.round((correct / result.questions.length) * 100);
  if (result.correctCount !== correct || result.marks !== correct * 5 || result.percentage !== expectedPercentage) addIssue(ctx, [], "MCQ totals must be derived from per-question awarded marks.");
  if (!unique(result.questions.map(({ variantId }) => variantId))) addIssue(ctx, ["questions"], "MCQ result variant IDs must be unique.");
  if (result.questions.length === 20 && !result.tracks) addIssue(ctx, ["tracks"], "Current MCQ results require track summaries.");
  if (result.tracks) for (const track of QuestionTrackSchema.options) {
    const questions = result.questions.filter((question) => question.track === track);
    const trackCorrect = questions.filter(({ awardedMarks }) => awardedMarks === 5).length;
    const summary = result.tracks[track];
    const percentage = questions.length === 0 ? 0 : Math.round((trackCorrect / questions.length) * 100);
    if (summary.questionCount !== questions.length || summary.correctCount !== trackCorrect || summary.marks !== trackCorrect * 5 || summary.percentage !== percentage) addIssue(ctx, ["tracks", track], "Track totals must be derived from per-question awarded marks.");
  }
});
export const FindingSchema = z.strictObject({
  id: uuid,
  criterionId: CriterionIdSchema,
  requirementIds: z.array(label).refine(unique, "Finding requirement IDs must be unique."),
  kind: z.enum(["contradiction", "not_demonstrated", "tradeoff"]),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(INPUT_BOUNDS.evidencePerItem),
  judgment: authoredProse,
  consequence: authoredProse,
  suggestion: authoredProse,
});
export const AssessmentBodySchema = z.strictObject({
  criteria: z.array(z.strictObject({
    criterionId: CriterionIdSchema,
    rating: RatingSchema,
    rationale: authoredProse,
    evidence: z.array(EvidenceReferenceSchema).min(1).max(INPUT_BOUNDS.evidencePerItem),
  })).length(5),
  strengths: z.array(z.strictObject({ text: authoredProse, evidence: z.array(EvidenceReferenceSchema).min(1).max(INPUT_BOUNDS.evidencePerItem) })).max(INPUT_BOUNDS.strengths),
  findings: z.array(FindingSchema).max(INPUT_BOUNDS.findings),
  priorityFindingIds: z.array(label).max(INPUT_BOUNDS.priorities).refine(unique, "Priority finding IDs must be unique."),
}).superRefine((body, ctx) => {
  if (!sameMembers(body.criteria.map(({ criterionId }) => criterionId), CriterionIdSchema.options)) addIssue(ctx, ["criteria"], "Assessment must contain every criterion exactly once.");
  if (!unique(body.findings.map(({ id }) => id))) addIssue(ctx, ["findings"], "Finding IDs must be unique.");
  for (const id of body.priorityFindingIds) if (!body.findings.some((finding) => finding.id === id)) addIssue(ctx, ["priorityFindingIds"], `Priority ID ${id} does not identify a finding.`);
  body.findings.forEach((finding, index) => {
    if (finding.kind === "contradiction" && !finding.evidence.some(({ quote }) => quote !== undefined)) addIssue(ctx, ["findings", index, "evidence"], "Contradiction findings require quoted evidence.");
  });
});
export const ReviewConfigurationSchema = z.strictObject({
  provider: z.literal("groq"),
  model: label,
  reasoningEffort: z.enum(["low", "medium", "high"]),
  evaluatorVersion: label,
  promptVersion: label,
  rubricVersion: label,
});
export const ClarificationRequestSchema = z.strictObject({
  id: uuid,
  sessionId: uuid,
  snapshotId: uuid,
  configuration: ReviewConfigurationSchema,
  questions: z.array(z.strictObject({ id: uuid, text: z.string().min(1).max(INPUT_BOUNDS.clarificationQuestionCharacters), reference: EvidenceReferenceSchema })).min(1).max(INPUT_BOUNDS.clarificationQuestions),
}).superRefine((request, ctx) => {
  if (!unique(request.questions.map(({ id }) => id))) addIssue(ctx, ["questions"], "Clarification question IDs must be unique.");
});
export const ClarificationAnswerSchema = z.discriminatedUnion("status", [
  z.strictObject({ questionId: uuid, status: z.literal("answered"), answer: z.string().min(1).max(INPUT_BOUNDS.clarificationAnswerCharacters) }),
  z.strictObject({ questionId: uuid, status: z.literal("skipped") }),
]);
export const DesignReportSchema: z.ZodType<DesignReport> = z.strictObject({
  assessment: AssessmentBodySchema,
  marks: z.number().min(0).max(50).multipleOf(2.5),
  configuration: ReviewConfigurationSchema,
  evaluatedAt: isoTime,
}).superRefine((report, ctx) => {
  const calculated = report.assessment.criteria.reduce((total, criterion) => total + criterion.rating, 0) * 2.5;
  if (report.marks !== calculated) addIssue(ctx, ["marks"], "Design marks must be derived from criterion ratings.");
});

export const EvaluationRunSchema = z.strictObject({
  id: uuid,
  snapshotId: uuid,
  phase: z.enum(["mcq", "initial", "final"]),
  sessionId: uuid.optional(),
  credentialMode: CredentialModeSchema.optional(),
  configuration: ReviewConfigurationSchema.optional(),
  startedAt: isoTime,
  endedAt: isoTime.optional(),
  outcome: z.enum(["running", "succeeded", "awaiting_clarification", "failed", "interrupted"]),
  error: EvaluationErrorSchema.optional(),
}).superRefine((run, ctx) => {
  if (run.phase === "mcq" && (run.sessionId || run.credentialMode || run.configuration)) addIssue(ctx, [], "MCQ runs cannot have design review configuration.");
  if (run.phase !== "mcq" && (!run.sessionId || !run.credentialMode || !run.configuration)) addIssue(ctx, [], "Design runs require session, credential, and configuration.");
  if (run.outcome === "running" && (run.endedAt || run.error)) addIssue(ctx, [], "A running run cannot be ended or have an error.");
  if (run.outcome !== "running" && !run.endedAt) addIssue(ctx, ["endedAt"], "A terminal run requires an end time.");
  if ((run.outcome === "failed" || run.outcome === "interrupted") !== Boolean(run.error)) addIssue(ctx, ["error"], "Only failed or interrupted runs require an error.");
  if (run.outcome === "awaiting_clarification" && run.phase !== "initial") addIssue(ctx, ["outcome"], "Only an initial design run can await clarification.");
});

export const McqEvaluationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({ status: z.literal("running"), runId: uuid }),
  z.strictObject({ status: z.literal("succeeded"), runId: uuid, result: McqResultSchema }),
  z.strictObject({ status: z.literal("failed"), runId: uuid.optional(), error: EvaluationErrorSchema }),
  z.strictObject({ status: z.literal("interrupted"), runId: uuid.optional(), error: EvaluationErrorSchema }),
]);
export const DesignEvaluationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not_required") }),
  z.strictObject({ status: z.literal("pending") }),
  z.strictObject({ status: z.literal("running"), runId: uuid }),
  z.strictObject({ status: z.literal("awaiting_clarification"), runId: uuid, request: ClarificationRequestSchema }),
  z.strictObject({ status: z.literal("succeeded"), runId: uuid, report: DesignReportSchema }),
  z.strictObject({ status: z.literal("failed"), runId: uuid.optional(), error: EvaluationErrorSchema }),
  z.strictObject({ status: z.literal("interrupted"), runId: uuid.optional(), error: EvaluationErrorSchema }),
]);
export const ReviewSessionSchema = z.strictObject({
  id: uuid,
  configuration: ReviewConfigurationSchema,
  credentialMode: CredentialModeSchema,
  clarification: ClarificationRequestSchema.optional(),
  frozenAnswers: z.array(ClarificationAnswerSchema).optional(),
}).superRefine((session, ctx) => {
  if (session.clarification && (session.clarification.sessionId !== session.id || !sameConfiguration(session.clarification.configuration, session.configuration))) addIssue(ctx, ["clarification"], "Clarification must match its review session.");
  if (session.frozenAnswers) {
    if (!session.clarification || !sameMembers(session.frozenAnswers.map(({ questionId }) => questionId), session.clarification.questions.map(({ id }) => id))) addIssue(ctx, ["frozenAnswers"], "Frozen answers must exactly match clarification questions.");
  }
});

function validateAnswers(ctx: z.RefinementCtx, answers: Record<string, string | null>, content: PublicProblemSnapshot, path: PropertyKey[]) {
  const variantIds = content.questions.map(({ variant }) => variant.id);
  if (!sameMembers(Object.keys(answers), variantIds)) {
    addIssue(ctx, path, "Answers must exactly match the pinned variants.");
    return;
  }
  for (const { variant } of content.questions) {
    const selected = answers[variant.id];
    if (selected !== null && selected !== undefined && !variant.options.some(({ id }) => id === selected)) addIssue(ctx, [...path, variant.id], "Selected option does not belong to this variant.");
  }
}

export const AttemptDataSchema: z.ZodType<AttemptData> = z.strictObject({
  id: uuid,
  parentAttemptId: uuid.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
  status: z.enum(["draft", "submitted"]),
  mode: PracticeModeSchema,
  content: PublicProblemSnapshotSchema,
  draftDesign: EditableStructuredDesignSchema.nullable(),
  draftAnswers: idRecord(label.nullable()),
  learnerRequirementNotes: z.array(z.strictObject({ id: uuid, text: prose })).max(INPUT_BOUNDS.learnerRequirementNotes).default([]),
  scratchpad: z.string().max(INPUT_BOUNDS.scratchpadCharacters),
  scratchpadCanvas: z.array(z.strictObject({
    id: uuid,
    kind: z.enum(["text", "sticky", "rectangle", "arrow"]),
    x: z.number().finite().min(-10_000).max(10_000),
    y: z.number().finite().min(-10_000).max(10_000),
    width: z.number().finite().min(1).max(5_000),
    height: z.number().finite().min(1).max(5_000),
    text: z.string().max(INPUT_BOUNDS.scratchpadCanvasTextCharacters),
    color: z.enum(["yellow", "blue", "pink", "white"]),
    fromId: uuid.optional(),
    toId: uuid.optional(),
  })).max(INPUT_BOUNDS.scratchpadCanvasItems).default([]),
  snapshot: SubmissionSnapshotSchema.nullable(),
  mcq: McqEvaluationSchema,
  design: DesignEvaluationSchema,
  reviewSession: ReviewSessionSchema.nullable(),
  runs: z.array(EvaluationRunSchema),
}).superRefine((attempt, ctx) => {
  if (attempt.parentAttemptId === attempt.id) addIssue(ctx, ["parentAttemptId"], "An attempt cannot be its own parent.");
  if (attempt.mode === "mcq_only" && attempt.design.status !== "not_required") addIssue(ctx, ["design"], "MCQ-only attempts must not require design evaluation.");
  if (attempt.mode === "comprehensive" && attempt.design.status === "not_required") addIssue(ctx, ["design"], "Comprehensive attempts require design evaluation.");
  if (attempt.mode === "mcq_only" && (attempt.reviewSession !== null || attempt.runs.some(({ phase }) => phase !== "mcq"))) addIssue(ctx, ["reviewSession"], "MCQ-only attempts cannot contain design review state.");
  if (attempt.status === "draft") {
    if (attempt.snapshot || attempt.runs.length || attempt.reviewSession || attempt.mcq.status !== "pending" || !["pending", "not_required"].includes(attempt.design.status)) addIssue(ctx, [], "Drafts cannot contain submission or evaluation state.");
    if (attempt.mode === "comprehensive" && attempt.draftDesign === null) addIssue(ctx, ["draftDesign"], "Comprehensive drafts require a structured design value.");
    if (attempt.mode === "mcq_only" && attempt.draftDesign !== null) addIssue(ctx, ["draftDesign"], "MCQ-only drafts cannot include a design.");
    validateAnswers(ctx, attempt.draftAnswers, attempt.content, ["draftAnswers"]);
  } else {
    if (!attempt.snapshot) addIssue(ctx, ["snapshot"], "Submitted attempts require a snapshot.");
    if (attempt.draftDesign !== null || Object.keys(attempt.draftAnswers).length !== 0) addIssue(ctx, [], "Submitted attempts must clear redundant draft fields.");
  }
  const snapshot = attempt.snapshot;
  if (!snapshot) return;
  if (snapshot.attemptId !== attempt.id || snapshot.problemId !== attempt.content.problemId || snapshot.contentVersion !== attempt.content.contentVersion || snapshot.language !== attempt.content.language || snapshot.mode !== attempt.mode) addIssue(ctx, ["snapshot"], "Snapshot identity must match its attempt and pinned content.");
  validateAnswers(ctx, snapshot.answers, attempt.content, ["snapshot", "answers"]);
  const unanswered = Object.entries(snapshot.answers).filter(([, answer]) => answer === null).map(([id]) => id);
  if (!sameMembers(snapshot.acknowledgments.unansweredQuestionIds, unanswered)) addIssue(ctx, ["snapshot", "acknowledgments", "unansweredQuestionIds"], "Acknowledged unanswered IDs must exactly match snapshot answers.");
  const incomplete = snapshot.design ? findIncompleteSections(snapshot.design) : [];
  if (snapshot.design && attempt.content.requirements.some(({ id }) => !snapshot.design!.requirementHandling.some(({ requirementId }) => requirementId === id)) && !incomplete.includes("requirementHandling")) incomplete.push("requirementHandling");
  if (!sameMembers(snapshot.acknowledgments.incompleteSections, incomplete)) addIssue(ctx, ["snapshot", "acknowledgments", "incompleteSections"], "Acknowledged incomplete sections must exactly match the frozen design.");
  if (snapshot.design) {
    const requirementIds = new Set(attempt.content.requirements.map(({ id }) => id));
    for (const [index, handling] of snapshot.design.requirementHandling.entries()) if (!requirementIds.has(handling.requirementId)) addIssue(ctx, ["snapshot", "design", "requirementHandling", index, "requirementId"], "Snapshot design references an unknown requirement.");
  }
  for (const run of attempt.runs) if (run.snapshotId !== snapshot.id) addIssue(ctx, ["runs"], "Every run must reference the active snapshot.");
  if (!unique(attempt.runs.map(({ id }) => id))) addIssue(ctx, ["runs"], "Run IDs must be unique.");
  const runningByComponent = attempt.runs.filter(({ outcome }) => outcome === "running").map(({ phase }) => phase === "mcq" ? "mcq" : "design");
  if (!unique(runningByComponent)) addIssue(ctx, ["runs"], "At most one active run may exist per component.");
  for (const [index, run] of attempt.runs.entries()) {
    if (run.outcome === "running") {
      const evaluation = run.phase === "mcq" ? attempt.mcq : attempt.design;
      if (evaluation.status !== "running" || evaluation.runId !== run.id) addIssue(ctx, ["runs", index], "A running run must be the current run for its component.");
    }
  }
  const checkEvaluationRun = (component: "mcq" | "design", evaluation: typeof attempt.mcq | typeof attempt.design) => {
    if (!("runId" in evaluation) || !evaluation.runId) return;
    const run = attempt.runs.find(({ id }) => id === evaluation.runId);
    if (!run || (component === "mcq") !== (run.phase === "mcq")) {
      addIssue(ctx, [component, "runId"], "Evaluation run must identify a matching component run.");
      return;
    }
    const expectedOutcome = evaluation.status === "awaiting_clarification" ? "awaiting_clarification" : evaluation.status;
    if (run.outcome !== expectedOutcome) addIssue(ctx, [component, "runId"], "Evaluation status must match its run outcome.");
  };
  checkEvaluationRun("mcq", attempt.mcq);
  checkEvaluationRun("design", attempt.design);
  const currentDesignRunId = "runId" in attempt.design ? attempt.design.runId : undefined;
  const currentDesignRun = currentDesignRunId ? attempt.runs.find(({ id }) => id === currentDesignRunId) : undefined;
  if (currentDesignRun && currentDesignRun.phase !== "mcq") {
    const session = attempt.reviewSession;
    if (!session) addIssue(ctx, ["reviewSession"], "A design evaluation run requires its review session.");
    else if (currentDesignRun.sessionId !== session.id || currentDesignRun.credentialMode !== session.credentialMode || !sameConfiguration(currentDesignRun.configuration, session.configuration)) addIssue(ctx, ["runs"], "The current design run must match its review session, credential mode, and configuration.");
  }
  if (attempt.reviewSession) {
    const sessionRuns = attempt.runs.filter((run) => run.phase !== "mcq" && run.sessionId === attempt.reviewSession!.id);
    if (sessionRuns.length === 0) addIssue(ctx, ["reviewSession"], "A review session must own at least one design run.");
    if (attempt.design.status === "pending" || attempt.design.status === "not_required") addIssue(ctx, ["design"], "A review session cannot accompany a pending or non-required design evaluation.");
  }
  if (attempt.mcq.status === "succeeded") {
    const publicById = new Map(attempt.content.questions.map((question) => [question.variant.id, question]));
    for (const result of attempt.mcq.result.questions) {
      const question = publicById.get(result.variantId);
      const variant = question?.variant;
      if (!variant || result.track !== question.track || result.selectedOptionId !== snapshot.answers[result.variantId] || !variant.options.some(({ id }) => id === result.correctOptionId) || !sameMembers(Object.keys(result.rationaleByOptionId), variant.options.map(({ id }) => id))) addIssue(ctx, ["mcq", "result"], "MCQ result must correspond to the pinned questions and snapshot answers.");
    }
  }
  if (attempt.reviewSession) {
    if (attempt.reviewSession.clarification?.snapshotId !== undefined && attempt.reviewSession.clarification.snapshotId !== snapshot.id) addIssue(ctx, ["reviewSession", "clarification", "snapshotId"], "Clarification must reference the attempt snapshot.");
    if (attempt.reviewSession.clarification && snapshot.design) validateClarificationEvidence(ctx, attempt.reviewSession.clarification, snapshot.design, attempt.content.requirements, ["reviewSession", "clarification"]);
    if (attempt.reviewSession.clarification && !attempt.reviewSession.frozenAnswers && attempt.design.status !== "awaiting_clarification") addIssue(ctx, ["reviewSession"], "Unanswered clarification can only accompany awaiting-clarification state.");
    if (attempt.reviewSession.frozenAnswers && (!currentDesignRun || currentDesignRun.phase !== "final")) addIssue(ctx, ["reviewSession", "frozenAnswers"], "Frozen clarification answers require the current final-phase run.");
    if (currentDesignRun?.phase === "final" && (!attempt.reviewSession.clarification || !attempt.reviewSession.frozenAnswers)) addIssue(ctx, ["reviewSession"], "A final-phase run requires frozen clarification questions and answers.");
  }
  if (attempt.design.status === "awaiting_clarification") {
    if (!attempt.reviewSession || !sameConfiguration(attempt.design.request, attempt.reviewSession.clarification)) addIssue(ctx, ["design", "request"], "Awaiting clarification must match the active review session.");
  }
  if (attempt.design.status === "succeeded" && snapshot.design) {
    const issues = validateAssessmentEvidence(attempt.design.report.assessment, {
      design: snapshot.design,
      requirements: attempt.content.requirements,
      clarification: attempt.reviewSession?.clarification,
      clarificationAnswers: attempt.reviewSession?.frozenAnswers,
    });
    for (const issue of issues) addIssue(ctx, ["design", "report", "assessment"], issue.message);
    if (attempt.reviewSession && !sameConfiguration(attempt.design.report.configuration, attempt.reviewSession.configuration)) addIssue(ctx, ["design", "report", "configuration"], "Report configuration must match its review session.");
  }
});

export const PracticeDataSchema = z.strictObject({ attempts: z.array(AttemptDataSchema) }).superRefine((practice, ctx) => {
  const ids = practice.attempts.map(({ id }) => id);
  if (!unique(ids)) addIssue(ctx, ["attempts"], "Attempt IDs must be unique.");
  const snapshotIds = practice.attempts.flatMap((attempt) => attempt.snapshot ? [attempt.snapshot.id] : []);
  if (!unique(snapshotIds)) addIssue(ctx, ["attempts"], "Submission snapshot IDs must be unique across attempts.");
  const byId = new Map(practice.attempts.map((attempt) => [attempt.id, attempt]));
  for (const [index, attempt] of practice.attempts.entries()) {
    if (attempt.parentAttemptId && !byId.has(attempt.parentAttemptId)) addIssue(ctx, ["attempts", index, "parentAttemptId"], "Revision parent does not exist.");
    if (attempt.parentAttemptId && byId.get(attempt.parentAttemptId)?.status !== "submitted") addIssue(ctx, ["attempts", index, "parentAttemptId"], "Revision parent must be submitted.");
    const visited = new Set<string>();
    let current: AttemptData | undefined = attempt;
    while (current?.parentAttemptId) {
      if (visited.has(current.id)) { addIssue(ctx, ["attempts", index, "parentAttemptId"], "Revision lineage must be acyclic."); break; }
      visited.add(current.id);
      current = byId.get(current.parentAttemptId);
    }
  }
});
export const PersistedEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  writerId: label,
  savedAt: isoTime,
  data: PracticeDataSchema,
});
export const BackupSchema: z.ZodType<Backup> = z.strictObject({
  format: z.literal("lldpractice-backup"),
  schemaVersion: z.literal(1),
  exportedAt: isoTime,
  data: PracticeDataSchema,
});

export function parseBackupJson(json: string): Backup {
  if (new TextEncoder().encode(json).byteLength > INPUT_BOUNDS.backupBytes) throw new Error("Backup exceeds the 10 MiB limit.");
  return BackupSchema.parse(JSON.parse(json));
}

export const ReviewInputSchema = z.strictObject({
  problemId: label,
  contentVersion: label,
  snapshotId: uuid,
  design: StructuredDesignSchema,
  acknowledgedIncompleteSections: z.array(SectionIdSchema).refine(unique),
  phase: z.enum(["initial", "final"]),
  sessionId: uuid,
  configuration: ReviewConfigurationSchema,
  clarification: ClarificationRequestSchema.optional(),
  answers: z.array(ClarificationAnswerSchema).optional(),
}).superRefine((input, ctx) => {
  const incompleteSections = findIncompleteSections(input.design);
  // Trusted content at the server determines whether otherwise populated mappings omit a requirement.
  const shapeAcknowledgments = input.acknowledgedIncompleteSections.filter((section) => section !== "requirementHandling" || incompleteSections.includes(section));
  if (!sameMembers(shapeAcknowledgments, incompleteSections)) addIssue(ctx, ["acknowledgedIncompleteSections"], "Acknowledged incomplete sections must match the submitted design.");
  if (input.phase === "initial" && (input.clarification || input.answers)) addIssue(ctx, [], "Initial review forbids clarification fields.");
  if (input.phase === "final") {
    if (!input.clarification || !input.answers) addIssue(ctx, [], "Final review requires clarification and answers.");
    else {
      if (input.clarification.sessionId !== input.sessionId || input.clarification.snapshotId !== input.snapshotId || !sameConfiguration(input.clarification.configuration, input.configuration) || !sameMembers(input.answers.map(({ questionId }) => questionId), input.clarification.questions.map(({ id }) => id))) addIssue(ctx, [], "Final review clarification, answers, snapshot, session, and configuration must match.");
      const submittedRequirementIds = input.design.requirementHandling.map(({ requirementId }) => ({ id: requirementId, text: requirementId }));
      validateClarificationEvidence(ctx, input.clarification, input.design, submittedRequirementIds, ["clarification"]);
    }
  }
});
export const RequestMetadataSchema = z.strictObject({ attemptId: uuid, snapshotId: uuid, runId: uuid });
export const McqScoreRequestSchema = RequestMetadataSchema.extend({
  problemId: label,
  contentVersion: label,
  language: LanguageSchema,
  answers: idRecord(label.nullable()),
});
export const DesignReviewRequestSchema = RequestMetadataSchema.extend({ credentialMode: CredentialModeSchema, input: ReviewInputSchema }).superRefine((request, ctx) => {
  if (request.snapshotId !== request.input.snapshotId) addIssue(ctx, ["snapshotId"], "Request and review input snapshot IDs must match.");
});
export const ApiFailureSchema = z.strictObject({ error: EvaluationErrorSchema });
export const CommitResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), revision: z.number().int().nonnegative() }),
  z.strictObject({ ok: z.literal(false), reason: z.enum(["conflict", "storage", "unsupported"]), message: authoredProse }),
]);
export const ReviewOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("report"), report: DesignReportSchema }),
  z.strictObject({ kind: z.literal("clarification"), clarification: ClarificationRequestSchema }),
]);
export const ApiSuccessSchema = <T extends z.ZodType>(data: T) => RequestMetadataSchema.extend({ requestId: uuid, data });
export const PublicConfigSchema = z.strictObject({
  provider: z.literal("groq"),
  model: label,
  reasoningEffort: z.enum(["low", "medium", "high"]),
  platformAvailable: z.boolean(),
  evaluatorVersion: label,
  promptVersion: label,
  content: z.array(z.strictObject({ problemId: label, contentVersion: label, rubricVersion: label })),
  limits: z.strictObject({ reviewTimeoutMs: z.number().int().positive(), maxBodyBytes: z.number().int().positive(), maxDesignBytes: z.number().int().positive() }),
});

export function parseDesignReport(input: unknown, source: Parameters<typeof validateAssessmentEvidence>[1]): DesignReport {
  const report = DesignReportSchema.parse(input);
  const issues = validateAssessmentEvidence(report.assessment, source);
  if (issues.length) throw new z.ZodError(issues.map((issue) => ({ code: "custom", path: ["assessment"], message: issue.message, input })));
  return report;
}
