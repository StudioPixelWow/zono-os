"use client";
// ============================================================================
// ZONO — Intelligence error boundary (Phase 19.5). Wraps a heavy intelligence
// view/widget so a render failure shows a calm fallback instead of crashing the
// whole page. RTL Hebrew. One widget failing must not take the page down.
// ============================================================================
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; title?: string; compact?: boolean }
interface State { hasError: boolean }

export class IntelligenceErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: unknown): void {
    // Surfaced in dev tools; never throws upward.
    if (typeof console !== "undefined") console.error("[ZONO intelligence widget error]", error);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div dir="rtl" className={`flex flex-col items-center gap-2 rounded-[20px] border border-amber-200 bg-amber-50/60 text-center ${this.props.compact ? "p-4" : "p-8"}`}>
        <AlertTriangle size={this.props.compact ? 18 : 24} className="text-amber-500" />
        <p className="text-sm font-black text-amber-800">{this.props.title ?? "הרכיב נכשל בטעינה"}</p>
        <p className="text-[12px] text-amber-700/80">שאר הדף ממשיך לפעול כרגיל. רענן/י כדי לנסות שוב.</p>
      </div>
    );
  }
}
