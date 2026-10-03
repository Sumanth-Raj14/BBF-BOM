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

/**
 * Offline credential verification.
 *
 * WHAT WAS FALSE BEFORE: an unreachable server let ANY email + any 4-char
 * password into the app shell. The login screen said "Offline mode" — i.e. it
 * claimed the user had been authenticated — when nothing had authenticated
 * anyone. isOfflineCapableError() only ever answered "is the server down?",
 * never "is this person known on this device?".
 *
 * Nothing verifiable was stored: storage.auth deliberately strips the password
 * (storage.js), so there was no way to check the credentials at all. So we
 * record a PBKDF2 verifier on each SUCCESSFUL online login, and offline access
 * is granted only to an account that has previously logged in on this device
 * with this same password. Unknown account, wrong password, or no WebCrypto
 * (insecure context) => offline login is REFUSED, not granted.
 *
 * Deliberately NOT a full local auth system: no lockout, no expiry, no
 * multi-device sync. The verifier is only a "you have been here before" gate;
 * the server remains the authority whenever it can be reached.
 * ponytail: PBKDF2-SHA256 in the page thread; move to a worker if the ~200ms
 * derive ever shows up on the login screen.
 */
const CRED_KEY = "__bbox_offline_cred";
const PBKDF2_ITERATIONS = 210000;

const hex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(CRED_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

async function derive(password, saltHex) {
  const subtle = globalThis.crypto?.subtle;
  // No WebCrypto (insecure context) => cannot verify => cannot admit anyone.
  if (!subtle || !saltHex) return null;
  const key = await subtle.importKey(
    "raw",
    new globalThis.TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = Uint8Array.from(
    saltHex.match(/../g).map((h) => parseInt(h, 16)),
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

/** Constant-time-ish compare so a wrong password leaks no prefix timing. */
function equals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Call ONLY after the server has confirmed these credentials. Records the
 * verifier that a later offline login is checked against.
 */
export async function rememberOfflineCredential(email, password) {
  if (!email || !password || !globalThis.crypto?.subtle) return false;
  try {
    const salt = hex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(password, salt);
    if (!hash) return false;
    const store = readStore();
    store[String(email).trim().toLowerCase()] = { salt, hash };
    localStorage.setItem(CRED_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when this exact account+password has already authenticated
 * successfully on this device. Never true for an account we have not seen.
 */
export async function verifyOfflineCredential(email, password) {
  if (!email || !password) return false;
  try {
    const rec = readStore()[String(email).trim().toLowerCase()];
    if (!rec?.salt || !rec?.hash) return false;
    return equals(await derive(password, rec.salt), rec.hash);
  } catch {
    return false;
  }
}

export default isOfflineCapableError;
