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
  if (!currentPost) return;
  await navigator.clipboard.writeText(currentPost.text || "");
  $("postMsg").textContent = "הטקסט הועתק";
  send("EVENT", { postId: currentPost.postId, event: "copied" }); // assisted, not a publish
});
$("openBtn").addEventListener("click", () => {
  if (currentPost && currentPost.destinationUrl) {
    chrome.tabs.create({ url: currentPost.destinationUrl });
    send("EVENT", { postId: currentPost.postId, event: "opened" });
  }
});
$("openImgBtn").addEventListener("click", () => {
  const url = currentPost && currentPost.imageUrls && currentPost.imageUrls[0];
  if (url) chrome.tabs.create({ url });
});
$("publishedBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  // Optional: capture the published post URL.
  const url = prompt("הדבק קישור לפוסט שפורסם (לא חובה):") || null;
  const r = await send("REPORT", { payload: { postId: currentPost.postId, result: "user_confirmed_published", externalPostUrl: url } });
  $("postMsg").textContent = r.ok ? "דווח כפורסם ✓" : "הדיווח נכשל";
  if (r.ok) await showNextPost();
});
$("failedBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  const reason = prompt("מה הסיבה לכשל? (לא חובה)") || null;
  await send("REPORT", { payload: { postId: currentPost.postId, result: "failed", errorMessage: reason } });
  await showNextPost();
});
$("skipBtn").addEventListener("click", async () => {
  if (!currentPost) return;
  await send("REPORT", { payload: { postId: currentPost.postId, result: "user_skipped" } });
  await showNextPost();
});
$("refreshBtn").addEventListener("click", showNextPost);

// On open: if already paired, jump to the next post.
showNextPost();
