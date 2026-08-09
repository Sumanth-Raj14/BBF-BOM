import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression tests for the poisoned offline write queue.
 *
 * The bug: dataService.set() passed a whole COLLECTION (an array) to a
 * single-entity create endpoint. POST /api/v1/parts answered 422, and
 * processQueue's catch-all requeued the failed write unconditionally — so the
 * unsendable entry replayed on every app boot forever. In a 46-route browser
 * sweep this fired 76 failing POST /parts, one or two on every single page.
 *
 * Three things must hold now:
 *   1. an array payload is never posted to a single-entity create
 *   2. a permanently-invalid queue entry is dropped, not retried forever
 *   3. already-poisoned queues in localStorage self-heal on load
 */

const QUEUE_KEY = "__bbox_sync_queue";

describe("offline sync queue poisoning", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("drops an already-poisoned queue entry on load (array payload for create)", async () => {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        { domain: "parts", action: "create", payload: [], ts: 1 },
        { domain: "parts", action: "create", payload: [{ pn: "A" }, { pn: "B" }], ts: 2 },
        { domain: "parts", action: "create", payload: { pn: "GOOD" }, ts: 3 },
      ]),
    );

    // Importing the module runs the sanitiser the first time the queue loads.
    const mod = await import("../services/dataService.js");
    // Touch the queue through any public path that reads it.
    if (mod.dataService?.getSyncStatus) mod.dataService.getSyncStatus();

    const remaining = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    const shapes = remaining.map((r) => Array.isArray(r.payload));
    expect(
      shapes.every((isArr) => isArr === false),
      "array-payload create entries must be dropped",
    ).toBe(true);
    expect(remaining.some((r) => r.payload?.pn === "GOOD")).toBe(true);
  });

  it("never enqueues a whole collection as a single-entity create", async () => {
    const mod = await import("../services/dataService.js");
    const ds = mod.dataService || mod.default;

    // A whole-collection replace: this is what AppCtx does with BOM rows.
    await ds.set("parts", [{ pn: "X" }, { pn: "Y" }]).catch(() => {});

    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    const badly = queue.filter(
      (q) => (q.action === "create" || q.action === "update") && Array.isArray(q.payload),
    );
    expect(badly, "a collection must never be queued as a single create").toHaveLength(0);
  });
});
