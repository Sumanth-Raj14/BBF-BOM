import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "./storage-state.js";

/**
 * Proves the four newly added screens are REACHABLE BY CLICKING, not just by
 * typing a URL.
 *
 * The route sweep navigates straight to a path, so it would still pass if the
 * nav entry were missing, mislabelled, or pointed at the wrong id — which is
 * exactly how a feature ends up shipped-but-unreachable. That was the original
 * defect for all four of these: working backend, working API client, no way in.
 */

test.use({ storageState: STORAGE_STATE });

const NEW_SCREENS = [
  { label: "Contracts", path: "/contracts", heading: /contract/i },
  { label: "Supplier Scorecards", path: "/supplier-scorecards", heading: /scorecard/i },
  { label: "Make vs Buy", path: "/make-vs-buy", heading: /make.*buy/i },
  { label: "E-Signatures", path: "/esignatures", heading: /signature/i },
];

for (const s of NEW_SCREENS) {
  test(`nav "${s.label}" reaches ${s.path}`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The rail collapses its groups on narrow viewports; make sure the entry is
    // present in the DOM before clicking it.
    const item = page.getByRole("button", { name: s.label, exact: true }).first();
    await expect(item, `nav entry "${s.label}" should exist`).toBeVisible({
      timeout: 15000,
    });

    await item.click();
    await page.waitForURL(`**${s.path}`, { timeout: 15000 });
    await page.waitForLoadState("networkidle");

    expect(pageErrors, `no JS crash on ${s.path}`).toEqual([]);

    // The screen rendered its own header, not an empty shell or a 404.
    await expect(
      page.getByRole("heading", { name: s.heading }).first(),
    ).toBeVisible({ timeout: 15000 });
  });
}
