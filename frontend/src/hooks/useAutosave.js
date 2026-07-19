import React from "react";
import { storage } from "../utils/storage.js";

export const DEFAULT_AUTOSAVE_DELAY_MS = 800;

/**
 * Draft-safety for in-progress editor/form state.
 *
 * Debounce-persists `value` to a localStorage-backed draft (namespaced by
 * `screen` + `entityId`, via storage.drafts) so unsaved edits survive an
 * accidental reload/navigation/crash. Any existing draft is detected
 * synchronously on first render (before paint) so callers can offer a
 * "Draft restored" affordance with no extra render/flash.
 *
 * This hook does NOT own the caller's field state — it only watches
 * whatever `value` is passed in and mirrors it to disk. Callers stay in
 * full control of applying/discarding a restored draft:
 *
 *   const autosave = useAutosave({ screen: "new-part", entityId: "new", value: form });
 *   React.useEffect(() => {
 *     if (autosave.hasDraft && autosave.draftValue) setForm(autosave.draftValue);
 *   }, []); // run once, on mount
 *   ...
 *   // after a successful save:
 *   autosave.clearDraft();
 *
 * @param {Object} opts
 * @param {string} opts.screen - Screen/surface identifier, e.g. "new-part" or "bom-editor".
 * @param {string|number} [opts.entityId="new"] - Entity being edited (part id, BOM id, ...).
 * @param {*} opts.value - Current live value to autosave (must be JSON-serializable).
 * @param {boolean} [opts.enabled=true] - Set false to pause detection + autosaving.
 * @param {number} [opts.delay=800] - Debounce delay in ms before persisting.
 * @returns {{
 *   hasDraft: boolean,
 *   draftValue: *,
 *   restoredAt: number|null,
 *   discardDraft: () => void,
 *   clearDraft: () => void,
 * }}
 */
export function useAutosave({
  screen,
  entityId = "new",
  value,
  enabled = true,
  delay = DEFAULT_AUTOSAVE_DELAY_MS,
} = {}) {
  // Detect an existing draft synchronously via lazy useState initializers —
  // this runs during the first render, so hasDraft/draftValue are correct
  // immediately (no effect round-trip / flash of empty state).
  const [initial] = React.useState(() =>
    enabled ? storage.drafts.get(screen, entityId) : null,
  );
  const [hasDraft, setHasDraft] = React.useState(() => !!initial);
  const [draftValue, setDraftValue] = React.useState(() =>
    initial ? initial.value : null,
  );
  const [restoredAt, setRestoredAt] = React.useState(() =>
    initial ? initial.savedAt || null : null,
  );

  const timerRef = React.useRef(null);
  // Skip persisting on the very first run so we don't immediately overwrite
  // an as-yet-unreviewed draft with the form's pristine initial value.
  const firstRunRef = React.useRef(true);

  React.useEffect(() => {
    if (!enabled) return undefined;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return undefined;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      storage.drafts.set(screen, entityId, value);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay, enabled, screen, entityId]);

  const discardDraft = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    storage.drafts.clear(screen, entityId);
    setHasDraft(false);
    setDraftValue(null);
    setRestoredAt(null);
  }, [screen, entityId]);

  // Same as discardDraft — kept as a distinct name so call sites read as
  // intent ("this save succeeded, the draft is now stale") rather than
  // "the user opted out of their draft".
  const clearDraft = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    storage.drafts.clear(screen, entityId);
    setHasDraft(false);
    setDraftValue(null);
    setRestoredAt(null);
  }, [screen, entityId]);

  return { hasDraft, draftValue, restoredAt, discardDraft, clearDraft };
}

export default useAutosave;
