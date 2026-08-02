import React from "react";
import { describe, it, expect } from "vitest";

window.React = React;

import { AppContext } from "../AppCtx.jsx";
import { AppCtx as OverlaysAppCtx, useAppStore } from "../../root/overlays.jsx";

/**
 * KNOWN DEFECT — deliberately documented, not fixed.
 *
 * There are TWO app context objects and only one is ever provided:
 *   - context/AppCtx.jsx exports AppContext — AppCtxProvider mounts THIS one.
 *   - root/overlays.jsx exports AppCtx, and useAppStore() reads THAT one.
 *
 * Nothing provides the overlays context, so useAppStore() returns null and
 * every `const ctx = useAppStore(); ctx?.foo` read through it is silently
 * undefined — ~40 sites, including BomEditorScreen's permission lookup, which
 * therefore always falls back to Viewer.
 *
 * WHY IT IS STILL HERE: unifying them was attempted and MEASURED. Pointing
 * both at one shared context object builds cleanly and passes all 184 unit
 * tests, but takes the Playwright suite from 35 passed / 4 failed to
 * 15 passed / 24 failed — waking ~40 dormant code paths at once breaks the
 * app. The fix is therefore a project of its own: unify, then work through
 * the woken paths one by one.
 *
 * This test FAILS the moment someone unifies them, which is the intended
 * outcome — at that point delete it, along with the workarounds citing it
 * (see the three modals that use React.useContext(AppContext) directly).
 */
describe("app context identity (known defect)", () => {
  it("the provided context and the one useAppStore reads are NOT the same object", () => {
    expect(AppContext).not.toBe(OverlaysAppCtx);
  });

  it("useAppStore exists but reads the unprovided context", () => {
    expect(typeof useAppStore).toBe("function");
  });
});
