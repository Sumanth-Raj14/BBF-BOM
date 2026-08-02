import { describe, it, expect, vi } from "vitest";

import { setNavigator, navigateTo, hasNavigator } from "../navigation.js";

/**
 * Improvement #2: replaces window.__nav (55 call sites across 16 files).
 * These pin the semantics the global had, so the swap is behaviour-preserving.
 */
describe("navigation registry", () => {
  it("routes through the registered navigator", () => {
    const nav = vi.fn();
    const off = setNavigator(nav);
    navigateTo("bom");
    expect(nav).toHaveBeenCalledWith("bom");
    off();
  });

  it("no-ops before a navigator exists, as window.__nav?.() did", () => {
    const off = setNavigator(() => {});
    off();
    expect(hasNavigator()).toBe(false);
    expect(() => navigateTo("parts")).not.toThrow();
  });

  it("a stale unregister cannot clear a newer navigator", () => {
    // During a remount the new provider registers before the old one's
    // cleanup runs; the old cleanup must not tear down the live navigator.
    const oldNav = vi.fn();
    const newNav = vi.fn();
    const offOld = setNavigator(oldNav);
    setNavigator(newNav);
    offOld();
    expect(hasNavigator()).toBe(true);
    navigateTo("vendors");
    expect(newNav).toHaveBeenCalledWith("vendors");
    expect(oldNav).not.toHaveBeenCalled();
  });
});
