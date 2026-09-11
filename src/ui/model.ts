import { AttemptDataSchema } from "@/domain/schemas";
import type { AttemptData, PracticeMode, PublicProblemSnapshot, SectionId, StructuredDesign } from "@/domain/types";

export const clock = { now: () => new Date().toISOString() };
export const ids = { next: () => crypto.randomUUID() };
export const languages = { java: "Java", python: "Python", cpp: "C++" };
export const sectionLabels = { assumptions: "Assumptions", requirementHandling: "Requirements", classes: "Classes & interfaces", relationships: "Relationships", normalScenario: "Normal walkthrough", failureScenario: "Failure walkthrough", tradeoff: "Trade-offs" };
export const designSectionOrder = Object.keys(sectionLabels) as SectionId[];
export function firstUnansweredQuestionIndex(questions: readonly { variant: { id: string } }[], answers: Record<string, string | null>) {
  const index = questions.findIndex(({ variant }) => answers[variant.id] == null);
  return index < 0 ? 0 : index;
}
export function designSectionProgress(incompleteSections: readonly SectionId[]) {
  const incomplete = new Set(incompleteSections);
  return designSectionOrder.map(id => ({ id, complete: !incomplete.has(id) }));
}
export function emptyDesign(content: PublicProblemSnapshot): StructuredDesign {
  return { assumptions: "", requirementHandling: content.requirements.map(({ id }) => ({ requirementId: id, response: "" })), classes: [], relationships: [], normalScenario: { title: "", steps: [] }, failureScenario: { title: "", steps: [] }, tradeoff: { chosen: "", alternative: "", justification: "" } };
}
export function newDraft(content: PublicProblemSnapshot, mode: PracticeMode): AttemptData {
  const now = clock.now();
  return AttemptDataSchema.parse({
    id: ids.next(),
    parentAttemptId: null,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    mode,
    content,
    draftDesign: mode === "comprehensive" ? emptyDesign(content) : null,
    draftAnswers: Object.fromEntries(content.questions.map(({ variant }) => [variant.id, null])),
    learnerRequirementNotes: [],
    scratchpad: "",
    scratchpadCanvas: [],
    snapshot: null,
    mcq: { status: "pending" },
    design: { status: mode === "comprehensive" ? "pending" : "not_required" },
    reviewSession: null,
    runs: [],
  });
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
