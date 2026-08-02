import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Improvement #3: check the frontend's hand-written request paths against the
 * backend's actual OpenAPI contract.
 *
 * `api.js` writes every path as a string literal, so a route that does not
 * exist — or a renamed one — is only discovered at runtime, usually as a 404
 * or a 422 that the UI swallows. Audit finding A8 was precisely this:
 * `erpConnectorsAPI.logs("latest")` fed a string into an `int` path parameter
 * and 422'd on every call.
 *
 * Regenerate the spec with `cd backend && python -m scripts.export_openapi`
 * after adding or renaming routes.
 */
const ROOT = path.resolve(__dirname, "../..");
const SPEC = path.join(ROOT, "openapi.json");
const API_JS = path.join(ROOT, "api.js");

/** Spec paths, minus the /api/v1 prefix api.js omits, as matchable regexes. */
function specMatchers(spec) {
  return Object.keys(spec.paths).map((p) => {
    const rel = p.replace(/^\/api\/v1/, "");
    // {param} matches any single non-slash segment, including a template hole.
    const rx = rel
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace(/\{[^}]+\}/g, "[^/]+");
    return { raw: p, rel, rx: new RegExp(`^${rx}$`) };
  });
}

/**
 * Paths api.js requests. Template holes (${...}) become a placeholder segment,
 * and any query string is dropped — neither affects which route is hit.
 */
function requestedPaths(src) {
  const found = new Set();
  // Each quote style is matched separately. A single character class like
  // [^`'"]+ truncates at the first quote INSIDE a template expression --
  // `/inventory/stock${q ? '?' + q : ''}` was captured as "/inventory/stock${q "
  // and then reported as a missing backend route. The test's own parser was
  // the bug; a backtick cannot appear unescaped inside a template literal, so
  // [^`]* is safe there.
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
    // Substitute template holes BEFORE splitting on "?": an interpolation such
    // as `/parts${query ? "?" + query : ""}` contains a literal "?", so
    // splitting first truncated the path to "/parts${query ".
    // A hole preceded by "/" is a path SEGMENT (/parts/${id}); one appended
    // directly is a query string (`/parts${query ? "?" + query : ""}`) and is
    // not part of the route at all. Treating both as segments produced
    // phantom paths like "/partsX".
    p = p.replace(/\/\$\{[^}]*\}/g, "/X");
    p = p.replace(/\$\{[^}]*\}/g, "");
    p = p.split("?")[0];
    p = p.replace(/\/+$/, "") || "/";
    found.add(p);
  }
  }
  return [...found];
}

/**
 * Paths api.js requests that the backend does NOT serve — every one of these
 * 404s or 405s at runtime today. Found by this test on its first real run.
 *
 * They are listed rather than fixed because each needs a decision this test
 * cannot make: whether the frontend should call a different existing route, or
 * the backend should grow the missing one. Guessing a mapping (e.g. that
 * "advance" means "/action") would paper over a product question.
 *
 * The list must only ever SHRINK. A new mismatch fails the test.
 */
const KNOWN_BROKEN = [
  "/barcodes/assign/X",     // backend: generate | image | lookup | qr — no assign
  "/barcodes/batch-generate", // no such route
  "/work-orders/X/advance", // backend exposes /work-orders/{id}/action
  "/eco/X/reject",          // backend exposes /eco/{id}/action and /approve
  "/eco/X/changes",         // no such route
  "/esignatures/X",         // backend exposes only /esignatures/
  "/bom/X",                 // /bom/{id} is not a route; /bom/ and /bom/compare are
];

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
    const src = fs.readFileSync(API_JS, "utf-8");
    const requested = requestedPaths(src);

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

  it("the known-broken list has not grown stale", () => {
    if (!specExists) return;
    const spec = JSON.parse(fs.readFileSync(SPEC, "utf-8"));
    const matchers = specMatchers(spec);
    // If the backend grew one of these routes, delete the entry — otherwise
    // the allowlist silently hides a path that now works.
    const nowValid = KNOWN_BROKEN.filter((p) =>
      matchers.some((m) => m.rx.test(p) || m.rx.test(p + "/")),
    );
    expect(
      nowValid,
      "these paths now exist on the backend — remove them from KNOWN_BROKEN",
    ).toEqual([]);
  });
});
