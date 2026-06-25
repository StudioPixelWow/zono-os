"use client";
// ============================================================================
// ZONO — Visual workflow builder. Drag & drop nodes (trigger/condition/delay/
// action/split/merge/end), connect them, zoom, minimap, undo/redo, RTL. Save a
// versioned workflow; preview exactly what will happen via Simulation Mode.
// ============================================================================
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Plus, ZoomIn, ZoomOut, Undo2, Redo2, Save, Play, Trash2, Link2, X,
} from "lucide-react";
import { createJourneyAction, simulateJourneyAction } from "@/lib/journey-automation/server-actions";
import { validateGraph } from "@/lib/journey-automation/engine";
import { DEFAULT_JOURNEYS } from "@/lib/journey-automation/templates";
import { NODE_KIND_LABELS, JOURNEY_TYPES } from "@/lib/journey-automation/workflows";
import { TRIGGERS } from "@/lib/journey-automation/triggers";
import { ACTIONS } from "@/lib/journey-automation/actions";
import type { ExecutionResult, NodeKind, WorkflowGraph, WorkflowNode } from "@/lib/journey-automation/types";

const PALETTE: NodeKind[] = ["trigger", "condition", "delay", "action", "split", "merge", "end"];
const KIND_TONE: Record<NodeKind, string> = {
  trigger: "border-violet-400 bg-violet-50", condition: "border-amber-400 bg-amber-50", delay: "border-sky-400 bg-sky-50",
  action: "border-emerald-400 bg-emerald-50", split: "border-fuchsia-400 bg-fuchsia-50", merge: "border-fuchsia-400 bg-fuchsia-50", end: "border-black/30 bg-black/5",
};

const NODE_W = 150, NODE_H = 56;
let idc = 0;
const newId = () => `n${Date.now().toString(36)}${idc++}`;

export function JourneyBuilder() {
  const seed = DEFAULT_JOURNEYS[0]!.graph;
  const [history, setHistory] = useState<WorkflowGraph[]>([seed]);
  const [hi, setHi] = useState(0);
  const graph = history[hi]!;
  const [zoom, setZoom] = useState(0.9);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [name, setName] = useState("מסע חדש");
  const [journeyType, setJourneyType] = useState("property");
  const [sim, setSim] = useState<ExecutionResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const commit = useCallback((g: WorkflowGraph) => {
    const next = history.slice(0, hi + 1);
    next.push(g);
    setHistory(next.slice(-50));
    setHi(Math.min(next.length - 1, 49));
  }, [history, hi]);

  const triggerType = useMemo(() => graph.nodes.find((n) => n.kind === "trigger")?.triggerType ?? null, [graph]);
  const validation = useMemo(() => validateGraph(graph), [graph]);

  const addNode = (kind: NodeKind) => {
    const node: WorkflowNode = {
      id: newId(), kind, title: NODE_KIND_LABELS[kind],
      triggerType: kind === "trigger" ? "manual" : undefined,
      actionType: kind === "action" ? "create_task" : undefined,
      delayMinutes: kind === "delay" ? 120 : undefined,
      x: 140 + (graph.nodes.length % 4) * 40, y: 80 + graph.nodes.length * 24,
    };
    commit({ nodes: [...graph.nodes, node], edges: graph.edges });
    setSelected(node.id);
  };
  const updateNode = (id: string, patch: Partial<WorkflowNode>) => commit({ nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)), edges: graph.edges });
  const deleteNode = (id: string) => { commit({ nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.from !== id && e.to !== id) }); setSelected(null); };
  const connect = (to: string) => {
    if (!connectFrom || connectFrom === to) { setConnectFrom(null); return; }
    const fromNode = graph.nodes.find((n) => n.id === connectFrom);
    const branch = fromNode?.kind === "condition" ? (graph.edges.some((e) => e.from === connectFrom && e.branch === "true") ? "false" : "true") : null;
    commit({ nodes: graph.nodes, edges: [...graph.edges, { id: newId(), from: connectFrom, to, branch }] });
    setConnectFrom(null);
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    const n = graph.nodes.find((x) => x.id === id)!;
    drag.current = { id, dx: e.clientX / zoom - (n.x ?? 0), dy: e.clientY / zoom - (n.y ?? 0) };
    setSelected(id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { id, dx, dy } = drag.current;
    const x = Math.max(0, e.clientX / zoom - dx), y = Math.max(0, e.clientY / zoom - dy);
    setHistory((h) => h.map((g, i) => (i === hi ? { nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)), edges: g.edges } : g)));
  };
  const onPointerUp = () => { if (drag.current) { commit(graph); drag.current = null; } };

  const runSim = async () => {
    setMsg(null);
    const res = await simulateJourneyAction(graph, { triggerType: (triggerType ?? "manual"), entityType: "property", entityId: null, entityLabel: "נכס לדוגמה", context: { is_private: true, opportunity_score: 88, buyer_count: 3, listing_type: "private", task_status: "todo" } });
    if (res.ok) setSim(res.data); else setMsg(res.error);
  };
  const save = async () => {
    setMsg(null);
    if (!validation.ok) { setMsg(validation.issues.find((i) => i.level === "error")?.message ?? "הגרף אינו תקין."); return; }
    const res = await createJourneyAction({ name, journeyType, triggerType, graph, activate: false });
    setMsg(res.ok ? "המסע נשמר כטיוטה (גרסה 1)." : res.error);
  };
  const loadTemplate = (key: string) => { const t = DEFAULT_JOURNEYS.find((x) => x.key === key); if (t) { commit(t.graph); setName(t.name); setJourneyType(t.journeyType); } };

  const bounds = graph.nodes.reduce((a, n) => ({ w: Math.max(a.w, (n.x ?? 0) + 200), h: Math.max(a.h, (n.y ?? 0) + 120) }), { w: 800, h: 500 });

  return (
    <div dir="rtl" className="flex h-[calc(100vh-2rem)] flex-col gap-3 p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-white p-2.5">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-44 rounded-lg border border-black/10 px-2 py-1.5 text-sm font-bold text-ink" />
        <select value={journeyType} onChange={(e) => setJourneyType(e.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[12px] font-semibold">
          {JOURNEY_TYPES.map((j) => <option key={j.type} value={j.type}>{j.label}</option>)}
        </select>
        <select onChange={(e) => e.target.value && loadTemplate(e.target.value)} value="" className="rounded-lg border border-black/10 px-2 py-1.5 text-[12px] font-semibold">
          <option value="">תבנית…</option>
          {DEFAULT_JOURNEYS.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <div className="ms-auto flex items-center gap-1.5">
          <button onClick={() => setHi(Math.max(0, hi - 1))} disabled={hi === 0} className="rounded-lg bg-black/5 p-1.5 disabled:opacity-40" title="בטל"><Undo2 size={15} /></button>
          <button onClick={() => setHi(Math.min(history.length - 1, hi + 1))} disabled={hi === history.length - 1} className="rounded-lg bg-black/5 p-1.5 disabled:opacity-40" title="חזור"><Redo2 size={15} /></button>
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="rounded-lg bg-black/5 p-1.5"><ZoomOut size={15} /></button>
          <span className="text-[11px] font-bold text-ink/50">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="rounded-lg bg-black/5 p-1.5"><ZoomIn size={15} /></button>
          <button onClick={runSim} className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[12px] font-bold text-amber-800"><Play size={13} /> סימולציה</button>
          <button onClick={save} className="inline-flex items-center gap-1 rounded-lg bg-brand-strong px-2.5 py-1.5 text-[12px] font-bold text-white"><Save size={13} /> שמור</button>
        </div>
      </div>
      {msg && <p className="rounded-xl bg-brand-soft px-3 py-2 text-[12px] font-bold text-brand-strong">{msg}</p>}
      {!validation.ok && <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{validation.issues.filter((i) => i.level === "error").map((i) => i.message).join(" · ")}</p>}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Palette */}
        <div className="flex w-32 shrink-0 flex-col gap-1.5">
          <p className="text-[11px] font-black text-ink/50">הוסף צומת</p>
          {PALETTE.map((k) => (
            <button key={k} onClick={() => addNode(k)} className={`rounded-xl border-2 px-2 py-2 text-[12px] font-bold text-ink ${KIND_TONE[k]}`}><Plus size={11} className="inline" /> {NODE_KIND_LABELS[k]}</button>
          ))}
          {connectFrom && <button onClick={() => setConnectFrom(null)} className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">בטל חיבור</button>}
        </div>

        {/* Canvas */}
        <div className="relative min-h-0 flex-1 overflow-auto rounded-2xl border border-black/5 bg-[radial-gradient(circle,#0001_1px,transparent_1px)] [background-size:18px_18px]" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div style={{ width: bounds.w * zoom, height: bounds.h * zoom, position: "relative" }}>
            <svg width={bounds.w * zoom} height={bounds.h * zoom} className="absolute inset-0 pointer-events-none">
              {graph.edges.map((e) => {
                const a = graph.nodes.find((n) => n.id === e.from), b = graph.nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const x1 = ((a.x ?? 0) + NODE_W / 2) * zoom, y1 = ((a.y ?? 0) + NODE_H) * zoom;
                const x2 = ((b.x ?? 0) + NODE_W / 2) * zoom, y2 = (b.y ?? 0) * zoom;
                const stroke = e.branch === "true" ? "#16a34a" : e.branch === "false" ? "#ef4444" : "#a855f7";
                return <g key={e.id}><path d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} stroke={stroke} strokeWidth={2} fill="none" /></g>;
              })}
            </svg>
            {graph.nodes.map((n) => (
              <div key={n.id}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                onClick={() => connectFrom && connect(n.id)}
                style={{ left: (n.x ?? 0) * zoom, top: (n.y ?? 0) * zoom, width: NODE_W * zoom, minHeight: NODE_H * zoom, position: "absolute" }}
                className={`cursor-grab touch-none rounded-xl border-2 p-2 text-right shadow-sm ${KIND_TONE[n.kind]} ${selected === n.id ? "ring-2 ring-brand-strong" : ""}`}>
                <p className="text-[11px] font-black text-ink">{n.title || NODE_KIND_LABELS[n.kind]}</p>
                <p className="text-[9px] font-bold text-ink/45">{NODE_KIND_LABELS[n.kind]}</p>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <button onClick={(ev) => { ev.stopPropagation(); setConnectFrom(n.id); }} className="rounded bg-white/70 p-0.5 text-ink/60" title="חבר"><Link2 size={11} /></button>
                  <button onClick={(ev) => { ev.stopPropagation(); deleteNode(n.id); }} className="rounded bg-white/70 p-0.5 text-red-500" title="מחק"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
          {/* Minimap */}
          <div className="absolute bottom-2 left-2 h-24 w-36 overflow-hidden rounded-lg border border-black/10 bg-white/80 backdrop-blur">
            <svg viewBox={`0 0 ${bounds.w} ${bounds.h}`} className="h-full w-full">
              {graph.nodes.map((n) => <rect key={n.id} x={n.x ?? 0} y={n.y ?? 0} width={NODE_W} height={NODE_H} rx={8} className="fill-brand-strong/40" />)}
            </svg>
          </div>
        </div>

        {/* Inspector */}
        <div className="w-60 shrink-0 overflow-y-auto rounded-2xl border border-black/5 bg-white p-3">
          {selected ? <NodeInspector node={graph.nodes.find((n) => n.id === selected)!} onChange={(p) => updateNode(selected, p)} /> : (
            <div className="text-[12px] text-ink/50">
              <p className="mb-2 font-black text-ink">סימולציה</p>
              {sim ? (
                <ul className="flex flex-col gap-1">
                  {sim.steps.map((s, i) => <li key={i} className="rounded-lg bg-black/[0.03] px-2 py-1 text-[11px]"><b className="text-ink">{NODE_KIND_LABELS[s.nodeKind]}</b>{s.actionType ? ` · ${s.actionType}` : ""} → {s.status}</li>)}
                  <li className="mt-1 text-[11px] font-bold text-brand-strong">סטטוס: {sim.status} · {sim.stepsDone}/{sim.stepsTotal} צעדים</li>
                </ul>
              ) : <p>בחר צומת לעריכה, או הרץ סימולציה לתצוגה מקדימה של כל המסע.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeInspector({ node, onChange }: { node: WorkflowNode; onChange: (p: Partial<WorkflowNode>) => void }) {
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="flex items-center justify-between"><p className="font-black text-ink">עריכת צומת</p><X size={14} className="text-ink/30" /></div>
      <label className="flex flex-col gap-0.5 font-bold text-ink/55">כותרת
        <input value={node.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} className="rounded-lg border border-black/10 px-2 py-1 font-semibold text-ink" />
      </label>
      {node.kind === "trigger" && (
        <label className="flex flex-col gap-0.5 font-bold text-ink/55">טריגר
          <select value={node.triggerType ?? "manual"} onChange={(e) => onChange({ triggerType: e.target.value as WorkflowNode["triggerType"] })} className="rounded-lg border border-black/10 px-2 py-1 font-semibold text-ink">
            {TRIGGERS.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </label>
      )}
      {node.kind === "action" && (
        <label className="flex flex-col gap-0.5 font-bold text-ink/55">פעולה
          <select value={node.actionType ?? "create_task"} onChange={(e) => onChange({ actionType: e.target.value as WorkflowNode["actionType"] })} className="rounded-lg border border-black/10 px-2 py-1 font-semibold text-ink">
            {ACTIONS.map((a) => <option key={a.type} value={a.type}>{a.label}{a.ai ? " (AI)" : ""}</option>)}
          </select>
        </label>
      )}
      {(node.kind === "delay" || node.actionType === "wait") && (
        <label className="flex flex-col gap-0.5 font-bold text-ink/55">השהיה (דקות)
          <input type="number" min={1} value={node.delayMinutes ?? 0} onChange={(e) => onChange({ delayMinutes: Number(e.target.value) })} className="rounded-lg border border-black/10 px-2 py-1 font-semibold text-ink" />
        </label>
      )}
      {node.kind === "condition" && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">תנאי מתפצל לענפי כן/לא. חבר שני יעדים — הראשון = כן, השני = לא.</p>}
    </div>
  );
}
