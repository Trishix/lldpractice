"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePractice } from "./provider";
import { download } from "./model";
export function Shell({ children, outline, attemptId }: {
    children: React.ReactNode;
    outline?: React.ReactNode;
    attemptId?: string;
}) {
    const { state, runtime, problems } = usePractice();
    const pathname = usePathname();
    const workspace = useRef<HTMLElement>(null);
    const [menu, setMenu] = useState(false);
    const [error, setError] = useState("");
    const current = state.data.attempts.find(a => a.id === attemptId);
    const problemList = problems;
    useEffect(() => {
        const routeState = window as Window & {
            __lldPracticePathname?: string;
        };
        const routeChanged = routeState.__lldPracticePathname !== undefined && routeState.__lldPracticePathname !== pathname;
        routeState.__lldPracticePathname = pathname;
        if (!routeChanged)
            return;
        requestAnimationFrame(() => {
            const heading = workspace.current?.querySelector<HTMLElement>("[data-route-heading], .page-heading h1, .attempt-heading h1, h1");
            if (!heading)
                return;
            if (!heading.hasAttribute("tabindex"))
                heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
            
        });
    }, [pathname]);
    const nav = <><p className="nav-label">Workspace</p><nav aria-label="Main navigation">{[["/", "Practice"], ["/history", "History"], ["/settings", "Settings"]].map(([href, name]) => <Link key={href} href={href} onClick={() => setMenu(false)} aria-current={pathname === href ? "page" : undefined}>{name}</Link>)}</nav><p className="nav-label">Problems</p><nav aria-label="Problems">{problemList.map(p => <Link key={p.problemId} href={`/?problem=${p.problemId}`} onClick={() => setMenu(false)} aria-current={current?.content.problemId === p.problemId ? "true" : undefined}>{p.title}</Link>)}</nav>{current && <><p className="nav-label">Current attempt</p><Link href={`/attempts/${current.id}`} className="current-attempt">{current.parentAttemptId ? "Revision" : "Practice"} · {current.status}<br /><small>{new Date(current.createdAt).toLocaleDateString()}</small></Link></>}<p className="local-note">Saved in this browser.<br />No account needed.</p></>;
    return <><a className="skip-link" href="#workspace">Skip to workspace</a><header className="topbar"><Link href="/" className="brand" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>LLD Practice<span> / </span><small>Learn by designing</small></Link><span className="top-note">Your next design starts here.</span><button className="menu-button" aria-expanded={menu} aria-controls="mobile-navigation" onClick={() => setMenu(!menu)}>Menu</button></header><div className="shell"><aside className="left-nav">{nav}</aside>{menu && <aside id="mobile-navigation" className="mobile-nav">{nav}</aside>}<main ref={workspace} id="workspace" className={`workspace${attemptId ? " practice-workspace" : ""}`} tabIndex={-1}>
    {state.access === "readonly" && state.saveStatus !== "conflict" && !(state.saveStatus === "error" && runtime.repository.canClear()) && <div className="notice" role="status">This tab is read-only. Close the other practice tab, then <button onClick={async () => { runtime.repository.closeSession(); await runtime.repository.startSession(); }}>Take over editing</button>.</div>}
    {state.access === "readonly" && state.saveStatus === "error" && runtime.repository.canClear() && <div className="notice" role="alert">{state.saveError} <Link href="/settings">Retry clearing in Settings</Link></div>}
    {state.access === "unsupported" && <div className="notice" role="status">Memory-only drafting. Persistent submission is unavailable in this browser. Export a backup before closing.</div>}
    {state.access === "corrupt" && <div className="notice" role="alert">Saved data could not be read. Download the original data before restoring a backup or clearing it in <Link href="/settings">Settings</Link>. <button onClick={() => { const raw = runtime.repository.exportRawRecovery(); if (raw)
        download("lldpractice-recovery.txt", raw); }}>Download recovery data</button></div>}
    {(state.saveStatus === "error" || state.saveStatus === "conflict") && (state.access === "writable" || state.saveStatus === "conflict") && <div className="notice" role="alert"><strong>Local save needs attention.</strong> {state.saveError}<div className="actions">{state.access === "writable" && <button onClick={() => void runtime.repository.retrySave()}>Retry local save</button>}<button onClick={() => download("lldpractice-backup.json", runtime.repository.exportPractice())}>Export backup</button>{state.saveStatus === "conflict" && <button onClick={async () => { if (window.confirm("Reload saved data and discard unsaved changes in this tab? Export a backup first if needed.")) {
        runtime.coordinator.invalidate();
        await runtime.repository.reload();
    } }}>Reload saved data</button>}</div></div>}
    {error && <p role="alert">{error}</p>}{children}
  </main><aside className="right-panel">{outline ?? <><p className="nav-label">Practice loop</p><ol className="workflow"><li>Choose a problem</li><li>Make your design explicit</li><li>Save a frozen submission</li><li>Evaluate and read feedback</li><li>Revise with a clear reason</li></ol><hr /><h3>Your work stays yours</h3><p>Drafts, submissions, and feedback live in this browser. Export a backup to keep a copy.</p><button onClick={() => { try {
        download("lldpractice-backup.json", runtime.repository.exportPractice());
    }
    catch {
        setError("Backup could not be exported.");
    } }}>Export practice</button></>}</aside></div></>;
}
