/**
 * App navigation, as an ES module instead of a global.
 *
 * Improvement #2. This replaces the old `window.__nav`, which AppCtx assigned
 * in an effect and 16 files then called optionally. That pattern has three
 * problems: nothing declares the dependency, the optional call silently does
 * nothing if the provider has not mounted yet, and it cannot be typed, traced
 * or mocked.
 *
 * It stays a registry rather than becoming react-router's `useNavigate`
 * because many callers are not React components — they are shim modules and
 * plain event handlers outside the tree, where hooks are illegal. The registry
 * keeps the existing runtime semantics exactly while removing the global.
 */
let navigator = null;

/**
 * Register the app's navigate function. Call from the router-aware provider.
 * @param {(route: string) => void} fn
 * @returns {() => void} unregister, for effect cleanup
 */
export function setNavigator(fn) {
  navigator = fn;
  return () => {
    // Only clear if we are still the active navigator: during a remount the
    // new provider may register before the old one's cleanup runs.
    if (navigator === fn) navigator = null;
  };
}

/**
 * Navigate to a route. No-ops before the provider mounts — the same behaviour
 * as the old optional global call, but it says so out loud in development
 * instead of vanishing silently.
 * @param {string} route
 */
export function navigateTo(route) {
  if (navigator) {
    navigator(route);
    return;
  }
  if (import.meta.env?.DEV) {
    console.warn(
      `[navigation] navigateTo(${JSON.stringify(route)}) before a navigator ` +
        "was registered — ignored.",
    );
  }
}

/** True once a navigator is registered. Exposed for tests. */
export function hasNavigator() {
  return navigator !== null;
}
