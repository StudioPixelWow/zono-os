// ============================================================================
// ZONO Facebook Assistant — content script (v0.2), runs on facebook.com.
// Three jobs, all cookie-free and user-authorized:
//   1) session detection  → boolean heartbeat (no cookies/tokens ever).
//   2) group import (P4)   → when the ZONO UI requested a scan, read the groups
//      the user is a member of from the joined-groups page and send metadata.
//   3) comment ingest (P5) → on a ZONO post's permalink, read new comments.
// We read ONLY what the logged-in user can already see in the DOM. We never read
// document.cookie, never capture tokens, never auto-click a publish.
//
// NOTE: Facebook's DOM is obfuscated and changes often. The readers below use
// stable anchors (href patterns like /groups/<id>) with best-effort text parsing
// and graceful degradation — values that cannot be determined reliably are sent
// as null rather than guessed. Selectors may need light tuning against the live UI.
// ============================================================================
(function () {
  const FB = /(^|\.)facebook\.com$/.test(location.hostname);
  if (!FB) return;

  // ── 1) Session detection ───────────────────────────────────────────────────
  function facebookSessionDetected() {
    return !!document.querySelector('[role="navigation"], [aria-label]') &&
      !/\/(login|checkpoint|recover)/.test(location.pathname);
  }
  function bestEffortProfileName() {
    const el = document.querySelector('[role="navigation"] [aria-label]');
    const txt = el && el.getAttribute("aria-label") ? el.getAttribute("aria-label").trim() : "";
    return txt && txt.length <= 60 ? txt : null;
  }
  function reportHeartbeat() {
    try {
      chrome.runtime.sendMessage({
        type: "HEARTBEAT",
        facebookSessionDetected: facebookSessionDetected(),
        facebookProfileName: bestEffortProfileName(),
      });
    } catch { /* extension reloading */ }
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function autoScroll({ maxRounds = 40, pause = 700 } = {}) {
    // Lazy-load by scrolling until the page height stops growing (or cap rounds).
    let last = -1, stable = 0;
    for (let i = 0; i < maxRounds; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(pause);
      const h = document.body.scrollHeight;
      if (h === last) { if (++stable >= 3) break; } else { stable = 0; last = h; }
    }
  }
  const groupIdFromHref = (href) => {
    const m = /\/groups\/([^/?#]+)/.exec(href || "");
    if (!m) return null;
    const id = decodeURIComponent(m[1]);
    // Ignore non-group sub-routes.
    if (["joins", "feed", "discover", "create", "your_groups"].includes(id)) return null;
    return id;
  };
  const parseMembers = (text) => {
    // "12.3K members" / "12,345 members" / "1.2 אלף חברים" — best-effort, else null.
    if (!text) return null;
    const m = /([\d.,]+)\s*(K|M|אלף|מיליון)?\s*(members|חבר)/i.exec(text);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (Number.isNaN(n)) return null;
    const unit = (m[2] || "").toLowerCase();
    if (unit === "k" || unit === "אלף") n *= 1e3;
    else if (unit === "m" || unit === "מיליון") n *= 1e6;
    return Math.round(n);
  };
  const parsePrivacy = (text) => {
    if (!text) return null;
    if (/public|ציבורית|ציבורי/i.test(text)) return "public";
    if (/private|closed|פרטית|פרטי|סגורה/i.test(text)) return "private";
    return null;
  };

  // ── 2) Group import (P4) ────────────────────────────────────────────────────
  function collectGroups() {
    const byId = new Map();
    // Anchors to group pages are the stable signal across FB layouts.
    const anchors = document.querySelectorAll('a[href*="/groups/"]');
    anchors.forEach((a) => {
      const href = a.href || a.getAttribute("href") || "";
      const id = groupIdFromHref(href);
      if (!id) return;
      const name = (a.textContent || "").trim();
      if (!name || name.length > 120) return; // skip icon/permalink anchors with no readable name
      if (byId.has(id)) return;
      // Nearby text (the card) may carry members/privacy — best-effort, else null.
      const card = a.closest('[role="listitem"], li, [data-visualcompletion]') || a.parentElement;
      const cardText = card ? (card.textContent || "") : "";
      byId.set(id, {
        externalGroupId: id,
        name,
        url: `https://www.facebook.com/groups/${id}`,
        membersCount: parseMembers(cardText),
        privacyLevel: parsePrivacy(cardText),
        memberRole: /admin|מנהל/i.test(cardText) ? "admin" : (/moderator|מנחה/i.test(cardText) ? "moderator" : null),
        isMember: true, // we read this from the user's OWN joined-groups view
      });
    });
    return [...byId.values()];
  }

  async function runGroupScan() {
    // Only when the ZONO UI asked (scanPending) and we are on a groups list page.
    const { scanPending } = await chrome.storage.local.get(["scanPending"]);
    if (!scanPending) return;
    const onGroupsList = /\/groups(\/joins|\/your_groups|\/feed)?\/?$/.test(location.pathname) || /\/groups\/?$/.test(location.pathname);
    if (!onGroupsList) return; // background navigated us here; wait for the right page

    await autoScroll();               // pagination / lazy-load
    const groups = collectGroups();
    if (!groups.length) return;       // nothing readable yet — leave scanPending for a retry

    // Send in batches (retry once on failure). Background clears scanPending on success.
    const BATCH = 100;
    for (let i = 0; i < groups.length; i += BATCH) {
      const chunk = groups.slice(i, i + BATCH);
      let res = await sendMessage({ type: "GROUPS_SCANNED", groups: chunk });
      if (!res || !res.ok) { await sleep(1500); res = await sendMessage({ type: "GROUPS_SCANNED", groups: chunk }); }
    }
  }

  // ── 3) Comment ingest (P5) — only for OUR posts ─────────────────────────────
  const commentIdFromHref = (href) => {
    const m = /comment_id=([0-9]+)/.exec(href || "") || /\/(?:posts|permalink)\/[^/]*\/?.*?([0-9]{6,})/.exec(href || "");
    return m ? m[1] : null;
  };
  function collectComments() {
    const out = [];
    const seen = new Set();
    // Comment articles carry an author link + text; be tolerant of layout.
    const nodes = document.querySelectorAll('[role="article"]');
    nodes.forEach((node) => {
      const authorA = node.querySelector('a[href*="/user/"], a[role="link"][href*="facebook.com/"]');
      const authorName = authorA ? (authorA.textContent || "").trim() : null;
      // The comment body is the longest text block that isn't the author name.
      let text = "";
      node.querySelectorAll('div[dir="auto"], span[dir="auto"]').forEach((d) => {
        const t = (d.textContent || "").trim();
        if (t && t !== authorName && t.length > text.length) text = t;
      });
      if (!text || text.length < 2) return;
      // A stable-ish external id from a permalink within the node, else a hash.
      const permA = node.querySelector('a[href*="comment_id="], a[href*="/posts/"], a[href*="/permalink/"]');
      const externalCommentId = commentIdFromHref(permA ? (permA.href || "") : "") || `h${hash(authorName + "|" + text)}`;
      if (seen.has(externalCommentId)) return;
      seen.add(externalCommentId);
      out.push({
        externalCommentId,
        authorName: authorName || null,
        authorExternalId: null,     // not reliably determinable → null (never guessed)
        authorProfileUrl: authorA ? (authorA.href || null) : null,
        text,
        occurredAt: null,            // FB relative timestamps are unreliable → null
      });
    });
    return out;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  async function runCommentScan() {
    // Only on a permalink that matches a post ZONO published (watched map).
    const { watched } = await sendMessage({ type: "GET_WATCHED" }) || {};
    if (!watched) return;
    const here = location.href.split("#")[0].replace(/\/+$/, "");
    let postId = null;
    for (const [url, id] of Object.entries(watched)) {
      const u = String(url).split("#")[0].replace(/\/+$/, "");
      if (here === u || here.startsWith(u) || (u && here.includes(u.split("facebook.com")[1] || " "))) { postId = id; break; }
    }
    if (!postId) return;
    await sleep(1500); // let comments render
    const comments = collectComments().map((c) => ({ ...c, postId }));
    if (comments.length) await sendMessage({ type: "COMMENTS_SCANNED", comments });
  }

  function sendMessage(msg) {
    return new Promise((resolve) => { try { chrome.runtime.sendMessage(msg, resolve); } catch { resolve(null); } });
  }

  // ── Orchestration ───────────────────────────────────────────────────────────
  reportHeartbeat();
  setInterval(reportHeartbeat, 2 * 60 * 1000);
  // Give the SPA a moment to render, then run the context-appropriate readers.
  setTimeout(() => { runGroupScan().catch(() => {}); runCommentScan().catch(() => {}); }, 2500);
})();
