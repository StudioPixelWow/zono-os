"use client";

import { useState } from "react";
import Link from "next/link";
import type { DistributionBoard } from "@/lib/distribution/service";
import { Glass, StatTile, SectionHeading, Chip, EmptyState, compact } from "./shared";

type Tab = "comments" | "messages" | "leads";

export function LeadCollectionSection({ board }: { board: DistributionBoard }) {
  const [tab, setTab] = useState<Tab>("leads");
  const leadsGenerated = board.communities.reduce((s, c) => s + (c.intel?.leads_generated ?? 0), 0);
  const dealsCreated = board.communities.reduce((s, c) => s + (c.intel?.deals_created ?? 0), 0);
  const estRevenue = board.communities.reduce((s, c) => s + (c.intel?.estimated_revenue ?? 0), 0);

  const empties: Record<Tab, { icon: string; title: string; body: string }> = {
    comments: { icon: "MessageSquare", title: "אין עדיין תגובות שנאספו", body: "תגובות מפוסטים שתפרסם ייאספו כאן אוטומטית לאחר חיבור איסוף ההתקשרויות מפייסבוק. כל תגובה תקושר לנכס ולקהילה." },
    messages: { icon: "MessageCircle", title: "אין עדיין הודעות נכנסות", body: "הודעות פרטיות (Messenger) שמתקבלות בעקבות הפצה יוצגו כאן עם זיהוי כוונה וקישור לנכס." },
    leads: { icon: "UserPlus", title: "אין עדיין לידים מקושרים", body: "לידים שנוצרים מההפצה (תגובות והודעות שזוהו ככוונת רכישה) יופיעו כאן מקושרים לנכס המקור ולקהילה." },
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="איסוף לידים" subtitle="תגובות, הודעות ולידים שנאספים מההפצה — מקושרים לנכס" icon="Inbox" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="לידים מצטברים" value={compact(leadsGenerated)} hint="מכל הקהילות" icon="UserPlus" tone="success" />
        <StatTile label="עסקאות" value={compact(dealsCreated)} hint="נוצרו מההפצה" icon="Handshake" tone="brand" />
        <StatTile label="הכנסה מוערכת" value={`₪${compact(estRevenue)}`} hint="פוטנציאל מצטבר" icon="Wallet" tone="accent" />
        <StatTile label="קהילות מניבות" value={String(board.communities.filter((c) => (c.intel?.leads_generated ?? 0) > 0).length)} hint="עם לידים בפועל" icon="Target" tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={tab === "leads"} onClick={() => setTab("leads")}>לידים</Chip>
        <Chip active={tab === "comments"} onClick={() => setTab("comments")}>תגובות</Chip>
        <Chip active={tab === "messages"} onClick={() => setTab("messages")}>הודעות</Chip>
      </div>

      {/* Top lead-producing communities (real) */}
      {leadsGenerated > 0 && (
        <Glass className="flex flex-col gap-2 p-5">
          <p className="text-ink text-sm font-extrabold">קהילות מובילות בלידים</p>
          {board.communities.filter((c) => (c.intel?.leads_generated ?? 0) > 0).sort((a, b) => (b.intel?.leads_generated ?? 0) - (a.intel?.leads_generated ?? 0)).slice(0, 5).map((c) => (
            <div key={c.id} className="bg-card/60 border-line flex items-center justify-between gap-2 rounded-xl border p-2.5">
              <span className="text-ink truncate text-sm font-bold">{c.name}</span>
              <span className="text-brand-strong shrink-0 text-sm font-black tabular-nums">{c.intel?.leads_generated} לידים</span>
            </div>
          ))}
        </Glass>
      )}

      <EmptyState {...empties[tab]} action={<Link href="/social-leads" className="btn-zono-primary mt-1 rounded-xl px-4 py-2 text-sm font-bold text-white">פתח מרכז לידים חברתי</Link>} />
    </div>
  );
}
