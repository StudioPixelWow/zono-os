// ============================================================================
// ZONO Facebook Assistant — content script (skeleton), runs on facebook.com.
// ONLY detects whether the user appears to be logged into Facebook in THIS
// browser tab, by checking for logged-in DOM markers. It does NOT read cookies,
// does NOT read passwords, and does NOT transmit any Facebook session data —
// only a boolean is sent to the background worker. No DOM auto-click publishing.
// ============================================================================
(function () {
  function facebookSessionDetected() {
    // Heuristic, cookie-free: presence of a logged-in chrome (nav bar / profile).
    // We never read document.cookie and never capture tokens.
    return !!document.querySelector('[aria-label],[role="navigation"]') &&
      /facebook\.com/.test(location.hostname) &&
      !/login|checkpoint/.test(location.pathname);
  }

  function bestEffortProfileName() {
    // Optional, display-only; null if not safely available. No IDs/tokens scraped.
    const el = document.querySelector('[aria-label][role="navigation"] span');
    const txt = el && el.textContent ? el.textContent.trim() : "";
    return txt && txt.length <= 60 ? txt : null;
  }

  function report() {
    try {
      chrome.runtime.sendMessage({
        type: "HEARTBEAT",
        facebookSessionDetected: facebookSessionDetected(),
        facebookProfileName: bestEffortProfileName(),
      });
    } catch { /* extension context may be reloading */ }
  }

  // Report once on load, then every 2 minutes while the tab is open.
  report();
  setInterval(report, 2 * 60 * 1000);
})();
