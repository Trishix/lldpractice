"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Language, PracticeMode } from "@/domain/types";
import { usePractice } from "@/ui/provider";
import { Shell } from "@/ui/shell";
import { languages, newDraft } from "@/ui/model";
export default function Catalogue({ initialProblem, problems }: {
    initialProblem: string | null;
    problems: import("@/domain/types").PublicProblemSnapshot[];
}) {
    const { preferences, runtime, state, editable } = usePractice();
    const [selected, setSelected] = useState<string | null>(initialProblem);
    const [error, setError] = useState("");
    const starting = useRef(false);
    const router = useRouter();
    const start = (problemId: string) => {
        if (starting.current)
            return;
        starting.current = true;
        try {
            const content = problems.find(p => p.problemId === problemId && p.language === preferences.language)!;
            const attempt = newDraft(content, preferences.mode);
            runtime.repository.stage({ attempts: [...runtime.repository.getState().data.attempts, attempt] });
            router.push(`/attempts/${attempt.id}`);
        }
        catch {
            setError("The attempt could not be created. Check browser storage access.");
            starting.current = false;
        }
    };
    return <Shell><section className="page-heading"><p className="eyebrow">Design practice</p><h1 data-route-heading tabIndex={-1}>Practice low-level design</h1><p>Turn requirements into a design you can explain. Submit it, inspect the feedback, and try again.</p></section><div className="catalogue-heading"><h2>Choose your problem</h2><span>2 problems · 3 languages</span></div><div className="problem-list">{problems.filter(p => p.language === "java").map((p, index) => {
            const attempts = state.data.attempts.filter(a => a.content.problemId === p.problemId);
            const drafts = attempts.filter(a => a.status === "draft");
            return <article className="problem" id={p.problemId} key={p.problemId}><div className="problem-title"><span className="problem-number">0{index + 1}</span><h2>{p.title}</h2></div><p>{p.introduction}</p><p className="meta">20 questions · {index === 0 ? "Turn ownership, legal moves, terminal state" : "Exact landing, transitions, collaborators"}</p><div className="actions"><button aria-expanded={selected === p.problemId} onClick={() => setSelected(selected === p.problemId ? null : p.problemId)}>{selected === p.problemId ? "Close setup" : "Open setup"}</button>{drafts.length === 1 && <Link href={`/attempts/${drafts[0].id}`}>Resume draft</Link>}{drafts.length > 1 && <Link href="/history">{drafts.length} drafts</Link>}<small>{attempts.length} saved attempts</small></div>{selected === p.problemId && <div className="setup"><fieldset><legend>Practice mode</legend>{(["mcq_only", "comprehensive"] as PracticeMode[]).map(mode => <label className="choice" key={mode}><input type="radio" name="mode" value={mode} checked={preferences.mode === mode} onChange={() => preferences.setMode(mode)}/><span>{mode === "mcq_only" ? "Quick practice" : "Full practice"}<small>{mode === "mcq_only" ? "20 MCQs · knowledge score out of 100" : "Guided design + 20 MCQs · combined score out of 150"}</small></span></label>)}</fieldset><label>Language<select value={preferences.language} onChange={e => preferences.setLanguage(e.target.value as Language)}>{Object.entries(languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="meta">Language and mode stay fixed for this attempt. Full practice can be drafted before setting up AI access.</p><button className="primary" disabled={!editable} onClick={() => start(p.problemId)}>Start practice</button></div>}</article>;
        })}</div>{error && <p role="alert">{error}</p>}</Shell>;
}
