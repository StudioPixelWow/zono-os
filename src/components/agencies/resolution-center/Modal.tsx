"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Minimal RTL modal (no external dep). Backdrop click + close button. */
export function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="bg-card relative z-10 max-h-[88vh] w-full max-w-lg overflow-auto rounded-card border border-line shadow-2xl">
        <div className="border-line bg-card sticky top-0 flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-ink text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none" aria-label="סגור">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="border-line bg-card sticky bottom-0 flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalActions({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (<><Button variant="ghost" onClick={onCancel}>ביטול</Button>{children}</>);
}
