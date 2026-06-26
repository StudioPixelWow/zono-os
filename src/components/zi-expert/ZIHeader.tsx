"use client";
// ZI Expert™ — chat window header. Avatar stays attached so users always know
// they're talking to ZI. Exposes history, new-chat and close.
import { History, Plus, X, GraduationCap } from "lucide-react";
import { ZIAvatar } from "./ZIAvatar";

export function ZIHeader({ onToggleHistory, onNewChat, onClose, historyOpen, onToggleLearn, learnOpen }: {
  onToggleHistory: () => void;
  onNewChat: () => void;
  onClose: () => void;
  historyOpen: boolean;
  onToggleLearn: () => void;
  learnOpen: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <ZIAvatar size={38} state="online" />
        <div className="leading-tight">
          <p className="flex items-center gap-1.5 text-sm font-black text-white">
            ZI
            <span className="text-[10px] font-bold text-emerald-300">● מחובר</span>
          </p>
          <p className="text-[11px] text-white/50">המומחה שלך ל-ZONO</p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onToggleLearn} title="מרכז למידה" className={`rounded-lg p-1.5 transition hover:bg-white/10 ${learnOpen ? "bg-white/10 text-white" : "text-white/60"}`}><GraduationCap size={16} /></button>
        <button type="button" onClick={onToggleHistory} title="היסטוריית שיחות" className={`rounded-lg p-1.5 transition hover:bg-white/10 ${historyOpen ? "bg-white/10 text-white" : "text-white/60"}`}><History size={16} /></button>
        <button type="button" onClick={onNewChat} title="שיחה חדשה" className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"><Plus size={16} /></button>
        <button type="button" onClick={onClose} title="סגור" className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"><X size={16} /></button>
      </div>
    </div>
  );
}
