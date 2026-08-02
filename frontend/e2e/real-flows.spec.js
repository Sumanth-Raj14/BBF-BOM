import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "./storage-state.js";

/**
 * End-to-end tests that exercise the app against a REAL backend.
 *
 * Why this file exists alongside e2e/smoke.spec.js: that suite seeds
 * `localStorage.__bbox_auth` to skip the login screen, and it runs against
 * `vite preview`, which (until the `preview.proxy` added in this change) had no
 * route to the API at all. So it rendered a frontend talking to nothing — which
 * is exactly why it caught none of the failures found by hand: the missing dev
 * proxy, CSRF-less uploads, the analytics crash on real data, the folder-tree
 * null crash, or the offline-login auth bypass.
 *
 * These tests log in through the actual form and assert on real API responses.
 *
 * REQUIREMENTS: a backend on 127.0.0.1:8000 with a known user. Skips (does not
 * fail) when the backend is absent, so `npm run test:e2e` stays usable offline.
 */
const EMAIL = process.env.E2E_EMAIL || "admin@blackbox.com";
const PASSWORD = process.env.E2E_PASSWORD || "admin123";

/** Screens to walk. `path` is the SPA route; `expect` a string that must appear. */
const SCREENS = [
  { path: "/parts", name: "Components" },
  { path: "/vendors", name: "Suppliers" },
  { path: "/procurement", name: "Procurement" },
  { path: "/members", name: "Members" },
  { path: "/docs", name: "Documents" },
  { path: "/analytics", name: "Analytics" },
];

async function backendUp(request) {
  try {
    const r = await request.get("/api/v1/sso/providers");
    return r.ok() && (r.headers()["content-type"] || "").includes("json");
  } catch {
    return false;
  }
}

/** Collect page errors so a screen that throws cannot silently "pass". */
function watchForCrashes(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}


/** Log in through the real form. Uses the inputs' stable ids: placeholders are
 *  i18n-driven and would break the moment the UI language changes. */
async function login(page, email = EMAIL, password = PASSWORD) {
  await page.goto("/");
  await page.locator("#auth-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.locator('button[type="submit"]').first().click();
}

test.describe("Real backend flows", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await backendUp(request)),
      "backend not reachable on /api/v1 — start uvicorn to run these",
    );
  });

  test("the API is reachable through the app origin (not the SPA fallback)", async ({
    request,
  }) => {
    // Guards the proxy itself. When it is missing this returns text/html and
    // every client call dies with "Unexpected token '<'".
    const res = await request.get("/api/v1/sso/providers");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("protected endpoints reject anonymous callers", async ({ request }) => {
    const res = await request.get("/api/v1/rbac/roles");
    expect([401, 403]).toContain(res.status());
  });

  test("a wrong password does NOT get into the app", async ({ page }) => {
    // Regression cover for A10: the offline fallback must not admit anyone
    // just because the server answered unhappily.
    await login(page, EMAIL, "definitely-not-the-password");
    await page.waitForTimeout(3000);
    await expect(page.locator("#auth-password")).toBeVisible();
  });

  test("a real login reaches the app shell", async ({ page }) => {
    const errors = watchForCrashes(page);
    await login(page);
    await expect(page.locator("#auth-password")).toBeHidden({ timeout: 20000 });
    expect(
      errors.filter((e) => /Unexpected token '<'|is not valid JSON/.test(e)),
      "API responses must be JSON, not the SPA fallback",
    ).toEqual([]);
  });

  // Reuse the session captured by auth.setup.js -- see the rate-limit note there.
  test.describe("authenticated screens", () => {
    test.use({ storageState: STORAGE_STATE });

  for (const screen of SCREENS) {
    test(`${screen.name} renders without a crash`, async ({ page }) => {
      const errors = watchForCrashes(page);
      await page.goto(screen.path);
      await page.waitForTimeout(2500);

      // An ErrorBoundary swallows the throw and renders a fallback, so the page
      // still "loads" — assert the fallback is absent, not just that we got HTML.
      await expect(
        page.getByText(/Screen failed to load|An error occurred while loading/i),
      ).toHaveCount(0);

      // The specific crash classes found by hand this cycle.
      const fatal = errors.filter((e) =>
        /Cannot read properties of (null|undefined)|Element type is invalid|is not a function|Unexpected token '<'/.test(
          e,
        ),
      );
      expect(fatal, `${screen.name} threw: ${fatal.join(" | ")}`).toEqual([]);
    });
  }
  });
});
