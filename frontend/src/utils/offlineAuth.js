/**
 * When may a failed login fall back to the LOCAL-FIRST offline path?
 *
 * Audit finding A10 (auth bypass). This product is local-first: if the server
 * genuinely cannot be reached, a previously-known user is let into the app
 * shell because there is no way to ask the server whether their credentials
 * are valid. That reasoning holds for exactly one situation — the server is
 * UNREACHABLE.
 *
 * "Internal server error" used to be treated as offline. An HTTP 500 proves
 * the server received the request and answered, so that turned any 5xx into a
 * skeleton key: arbitrary credentials opened the full app shell. A
 * reachable-but-erroring server is a FAILED LOGIN.
 *
 * Extracted from the inline handler in screens/App.jsx so this rule is a named,
 * tested unit rather than an anonymous boolean inside a catch block.
 *
 * @param {string} message  the error message thrown by the login attempt
 * @returns {boolean} true only when the failure looks like genuine network loss
 */
export function isOfflineCapableError(message) {
  const msg = String(message || "");
  // Transport-level failures: the request never got an HTTP answer.
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Unable to connect") ||
    // The API client's circuit breaker, which (since A4) only opens on
    // transport/5xx failures rather than on deterministic 4xx responses.
    msg.includes("temporarily unavailable")
  );
}

export default isOfflineCapableError;
