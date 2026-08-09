import { test } from "@playwright/test";

/** Diagnostic: does the built app boot, and does the login form work? */
test("app boots and login form submits", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + (e.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text().slice(0, 250));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const hasEmail = await page.locator("#auth-email").count();
  const rootHtml = (await page.locator("#root").innerHTML().catch(() => "")).slice(0, 300);

  console.log("=== auth-email present:", hasEmail);
  console.log("=== root html head:", rootHtml.replace(/\s+/g, " ").slice(0, 250));
  console.log("=== errors:\n" + (errs.slice(0, 12).join("\n") || "(none)"));

  if (hasEmail) {
    await page.locator("#auth-email").fill(process.env.E2E_EMAIL || "admin@blackbox.com");
    await page.locator("#auth-password").fill(process.env.E2E_PASSWORD || "admin123");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(5000);
    const stillThere = await page.locator("#auth-password").isVisible().catch(() => false);
    console.log("=== password field still visible after submit:", stillThere);
    console.log("=== post-submit errors:\n" + (errs.slice(0, 15).join("\n") || "(none)"));
  }
});
