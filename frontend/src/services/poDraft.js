/**
 * Purchase-order draft buffer, shared between the BOM editor and the parts
 * screen while a user assembles a PO.
 *
 * Improvement #2: replaces `window.__poDraft`, which both screens read and
 * wrote directly. Same semantics — a module-level buffer rather than a global
 * — but the dependency is now declared and the buffer can be reset in tests.
 */
let draft = [];

/** Current draft lines. Always an array. */
export function getPoDraft() {
  return draft;
}

/** Replace the draft. Non-arrays are ignored rather than corrupting callers. */
export function setPoDraft(lines) {
  if (Array.isArray(lines)) draft = lines;
  return draft;
}

/** Empty the draft (e.g. after the PO is submitted). */
export function clearPoDraft() {
  draft = [];
}
