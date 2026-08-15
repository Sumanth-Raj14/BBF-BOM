import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_STATE } from "./storage-state.js";

/**
 * Full-application route sweep.
 *
 * Purpose: prove that every route in the app actually renders against a REAL
 * backend, and record exactly how each one fails when it doesn't. The existing
 * specs cover a handful of screens; this one covers all of them, so "many pages
 * are not working" becomes a concrete, per-page list instead of an impression.
 *
 * For each route it records:
 *   - uncaught page errors (a JS crash blanks the screen)
 *   - console errors
 *   - failed API calls (4xx/5xx), with the status and path
 *   - whether the screen rendered any real content at all
 *
 * Results are written to e2e/sweep-report.json for triage. The test itself only
 * FAILS on a hard crash or a blank screen; API errors are reported but not
 * failed on, because some are backend-dialect artifacts on the SQLite sweep DB
 * rather than page bugs.
 */

test.use({ storageState: STORAGE_STATE });

const SWEEP_OUT = path.join(process.cwd(), "e2e", "sweep-report");

const ROUTES = [
  "/dashboard", "/bom", "/parts", "/inventory", "/vendors", "/members",
  "/procurement", "/diff", "/ecr", "/calendar", "/work-orders", "/ncr",
  "/qms", "/compliance", "/pdm", "/approvals", "/ocr", "/docs", "/analytics",
  "/activity", "/webhooks", "/bulk-import", "/erp", "/supplier-portal", "/ai",
  "/monitoring", "/order-tracking", "/scanner", "/enterprise-dashboards",
  "/tenant-admin", "/service-bom", "/routing", "/work-centers", "/labor",
  "/currency", "/compliance-autonumber", "/custom-attributes", "/api-keys",
  "/my-work", "/integrations", "/audit-trail", "/zoho-books", "/catalogs",
  "/traceability", "/deviations", "/bom-variants",
  // wave 2 parity screens
  "/requirements", "/mbom",
  "/cad-connectors",

  // Screens added for backends that previously had no UI surface.
  "/contracts", "/supplier-scorecards", "/make-vs-buy", "/esignatures",
];


test.describe("Route sweep", () => {
  for (const route of ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      const pageErrors = [];
      const consoleErrors = [];
      const apiFailures = [];

      page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
      });
      page.on("response", (r) => {
        const u = r.url();
        if (u.includes("/api/") && r.status() >= 400) {
          apiFailures.push(`${r.status()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
        }
      });

      await page.goto(route, { waitUntil: "domcontentloaded" });
      // let lazy chunks + first data fetches settle
      await page.waitForTimeout(2500);

      const main = page.locator("#main-content");
      const mainExists = await main.count();
      const text = mainExists ? ((await main.first().innerText().catch(() => "")) || "").trim() : "";
      const navVisible = await page.locator(".navrail").isVisible().catch(() => false);

      // An error boundary rendering its fallback is a crash the user sees.
      const boundary = await page
        .locator("text=/something went wrong|failed to load screen|screen failed/i")
        .count();

      const verdict = {
        route,
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 8),
        apiFailures: [...new Set(apiFailures)].slice(0, 12),
        contentChars: text.length,
        navVisible,
        errorBoundary: boundary > 0,
      };
      // One file per route, NOT a shared in-memory array: Playwright restarts
      // the worker process after a failed test, which would reset the array and
      // silently drop every result recorded before the first failure.
      fs.mkdirSync(SWEEP_OUT, { recursive: true });
      fs.writeFileSync(
        path.join(SWEEP_OUT, route.replace(/\//g, "_") + ".json"),
        JSON.stringify(verdict, null, 1),
      );

      // Hard failures only: a JS crash, an error boundary, or an empty screen.
      expect(pageErrors, `${route} threw: ${pageErrors[0] || ""}`).toHaveLength(0);
      expect(boundary, `${route} rendered an error boundary`).toBe(0);
      expect(
        text.length,
        `${route} rendered no content (blank screen)`
      ).toBeGreaterThan(20);
    });
  }
});
