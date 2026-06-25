"use client";
// ============================================================================
// ZI Expert™ — a single chat message. Assistant messages render lightweight,
// safe Markdown (headings, bold, inline code, code blocks, bullet/numbered
// lists, tables, internal links) and expose copy / regenerate / thumbs.
// No raw HTML is ever injected — everything is built as React elements.
// ============================================================================
import { Fragment, type ReactNode, useState } from "react";
import Link from "next/link";
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { ZIAvatar } from "./ZIAvatar";
import type { ZiMessage } from "@/lib/zi-expert/types";

// ── inline markdown: **bold**, `code`, [text](href) ─────────────────────────
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`} className="font-black text-white">{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<code key={`${keyBase}-c${i}`} className="rounded bg-black/40 px-1 py-0.5 text-[12px] text-violet-200">{m[4]}</code>);
    } else if (m[6] !== undefined && m[7] !== undefined) {
      const href = m[7];
      nodes.push(
        href.startsWith("/")
          ? <Link key={`${keyBase}-l${i}`} href={href} className="font-bold text-violet-300 underline-offset-2 hover:underline">{m[6]}</Link>
          : <a key={`${keyBase}-l${i}`} href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-300 underline-offset-2 hover:underline">{m[6]}</a>,
      );
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last)}</Fragment>);
  return nodes;
}

// ── block markdown ───────────────────────────────────────────────────────────
function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push(<pre key={`k${key++}`} className="my-2 overflow-x-auto rounded-xl bg-black/50 p-3 text-[12px] leading-relaxed text-violet-100" dir="ltr"><code>{code.join("\n")}</code></pre>);
      continue;
    }

    // table (header row + separator)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const parseRow = (r: string) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") { rows.push(parseRow(lines[i])); i++; }
      blocks.push(
        <div key={`k${key++}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr>{headers.map((h, hi) => <th key={hi} className="border border-white/10 bg-white/5 px-2 py-1 text-right font-bold text-white">{renderInline(h, `th${hi}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-white/10 px-2 py-1 text-white/80">{renderInline(c, `td${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    // headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<p key={`k${key++}`} className="mt-2 mb-1 text-sm font-black text-white">{renderInline(h[2], `h${key}`)}</p>);
      i++;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push(<ul key={`k${key++}`} className="my-1.5 list-disc space-y-1 pr-5 text-sm text-white/85">{items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>)}</ul>);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={`k${key++}`} className="my-1.5 list-decimal space-y-1 pr-5 text-sm text-white/85">{items.map((it, ii) => <li key={ii}>{renderInline(it, `ol${key}-${ii}`)}</li>)}</ol>);
      continue;
    }

    // blank line
    if (line.trim() === "") { i++; continue; }

    // paragraph (merge consecutive non-empty, non-special lines)
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !lines[i].trim().startsWith("```") && !/^#{1,4}\s+/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push(<p key={`k${key++}`} className="my-1 text-sm leading-relaxed text-white/85">{renderInline(para.join(" "), `p${key}`)}</p>);
  }
  return blocks;
}

export function ZIMessage({ message, onRate, onRegenerate, canRegenerate }: {
  message: ZiMessage;
  onRate?: (rating: "up" | "down") => void;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  if (isUser) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-l from-violet-600 to-fuchsia-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_rgba(139,92,246,0.3)]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <ZIAvatar size={30} state="online" showStatus={false} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-violet-400/15 bg-white/[0.04] px-3.5 py-2.5">
          {renderMarkdown(message.content)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-white/40">
          <button type="button" onClick={copy} title="העתק" className="rounded-md p-1 transition hover:bg-white/10 hover:text-white">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {canRegenerate && onRegenerate && (
            <button type="button" onClick={onRegenerate} title="צור תשובה מחדש" className="rounded-md p-1 transition hover:bg-white/10 hover:text-white"><RefreshCw size={13} /></button>
          )}
          {onRate && (
            <>
              <button type="button" onClick={() => onRate("up")} title="תשובה טובה" className={`rounded-md p-1 transition hover:bg-white/10 hover:text-white ${message.rating === "up" ? "text-emerald-300" : ""}`}><ThumbsUp size={13} /></button>
              <button type="button" onClick={() => onRate("down")} title="לא עזר" className={`rounded-md p-1 transition hover:bg-white/10 hover:text-white ${message.rating === "down" ? "text-rose-300" : ""}`}><ThumbsDown size={13} /></button>
            </>
          )}
          {message.source === "fallback" && <span className="text-[10px] text-white/30">מענה מבוסס-ידע</span>}
        </div>
      </div>
    </div>
  );
}
