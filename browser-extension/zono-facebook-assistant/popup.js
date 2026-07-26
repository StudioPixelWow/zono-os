// ============================================================================
// ZONO Facebook Assistant — popup logic (skeleton).
// Pairing screen + next-post viewer + manual result reporting. The user copies
// text, opens the destination, publishes BY HAND on Facebook, then confirms.
// There is NO DOM auto-click publishing here — every publish is human-driven.
// ============================================================================
const $ = (id) => document.getElementById(id);
let currentPost = null;

// P4.3 capture state.
let captureDisabledForSession = false; // set true after a 404 (server feature off)
let capturePending = false;            // guards double-submit
let captureAttachedPostId = null;      // the post the capture form is currently bound to

function send(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

async function showNextPost() {
  const { post } = await send("NEXT_POST", {});
  currentPost = post;
  if (!post) { $("postCard").style.display = "none"; syncCaptureToCurrentPost(); return; }
  $("pairCard").style.display = "none";
  $("postCard").style.display = "block";
  $("dest").textContent = post.destinationName || "יעד פרסום";
  $("text").textContent = [post.text, (post.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  syncCaptureToCurrentPost();
}

// ── P4.3: human-confirmed interaction capture ────────────────────────────────
const shortId = (id) => (typeof id === "string" && id.length > 8 ? id.slice(0, 8) + "…" : (id || ""));

function clearCaptureFields() {
  ["capText", "capAuthor", "capProfile", "capCommentId", "capPostId", "capPostUrl"].forEach((id) => { $(id).value = ""; });
  $("capType").value = "comment";
}

// Bind the capture form to the CURRENT source post. When the post changes, clear
// any old inputs so nothing is accidentally attached to the new post.
function syncCaptureToCurrentPost() {
  const postId = currentPost && currentPost.postId ? currentPost.postId : null;
  if (postId !== captureAttachedPostId) {
    clearCaptureFields();
    $("captureMsg").textContent = "";
    captureAttachedPostId = postId;
  }
  const canCapture = !!postId && !captureDisabledForSession;
  $("captureCard").style.display = (postId || captureDisabledForSession) ? "block" : "none";
  $("captureForm").style.display = canCapture ? "block" : "none";
  if (canCapture) {
    $("captureContext").textContent = `תצורף לפוסט: ${(currentPost.destinationName || "יעד")} · #${shortId(postId)}`;
  } else if (captureDisabledForSession) {
    $("captureContext").textContent = "שמירת אינטראקציות אינה זמינה כרגע.";
  }
}

function handleCaptureResult(result) {
  switch (result && result.kind) {
    case "success":
      $("captureMsg").textContent = `נשמר ✓ ${result.deduped ? "(כבר קיים)" : ""} · שיוך: ${result.attribution === "post" ? "מקושר לפוסט" : "ללא שיוך"}`;
      clearCaptureFields(); // keep the source-post context, clear the interaction
      break;
    case "invalid":
      $("captureMsg").textContent = "הקלט נדחה — בדוק ונסה שוב."; break;
    case "unauthorized":
      $("captureMsg").textContent = "יש לחבר מחדש את התוסף."; break;
    case "disabled":
      captureDisabledForSession = true; syncCaptureToCurrentPost();
      $("captureMsg").textContent = "היכולת אינה זמינה כרגע."; break;
    case "rate_limited":
      $("captureMsg").textContent = "יותר מדי בקשות — נסה שוב בעוד רגע."; break;
    default:
      $("captureMsg").textContent = "השמירה נכשלה — נסה שוב מאוחר יותר.";
  }
}

async function submitCapture() {
  if (capturePending) return; // double-click / re-entry guard
  if (!currentPost || !currentPost.postId) { $("captureMsg").textContent = "אין פוסט טעון."; return; }

  const form = {
    interactionType: $("capType").value,
    messageText: $("capText").value,
    personName: $("capAuthor").value,
    profileUrl: $("capProfile").value,
    externalCommentId: $("capCommentId").value,
    externalPostId: $("capPostId").value,
    externalPostUrl: $("capPostUrl").value,
  };
  const v = ZonoCapture.validateCaptureInput(form);
  if (!v.ok) { $("captureMsg").textContent = v.error === "empty" ? "יש להזין תוכן או מזהה תגובה." : "קלט לא תקין."; return; }

  // sourcePostId comes ONLY from currentPost.postId; never any campaign/property/group.
  const forPostId = currentPost.postId;
  const payload = ZonoCapture.buildCapturePayload(forPostId, v.value);

  capturePending = true;
  $("captureBtn").disabled = true;
  $("captureMsg").textContent = "שומר…";
  let result;
  try { result = await send("CAPTURE_INTERACTION", { payload }); }
  catch { result = { kind: "error" }; }
  capturePending = false;
  $("captureBtn").disabled = false;

  // Invalidate a result whose source post is no longer the one loaded (the popup
  // switched posts while the request was in flight) — do not apply it.
  if (!currentPost || currentPost.postId !== forPostId) return;
  handleCaptureResult(result);
}

$("captureBtn").addEventListener("click", submitCapture);

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
