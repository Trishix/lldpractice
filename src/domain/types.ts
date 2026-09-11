export type Id = string;
export type IsoTime = string;
export type Language = "java" | "python" | "cpp";
export type PracticeMode = "mcq_only" | "comprehensive";
export type QuestionTrack = "system_design" | "problem_oop";
export type CredentialMode = "platform" | "user";
export type CriterionId = "requirements" | "responsibilities" | "relationships" | "behavior" | "tradeoffs";
export type SectionId = "assumptions" | "requirementHandling" | "classes" | "relationships" | "normalScenario" | "failureScenario" | "tradeoff";
export type Rating = 0 | 1 | 2 | 3 | 4;

export interface Requirement { id: Id; text: string }
export interface Option { id: Id; text: string }
export interface QuestionVariant {
  id: Id;
  language: Language;
  snippet: string;
  assumptions: string;
  prompt: string;
  options: Option[];
}
export interface ConceptQuestion {
  id: Id;
  track: QuestionTrack;
  category: "trace" | "defect" | "responsibility" | "contract" | "change";
  conceptTag: string;
  marks: 5;
  variants: Record<Language, QuestionVariant>;
}
export interface PublicProblemSnapshot {
  problemId: Id;
  contentVersion: string;
  title: string;
  introduction: string;
  requirements: Requirement[];
  exclusions: string[];
  example: string;
  faq: { question: string; answer: string }[];
  scenarioPrompts: { normal: string; failure: string };
  language: Language;
  questions: { conceptId: Id; conceptTag: string; track: QuestionTrack; variant: QuestionVariant }[];
  attribution: { url: string; commit: string; adaptations: string[] };
}
export interface PublicProblemSummary {
  problemId: Id;
  contentVersion: string;
  title: string;
}
export interface RubricCriterion {
  id: CriterionId;
  description: string;
  anchors: Record<Rating, string>;
}
export interface ProblemPackage {
  problemId: Id;
  contentVersion: string;
  publicByLanguage: Record<Language, PublicProblemSnapshot>;
  concepts: ConceptQuestion[];
  keysByVariantId: Record<Id, { correctOptionId: Id; rationaleByOptionId: Record<Id, string> }>;
  rubricVersion: string;
  rubric: RubricCriterion[];
  referenceDesign: string;
}

export interface DesignField {
  id: Id;
  name: string;
  type: string;
  visibility: "public" | "protected" | "private";
}
export interface DesignMethod {
  id: Id;
  name: string;
  parameters: { id: Id; name: string; type: string }[];
  returnType: string;
  contract: string;
}
export interface DesignClass {
  id: Id;
  kind: "class" | "interface";
  name: string;
  responsibility: string;
  fields: DesignField[];
  methods: DesignMethod[];
}
export interface Relationship {
  id: Id;
  sourceClassId: Id;
  targetClassId: Id;
  kind: "association" | "dependency" | "aggregation" | "composition" | "inheritance" | "implementation";
  multiplicity: string;
  explanation: string;
}
export interface Walkthrough {
  title: string;
  steps: { id: Id; classId: Id; methodId: Id; action: string; expectedOutcome: string }[];
}
export interface StructuredDesign {
  assumptions: string;
  requirementHandling: { requirementId: Id; response: string }[];
  classes: DesignClass[];
  relationships: Relationship[];
  normalScenario: Walkthrough;
  failureScenario: Walkthrough;
  tradeoff: { chosen: string; alternative: string; justification: string };
}
export interface EvidenceReference {
  section: SectionId | "clarification";
  objectId?: Id;
  field: string;
  quote?: string;
}
export interface SubmissionAcknowledgments {
  incompleteSections: SectionId[];
  unansweredQuestionIds: Id[];
}
export interface SubmissionSnapshot {
  id: Id;
  attemptId: Id;
  submittedAt: IsoTime;
  problemId: Id;
  contentVersion: string;
  language: Language;
  mode: PracticeMode;
  design: StructuredDesign | null;
  answers: Record<Id, Id | null>;
  acknowledgments: SubmissionAcknowledgments;
}

export interface EvaluationError {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: Id;
  fieldErrors?: { reference: EvidenceReference; message: string }[];
  retryAfterSeconds?: number;
}
export interface McqResult {
  evaluatorVersion: "mcq-v1";
  correctCount: number;
  marks: number;
  percentage: number;
  questions: {
    variantId: Id;
    track: QuestionTrack;
    selectedOptionId: Id | null;
    correctOptionId: Id;
    awardedMarks: 0 | 5;
    rationaleByOptionId: Record<Id, string>;
  }[];
  tracks?: Record<QuestionTrack, { correctCount: number; questionCount: number; marks: number; percentage: number }>;
  referenceDesign: string;
}
export interface Finding {
  id: Id;
  criterionId: CriterionId;
  requirementIds: Id[];
  kind: "contradiction" | "not_demonstrated" | "tradeoff";
  evidence: EvidenceReference[];
  judgment: string;
  consequence: string;
  suggestion: string;
}
export interface AssessmentBody {
  criteria: { criterionId: CriterionId; rating: Rating; rationale: string; evidence: EvidenceReference[] }[];
  strengths: { text: string; evidence: EvidenceReference[] }[];
  findings: Finding[];
  priorityFindingIds: Id[];
}
export interface ReviewConfiguration {
  provider: "groq";
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  evaluatorVersion: string;
  promptVersion: string;
  rubricVersion: string;
}
export interface ClarificationRequest {
  id: Id;
  sessionId: Id;
  snapshotId: Id;
  configuration: ReviewConfiguration;
  questions: { id: Id; text: string; reference: EvidenceReference }[];
}
export type ClarificationAnswer =
  | { questionId: Id; status: "answered"; answer: string }
  | { questionId: Id; status: "skipped" };
export interface DesignReport {
  assessment: AssessmentBody;
  marks: number;
  configuration: ReviewConfiguration;
  evaluatedAt: IsoTime;
}
export type RunPhase = "mcq" | "initial" | "final";
export interface EvaluationRun {
  id: Id;
  snapshotId: Id;
  phase: RunPhase;
  sessionId?: Id;
  credentialMode?: CredentialMode;
  configuration?: ReviewConfiguration;
  startedAt: IsoTime;
  endedAt?: IsoTime;
  outcome: "running" | "succeeded" | "awaiting_clarification" | "failed" | "interrupted";
  error?: EvaluationError;
}
export type McqEvaluation =
  | { status: "pending" }
  | { status: "running"; runId: Id }
  | { status: "succeeded"; runId: Id; result: McqResult }
  | { status: "failed" | "interrupted"; runId?: Id; error: EvaluationError };
export type DesignEvaluation =
  | { status: "not_required" }
  | { status: "pending" }
  | { status: "running"; runId: Id }
  | { status: "awaiting_clarification"; runId: Id; request: ClarificationRequest }
  | { status: "succeeded"; runId: Id; report: DesignReport }
  | { status: "failed" | "interrupted"; runId?: Id; error: EvaluationError };
export type EvaluationComponent = "mcq" | "design";
export interface ReviewSession {
  id: Id;
  configuration: ReviewConfiguration;
  credentialMode: CredentialMode;
  clarification?: ClarificationRequest;
  frozenAnswers?: ClarificationAnswer[];
}
export interface AttemptData {
  id: Id;
  parentAttemptId: Id | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
  status: "draft" | "submitted";
  mode: PracticeMode;
  content: PublicProblemSnapshot;
  draftDesign: StructuredDesign | null;
  draftAnswers: Record<Id, Id | null>;
  learnerRequirementNotes: { id: Id; text: string }[];
  scratchpad: string;
  scratchpadCanvas: ScratchpadCanvasItem[];
  snapshot: SubmissionSnapshot | null;
  mcq: McqEvaluation;
  design: DesignEvaluation;
  reviewSession: ReviewSession | null;
  runs: EvaluationRun[];
}

export type ScratchpadCanvasItemKind = "text" | "sticky" | "rectangle" | "arrow";
export type ScratchpadCanvasColor = "yellow" | "blue" | "pink" | "white";
export interface ScratchpadCanvasItem {
  id: Id;
  kind: ScratchpadCanvasItemKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: ScratchpadCanvasColor;
  fromId?: Id;
  toId?: Id;
}

export interface Clock { now(): IsoTime }
export interface IdGenerator { next(): Id }
export interface ValidationResult {
  blocking: { reference: EvidenceReference; message: string }[];
  incompleteSections: SectionId[];
  unansweredQuestionIds: Id[];
}
export interface SubmissionValidator { validate(attempt: AttemptData): ValidationResult }
export interface ScorePolicy {
  mcq(correctCount: number, questionCount?: number): { marks: number; percentage: number };
  design(ratings: Rating[]): number;
  overall(mcq: McqEvaluation, design: DesignEvaluation): number | null;
}
export interface Attempt {
  toData(): AttemptData;
  editDesign(design: StructuredDesign): void;
  answer(variantId: Id, optionId: Id | null): void;
  prepareSubmission(ack: SubmissionAcknowledgments): SubmissionSnapshot;
  createRevision(newId: Id, now: IsoTime): AttemptData;
}
export interface PracticeData { attempts: AttemptData[] }
export interface PersistedEnvelope {
  schemaVersion: 1;
  revision: number;
  writerId: Id;
  savedAt: IsoTime;
  data: PracticeData;
}
export type CommitResult =
  | { ok: true; revision: number }
  | { ok: false; reason: "conflict" | "storage" | "unsupported"; message: string };
export interface AttemptRepository {
  hydrate(): Promise<PersistedEnvelope | null>;
  read(id: Id): AttemptData | null;
  stage(data: PracticeData): void;
  stageAttempt(attemptId: Id, attempt: AttemptData): void;
  flush(): Promise<CommitResult>;
  commitCritical(attemptId: Id, transition: (current: AttemptData) => AttemptData): Promise<CommitResult>;
  replace(data: PracticeData): Promise<CommitResult>;
  exportPractice(): string;
}
export interface ReviewInput {
  problemId: Id;
  contentVersion: string;
  snapshotId: Id;
  design: StructuredDesign;
  acknowledgedIncompleteSections: SectionId[];
  phase: "initial" | "final";
  sessionId: Id;
  configuration: ReviewConfiguration;
  clarification?: ClarificationRequest;
  answers?: ClarificationAnswer[];
}
export type ReviewOutcome =
  | { kind: "report"; report: DesignReport }
  | { kind: "clarification"; clarification: ClarificationRequest };
export interface DesignEvaluator { evaluate(input: ReviewInput, signal: AbortSignal): Promise<ReviewOutcome> }
export interface McqEvaluator {
  evaluate(content: ProblemPackage, language: Language, answers: Record<Id, Id | null>): McqResult;
}
export interface EvaluationCoordinator {
  saveSubmission(attemptId: Id, ack: SubmissionAcknowledgments): Promise<CommitResult>;
  evaluate(attemptId: Id, components?: EvaluationComponent[]): Promise<void>;
  submit(attemptId: Id, ack: SubmissionAcknowledgments): Promise<void>;
  retry(attemptId: Id, component: EvaluationComponent): Promise<void>;
  completeClarification(attemptId: Id, answers: ClarificationAnswer[]): Promise<void>;
  restartDesignReview(attemptId: Id): Promise<void>;
  invalidate(): void;
}

export interface RequestMetadata { attemptId: Id; snapshotId: Id; runId: Id }
export interface ApiSuccess<T> extends RequestMetadata { requestId: Id; data: T }
export interface ApiFailure { error: EvaluationError }
export interface PublicConfig {
  provider: "groq";
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  platformAvailable: boolean;
  evaluatorVersion: string;
  promptVersion: string;
  content: { problemId: Id; contentVersion: string; rubricVersion: string }[];
  limits: { reviewTimeoutMs: number; maxBodyBytes: number; maxDesignBytes: number };
}
export interface McqScoreRequest extends RequestMetadata {
  problemId: Id;
  contentVersion: string;
  language: Language;
  answers: Record<Id, Id | null>;
}
export interface DesignReviewRequest extends RequestMetadata {
  credentialMode: CredentialMode;
  input: ReviewInput;
}
export interface Backup {
  format: "lldpractice-backup";
  schemaVersion: 1;
  exportedAt: IsoTime;
  data: PracticeData;
}
