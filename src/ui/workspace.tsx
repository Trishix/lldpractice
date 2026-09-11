"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Attempt, DefaultSubmissionValidator } from "@/domain/attempt";
import type { AttemptData, QuestionTrack, SectionId, StructuredDesign, ScratchpadCanvasItem } from "@/domain/types";
import { usePractice } from "./provider";
import { Shell } from "./shell";
import { DesignEditor, Uml } from "./design-editor";
import { ScratchpadCanvas } from "./scratchpad-canvas";
import type { ScratchpadCanvasState } from "./scratchpad-model";
import { Feedback, Report, Scores } from "./feedback";
import { clock, designSectionOrder, designSectionProgress, firstUnansweredQuestionIndex, ids, languages, sectionLabels } from "./model";
export default function Workspace({ attemptId }: {
    attemptId: string;
}) {
    const { runtime, state, editable, preferences, credentials } = usePractice();
    const attempt = state.data.attempts.find(a => a.id === attemptId);
    const [tab, setTab] = useState("start");
    const [ack, setAck] = useState(false);
    const [busy, setBusy] = useState(false);
    const guard = useRef(false);
    const [error, setError] = useState("");
    const [questionIndex, setQuestionIndex] = useState(() => attempt ? firstUnansweredQuestionIndex(attempt.content.questions, attempt.draftAnswers) : 0);
    const [designSection, setDesignSection] = useState<SectionId>("assumptions");
    const questionHeading = useRef<HTMLHeadingElement>(null);
    const router = useRouter();
    if (!attempt)
        return <Shell><section className="page-heading"><h1 data-route-heading tabIndex={-1}>Attempt not found</h1><p>This attempt is not stored in this browser. Restore its backup in Settings or start a new practice.</p><Link href="/">Choose a problem</Link></section></Shell>;
    const parent = state.data.attempts.find(a => a.id === attempt.parentAttemptId);
    const activeTab = tab === "start" ? attempt.status === "submitted" ? "review" : attempt.mode === "comprehensive" ? "design" : "mcqs" : tab;
    const draft = attempt.status === "draft";
    const canEdit = editable && draft && !busy;
    const design = draft ? attempt.draftDesign : attempt.snapshot?.design;
    const answers = draft ? attempt.draftAnswers : attempt.snapshot!.answers;
    const answered = Object.values(answers).filter(Boolean).length;
    const trackLabels: Record<QuestionTrack, string> = { system_design: "System design", problem_oop: "Problem OOP" };
    const trackIndexes = (track: QuestionTrack) => attempt.content.questions.flatMap((question, index) => question.track === track ? [index] : []);
    const trackProgress = (["system_design", "problem_oop"] as const).map(track => {
        const indexes = trackIndexes(track);
        return { track, label: trackLabels[track], indexes, answered: indexes.filter(index => Boolean(answers[attempt.content.questions[index]!.variant.id])).length };
    }).filter(({ indexes }) => indexes.length > 0);
    const currentQuestion = attempt.content.questions[questionIndex]!;
    const currentTrackIndexes = trackIndexes(currentQuestion.track);
    const currentTrackPosition = currentTrackIndexes.indexOf(questionIndex) + 1;
    const nextQuestion = attempt.content.questions[questionIndex + 1];
    const nextQuestionLabel = nextQuestion && nextQuestion.track !== currentQuestion.track ? `Continue to ${trackLabels[nextQuestion.track]}` : "Next question";
    const validation = new DefaultSubmissionValidator().validate(attempt);
    const omissions = validation.incompleteSections.length + validation.unansweredQuestionIds.length;
    const designProgress = designSectionProgress(validation.incompleteSections);
    const canvasValue: ScratchpadCanvasState = { items: attempt.scratchpadCanvas.map(item => ({ ...item, kind: item.kind === "sticky" ? "note" : item.kind === "rectangle" ? "box" : item.kind === "text" ? "note" : "arrow", color: (item.color as "yellow" | "blue" | "pink" | "white") })), scale: 1, offsetX: 0, offsetY: 0 };
    const updateCanvas = (next: ScratchpadCanvasState) => { const current = runtime.repository.read(attemptId)!; const items: ScratchpadCanvasItem[] = next.items.map(item => ({ ...item, kind: item.kind === "note" ? "sticky" : item.kind === "box" ? "rectangle" : item.kind })); stage({ ...current, scratchpadCanvas: items, updatedAt: clock.now() }); };
    const focusQuestion = (index: number) => {
        setQuestionIndex(index);
        requestAnimationFrame(() => {
            document.querySelector(".question-body")?.scrollTo(0, 0);
            questionHeading.current?.focus({ preventScroll: true });
        });
    };
    const focusDesignSection = (section: SectionId) => {
        setDesignSection(section);
        requestAnimationFrame(() => {
            const heading = document.querySelector<HTMLElement>(`#${section} > h2`);
            document.querySelector(".design-body")?.scrollTo(0, 0);
            heading?.focus({ preventScroll: true });
        });
    };
    const run = (action: () => Promise<unknown>) => {
        if (guard.current)
            return;
        guard.current = true;
        setBusy(true);
        setError("");
        void action().catch(e => setError(e instanceof Error ? e.message : "The action could not be completed.")).finally(() => { guard.current = false; setBusy(false); });
    };
    const stage = (next: AttemptData) => {
        runtime.repository.stageAttempt(attemptId, next);
        setAck(false);
    };
    const editDesign = (next: StructuredDesign) => { try {
        const model = new Attempt(runtime.repository.read(attemptId)!, clock, ids);
        model.editDesign(next);
        stage(model.toData());
        setError("");
    }
    catch {
        setError("This design exceeds the supported size. Shorten the last field or remove an unused item.");
    } };
    const answer = (variantId: string, optionId: string | null) => { const model = new Attempt(runtime.repository.read(attemptId)!, clock, ids); model.answer(variantId, optionId); stage(model.toData()); };
    const revise = () => { if (guard.current)
        return; guard.current = true; try {
        const next = new Attempt(runtime.repository.read(attemptId)!, clock, ids).createRevision(ids.next(), clock.now());
        runtime.repository.stage({ attempts: [...runtime.repository.getState().data.attempts, next] });
        router.push(`/attempts/${next.id}`);
    }
    catch {
        guard.current = false;
        setError("The revision could not be created. Resolve storage access first.");
    } };
    const outline = <><p className="nav-label">On this page</p><nav className="outline-links" aria-label="Section outline">{activeTab === "design" && designProgress.map(({ id, complete }) => <button key={id} aria-current={id === designSection ? "step" : undefined} onClick={() => focusDesignSection(id)}>{sectionLabels[id]} · {complete ? "complete" : "incomplete"}</button>)}{activeTab === "mcqs" && attempt.content.questions.map((q, i) => { const position = trackIndexes(q.track).indexOf(i) + 1; return <button key={q.variant.id} aria-current={i === questionIndex ? "step" : undefined} onClick={() => focusQuestion(i)}>{trackLabels[q.track]} {position}{answers[q.variant.id] ? " · answered" : ""}</button>; })}{activeTab === "review" && <p>{draft ? "Check omissions, then save your submission. Evaluation follows as a separate action." : "Read each finding against the frozen evidence before revising."}</p>}</nav><hr /><h3>Guided help</h3>{attempt.content.faq.map(f => <details className="help" key={f.question}><summary>{f.question}</summary><p>{f.answer}</p></details>)}{parent && <><hr /><p className="nav-label">Parent feedback</p><Link href={`/attempts/${parent.id}`}>Open parent submission</Link><Scores attempt={parent}/>{parent.design.status === "succeeded" ? <Report report={parent.design.report} attempt={parent}/> : <p>The parent has no completed design report.</p>}</>}</>;
    const tabs = [...(attempt.mode === "comprehensive" ? ["design", "scratchpad"] : []), "mcqs", "review"];
    return <Shell attemptId={attemptId} outline={outline}><section className="attempt-heading"><p className="eyebrow">{parent ? "Revision" : "Practice"} / {draft ? "Draft" : "Frozen submission"}</p><h1 data-route-heading tabIndex={-1}>{attempt.content.title}</h1><div className="attempt-meta"><span>{languages[attempt.content.language]}</span><span>{attempt.mode === "comprehensive" ? "Full practice" : "Quick practice"}</span><span role="status">{state.saveStatus === "saved" ? "Saved on this browser" : state.saveStatus === "dirty" ? "Unsaved changes" : state.saveStatus === "saving" ? "Saving…" : state.saveStatus === "idle" ? "Ready" : "Local save needs attention"}</span></div></section><details className="disclosure problem-brief"><summary>Problem brief & requirements</summary><p>{attempt.content.introduction}</p><ul>{attempt.content.requirements.map(r => <li key={r.id}>{r.text}</li>)}</ul><h3>Example</h3><p>{attempt.content.example}</p><h3>Out of scope</h3><ul>{attempt.content.exclusions.map(e => <li key={e}>{e}</li>)}</ul><p className="meta">Adapted from <a href={attempt.content.attribution.url} target="_blank" rel="noreferrer">the credited design collection</a>. Requirements and exercises are authored for this practice.</p></details><div className="tabs" role="tablist" aria-label="Practice sections">{tabs.map(t => <button key={t} role="tab" id={`tab-${t}`} aria-selected={activeTab === t} aria-controls={`panel-${t}`} tabIndex={activeTab === t ? 0 : -1} onKeyDown={e => { const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (delta) {
        e.preventDefault();
        const next = tabs[(tabs.indexOf(t) + delta + tabs.length) % tabs.length];
        setTab(next);
        document.getElementById(`tab-${next}`)?.focus();
    } }} onClick={() => setTab(t)}>{t === "mcqs" ? `MCQs · ${answered}/${attempt.content.questions.length}` : t === "design" ? "Design" : t === "scratchpad" ? "Scratchpad" : "Review"}</button>)}</div><details className="mobile-help disclosure"><summary>Section navigation & help</summary>{outline}</details>{error && <div className="notice" role="alert">{error}</div>}<div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
    {activeTab === "design" && design && <><div className="design-body"><DesignEditor learnerRequirementNotes={attempt.learnerRequirementNotes} onRequirementNotesChange={notes => stage({ ...runtime.repository.read(attemptId)!, learnerRequirementNotes: notes, updatedAt: clock.now() })} design={design} content={attempt.content} disabled={!canEdit} activeSection={designSection} progress={designProgress} onSectionChange={focusDesignSection} onChange={editDesign}/><Uml design={design}/></div><div className="section-footer"><button disabled={designSection === designSectionOrder[0]} onClick={() => focusDesignSection(designSectionOrder[Math.max(0, designSectionOrder.indexOf(designSection) - 1)])}>Back section</button><button className="primary" onClick={() => { const next = designSectionOrder[designSectionOrder.indexOf(designSection) + 1]; if (next)
        focusDesignSection(next);
    else
        setTab("scratchpad");  }}>{designSection === designSectionOrder.at(-1) ? "Continue to scratchpad" : "Next section"}</button></div></>}
    {activeTab === "scratchpad" && <><ScratchpadCanvas value={canvasValue} disabled={!canEdit} onChange={updateCanvas}/><div className="section-footer"><button onClick={() => setTab("design")}>Back to design</button><button className="primary" onClick={() => { setTab("mcqs");  }}>Continue to MCQs</button></div></>}
    {activeTab === "mcqs" && <section className="question"><div className="mcq-track-switch" role="group" aria-label="Question tracks">{trackProgress.map(track => <button key={track.track} type="button" aria-pressed={currentQuestion.track === track.track} onClick={() => focusQuestion(track.indexes[0]!)}>{track.label} · {track.answered}/{track.indexes.length}</button>)}</div><div className="question-heading"><h2 ref={questionHeading} tabIndex={-1}>{trackLabels[currentQuestion.track]} · Question {currentTrackPosition} of {currentTrackIndexes.length}</h2><span>5 marks · {questionIndex + 1} of {attempt.content.questions.length} overall</span></div><div className="question-body" key={currentQuestion.variant.id}><div className="question-context"><p className="assumptions"><strong>Given:</strong> {currentQuestion.variant.assumptions}</p><pre tabIndex={0} aria-label="Question code"><code>{currentQuestion.variant.snippet}</code></pre></div><div className="question-response"><fieldset disabled={!canEdit}><legend><span>Choose the best answer.</span> {currentQuestion.variant.prompt}</legend>{currentQuestion.variant.options.map(o => <label className="choice answer" key={o.id}><input type="radio" name={currentQuestion.variant.id} checked={answers[currentQuestion.variant.id] === o.id} onChange={() => answer(currentQuestion.variant.id, o.id)}/><span>{o.text}</span></label>)}</fieldset><button disabled={!canEdit || !answers[currentQuestion.variant.id]} onClick={() => answer(currentQuestion.variant.id, null)}>Clear answer</button></div></div><div className="section-footer"><button disabled={questionIndex === 0} onClick={() => focusQuestion(questionIndex - 1)}>Previous question</button>{questionIndex < attempt.content.questions.length - 1 ? <button className="primary" onClick={() => focusQuestion(questionIndex + 1)}>{nextQuestionLabel}</button> : <button className="primary" onClick={() => setTab("review")}>Review submission</button>}</div></section>}
    {activeTab === "review" && (draft ? <section><h2>Review your submission</h2><p>Saving freezes this design and these answers. You can evaluate the saved submission next.</p><div className="review-summary"><span>{answered} of {attempt.content.questions.length} questions answered</span>{trackProgress.map(track => <span key={track.track}>{track.label}: {track.answered} of {track.indexes.length}</span>)}{attempt.mode === "comprehensive" && <span>{7 - validation.incompleteSections.length} of 7 design sections complete</span>}</div>{validation.blocking.length > 0 && <div className="notice" role="alert"><h3>Resolve structural issues</h3><ul>{validation.blocking.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul><button onClick={() => setTab("design")}>Return to design</button></div>}{omissions > 0 && <div className="notice"><h3>Before you save</h3>{validation.incompleteSections.length > 0 && <p>Incomplete: {validation.incompleteSections.map(s => sectionLabels[s]).join(", ")}.</p>}{validation.unansweredQuestionIds.length > 0 && <p>{validation.unansweredQuestionIds.length} unanswered questions will receive zero marks.</p>}<label className="choice"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/>I acknowledge these omissions and want to submit this version.</label></div>}<button className="primary" disabled={!canEdit || state.access !== "writable" || validation.blocking.length > 0 || (omissions > 0 && !ack)} onClick={() => run(async () => { const result = await runtime.coordinator.saveSubmission(attemptId, { incompleteSections: validation.incompleteSections, unansweredQuestionIds: validation.unansweredQuestionIds }); if (!result.ok)
        setError("The submission was not saved. Your draft remains editable; no evaluation request was sent."); })}>Save frozen submission</button></section> : <Feedback attempt={attempt} editable={state.access === "writable"} busy={busy} run={run} designReviewAvailable={Boolean(runtime.config && (preferences.credentialMode === "user" ? credentials.key : runtime.config.platformAvailable))} onEvaluateAll={() => runtime.coordinator.evaluate(attemptId, runtime.config && (preferences.credentialMode === "user" ? credentials.key : runtime.config.platformAvailable) ? undefined : ["mcq"])} onEvaluate={component => runtime.coordinator.evaluate(attemptId, [component])} onRetry={c => runtime.coordinator.retry(attemptId, c)} onRestart={() => runtime.coordinator.restartDesignReview(attemptId)} onClarify={a => runtime.coordinator.completeClarification(attemptId, a)} onRevise={revise}/>)}</div></Shell>;
}
