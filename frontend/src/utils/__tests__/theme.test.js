import { describe, it, expect, beforeEach } from "vitest";
import { storage, KEYS } from "../storage.js";
import { accentTokensFor, contrastRatio } from "../accent.js";
import { ACCENT_PRESETS } from "../constants.js";

describe("theme persistence (storage.theme)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to system when nothing is stored", () => {
    expect(storage.theme.get()).toBe("system");
  });

  it("persists an explicit light/dark/system choice", () => {
    storage.theme.set("dark");
    expect(storage.theme.get()).toBe("dark");
    expect(localStorage.getItem(KEYS.THEME)).toBe("dark");

    storage.theme.set("light");
    expect(storage.theme.get()).toBe("light");

    storage.theme.set("system");
    expect(storage.theme.get()).toBe("system");
  });
});

describe("accentTokensFor dark-mode AA", () => {
  it("keeps the light-mode token set unchanged (default theme arg)", () => {
    const t = accentTokensFor("#e85d1f");
    expect(t["--accent-text"]).toBe("#B8480F");
  });

  it("re-derives --accent-text for dark surfaces for every preset", () => {
    // The light-tuned --accent-text values are darkened for AA against a
    // *white* surface (~3.3:1 on a dark one — fails AA). Dark mode must
    // re-derive a brighter value that clears 4.5:1 against the lightest
    // dark surface (--bg-subtle, #232326).
    for (const hex of ACCENT_PRESETS) {
      const light = accentTokensFor(hex, "light");
      const dark = accentTokensFor(hex, "dark");
      expect(contrastRatio(dark["--accent-text"], "#232326")).toBeGreaterThanOrEqual(4.5);
      expect(dark["--accent-text"]).not.toBe(light["--accent-text"]);
    }
  });

  it("leaves --accent-strong/--accent-interactive/--focus untouched between themes", () => {
    const light = accentTokensFor("#e85d1f", "light");
    const dark = accentTokensFor("#e85d1f", "dark");
    expect(dark["--accent-strong"]).toBe(light["--accent-strong"]);
    expect(dark["--accent-interactive"]).toBe(light["--accent-interactive"]);
    expect(dark["--focus"]).toBe(light["--focus"]);
  });
});
