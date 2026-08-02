import { describe, it, expect, vi } from "vitest";

import { setOfflineSimToggle, toggleOfflineSim } from "../offlineSim.js";

/**
 * Improvement #2: replaces window.__toggleOffline. These pin the semantics
 * the global had — including the "unavailable" branch the nav rail relied on
 * when NetworkBadge was unmounted — so the swap is behaviour-preserving.
 */
describe("offline-simulation registry", () => {
  it("reports unavailable when nothing is registered", () => {
    const off = setOfflineSimToggle(() => {});
    off();
    expect(toggleOfflineSim()).toBe(false);
  });

  it("runs the registered toggle and reports success", () => {
    const fn = vi.fn();
    const off = setOfflineSimToggle(fn);
    expect(toggleOfflineSim()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("a stale unregister cannot clear a newer toggle", () => {
    const oldFn = vi.fn();
    const newFn = vi.fn();
    const offOld = setOfflineSimToggle(oldFn);
    const offNew = setOfflineSimToggle(newFn);
    offOld();
    expect(toggleOfflineSim()).toBe(true);
    expect(newFn).toHaveBeenCalledTimes(1);
    expect(oldFn).not.toHaveBeenCalled();
    offNew();
  });
});
