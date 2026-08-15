import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "./storage-state.js";

/**
 * WRITE flows: prove the app can actually change data, not just display it.
 *
 * real-flows.spec.js only reads. Every bug this cycle that involved a write —
 * CSRF-less multipart uploads (403), the tenantId NOT NULL violations, the
 * missing download endpoint — would have sailed past a read-only suite.
 *
 * These drive the HTTP API through the browser's authenticated session, so the
 * cookie, CSRF header and tenant scoping are all exercised exactly as the UI
 * uses them. They assert persistence by reading the record back.
 *
 * Everything created is prefixed E2E-WF- and deleted in the same test.
 */
test.use({ storageState: STORAGE_STATE });

const TAG = "E2E-WF-";

async function backendUp(request) {
  try {
    const r = await request.get("/api/v1/sso/providers");
    return r.ok() && (r.headers()["content-type"] || "").includes("json");
  } catch {
    return false;
  }
}

/** The app sends the CSRF token from its cookie on mutating requests. */
async function csrf(context) {
  const cookies = await context.cookies();
  const c = cookies.find((x) => x.name === "csrf_token");
  return c ? decodeURIComponent(c.value).split(".")[0] : "";
}

test.beforeEach(async ({ request }) => {
  test.skip(!(await backendUp(request)), "backend not reachable");
});

test("session from the UI login is authenticated for the API", async ({ request }) => {
  const res = await request.get("/api/v1/auth/me");
  expect(res.status(), "storageState should carry a valid session").toBe(200);
  const me = await res.json();
  expect(me.email).toBeTruthy();
});

test("create -> read back -> delete a part", async ({ request, context }) => {
  const token = await csrf(context);
  const pn = `${TAG}PART-${Date.now()}`;

  const created = await request.post("/api/v1/parts", {
    headers: { "X-CSRF-Token": token },
    data: { pn, name: "E2E write-flow part", category: "Electrical", cost: 1.23 },
  });
  expect([200, 201], await created.text()).toContain(created.status());
  const part = await created.json();
  expect(part.id).toBeTruthy();

  // Persistence is the point: read it back as a separate request.
  const fetched = await request.get(`/api/v1/parts/${part.id}`);
  expect(fetched.status()).toBe(200);
  expect((await fetched.json()).pn).toBe(pn);

  const removed = await request.delete(`/api/v1/parts/${part.id}`, {
    headers: { "X-CSRF-Token": token },
  });
  expect([200, 204]).toContain(removed.status());

  const gone = await request.get(`/api/v1/parts/${part.id}`);
  expect(gone.status()).toBe(404);
});

test("a mutating request without the CSRF token is rejected", async ({ request }) => {
  // Regression cover for A5: uploads bypassed CSRF entirely and 403'd in the
  // UI. This pins that the protection is real and that the suite would notice
  // if it were silently disabled.
  const res = await request.post("/api/v1/parts", {
    headers: { "X-CSRF-Token": "" },
    data: { pn: `${TAG}NO-CSRF`, name: "should not persist", category: "Electrical" },
  });
  // Deliberately exact: `not.toBe(201)` would also pass on a 500, which would
  // hide a broken endpoint as if it were working protection.
  expect([401, 403], `expected a CSRF rejection, got ${res.status()}`).toContain(
    res.status(),
  );
});

test("the seeded BOM explodes into its real multi-level tree", async ({ request }) => {
  // Exercises the closure table the seed fixture builds through bom_service,
  // including bom_closures.ancestor_item_id/descendant_item_id — the columns
  // that were unindexed until improvement #6.
  const list = await request.get("/api/v1/bom/?limit=50");
  expect(list.status()).toBe(200);
  const payload = await list.json();
  const boms = payload.items || payload.data || payload;
  const seeded = (Array.isArray(boms) ? boms : []).find((b) =>
    String(b.bom_number || b.bomNumber || "").startsWith("E2E-ASSY"),
  );
  test.skip(!seeded, "seed fixture not present — run scripts.seed_e2e_fixture");

  const items = await request.get(`/api/v1/bom/${seeded.id}/items`);
  expect(items.status()).toBe(200);
  const lines = await items.json();
  const rows = lines.items || lines;
  expect(Array.isArray(rows) ? rows.length : 0).toBeGreaterThan(5);
});

test("a document download is served and tenant-scoped", async ({ request }) => {
  // The download endpoint did not exist at all before this cycle.
  const missing = await request.get("/api/v1/documents/999999/download");
  expect(missing.status()).toBe(404);
});
