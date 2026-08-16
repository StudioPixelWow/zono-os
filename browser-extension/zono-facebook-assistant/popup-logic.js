// ============================================================================
// ZONO Facebook Assistant — PURE popup view-decision logic (v0.3).
// No DOM, no chrome.* — unit-tested by scripts/p9-7b-extension-harness.mts.
// Maps a (paired, post, error) result from the background NEXT_POST/STATE call
// to the popup view. The whole point: UNPAIRED is returned ONLY when genuinely
// not paired — a fetch error or an empty result keeps the user CONNECTED.
// ============================================================================
function decideView(state) {
  const { paired, post, error } = state || {};
  if (!paired) return { view: "UNPAIRED", msg: "" };
  if (post) return { view: "POST_READY", msg: "" };
  if (error === "auth") return { view: "REPAIR_HINT", msg: "החיבור דורש רענון — פתח שוב, ואם הבעיה נמשכת צור קוד חדש ב-ZONO." };
  if (error === "network") return { view: "RETRYABLE_ERROR", msg: "אין חיבור לרגע. נסה שוב." };
  if (error) return { view: "RETRYABLE_ERROR", msg: "שגיאה זמנית. נסה שוב." };
  return { view: "NO_POST", msg: "אין כרגע פוסט מוכן." };
}

// A view is "connected" (paired) for every state except UNPAIRED — so REPAIR_HINT,
// RETRYABLE_ERROR, NO_POST and POST_READY all keep the connected chrome visible.
function isConnectedView(view) { return view !== "UNPAIRED"; }

if (typeof module !== "undefined" && module.exports) module.exports = { decideView, isConnectedView };
if (typeof self !== "undefined") { self.decideView = decideView; self.isConnectedView = isConnectedView; }
