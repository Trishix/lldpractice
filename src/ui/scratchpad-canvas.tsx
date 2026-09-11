"use client";
import { useRef, useState } from "react";
import type { CanvasColor, CanvasItem, ScratchpadCanvasState } from "./scratchpad-model";
import { emptyCanvas, removeCanvasItem, updateCanvasItem } from "./scratchpad-model";

const colors: CanvasColor[] = ["yellow", "blue", "pink", "white"];
const clamp = (n: number) => Math.max(0, Math.min(9000, n));

export function ScratchpadCanvas({ value, disabled, onChange }: {
  value?: ScratchpadCanvasState; disabled: boolean; onChange(value: ScratchpadCanvasState): void;
}) {
  const state = value ?? emptyCanvas();
  const viewport = useRef<HTMLDivElement>(null);
  const studio = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [tool, setTool] = useState<CanvasItem["kind"]>("note");
  const [color, setColor] = useState<CanvasColor>("yellow");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [history, setHistory] = useState<{ undo: ScratchpadCanvasState[]; redo: ScratchpadCanvasState[] }>({ undo: [], redo: [] });
  const drag = useRef<{ id: string; x: number; y: number; original: CanvasItem; resize: boolean } | null>(null);
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const nodes = state.items.filter(item => item.kind !== "arrow");
  const remember = () => setHistory(h => ({ undo: [...h.undo.slice(-49), state], redo: [] }));
  const commit = (next: ScratchpadCanvasState) => { if (disabled) return; remember(); onChange(next); };
  const undo = () => {
    if (disabled || !history.undo.length) return;
    const previous = history.undo.at(-1)!;
    setHistory({ undo: history.undo.slice(0, -1), redo: [...history.redo, state] });
    onChange(previous); setSelected(null);
  };
  const redo = () => {
    if (disabled || !history.redo.length) return;
    const next = history.redo.at(-1)!;
    setHistory({ undo: [...history.undo, state], redo: history.redo.slice(0, -1) });
    onChange(next); setSelected(null);
  };
  const remove = (id: string) => {
    const next = removeCanvasItem(state, id);
    commit({ ...next, items: next.items.filter(item => item.fromId !== id && item.toId !== id) });
    setSelected(null);
  };
  const add = () => {
    if (disabled || state.items.length >= 120) return;
    const id = crypto.randomUUID();
    const columns = Math.max(4, Math.floor(((viewport.current?.clientWidth ?? 600) / zoom - 72) / 260));
    let x = 36, y = 36;
    for (let slot = 0; slot <= 120; slot++) {
      x = 36 + (slot % columns) * 260; y = 36 + Math.floor(slot / columns) * 220;
      if (!nodes.some(n => x < n.x + n.width + 16 && x + 236 > n.x && y < n.y + n.height + 16 && y + 196 > n.y)) break;
    }
    const item: CanvasItem = { id, kind: tool, x, y, width: 220, height: 180, text: "", color };
    if (tool === "arrow") {
      if (!nodes.some(n => n.id === from) || !nodes.some(n => n.id === to) || from === to) return;
      item.fromId = from; item.toId = to;
    }
    commit({ ...state, items: [...state.items, item] }); setSelected(id); setPan(false);
    if (tool !== "arrow") requestAnimationFrame(() => {
      const el = viewport.current; if (!el) return;
      if ((x + item.width) * zoom > el.scrollLeft + el.clientWidth || (y + item.height) * zoom > el.scrollTop + el.clientHeight)
        el.scrollTo(Math.max(0, x * zoom - 24), Math.max(0, y * zoom - 24));
      studio.current?.querySelector<HTMLTextAreaElement>(`[data-item-id="${id}"] textarea`)?.focus({ preventScroll: true });
    });
  };
  const width = Math.max(1200, ...state.items.map(item => item.x + item.width + 160));
  const height = Math.max(800, ...state.items.map(item => item.y + item.height + 160));
  const changeZoom = (next: number) => {
    const target = Math.max(.25, Math.min(2, next));
    const el = viewport.current;
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / zoom : 0;
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / zoom : 0;
    setZoom(target);
    requestAnimationFrame(() => { if (el) el.scrollTo(Math.max(0, cx * target - el.clientWidth / 2), Math.max(0, cy * target - el.clientHeight / 2)); });
  };
  const fit = () => {
    const el = viewport.current; if (!el) return;
    const left = nodes.length ? Math.min(...nodes.map(n => n.x)) : 0;
    const top = nodes.length ? Math.min(...nodes.map(n => n.y)) : 0;
    const right = Math.max(left + 240, ...nodes.map(n => n.x + n.width));
    const bottom = Math.max(top + 180, ...nodes.map(n => n.y + n.height));
    const next = Math.max(.25, Math.min(1, (el.clientWidth - 48) / (right - left), (el.clientHeight - 48) / (bottom - top)));
    setZoom(next);
    requestAnimationFrame(() => el.scrollTo(Math.max(0, left * next - 24), Math.max(0, top * next - 24)));
  };
  const move = (event: React.PointerEvent) => {
    if (panning.current) {
      viewport.current?.scrollTo(panning.current.left - (event.clientX - panning.current.x), panning.current.top - (event.clientY - panning.current.y)); return;
    }
    const d = drag.current; if (!d || disabled) return;
    const dx = (event.clientX - d.x) / zoom, dy = (event.clientY - d.y) / zoom;
    onChange(updateCanvasItem(state, d.id, d.resize
      ? { width: Math.max(180, Math.min(800, d.original.width + dx)), height: Math.max(160, Math.min(800, d.original.height + dy)) }
      : { x: clamp(d.original.x + dx), y: clamp(d.original.y + dy) }));
  };
  const endDrag = () => { drag.current = null; panning.current = null; };
  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, item: CanvasItem, resize = false) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); remember(); setSelected(item.id);
    drag.current = { id: item.id, x: event.clientX, y: event.clientY, original: item, resize };
  };
  return <section ref={studio} className={`scratchpad-studio${expanded ? " is-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded ? true : undefined} aria-label="Private scratchpad" onKeyDown={event => {
    if (expanded && event.key === "Escape") { event.preventDefault(); setExpanded(false); expandButton.current?.focus(); return; }
    if (expanded && event.key === "Tab") {
      const controls = Array.from(studio.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if ((event.target as HTMLElement).closest("input,textarea,select") || disabled) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    if (event.key === "Delete" && selected) { event.preventDefault(); remove(selected); }
    if (event.key === "Escape") { setSelected(null); setPan(false); }
  }}>
    <div className="scratchpad-toolbar">
      <strong>Scratchpad</strong><span className="meta">Private · excluded from AI review</span>
      <button ref={expandButton} type="button" className="canvas-expand" onClick={() => setExpanded(!expanded)}>{expanded ? "Return to practice" : "Expand canvas"}</button>
      <div className="scratchpad-tools" role="group" aria-label="Scratchpad tools">
        {(["note", "box", "arrow"] as const).map(kind => <button key={kind} type="button" aria-pressed={tool === kind} disabled={disabled} onClick={() => setTool(kind)}>{kind === "note" ? "Sticky note" : kind === "box" ? "Box" : "Arrow"}</button>)}
        <label className="scratchpad-color">Color<select value={color} disabled={disabled} onChange={event => {
          const next = event.target.value as CanvasColor; setColor(next);
          if (selected) commit(updateCanvasItem(state, selected, { color: next }));
        }}>{colors.map(c => <option key={c}>{c}</option>)}</select></label>
        <button type="button" className="primary" disabled={disabled || state.items.length >= 120 || (tool === "arrow" && (!from || !to || from === to))} onClick={add}>Add to canvas</button>
      </div>
      {tool === "arrow" && <div className="connector-controls">
        <label>Connect from<select value={from} disabled={disabled} onChange={e => setFrom(e.target.value)}><option value="">Choose an object</option>{nodes.map((n, i) => <option key={n.id} value={n.id}>{n.text.trim().slice(0, 40) || `Object ${i + 1}`}</option>)}</select></label>
        <label>Connect to<select value={to} disabled={disabled} onChange={e => setTo(e.target.value)}><option value="">Choose an object</option>{nodes.filter(n => n.id !== from).map(n => <option key={n.id} value={n.id}>{n.text.trim().slice(0, 40) || `Object ${nodes.indexOf(n) + 1}`}</option>)}</select></label>
        {!nodes.length && <small>Add two objects to connect them.</small>}
      </div>}
    </div>
    <div ref={viewport} className={`scratchpad-canvas${pan ? " is-panning" : ""}`} role="application" aria-label="Scratchpad canvas" tabIndex={0}
      onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag}
      onPointerDown={event => {
        if (event.button === 1 || (pan && event.button === 0)) {
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          const el = event.currentTarget; panning.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
        } else if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-plane")) setSelected(null);
      }}>
      <div className="canvas-extent" style={{ width: width * zoom, height: height * zoom }}>
        <div className="canvas-plane" style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
          <svg className="canvas-connections" width={width} height={height} aria-label="Object connections">
            <defs><marker id="scratch-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.5"/></marker></defs>
            {state.items.filter(n => n.kind === "arrow").map(item => {
              const source = nodes.find(n => n.id === item.fromId), target = nodes.find(n => n.id === item.toId);
              const a = source ? { x: source.x + source.width, y: source.y + source.height / 2 } : { x: item.x, y: item.y };
              const b = target ? { x: target.x, y: target.y + target.height / 2 } : { x: item.x + item.width, y: item.y + item.height };
              const bend = Math.max(50, Math.abs(b.x - a.x) / 2);
              return <path key={item.id} className={`canvas-connector${selected === item.id ? " selected" : ""}`} d={`M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`} markerEnd="url(#scratch-arrow-head)" tabIndex={0} role="button" aria-label={`Connection ${source?.text || "object"} to ${target?.text || "object"}`} onClick={() => setSelected(item.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); } }}/>;
            })}
          </svg>
          {nodes.map(item => <div key={item.id} data-item-id={item.id} className={`canvas-item canvas-${item.kind} canvas-${item.color}${selected === item.id ? " selected" : ""}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height }} onFocus={() => setSelected(item.id)}>
            <button type="button" className="canvas-handle" disabled={disabled} aria-label="Move canvas item" title="Drag, or move with arrow keys" onPointerDown={event => beginDrag(event, item)} onLostPointerCapture={endDrag} onKeyDown={event => {
              const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
              if (!delta) return; event.preventDefault();
              commit(updateCanvasItem(state, item.id, { x: clamp(item.x + delta[0]), y: clamp(item.y + delta[1]) }));
            }}>⠿ {item.kind === "note" ? "Note" : "Object"} · drag to move</button>
            <textarea aria-label={item.kind === "note" ? "Scratchpad note" : "Box label"} placeholder={item.kind === "note" ? "Write a thought…" : "Name this object…"} maxLength={2000} disabled={disabled} value={item.text} onChange={event => commit(updateCanvasItem(state, item.id, { text: event.target.value }))}/>
            <button type="button" className="canvas-resize" aria-label="Resize canvas item" title="Drag, or resize with arrow keys" disabled={disabled} onPointerDown={event => beginDrag(event, item, true)} onLostPointerCapture={endDrag} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault(); commit(updateCanvasItem(state, item.id, { width: Math.max(180, Math.min(800, item.width + (event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0))), height: Math.max(160, Math.min(800, item.height + (event.key === "ArrowDown" ? 10 : event.key === "ArrowUp" ? -10 : 0))) }));
            }}>↘</button>
          </div>)}
        </div>
      </div>
      {!state.items.length && <div className="scratchpad-empty"><strong>A little space to think.</strong><span>Add a note or an object. Connect them as your design takes shape.</span></div>}
    </div>
    <div className="canvas-statusbar">
      <div className="canvas-view-controls">
        <button type="button" aria-label="Zoom out" disabled={zoom <= .25} onClick={() => changeZoom(zoom - .25)}>−</button>
        <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => changeZoom(zoom + .25)}>+</button>
        <button type="button" onClick={fit}>Fit view</button>
        <button type="button" aria-pressed={pan} onClick={() => setPan(!pan)}>Pan</button>
      </div>
      <div className="canvas-edit-controls">
        <button type="button" disabled={disabled || !history.undo.length} onClick={undo}>Undo</button>
        <button type="button" disabled={disabled || !history.redo.length} onClick={redo}>Redo</button>
        <button type="button" disabled={disabled || !selected} onClick={() => selected && remove(selected)}>Delete selected</button>
        <button type="button" disabled={disabled || !state.items.length} onClick={() => { if (window.confirm("Clear the scratchpad? You can undo this while this panel stays open.")) { commit(emptyCanvas()); setSelected(null); } }}>Reset</button>
      </div>
      <small>{state.items.length}/120 items · Drag handles to move · Pan to explore · Changes save automatically</small>
    </div>
  </section>;
}
