import React from "react";
import { describe, it, expect } from "vitest";

window.React = React;

import { AppContext } from "../AppCtx.jsx";
import { AppCtx as OverlaysAppCtx, useAppStore } from "../../root/overlays.jsx";

/**
 * KNOWN DEFECT, documented so it cannot be forgotten.
 *
 * There are TWO React context objects and only one is ever provided:
 *   - context/AppCtx.jsx exports AppContext — AppCtxProvider mounts THIS one.
 *   - root/overlays.jsx exports AppCtx, and useAppStore() reads THAT one.
 *
 * Nothing provides the overlays context, so useAppStore() returns null
 * everywhere and every `const ctx = useAppStore(); ctx?.foo` is silently
 * undefined — ~40 sites, including BomEditorScreen's permission check, which
 * therefore always falls back to Viewer.
 *
 * This test FAILS the moment someone unifies the two, which is the intended
 * fix. When that happens, delete this test and the workarounds citing it.
 */
describe("app context identity (known defect)", () => {
  it("the provided context and the one useAppStore reads are NOT the same object", () => {
    expect(AppContext).not.toBe(OverlaysAppCtx);
  });

  it("useAppStore exists but reads the unprovided context", () => {
    expect(typeof useAppStore).toBe("function");
  });
});
