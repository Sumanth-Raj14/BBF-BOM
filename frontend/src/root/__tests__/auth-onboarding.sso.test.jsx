import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { AuthScreen, SSOCallbackScreen } from "../auth-onboarding.jsx";

// auth-onboarding.jsx reads `api` and `Icon` as bare globals (legacy
// window-global build convention used throughout this file, e.g.
// MobileScanView's `api.barcodes.lookup`) — stub them on `window`, which is
// jsdom's global object, the same way SupplierPortalScreen's test does.
beforeEach(() => {
  window.React = React;
  window.Icon = new Proxy({}, { get: () => (props) => <span {...props} /> });
  sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { search: "", href: "" },
  });
});

function providersResponse({ google = false, microsoft = false, github = false } = {}) {
  return {
    providers: [
      { id: "google", name: "Google", enabled: google },
      { id: "github", name: "GitHub", enabled: github },
      { id: "microsoft", name: "Microsoft", enabled: microsoft },
    ],
  };
}

describe("AuthScreen SSO buttons", () => {
  it("enables only the provider the backend reports configured, and starts a real redirect", async () => {
    const authorize = vi.fn().mockResolvedValue({
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=raw123",
      state: "raw123.signature",
      provider: "google",
    });
    window.api = {
      sso: {
        providers: vi.fn().mockResolvedValue(providersResponse({ google: true })),
        authorize,
      },
    };

    render(<AuthScreen onSignIn={() => {}} />);

    const googleBtn = await screen.findByRole("button", { name: /google/i });
    await waitFor(() => expect(googleBtn).not.toBeDisabled());
    const msBtn = screen.getByRole("button", { name: /microsoft/i });
    expect(msBtn).toBeDisabled();

    fireEvent.click(googleBtn);

    await waitFor(() => expect(authorize).toHaveBeenCalledWith("google"));
    await waitFor(() =>
      expect(window.location.href).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=raw123",
      ),
    );
    // The signed state (not the raw one the provider gets echoed) is stashed
    // for the callback to pair back up.
    expect(sessionStorage.getItem("sso_pending_provider")).toBe("google");
    expect(sessionStorage.getItem("sso_pending_state")).toBe("raw123.signature");
  });

  it("never fabricates a login — stays honestly disabled if the provider list can't be fetched", async () => {
    window.api = {
      sso: {
        providers: vi.fn().mockRejectedValue(new Error("network down")),
        authorize: vi.fn(),
      },
    };
    const onSignIn = vi.fn();

    render(<AuthScreen onSignIn={onSignIn} />);

    const googleBtn = await screen.findByRole("button", { name: /google/i });
    // Give the failed fetch a tick to settle, then assert it stayed disabled.
    await new Promise((r) => setTimeout(r, 0));
    expect(googleBtn).toBeDisabled();
    expect(onSignIn).not.toHaveBeenCalled();
  });
});

describe("SSOCallbackScreen", () => {
  it("completes the code exchange and reports a real session up, landing like a password login", async () => {
    sessionStorage.setItem("sso_pending_provider", "google");
    sessionStorage.setItem("sso_pending_state", "raw123.signature");
    window.location.search = "?code=provider-code-abc&state=raw123";
    const callback = vi.fn().mockResolvedValue({
      access_token: "jwt-token",
      user: { id: 1, email: "ssouser@example.com", fullName: "SSO User" },
      is_new_user: false,
    });
    window.api = { sso: { callback } };
    const onComplete = vi.fn();

    render(<SSOCallbackScreen onComplete={onComplete} />);

    await waitFor(() =>
      expect(callback).toHaveBeenCalledWith("google", "provider-code-abc", "raw123.signature"),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0].user.email).toBe("ssouser@example.com");
    // Single-use: the pending flow markers must not survive the exchange.
    expect(sessionStorage.getItem("sso_pending_provider")).toBeNull();
    expect(sessionStorage.getItem("sso_pending_state")).toBeNull();
  });

  it("shows a real error on denied consent instead of a silent redirect loop", async () => {
    sessionStorage.setItem("sso_pending_provider", "google");
    sessionStorage.setItem("sso_pending_state", "raw123.signature");
    window.location.search = "?error=access_denied&error_description=User+denied+access";
    const callback = vi.fn();
    window.api = { sso: { callback } };
    const onComplete = vi.fn();

    render(<SSOCallbackScreen onComplete={onComplete} />);

    expect(await screen.findByText(/denied/i)).toBeInTheDocument();
    expect(callback).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("refuses a mismatched state without ever calling the backend", async () => {
    sessionStorage.setItem("sso_pending_provider", "google");
    sessionStorage.setItem("sso_pending_state", "raw123.signature");
    window.location.search = "?code=abc&state=tampered-value";
    const callback = vi.fn();
    window.api = { sso: { callback } };
    const onComplete = vi.fn();

    render(<SSOCallbackScreen onComplete={onComplete} />);

    expect(await screen.findByText(/could not be verified|try again/i)).toBeInTheDocument();
    expect(callback).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows a real error when the exchange itself fails, never a fabricated login", async () => {
    sessionStorage.setItem("sso_pending_provider", "google");
    sessionStorage.setItem("sso_pending_state", "raw123.signature");
    window.location.search = "?code=abc&state=raw123";
    window.api = {
      sso: { callback: vi.fn().mockRejectedValue(new Error("Invalid state parameter")) },
    };
    const onComplete = vi.fn();

    render(<SSOCallbackScreen onComplete={onComplete} />);

    expect(await screen.findByText(/invalid state parameter/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
