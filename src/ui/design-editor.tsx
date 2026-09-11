"use client";

import type { DesignClass, PublicProblemSnapshot, SectionId, StructuredDesign } from "@/domain/types";
import { ids, sectionLabels } from "./model";
const learnerLabel = (label: string) => ({
  "Responsibility": "What does this collaborator own?",
  "Scenario title": "What scenario are you demonstrating?",
  "Action": "What happens?",
  "Expected outcome": "What must be true afterward?",
  "Multiplicity": "How many?",
  "Relationship explanation": "Why does this relationship exist?",
  "Chosen approach": "What approach did you choose?",
  "Alternative considered": "What credible alternative did you consider?",
  "Justification & consequences": "Why is the choice right here, and what does it cost?",
}[label] ?? label);
export function TextField({ label, value, onChange, long = false, limit = 2000 }: {
    label: string;
    value: string;
    onChange(value: string): void;
    long?: boolean;
    limit?: number;
}) {
    return <label>{learnerLabel(label)}{long ? <textarea rows={3} maxLength={limit} value={value} onChange={e => onChange(e.target.value)}/> : <input maxLength={limit} value={value} onChange={e => onChange(e.target.value)}/>}</label>;
}
export function DesignEditor({ design, content, onChange, disabled, activeSection, progress, onSectionChange, learnerRequirementNotes, onRequirementNotesChange }: {
    design: StructuredDesign;
    content: PublicProblemSnapshot;
    onChange(design: StructuredDesign): void;
    disabled: boolean;
    activeSection: SectionId;
    progress: {
        id: SectionId;
        complete: boolean;
    }[];
    onSectionChange(section: SectionId): void;
    learnerRequirementNotes: {
        id: string;
        text: string;
    }[];
    onRequirementNotesChange(notes: {
        id: string;
        text: string;
    }[]): void;
}) {
    const notes = learnerRequirementNotes;
    const updateNotes = onRequirementNotesChange;
    const edit = (mutate: (next: StructuredDesign) => void) => { const next = structuredClone(design); mutate(next); onChange(next); };
    const classOptions = (value: string, change: (id: string) => void) => <select value={value} onChange={e => change(e.target.value)}><option value="">Choose a class</option>{design.classes.map((c, i) => <option key={c.id} value={c.id}>{c.name || `Unnamed class ${i + 1}`}</option>)}</select>;
    const referencedClass = (id: string) => design.relationships.some(r => r.sourceClassId === id || r.targetClassId === id) || [design.normalScenario, design.failureScenario].some(s => s.steps.some(x => x.classId === id));
    const referencedMethod = (id: string) => [design.normalScenario, design.failureScenario].some(s => s.steps.some(x => x.methodId === id));
    const heading = (section: SectionId, children: React.ReactNode) => <h2 id={`${section}-heading`} tabIndex={-1}>{children}</h2>;
    return <>
    <nav className="design-progress" aria-label="Design worksheet progress">
      {progress.map(({ id, complete }, index) => <button key={id} aria-current={id === activeSection ? "step" : undefined} onClick={() => onSectionChange(id)}>{index + 1}. {sectionLabels[id]} · {complete ? "complete" : "incomplete"}</button>)}
    </nav>
    <fieldset className="worksheet" disabled={disabled}><legend className="sr-only">Guided design worksheet</legend>
      {activeSection === "assumptions" && <section id="assumptions">{heading("assumptions", "Assumptions")}<p>Set the boundaries your design relies on: actors, lifecycle, state ownership, and anything deliberately out of scope.</p><TextField label="What is true before the first operation?" value={design.assumptions} long limit={4000} onChange={value => edit(d => { d.assumptions = value; })}/></section>}

      {activeSection === "requirementHandling" && <section id="requirementHandling">{heading("requirementHandling", "Requirements")}<p>Turn every rule into an explicit design decision. Name the owner, the state it protects, and the result of both success and rejection.</p><div className="requirement-cards">{content.requirements.map((r, i) => { const response = design.requirementHandling.find(x => x.requirementId === r.id)?.response ?? ""; return <article className={`requirement-card${response.trim() ? " complete" : ""}`} key={r.id}><div className="requirement-card-heading"><span className="requirement-index">{String(i + 1).padStart(2, "0")}</span><div><strong>{r.text}</strong><small>{response.trim() ? "Decision captured" : "Needs your decision"}</small></div></div><label>Which object enforces this, and what happens on success or rejection?<textarea rows={4} maxLength={2000} value={response} onChange={event => edit(d => { const found = d.requirementHandling.find(x => x.requirementId === r.id); if (found)
        found.response = event.target.value;
    else
        d.requirementHandling.push({ requirementId: r.id, response: event.target.value }); })}/></label></article>; })}</div><div className="requirement-note"><strong>Add a design note</strong><p className="meta">Capture a learner assumption or open question. Notes stay private to this draft and are not treated as trusted requirements.</p>{notes.map(note => <label key={note.id}>Note<textarea rows={2} maxLength={2000} value={note.text} disabled={disabled} onChange={event => updateNotes(notes.map(item => item.id === note.id ? { ...item, text: event.target.value } : item))}/></label>)}{notes.map((note, index) => <button type="button" key={note.id} disabled={disabled} onClick={() => updateNotes(notes.filter(item => item.id !== note.id))}>Remove note {index + 1}</button>)}<button type="button" disabled={disabled || notes.length >= 50} onClick={() => updateNotes([...notes, { id: ids.next(), text: "" }])}>Add requirement note</button></div></section>}

      {activeSection === "classes" && <section id="classes">{heading("classes", "Classes & interfaces")}<p>Give each collaborator one clear job. Add only the state and contracts another object needs to use it correctly.</p>{design.classes.length === 0 && <p className="empty-inline">No classes yet. Start with one responsibility.</p>}{design.classes.map((c, ci) => <details className="editor-item" key={c.id}><summary>{c.name || `Class ${ci + 1}`} <small>· {c.kind} · {c.methods.length} methods</small></summary><div className="field-stack"><div className="form-row"><TextField label="Class name" value={c.name} limit={120} onChange={value => edit(d => { d.classes[ci].name = value; })}/><label>Kind<select value={c.kind} onChange={e => edit(d => { d.classes[ci].kind = e.target.value as DesignClass["kind"]; })}><option value="class">Class</option><option value="interface">Interface</option></select></label></div><TextField label="What does this collaborator own?" value={c.responsibility} long onChange={value => edit(d => { d.classes[ci].responsibility = value; })}/>
        <h3>Fields</h3>{c.fields.map((f, fi) => <div className="subitem" key={f.id}><div className="form-row"><TextField label="Field name" value={f.name} limit={120} onChange={value => edit(d => { d.classes[ci].fields[fi].name = value; })}/><TextField label="Field type" value={f.type} limit={120} onChange={value => edit(d => { d.classes[ci].fields[fi].type = value; })}/><label>Visibility<select value={f.visibility} onChange={e => edit(d => { d.classes[ci].fields[fi].visibility = e.target.value as typeof f.visibility; })}>{["private", "protected", "public"].map(v => <option key={v}>{v}</option>)}</select></label></div><button onClick={() => edit(d => { d.classes[ci].fields.splice(fi, 1); })}>Remove field {f.name}</button></div>)}<button disabled={disabled || c.fields.length >= 20} onClick={() => edit(d => { d.classes[ci].fields.push({ id: ids.next(), name: "", type: "", visibility: "private" }); })}>Add field</button>
        <h3>Methods & contracts</h3>{c.methods.map((m, mi) => <div className="subitem" key={m.id}><div className="form-row"><TextField label="Method name" value={m.name} limit={120} onChange={value => edit(d => { d.classes[ci].methods[mi].name = value; })}/><TextField label="Return type" value={m.returnType} limit={120} onChange={value => edit(d => { d.classes[ci].methods[mi].returnType = value; })}/></div><TextField label="Contract: preconditions, outcome, rejected inputs" value={m.contract} long onChange={value => edit(d => { d.classes[ci].methods[mi].contract = value; })}/>{m.parameters.map((p, pi) => <div className="form-row" key={p.id}><TextField label="Parameter name" value={p.name} limit={120} onChange={value => edit(d => { d.classes[ci].methods[mi].parameters[pi].name = value; })}/><TextField label="Parameter type" value={p.type} limit={120} onChange={value => edit(d => { d.classes[ci].methods[mi].parameters[pi].type = value; })}/><button onClick={() => edit(d => { d.classes[ci].methods[mi].parameters.splice(pi, 1); })}>Remove parameter</button></div>)}<div className="actions"><button disabled={disabled || m.parameters.length >= 10} onClick={() => edit(d => { d.classes[ci].methods[mi].parameters.push({ id: ids.next(), name: "", type: "" }); })}>Add parameter</button><button disabled={disabled || referencedMethod(m.id)} onClick={() => edit(d => { d.classes[ci].methods.splice(mi, 1); })}>Remove method {m.name}</button></div>{referencedMethod(m.id) && <p className="meta">Reassign or remove its walkthrough steps before deleting this method.</p>}</div>)}<button disabled={disabled || c.methods.length >= 20} onClick={() => edit(d => { d.classes[ci].methods.push({ id: ids.next(), name: "", parameters: [], returnType: "", contract: "" }); })}>Add method</button>
        <button disabled={disabled || referencedClass(c.id)} onClick={() => edit(d => { d.classes.splice(ci, 1); })}>Remove class {c.name}</button>{referencedClass(c.id) && <p className="meta">Reassign or remove its relationships and walkthrough steps before deleting this class.</p>}</div></details>)}<button disabled={disabled || design.classes.length >= 30} onClick={() => edit(d => { d.classes.push({ id: ids.next(), kind: "class", name: "", responsibility: "", fields: [], methods: [] }); })}>Add class or interface</button></section>}

      {activeSection === "relationships" && <section id="relationships">{heading("relationships", "Relationships")}{<p>Show how collaborators work together. Use the explanation to make ownership, lifetime, and dependency direction unambiguous.</p>}{design.relationships.map((r, ri) => <div className="editor-item field-stack" key={r.id}><div className="form-row"><label>Owner or source{classOptions(r.sourceClassId, value => edit(d => { d.relationships[ri].sourceClassId = value; }))}</label><label>Collaborator or target{classOptions(r.targetClassId, value => edit(d => { d.relationships[ri].targetClassId = value; }))}</label></div><div className="form-row"><label>Relationship kind<select value={r.kind} onChange={e => edit(d => { d.relationships[ri].kind = e.target.value as typeof r.kind; })}>{["association", "dependency", "aggregation", "composition", "inheritance", "implementation"].map(v => <option key={v}>{v}</option>)}</select></label><TextField label="How many?" value={r.multiplicity} limit={120} onChange={value => edit(d => { d.relationships[ri].multiplicity = value; })}/></div><TextField label="Why does this relationship exist?" value={r.explanation} long onChange={value => edit(d => { d.relationships[ri].explanation = value; })}/><button onClick={() => edit(d => { d.relationships.splice(ri, 1); })}>Remove relationship</button></div>)}<button disabled={disabled || design.classes.length < 1 || design.relationships.length >= 60} onClick={() => edit(d => { d.relationships.push({ id: ids.next(), sourceClassId: "", targetClassId: "", kind: "association", multiplicity: "", explanation: "" }); })}>Add relationship</button>{design.classes.length === 0 && <p className="meta">Add classes to connect them.</p>}</section>}

      {(["normalScenario", "failureScenario"] as const).map(section => activeSection === section && <section id={section} key={section}>{heading(section, sectionLabels[section])}<p>{content.scenarioPrompts[section === "normalScenario" ? "normal" : "failure"]}</p><TextField label="Scenario title" value={design[section].title} onChange={value => edit(d => { d[section].title = value; })}/>{design[section].steps.map((step, si) => <div className="editor-item field-stack" key={step.id}><h3>Step {si + 1}</h3><div className="form-row"><label>Acting class{classOptions(step.classId, value => edit(d => { d[section].steps[si].classId = value; d[section].steps[si].methodId = ""; }))}</label><label>Method<select value={step.methodId} onChange={e => edit(d => { d[section].steps[si].methodId = e.target.value; })}><option value="">Choose a method</option>{design.classes.find(c => c.id === step.classId)?.methods.map((m, i) => <option key={m.id} value={m.id}>{m.name || `Unnamed method ${i + 1}`}</option>)}</select></label></div><TextField label="Action" value={step.action} long onChange={value => edit(d => { d[section].steps[si].action = value; })}/><TextField label="Expected outcome" value={step.expectedOutcome} long onChange={value => edit(d => { d[section].steps[si].expectedOutcome = value; })}/><div className="actions"><button disabled={disabled || si === 0} onClick={() => edit(d => { const steps = d[section].steps; [steps[si - 1], steps[si]] = [steps[si], steps[si - 1]]; })}>Move step up</button><button onClick={() => edit(d => { d[section].steps.splice(si, 1); })}>Remove step</button></div></div>)}<button disabled={disabled || design[section].steps.length >= 30 || !design.classes.some(c => c.methods.length)} onClick={() => edit(d => { d[section].steps.push({ id: ids.next(), classId: "", methodId: "", action: "", expectedOutcome: "" }); })}>Add {section === "normalScenario" ? "normal" : "failure"} step</button>{!design.classes.some(c => c.methods.length) && <p className="meta">Add a class method before building a walkthrough.</p>}</section>)}

        {activeSection === "tradeoff" && <section id="tradeoff">{heading("tradeoff", "Trade-offs")}<p>Make one design decision visible. Explain what it buys you, what it costs, and when you would revisit it.</p>{(["chosen", "alternative", "justification"] as const).map(key => <TextField key={key} label={{ chosen: "What approach did you choose?", alternative: "What credible alternative did you consider?", justification: "Why is the choice right here, and what does it cost?" }[key]} value={design.tradeoff[key]} long limit={4000} onChange={value => edit(d => { d.tradeoff[key] = value; })}/>)}</section>}
    </fieldset>
  </>;
}
export function Uml({ design }: {
    design: StructuredDesign;
}) {
    const className = (id: string) => design.classes.find(c => c.id === id)?.name || "Unnamed class";
    return <details className="disclosure"><summary>Generated UML · from your worksheet</summary>{design.classes.length === 0 ? <p>Add classes to generate a diagram.</p> : <><div className="uml" aria-label="Class diagram">{design.classes.map(c => <article key={c.id}><h3>{c.kind === "interface" ? "«interface» " : ""}{c.name || "Unnamed class"}</h3><p>{c.responsibility || "Responsibility not specified"}</p>{c.fields.map(f => <div key={f.id}>{f.visibility === "private" ? "−" : "+"} {f.name}: {f.type}</div>)}<hr />{c.methods.map(m => <div key={m.id}>+ {m.name}({m.parameters.map(p => `${p.name}: ${p.type}`).join(", ")}): {m.returnType}</div>)}</article>)}</div><ul>{design.relationships.map(r => <li key={r.id}>{className(r.sourceClassId)} → {className(r.targetClassId)} · {r.kind} ({r.multiplicity || "multiplicity unspecified"})<p>{r.explanation}</p></li>)}</ul></>}</details>;
}
