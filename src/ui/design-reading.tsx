import type { AttemptData, EvidenceReference, SectionId, StructuredDesign } from "@/domain/types";
import { resolveEvidenceReference } from "@/domain/evidence";

export function evidenceDescription(reference: EvidenceReference, attempt: AttemptData) {
  const design = attempt.snapshot?.design;
  if (!design) return { label: "Frozen submission", value: undefined };
  const className = (id: string) => design.classes.find(c => c.id === id)?.name || "Unnamed class";
  let label = "";
  for (const c of design.classes) {
    if (c.id === reference.objectId) label = c.name || "Unnamed class";
    for (const f of c.fields) if (f.id === reference.objectId) label = `${c.name}.${f.name}`;
    for (const m of c.methods) {
      if (m.id === reference.objectId) label = `${c.name}.${m.name}()`;
      for (const p of m.parameters) if (p.id === reference.objectId) label = `${c.name}.${m.name}() parameter ${p.name}`;
    }
  }
  if (reference.section === "requirementHandling") {
    const index = attempt.content.requirements.findIndex(r => r.id === reference.objectId);
    if (index >= 0) label = `Requirement ${index + 1}: ${attempt.content.requirements[index].text}`;
  }
  if (reference.section === "relationships") {
    const r = design.relationships.find(r => r.id === reference.objectId);
    if (r) label = `${className(r.sourceClassId)} → ${className(r.targetClassId)}`;
  }
  if (reference.section === "normalScenario" || reference.section === "failureScenario") {
    const index = design[reference.section].steps.findIndex(s => s.id === reference.objectId);
    if (index >= 0) label = `Step ${index + 1}: ${className(design[reference.section].steps[index].classId)}`;
  }
  if (reference.section === "clarification") label = attempt.reviewSession?.clarification?.questions.find(q => q.id === reference.objectId)?.text ?? "Clarification round";
  let value = resolveEvidenceReference(reference, { design, requirements: attempt.content.requirements, clarification: attempt.reviewSession?.clarification, clarificationAnswers: attempt.reviewSession?.frozenAnswers })?.value;
  if (value && ["sourceClassId", "targetClassId", "classId"].includes(reference.field)) value = className(value);
  if (value && reference.field === "methodId") value = design.classes.flatMap(c => c.methods).find(m => m.id === value)?.name ?? "Unnamed method";
  return { label, value };
}
export function DesignSection({ design, section, attempt }: { design: StructuredDesign | null | undefined; section: SectionId; attempt: AttemptData }) {
  if (!design) return <p>No design in this attempt.</p>;
  const className = (id: string) => design.classes.find(c => c.id === id)?.name || "Unassigned class";
  if (section === "assumptions") return <p className="source-value">{design.assumptions || "Not specified"}</p>;
  if (section === "requirementHandling") return <>{attempt.content.requirements.map(r => <div key={r.id}><h4>{r.text}</h4><p>{design.requirementHandling.find(h => h.requirementId === r.id)?.response || "Not demonstrated"}</p></div>)}</>;
  if (section === "classes") return <>{design.classes.length === 0 && <p>No classes specified.</p>}{design.classes.map(c => <article key={c.id}><h4>{c.name || "Unnamed class"} · {c.kind}</h4><p>{c.responsibility || "Responsibility not specified"}</p>{c.fields.length > 0 && <ul>{c.fields.map(f => <li key={f.id}>{f.visibility} {f.name}: {f.type}</li>)}</ul>}{c.methods.map(m => <div key={m.id}><strong>{m.name}({m.parameters.map(p => `${p.name}: ${p.type}`).join(", ")}): {m.returnType}</strong><p>{m.contract || "Contract not specified"}</p></div>)}</article>)}</>;
  if (section === "relationships") return <>{design.relationships.length === 0 && <p>No relationships specified.</p>}{design.relationships.map(r => <div key={r.id}><h4>{className(r.sourceClassId)} → {className(r.targetClassId)}</h4><p>{r.kind} · {r.multiplicity || "Multiplicity not specified"}</p><p>{r.explanation || "Explanation not specified"}</p></div>)}</>;
  if (section === "normalScenario" || section === "failureScenario") return <><h4>{design[section].title || "Untitled walkthrough"}</h4><ol>{design[section].steps.map(s => <li key={s.id}><strong>{className(s.classId)}.{design.classes.find(c => c.id === s.classId)?.methods.find(m => m.id === s.methodId)?.name || "unassigned method"}()</strong><p>{s.action || "Action not specified"}</p><p>Outcome: {s.expectedOutcome || "Not specified"}</p></li>)}</ol>{design[section].steps.length === 0 && <p>No steps specified.</p>}</>;
  return <><h4>Chosen approach</h4><p>{design.tradeoff.chosen || "Not specified"}</p><h4>Alternative</h4><p>{design.tradeoff.alternative || "Not specified"}</p><h4>Justification</h4><p>{design.tradeoff.justification || "Not specified"}</p></>;
}
