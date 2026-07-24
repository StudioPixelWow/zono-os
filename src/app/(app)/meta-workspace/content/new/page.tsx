// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · New draft. Phase 2 UI (RTL, client form).
// ============================================================================
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewDraftPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/meta/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ internalName: name || "טיוטה חדשה" }) });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error === "rate_limited" ? "יותר מדי בקשות — נסו שוב בעוד רגע" : "יצירת הטיוטה נכשלה"); return; }
      router.push(`/meta-workspace/content/${json.draft.id}`);
    } catch { setError("שגיאת רשת"); } finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-bold">טיוטה חדשה</h1>
      <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="draft-name">שם פנימי לטיוטה</label>
      <input id="draft-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: קמפיין דירת 4 חדרים" className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none" />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button onClick={create} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "יוצר…" : "צור טיוטה"}</button>
    </main>
  );
}
