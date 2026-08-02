import { describe, it, expect } from "vitest";

import { isOfflineCapableError } from "../offlineAuth.js";

/**
 * Regression tests for audit finding A10 — an authentication bypass.
 *
 * The local-first offline path lets a previously-known user into the app shell
 * when the server cannot be reached to validate their credentials. Because it
 * skips credential validation entirely, it must trigger ONLY on genuine
 * network loss.
 *
 * "Internal server error" was on the offline list, so any HTTP 500 — proof the
 * server received the request and answered — opened the full shell to
 * arbitrary credentials.
 */
describe("isOfflineCapableError (A10 auth bypass guard)", () => {
  it("REJECTS a reachable-but-erroring server (the bypass)", () => {
    // The exact string that caused the bypass. If this ever returns true
    // again, any password gets into the app whenever the server 500s.
    expect(isOfflineCapableError("Internal server error")).toBe(false);
    expect(isOfflineCapableError("HTTP 500")).toBe(false);
    expect(isOfflineCapableError("500: Internal server error")).toBe(false);
  });

  it("REJECTS ordinary failed logins", () => {
    expect(isOfflineCapableError("Incorrect email or password")).toBe(false);
    expect(isOfflineCapableError("HTTP 401")).toBe(false);
    expect(isOfflineCapableError("Account locked. Try again in 5 minute(s).")).toBe(
      false,
    );
    expect(isOfflineCapableError("")).toBe(false);
    expect(isOfflineCapableError(null)).toBe(false);
    expect(isOfflineCapableError(undefined)).toBe(false);
  });

  it("ACCEPTS genuine transport failures, preserving local-first offline login", () => {
    // Guards the other direction: over-tightening this would break offline use
    // on a disconnected on-prem machine, which is a core product promise.
    expect(isOfflineCapableError("Failed to fetch")).toBe(true);
    expect(isOfflineCapableError("NetworkError when attempting to fetch")).toBe(
      true,
    );
    expect(
      isOfflineCapableError("Unable to connect to server — please check your connection"),
    ).toBe(true);
    expect(
      isOfflineCapableError("Service temporarily unavailable — try again later"),
    ).toBe(true);
  });
});
