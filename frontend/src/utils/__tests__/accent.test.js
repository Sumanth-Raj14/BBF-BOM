import { describe, it, expect } from "vitest";
import { accentTokensFor, contrastRatio } from "../accent.js";
import { ACCENT_PRESETS } from "../constants.js";

describe("accentTokensFor", () => {
  it("reproduces the locked default token set exactly", () => {
    const t = accentTokensFor("#e85d1f");
    expect(t["--accent"]).toBe("#E85D1F");
    expect(t["--accent-interactive"]).toBe("#E85D1F");
    expect(t["--accent-strong"]).toBe("#B8480F");
    expect(t["--accent-text"]).toBe("#B8480F");
    expect(t["--focus"]).toBe("#E85D1F");
  });

  it("moves the whole accent family together, not just --accent", () => {
    // The bug this closes: previously only --accent was set, leaving
    // --accent-strong/--accent-text/--focus desynced on non-default presets.
    const t = accentTokensFor("#0288d1");
    expect(t["--accent"]).toBe("#0288d1");
    expect(t["--accent-interactive"]).toBe("#0288d1");
    expect(t["--focus"]).toBe("#0288d1");
    // strong/text must differ from the raw preset when the raw preset itself
    // doesn't already clear AA body-text contrast.
    expect(t["--accent-strong"]).not.toBe("#0288d1");
    expect(t["--accent-text"]).toBe(t["--accent-strong"]);
  });

  it("every configured preset clears AA contrast for both text and non-text roles", () => {
    for (const hex of ACCENT_PRESETS) {
      const t = accentTokensFor(hex);
      // --accent-strong/--accent-text sit under white fills/text (buttons, links): >=4.5:1.
      expect(contrastRatio(t["--accent-strong"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t["--accent-text"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      // --accent-interactive/--focus are non-text (borders/rings/selection): >=3:1.
      expect(contrastRatio(t["--accent-interactive"], "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t["--focus"], "#ffffff")).toBeGreaterThanOrEqual(3);
    }
  });
});
