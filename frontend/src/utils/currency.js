/**
 * USD -> INR conversion rate, as a module instead of a global.
 *
 * Improvement #2, and a correctness fix. The code read `window.INR_RATE || 83`
 * in 19 places across 7 files — but nothing in the codebase ever ASSIGNED
 * window.INR_RATE. It was permanently undefined, so every rupee figure in the
 * app (analytics, PO exports, print views) silently used the hardcoded
 * fallback of 83, whatever the real rate was.
 *
 * The backend already exposes real rates at /api/v1/enterprise/exchange-rates
 * (and .../convert). `setInrRate()` is the seam for feeding those in; until a
 * caller does, `getInrRate()` returns the same 83 the app has always used, so
 * this change is behaviour-preserving on its own.
 */
export const DEFAULT_INR_RATE = 83;

let inrRate = DEFAULT_INR_RATE;

/** Current USD -> INR rate. Never returns undefined. */
export function getInrRate() {
  return inrRate;
}

/**
 * Override the rate, e.g. from GET /enterprise/exchange-rates.
 * Ignores non-finite or non-positive input rather than poisoning every money
 * figure in the UI with NaN.
 * @param {number} rate
 * @returns {boolean} whether it was accepted
 */
export function setInrRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return false;
  inrRate = n;
  return true;
}

/** Reset to the built-in default. Exposed for tests. */
export function resetInrRate() {
  inrRate = DEFAULT_INR_RATE;
}
