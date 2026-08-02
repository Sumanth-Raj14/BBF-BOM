import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Improvement #3: check the frontend's hand-written request paths against the
 * backend's actual OpenAPI contract.
 *
 * `api.js` writes every path as a string literal, so a route that does not
 * exist — or one that was renamed — is only discovered at runtime, usually as
 * a 404 or a 422 the UI swallows. Audit finding A8 was exactly that:
 * `erpConnectorsAPI.logs("latest")` fed a string into an `int` path parameter
 * and 422'd on every call.
 *
 * Regenerate the spec after adding or renaming routes:
 *     cd backend && python -m scripts.export_openapi
 */
const ROOT = path.resolve(__dirname, "../..");
const SPEC = path.join(ROOT, "openapi.json");
const API_JS = path.join(ROOT, "api.js");

/**
 * Paths api.js requests that the backend does NOT serve.
 *
 * The list must only ever SHRINK — a new mismatch fails the test below, and a
 * second test fails if one of these starts working, so the allowlist cannot
 * silently hide a route that now exists.
 *
 * Currently empty: all five known dead calls were deleted rather than
 * allowlisted, because nothing in the UI called them.
 */
const KNOWN_BROKEN = [];

/** Spec paths, minus the /api/v1 prefix api.js omits, as matchable regexes. */
function specMatchers(spec) {
  return Object.keys(spec.paths).map((p) => {
    const rel = p.replace(/^\/api\/v1/, "");
    const rx = rel
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace(/\{[^}]+\}/g, "[^/]+");
    return { raw: p, rel, rx: new RegExp(`^${rx}$`) };
  });
}

/**
 * Paths api.js requests, with template holes resolved to a placeholder segment
 * and query strings dropped — neither affects which route is hit.
 */
function requestedPaths(src) {
  const found = new Set();
  // Each quote style is matched separately. A single class like [^`'"]+
  // truncates at the first quote INSIDE a template expression, so
  // `/inventory/stock${q ? "?" + q : ""}` was captured as "/inventory/stock${q "
  // and reported as a missing route. A backtick cannot appear unescaped inside
  // a template literal, so [^`]* is safe there.
  const patterns = [
    /apiRequest\(\s*`([^`]*)`/g,
    /apiRequest\(\s*'([^']*)'/g,
    /apiRequest\(\s*"([^"]*)"/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) {
      let p = m[1];
      if (!p.startsWith("/")) continue;
      // A hole whose expression builds a QUERY (it contains a quoted "?") is
      // not part of the route even when it follows a slash:
      // `/esignatures/${q ? "?" + q : ""}` is the path /esignatures/ plus a
      // query. Strip these first or they masquerade as a path segment.
      p = p.replace(/\$\{[^}]*['"`]\?['"`][^}]*\}/g, "");
      // A remaining hole after a slash is a real path segment (/parts/${id}).
      p = p.replace(/\/\$\{[^}]*\}/g, "/X");
      // Anything still left is appended directly — a bare query interpolation.
      p = p.replace(/\$\{[^}]*\}/g, "");
      p = p.split("?")[0];
      p = p.replace(/\/+$/, "") || "/";
      found.add(p);
    }
  }
  return [...found];
}

const specExists = fs.existsSync(SPEC);

describe("frontend/backend API contract", () => {
  it("the exported OpenAPI spec is present", () => {
    expect(
      specExists,
      "openapi.json missing — run: cd backend && python -m scripts.export_openapi",
    ).toBe(true);
  });

  it("every path api.js requests exists on the backend", () => {
    if (!specExists) return;
    const spec = JSON.parse(fs.readFileSync(SPEC, "utf-8"));
    const matchers = specMatchers(spec);
    const requested = requestedPaths(fs.readFileSync(API_JS, "utf-8"));

    // Guard against a silently broken parser reporting a vacuous pass.
    expect(requested.length, "parsed no paths out of api.js").toBeGreaterThan(50);

    const unknown = requested
      .filter((p) => !matchers.some((m) => m.rx.test(p) || m.rx.test(p + "/")))
      .filter((p) => !KNOWN_BROKEN.includes(p));

    expect(
      unknown,
      `api.js requests ${unknown.length} path(s) the backend does not serve. ` +
        "Either the route was renamed/removed, or openapi.json is stale " +
        "(cd backend && python -m scripts.export_openapi).",
    ).toEqual([]);
  });

  it("the known-broken list has not gone stale", () => {
    if (!specExists) return;
    const spec = JSON.parse(fs.readFileSync(SPEC, "utf-8"));
    const matchers = specMatchers(spec);
    const nowValid = KNOWN_BROKEN.filter((p) =>
      matchers.some((m) => m.rx.test(p) || m.rx.test(p + "/")),
    );
    expect(
      nowValid,
      "these paths now exist on the backend — remove them from KNOWN_BROKEN",
    ).toEqual([]);
  });
});
