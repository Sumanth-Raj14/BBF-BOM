import path from "node:path";

/**
 * Where auth.setup.js saves the logged-in browser session for other specs.
 * Lives in its own module because Playwright forbids a spec importing another
 * spec/setup file.
 */
export const STORAGE_STATE = path.join(
  process.cwd(),
  "e2e",
  ".auth",
  "user.json",
);
