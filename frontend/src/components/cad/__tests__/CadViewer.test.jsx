import React from "react";
import { describe, it, expect } from "vitest";

window.React = React;

import { extOf, isViewable } from "../CadViewer.jsx";

/**
 * Pins the supported-format matrix. The viewer's whole value is being honest
 * about what it can render: the previous "3D preview" drew the same SVG
 * wireframe box for every file, including formats nothing can parse.
 */
describe("CadViewer format support", () => {
  it("accepts the mesh formats three ships loaders for", () => {
    ["part.stl", "a.obj", "a.gltf", "a.glb", "a.ply", "a.3mf"].forEach((f) =>
      expect(isViewable(f), f).toBe(true),
    );
  });

  it("accepts STEP and IGES (tessellated via the OpenCascade WASM kernel)", () => {
    ["a.step", "a.stp", "a.iges", "a.igs"].forEach((f) =>
      expect(isViewable(f), f).toBe(true),
    );
  });

  it("rejects proprietary CAD formats that genuinely cannot be parsed", () => {
    // If one of these ever returns true, the viewer would show an empty canvas
    // instead of telling the user to export a neutral format.
    ["a.sldprt", "a.sldasm", "a.ipt", "a.iam", "a.catpart"].forEach((f) =>
      expect(isViewable(f), f).toBe(false),
    );
  });

  it("is case-insensitive and survives odd names", () => {
    expect(isViewable("A.STEP")).toBe(true);
    expect(isViewable("my.model.v2.StL")).toBe(true);
    expect(isViewable("noextension")).toBe(false);
    expect(isViewable("")).toBe(false);
    expect(isViewable(null)).toBe(false);
    expect(extOf("a/b/c.Step")).toBe("step");
  });
});
