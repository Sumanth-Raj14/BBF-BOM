import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Logs in ONCE and saves the browser session for every other spec to reuse.
 *
 * Not a nicety: the backend enforces RATE_LIMIT_AUTH_PER_MINUTE = 5. A suite
 * that logs in per test exceeds that as soon as a few run in parallel, and the
 * later ones fail at the login step with a 429 — which looks exactly like a
 * broken screen. Worse, repeated bad logins trip the 5-attempt account lockout
 * (15 minutes), so a careless suite can lock the account it tests with.
 */
import { STORAGE_STATE } from "./storage-state.js";

const EMAIL = process.env.E2E_EMAIL || "admin@blackbox.com";
const PASSWORD = process.env.E2E_PASSWORD || "admin123";

setup("authenticate once", async ({ page, request }) => {
  // Don't burn a login attempt when the backend isn't there.
  let reachable = false;
  try {
    const r = await request.get("/api/v1/sso/providers");
    reachable = r.ok() && (r.headers()["content-type"] || "").includes("json");
  } catch {
    reachable = false;
  }
  if (!reachable) {
    // Write an empty state so dependent specs load and skip cleanly rather
    // than erroring on a missing file.
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "backend not reachable — skipping authentication");
    return;
  }

  await page.goto("/");
  await page.locator("#auth-email").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#auth-email").fill(EMAIL);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await expect(page.locator("#auth-password")).toBeHidden({ timeout: 20000 });

  // A freshly-authenticated account lands in the 5-step onboarding wizard,
  // which covers the whole app -- every screen test would otherwise assert
  // against "Name your workspace". Mark onboarding done, as it would be for
  // any established user. (storage.js KEYS.ONBOARDING)
  await page.evaluate(() => {
    localStorage.setItem("__bbox_onb", "1");
  });
  await page.reload();
  await page.waitForTimeout(1500);

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
