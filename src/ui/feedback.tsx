"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { AttemptData, ClarificationAnswer, DesignReport, EvidenceReference, Finding, EvaluationComponent } from "@/domain/types";
import { DefaultScorePolicy } from "@/domain/score-policy";
import { DesignSection, evidenceDescription } from "./design-reading";
import { sectionLabels } from "./model";

const findingLabels = {
  contradiction: "Contradiction",
  not_demonstrated: "Not demonstrated",
  tradeoff: "Trade-off",
} as const;

const stableIdPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");

export function Evidence({ reference, attempt, evidenceId }: { reference: EvidenceReference; attempt: AttemptData; evidenceId: string }) {
  const { label: objectLabel, value } = evidenceDescription(reference, attempt);
  const sectionLabel = reference.section === "clarification" ? "Clarification" : sectionLabels[reference.section];
  const instanceId = stableIdPart(useId());
  const targetId = `frozen-evidence-${stableIdPart(attempt.id)}-${instanceId}-${stableIdPart(evidenceId)}`;
  const target = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) requestAnimationFrame(() => {
      target.current?.scrollIntoView({ block: "center" });
      target.current?.focus({ preventScroll: true });
    });
  };
  return <div className="evidence">
    <small>{sectionLabel}{objectLabel ? ` / ${objectLabel}` : ""}{reference.field !== "$section" ? ` / ${reference.field.replace(/([A-Z])/g, " $1").toLowerCase()}` : " · section"}</small>
    {reference.quote && <blockquote>{reference.quote}</blockquote>}
    <button className="evidence-action" type="button" aria-expanded={open} aria-controls={targetId} onClick={toggle}>{open ? "Hide frozen evidence" : "View frozen evidence"}</button>
    <div ref={target} id={targetId} className="evidence-target" tabIndex={-1} hidden={!open}>
      {reference.field === "$section" && reference.section !== "clarification"
        ? <DesignSection design={attempt.snapshot?.design} section={reference.section} attempt={attempt}/>
        : <p className="source-value">{value ?? "No answer recorded."}</p>}
    </div>
  </div>;
}

function FindingArticle({ finding, attempt, evidenceId }: { finding: Finding; attempt: AttemptData; evidenceId: string }) {
  return <article className="finding">
    <p className="eyebrow">{findingLabels[finding.kind]}</p>
    <h4>{finding.judgment}</h4>
    {finding.evidence.map((reference, index) => <Evidence key={index} reference={reference} attempt={attempt} evidenceId={`${evidenceId}-${index}`}/>) }
    <p><strong>Consequence:</strong> {finding.consequence}</p>
    <p><strong>Revision:</strong> {finding.suggestion}</p>
    {finding.requirementIds.length > 0 && <ul>{finding.requirementIds.map(id => <li key={id}>{attempt.content.requirements.find(requirement => requirement.id === id)?.text}</li>)}</ul>}
  </article>;
}

export function Report({ report, attempt }: { report: DesignReport; attempt: AttemptData }) {
  const findingsById = new Map(report.assessment.findings.map(finding => [finding.id, finding]));
  const priorities = report.assessment.priorityFindingIds.slice(0, 3).map(id => findingsById.get(id)).filter((finding): finding is Finding => Boolean(finding));
  const priorityIds = new Set(priorities.map(finding => finding.id));
  const remaining = report.assessment.findings.filter(finding => !priorityIds.has(finding.id));
  return <>
    <section className="feedback-strengths">
      <h3>What works</h3>
      {report.assessment.strengths.length === 0 && <p>No strengths were returned for this submission.</p>}
      {report.assessment.strengths.map((strength, index) => <article key={index}>
        <p>{strength.text}</p>
        {strength.evidence.map((reference, evidenceIndex) => <Evidence key={evidenceIndex} reference={reference} attempt={attempt} evidenceId={`strength-${index}-${evidenceIndex}`}/>) }
      </article>)}
    </section>
    <section className="feedback-priorities">
      <h3>Priority improvements</h3>
      {priorities.length === 0 && <p>No priority findings were returned for this submission.</p>}
      {priorities.map((finding, index) => <FindingArticle key={finding.id} finding={finding} attempt={attempt} evidenceId={`priority-${index}`}/>) }
    </section>
    <details className="feedback-rubric disclosure">
      <summary>Detailed rubric · {report.assessment.criteria.length} criteria</summary>
      <div className="criteria">{report.assessment.criteria.map(criterion => <article key={criterion.criterionId}>
        <div className="criterion-heading"><h3>{criterion.criterionId === "tradeoffs" ? "Trade-offs" : criterion.criterionId}</h3><strong>{criterion.rating} / 4</strong></div>
        <p>{criterion.rationale}</p>
        {criterion.evidence.map((reference, index) => <Evidence key={index} reference={reference} attempt={attempt} evidenceId={`rubric-${criterion.criterionId}-${index}`}/>) }
      </article>)}</div>
    </details>
    {remaining.length > 0 && <details className="feedback-remaining disclosure">
      <summary>More findings · {remaining.length}</summary>
      {remaining.map((finding, index) => <FindingArticle key={finding.id} finding={finding} attempt={attempt} evidenceId={`remaining-${index}`}/>) }
    </details>}
    <p className="meta">AI feedback is an assessment to inspect, not an authoritative grade. Ratings use five anchored criteria; each level contributes 2.5 marks.</p>
  </>;
}

const componentStatus = (component: "mcq" | "design", status: string) => {
  if (status === "running") return component === "mcq" ? "Scoring MCQs…" : "Reviewing design…";
  return statusLabel(status);
};

export function Scores({ attempt }: { attempt: AttemptData }) {
  const overall = new DefaultScorePolicy().overall(attempt.mcq, attempt.design);
  const mcqResult = attempt.mcq.status === "succeeded" ? attempt.mcq.result : null;
  const mcqMaximum = (attempt.snapshot?.answers ? Object.keys(attempt.snapshot.answers).length : attempt.content.questions.length) * 5;
  return <div className="scores" aria-live="polite">
    {mcqResult?.tracks && <>
      <div><span>System design</span><small>10 fundamentals</small><strong>{mcqResult.tracks.system_design.marks} / 50</strong><span className="score-percentage">{mcqResult.tracks.system_design.percentage}%</span></div>
      <div><span>Problem OOP</span><small>10 problem-specific snippets</small><strong>{mcqResult.tracks.problem_oop.marks} / 50</strong><span className="score-percentage">{mcqResult.tracks.problem_oop.percentage}%</span></div>
    </>}
    <div><span>MCQ total</span><small>Answer-key scored</small><strong>{mcqResult ? `${mcqResult.marks} / ${mcqMaximum}` : componentStatus("mcq", attempt.mcq.status)}</strong>{mcqResult && <span className="score-percentage">{mcqResult.percentage}%</span>}</div>
    {attempt.mode === "comprehensive" && <>
      <div>
        <span>Design score</span>
        <small>AI-assessed</small>
        <strong>{attempt.design.status === "succeeded" ? `${attempt.design.report.marks} / 50` : componentStatus("design", attempt.design.status)}</strong>
      </div>
      <div><span>Combined score</span><strong>{overall === null ? "Pending" : `${overall} / ${mcqMaximum + 50}`}</strong></div>
    </>}
  </div>;
}

export function statusLabel(status: string) {
  return ({ pending: "Not evaluated", running: "Evaluating…", failed: "Failed", interrupted: "Interrupted", awaiting_clarification: "Clarification needed", not_required: "Not required", succeeded: "Complete" } as Record<string, string>)[status] ?? status;
}

export function Feedback({ attempt, editable, busy, run, onRetry, onRestart, onClarify, onRevise, onEvaluate, onEvaluateAll, designReviewAvailable = true }: {
  attempt: AttemptData;
  editable: boolean;
  busy: boolean;
  run(action: () => Promise<unknown>): void;
  onRetry(component: "mcq" | "design"): Promise<void>;
  onRestart(): Promise<void>;
  onClarify(answers: ClarificationAnswer[]): Promise<void>;
  onRevise(): void;
  onEvaluate(component: EvaluationComponent): Promise<void>;
  onEvaluateAll?: () => Promise<void>;
  designReviewAvailable?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skips, setSkips] = useState<Record<string, boolean>>({});
  const clarification = attempt.design.status === "awaiting_clarification" ? attempt.design.request : null;
  const evaluationPending = attempt.mcq.status === "pending" || attempt.design.status === "pending";
  const mcqPending = attempt.mcq.status === "pending";
  const designPending = attempt.mode === "comprehensive" && attempt.design.status === "pending";
  return <section className="feedback">
    <h2>Feedback</h2>
    <p>Your submission is frozen. Evaluation uses this saved version; a revision creates a separate draft.</p>
    <Scores attempt={attempt}/>
    {busy && <p role="status" className="notice">Evaluation in progress. You can stay here while the results arrive.</p>}
    {evaluationPending && <section className="evaluation-handoff">
      <h3>Ready to evaluate</h3>
      <p>{attempt.mode === "comprehensive"
        ? "Knowledge scoring checks your answers against the answer key. Design review separately sends your frozen design through the application server to Groq for AI assessment; the two results may finish independently."
        : "Knowledge scoring checks your frozen answers against the answer key. Quick practice does not send a design for AI assessment."}</p>
      <div className="actions">
        {onEvaluateAll && mcqPending && <button className="primary" disabled={!editable || busy} onClick={() => run(onEvaluateAll)}>Evaluate submission</button>}
        {mcqPending && !onEvaluateAll && <button className="primary" disabled={!editable || busy} onClick={() => run(() => onEvaluate("mcq"))}>Score MCQs</button>}
        {designPending && !(onEvaluateAll && mcqPending && designReviewAvailable) && (designReviewAvailable
          ? <button disabled={!editable || busy} onClick={() => run(() => onEvaluate("design"))}>Review design with Groq</button>
          : <p role="status">Design review is unavailable. <Link href="/settings">Review AI access in Settings</Link>.</p>)}
      </div>
    </section>}
    {(["mcq", "design"] as const).map(component => {
      const evaluation = attempt[component];
      return (evaluation.status === "failed" || evaluation.status === "interrupted") && <div className="notice" key={component} role="alert">
        <h3>{component === "mcq" ? "MCQ scoring" : "Design review"} {statusLabel(evaluation.status).toLowerCase()}</h3>
        <p>{evaluation.error.message}</p>
        {evaluation.error.retryAfterSeconds && <p>Wait {evaluation.error.retryAfterSeconds} seconds before trying again.</p>}
        <div className="actions">
          {evaluation.error.retryable && <button disabled={!editable || busy} onClick={() => run(() => onRetry(component))}>Retry {component === "mcq" ? "MCQ scoring" : "design review"}</button>}
          {component === "design" && <><Link href="/settings">Review access settings</Link><button disabled={!editable || busy} onClick={() => run(onRestart)}>Restart design review</button></>}
        </div>
        {evaluation.error.requestId && <small>Support reference: {evaluation.error.requestId}</small>}
      </div>;
    })}
    {clarification && <section className="clarification">
      <h3>One clarification round</h3>
      <p>Answer or explicitly skip each question. Your choices are saved before the final review, which cannot ask more questions.</p>
      {clarification.questions.map((question, index) => <fieldset key={question.id} disabled={busy || !editable}>
        <legend>{index + 1}. {question.text}</legend>
        <Evidence reference={question.reference} attempt={attempt} evidenceId={`clarification-${question.id}`}/>
        <label>Your answer<textarea maxLength={2000} disabled={skips[question.id]} rows={3} value={answers[question.id] ?? ""} onChange={event => setAnswers({ ...answers, [question.id]: event.target.value })}/></label>
        <label className="choice"><input type="checkbox" checked={skips[question.id] ?? false} onChange={event => setSkips({ ...skips, [question.id]: event.target.checked })}/>Skip this question</label>
      </fieldset>)}
      <button className="primary" disabled={busy || !editable || !clarification.questions.every(question => skips[question.id] || answers[question.id]?.trim())} onClick={() => run(() => onClarify(clarification.questions.map(question => skips[question.id] ? { questionId: question.id, status: "skipped" } : { questionId: question.id, status: "answered", answer: answers[question.id].trim() })))}>Save answers & final review</button>
    </section>}
    {attempt.design.status === "succeeded" && <Report report={attempt.design.report} attempt={attempt}/>}
    {attempt.mcq.status === "succeeded" && <section>
      <h3>Answer review</h3>
      {attempt.mcq.result.questions.map((question, index) => {
        const variant = attempt.content.questions.find(item => item.variant.id === question.variantId)!.variant;
        return <details className="disclosure" key={question.variantId}>
          <summary>{question.track === "system_design" ? "System design" : "Problem OOP"} · Question {index + 1} · {question.awardedMarks} / 5 · {question.selectedOptionId === null ? "Unanswered" : question.awardedMarks ? "Correct" : "Incorrect"}</summary>
          <p><strong>Assumptions:</strong> {variant.assumptions}</p>
          <pre tabIndex={0} aria-label="Question code"><code>{variant.snippet}</code></pre>
          <p><strong>Question:</strong> {variant.prompt}</p>
          {variant.options.map(option => <div key={option.id}><p><strong>{option.text}</strong>{option.id === question.correctOptionId ? " · Correct answer" : ""}{option.id === question.selectedOptionId ? " · Your answer" : ""}</p><p>{question.rationaleByOptionId[option.id]}</p></div>)}
        </details>;
      })}
      <details className="disclosure"><summary>Reference approach</summary><div className="reference-design">{attempt.mcq.result.referenceDesign}</div></details>
    </section>}
    <div className="actions"><button disabled={!editable || busy || attempt.mcq.status === "running" || attempt.design.status === "running"} className="primary" onClick={onRevise}>Create revision</button><Link href="/history">View history</Link></div>
    <details className="disclosure"><summary>Evaluation history · {attempt.runs.length} runs</summary>{attempt.runs.length === 0 ? <p>This submission has not been evaluated.</p> : <ul>{attempt.runs.map(runRecord => <li key={runRecord.id}>{runRecord.phase === "mcq" ? "MCQ scoring" : `${runRecord.phase === "initial" ? "Initial" : "Final"} design review`} · {statusLabel(runRecord.outcome)} · {new Date(runRecord.startedAt).toLocaleString()}</li>)}</ul>}</details>
  </section>;
}
