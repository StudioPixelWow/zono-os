// ============================================================================
// ZONO Facebook Assistant — popup logic (skeleton).
// Pairing screen + next-post viewer + manual result reporting. The user copies
// text, opens the destination, publishes BY HAND on Facebook, then confirms.
// There is NO DOM auto-click publishing here — every publish is human-driven.
// ============================================================================
const $ = (id) => document.getElementById(id);
let currentPost = null;

function send(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

async function showNextPost() {
  const { post } = await send("NEXT_POST", {});
  currentPost = post;
  if (!post) { $("postCard").style.display = "none"; return; }
  $("pairCard").style.display = "none";
  $("postCard").style.display = "block";
  $("dest").textContent = post.destinationName || "יעד פרסום";
  $("text").textContent = [post.text, (post.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
}

$("pairBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (!code) return;
  const res = await send("PAIR", { code });
  $("pairMsg").textContent = res.ok ? "חובר בהצלחה ✓" : `שגיאה: ${res.error || "קוד לא תקין"}`;
  if (res.ok) await showNextPost();
});

$("copyBtn").addEventListener("click", async () => {
  if (currentPost) { await navigator.clipboard.writeText(currentPost.text || ""); $("postMsg").textContent = "הטקסט הועתק"; }
});
$("openBtn").addEventListener("click", () => {
  if (currentPost && currentPost.destinationUrl) chrome.tabs.create({ url: currentPost.destinationUrl });
});
$("publishedBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  const r = await send("REPORT", { payload: { postId: currentPost.postId, result: "user_confirmed_published" } });
  $("postMsg").textContent = r.ok ? "דווח כפורסם ✓" : "הדיווח נכשל";
  if (r.ok) await showNextPost();
});
$("cancelBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  await send("REPORT", { payload: { postId: currentPost.postId, result: "user_cancelled" } });
  await showNextPost();
});
$("refreshBtn").addEventListener("click", showNextPost);

// On open: if already paired, jump to the next post.
showNextPost();
