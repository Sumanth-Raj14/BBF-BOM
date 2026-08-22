import { describe, it, expect, beforeEach } from "vitest";

import {
  isOfflineCapableError,
  rememberOfflineCredential,
  verifyOfflineCredential,
} from "../offlineAuth.js";

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

/**
 * The remaining half of A10: knowing the server is down said nothing about
 * WHO was asking. An unreachable server used to admit any email + any 4-char
 * password. Offline access is now gated on a credential this device has
 * already seen the server accept.
 */
describe("offline credential verifier", () => {
  beforeEach(() => localStorage.clear());

  it("REFUSES an account that never logged in on this device", async () => {
    expect(await verifyOfflineCredential("stranger@evil.com", "hunter2")).toBe(
      false,
    );
  });

  it("ACCEPTS the exact credential that previously succeeded online", async () => {
    expect(await rememberOfflineCredential("a@b.com", "correct horse")).toBe(
      true,
    );
    expect(await verifyOfflineCredential("a@b.com", "correct horse")).toBe(true);
    // case/whitespace on the email must not matter; the password must.
    expect(await verifyOfflineCredential(" A@B.com ", "correct horse")).toBe(
      true,
    );
  });

  it("REFUSES a wrong password for a known account", async () => {
    await rememberOfflineCredential("a@b.com", "correct horse");
    expect(await verifyOfflineCredential("a@b.com", "wrong horse")).toBe(false);
    expect(await verifyOfflineCredential("a@b.com", "")).toBe(false);
  });

  it("stores no plaintext password", async () => {
    await rememberOfflineCredential("a@b.com", "correct horse");
    expect(JSON.stringify(localStorage)).not.toContain("correct horse");
  });
});
