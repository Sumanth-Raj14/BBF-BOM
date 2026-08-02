import React from "react";
import { describe, it, expect } from "vitest";

window.React = React;

import { AppContext } from "../AppCtx.jsx";
import { AppContext as LeafContext, useAppStore } from "../appContext.js";
import { AppCtx as OverlaysAppCtx } from "../../root/overlays.jsx";

/**
 * There must be exactly ONE app context object.
 *
 * There used to be two createContext calls: AppCtxProvider mounted the one in
 * context/AppCtx.jsx, while useAppStore() read a different one in
 * root/overlays.jsx. Nothing provided the latter, so useAppStore() returned
 * null app-wide and every `const ctx = useAppStore(); ctx?.foo` was silently
 * undefined — ~40 sites, including BomEditorScreen's permission lookup, which
 * therefore always fell back to Viewer.
 *
 * Both now re-export the single object from context/appContext.js.
 *
 * NOTE for whoever removes the shim layer: overlays.jsx must keep assigning
 * window.useAppStore / window.AppCtx until the src/root/*.jsx files stop
 * calling `useAppStore` as a bare global. Dropping those assignments produces
 * "ReferenceError: useAppStore is not defined" across the app.
 */
describe("app context identity", () => {
  it("the provided context and the one useAppStore reads are the SAME object", () => {
    expect(AppContext).toBe(LeafContext);
    expect(OverlaysAppCtx).toBe(LeafContext);
  });

  it("exactly one context object is exported under both names", () => {
    expect(AppContext).toBe(OverlaysAppCtx);
  });

  it("the bare-global shim the root/*.jsx layer depends on is still installed", () => {
    expect(window.useAppStore).toBe(useAppStore);
    expect(window.AppCtx).toBe(LeafContext);
  });
});
