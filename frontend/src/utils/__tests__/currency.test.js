import { describe, it, expect, beforeEach } from "vitest";

import {
  DEFAULT_INR_RATE,
  getInrRate,
  setInrRate,
  resetInrRate,
} from "../currency.js";

/**
 * Improvement #2 / A12. `window.INR_RATE || 83` appeared in 19 places, but
 * nothing ever assigned window.INR_RATE — so every rupee figure in the app
 * used the hardcoded 83 regardless of the real rate.
 */
describe("INR rate", () => {
  beforeEach(() => resetInrRate());

  it("defaults to the rate the app has always effectively used", () => {
    expect(getInrRate()).toBe(DEFAULT_INR_RATE);
    expect(DEFAULT_INR_RATE).toBe(83);
  });

  it("accepts a real rate, so backend rates can drive the UI", () => {
    expect(setInrRate(87.42)).toBe(true);
    expect(getInrRate()).toBe(87.42);
  });

  it("rejects junk instead of poisoning every money figure with NaN", () => {
    for (const bad of [0, -5, NaN, Infinity, "abc", null, undefined, {}]) {
      expect(setInrRate(bad), String(bad)).toBe(false);
    }
    expect(getInrRate()).toBe(DEFAULT_INR_RATE);
  });
});
