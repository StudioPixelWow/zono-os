// ============================================================================
// ZONO Facebook Assistant — pure capture helpers (P4.3).
// No chrome / DOM / fetch at module scope, so this file loads safely in the
// popup (via <script>), in the service worker (via importScripts) AND under Node
// (via module.exports) for unit tests. Human-confirmed interaction capture only:
// no scraping, no auto-submit. Tenancy/attribution ids are NEVER built here — the
// ZONO server is authoritative for org/property/campaign/group.
// ============================================================================
(function (root) {
  "use strict";

  var TYPES = ["comment", "message", "reaction"];
  var MAX_TEXT = 4000, MAX_NAME = 200, MAX_URL = 2000, MAX_ID = 300;
  var MAX_RETRIES = 2;

  function clean(v, max) {
    if (typeof v !== "string") return undefined;
    var t = v.trim();
    if (!t) return undefined;
    return t.length > max ? t.slice(0, max) : t;
  }

  // Validate + normalize a human-entered capture form. Mirrors the P4.2 server
  // contract: empty (no text AND no external id) is rejected; a reaction may omit
  // text but must carry an external comment id. Unicode/Hebrew preserved by trim.
  function validateCaptureInput(form) {
    if (!form || typeof form !== "object") return { ok: false, error: "invalid" };
    var interactionType = TYPES.indexOf(form.interactionType) >= 0 ? form.interactionType : "comment";
    var externalCommentId = clean(form.externalCommentId, MAX_ID);
    var messageText = clean(form.messageText, MAX_TEXT);
    if (!externalCommentId && !messageText) return { ok: false, error: "empty" };
    return {
      ok: true,
      value: {
        interactionType: interactionType,
        externalCommentId: externalCommentId,
        externalPostId: clean(form.externalPostId, MAX_ID),
        externalPostUrl: clean(form.externalPostUrl, MAX_URL),
        personName: clean(form.personName, MAX_NAME),
        profileUrl: clean(form.profileUrl, MAX_URL),
        messageText: messageText,
      },
    };
  }

  // Build the EXACT request payload. sourcePostId comes ONLY from the caller
  // (currentPost.postId). Never includes organizationId/propertyId/campaignId/
  // groupId/leadId — the server resolves attribution. Empty optionals are omitted.
  function buildCapturePayload(sourcePostId, value) {
    var p = { sourcePostId: sourcePostId, platform: "facebook", interactionType: value.interactionType };
    if (value.externalCommentId) p.externalCommentId = value.externalCommentId;
    if (value.externalPostId) p.externalPostId = value.externalPostId;
    if (value.externalPostUrl) p.externalPostUrl = value.externalPostUrl;
    if (value.personName) p.personName = value.personName;
    if (value.profileUrl) p.profileUrl = value.profileUrl;
    if (value.messageText) p.messageText = value.messageText;
    return p;
  }

  // Map an HTTP status + parsed json body to a stable client outcome.
  function classifyCaptureResponse(status, json) {
    if (status >= 200 && status < 300 && json && json.ok) {
      return { kind: "success", id: (json && json.id) || null, deduped: !!(json && json.deduped), attribution: (json && json.attribution) || "unresolved" };
    }
    if (status === 400) return { kind: "invalid", error: (json && json.error) || "bad_request" };
    if (status === 401) return { kind: "unauthorized" };
    if (status === 404) return { kind: "disabled" };
    if (status === 429) return { kind: "rate_limited" };
    if (status >= 500 || status === 0) return { kind: "retryable" };
    return { kind: "error" };
  }

  // Short, bounded, increasing backoff for the network/5xx retry path only.
  function nextRetryDelay(attempt) {
    return Math.min(400 * Math.pow(2, attempt), 2000);
  }

  var api = {
    validateCaptureInput: validateCaptureInput,
    buildCapturePayload: buildCapturePayload,
    classifyCaptureResponse: classifyCaptureResponse,
    nextRetryDelay: nextRetryDelay,
    MAX_RETRIES: MAX_RETRIES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.ZonoCapture = api; }
})(typeof self !== "undefined" ? self : this);
