// CAD format tables and the pure predicates over them — deliberately free of
// any three.js import.
//
// Why this file exists: `isViewable` used to live in CadViewer.jsx, which
// statically imports three plus six of its loaders (~600 kB). Anything asking
// the cheap question "can this file be previewed?" therefore dragged the whole
// 3D engine into the main bundle, so every user downloaded a renderer just to
// look at a parts list. Keeping the tables here lets CadViewer be loaded lazily
// while callers still answer that question synchronously.
//
// CadViewer.jsx re-exports extOf/isViewable from here, so existing imports
// keep working.

export const MESH_EXT = {
  stl: "stl",
  obj: "obj",
  gltf: "gltf",
  glb: "gltf",
  ply: "ply",
  "3mf": "3mf",
};

export const OCCT_EXT = { step: "step", stp: "step", iges: "iges", igs: "iges" };

// Proprietary binaries with no public format — only their originating CAD
// package can open them. Listed so the UI can say so plainly rather than
// failing to render and looking broken.
export const NATIVE_CAD_EXT = ["sldprt", "sldasm", "ipt", "iam", "prt", "catpart"];

export function extOf(name) {
  return String(name || "")
    .split(".")
    .pop()
    .toLowerCase();
}

export function isViewable(name) {
  const e = extOf(name);
  return Boolean(MESH_EXT[e] || OCCT_EXT[e]);
}

export function isNativeCad(name) {
  return NATIVE_CAD_EXT.includes(extOf(name));
}
