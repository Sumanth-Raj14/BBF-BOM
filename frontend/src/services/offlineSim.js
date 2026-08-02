/**
 * Offline-simulation toggle, as an ES module instead of a global.
 *
 * Improvement #2: replaces `window.__toggleOffline`. NetworkBadge (in
 * root/final-polish.jsx) owns the "pretend we are offline" state and used to
 * publish its setter on window in an effect; the nav rail's "Simulate
 * offline" menu item picked it up from there. That made the wiring invisible
 * and, worse, the cleanup read `delete window.__toggleOffline` — the kind of
 * assignment site a rename codemod turns into a syntax error.
 *
 * A registry rather than context, because the producer (NetworkBadge) and the
 * consumer (NavRail) are siblings with no shared provider between them and
 * the badge only mounts when the app is offline.
 */
let toggle = null;

/**
 * Register the toggle. Call from NetworkBadge's mount effect.
 * @param {() => void} fn
 * @returns {() => void} unregister, for effect cleanup
 */
export function setOfflineSimToggle(fn) {
  toggle = fn;
  return () => {
    // Only clear if we are still the active toggle: during a remount the new
    // badge may register before the old one's cleanup runs.
    if (toggle === fn) toggle = null;
  };
}

/**
 * Flip the simulated-offline state.
 * @returns {boolean} true if a toggle was registered and ran, false if the
 *   feature is unavailable — callers use this to explain themselves to the
 *   user, which is what the old `if (window.__toggleOffline)` guard did.
 */
export function toggleOfflineSim() {
  if (!toggle) return false;
  toggle();
  return true;
}
