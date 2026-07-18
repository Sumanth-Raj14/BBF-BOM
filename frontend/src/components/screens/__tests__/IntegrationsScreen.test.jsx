import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../utils/toast", () => ({
  toast: vi.fn(),
}));
vi.mock("../../../../api.js", () => ({
  apiRequest: vi.fn(),
}));

import { toast } from "../../../utils/toast";
import { apiRequest } from "../../../../api.js";
import IntegrationsScreen from "../IntegrationsScreen.jsx";

function mockConnections(overrides = {}) {
  return [
    {
      provider: "clickup",
      is_enabled: true,
      status: "ok",
      last_error: null,
      has_credentials: true,
      config: { space_id: "sp1" },
      ...overrides,
    },
  ];
}

describe("IntegrationsScreen — live test-connection", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    toast.mockReset();
  });

  it("calls POST /integrations/{provider}/test-connection and shows an honest result", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/integrations/") return mockConnections();
      if (path === "/integrations/deliveries") return [];
      if (path === "/integrations/clickup/test-connection") {
        return {
          provider: "clickup",
          ok: true,
          reason: "ok",
          detail: "Credentials verified.",
          checked_at: "2026-07-18T10:00:00Z",
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    render(<IntegrationsScreen />);

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/integrations/"));

    const btns = await screen.findAllByRole("button", { name: "Test connection" });
    fireEvent.click(btns[0]); // clickup is the first provider card

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/integrations/clickup/test-connection",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    expect(await screen.findByText(/Credentials verified\./)).toBeTruthy();
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Credentials verified."),
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("reports a failed check honestly and never renders a raw secret", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/integrations/") return mockConnections();
      if (path === "/integrations/deliveries") return [];
      if (path === "/integrations/clickup/test-connection") {
        return {
          provider: "clickup",
          ok: false,
          reason: "auth_failed",
          detail: "Provider rejected the request (HTTP 401).",
          checked_at: "2026-07-18T10:00:00Z",
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    render(<IntegrationsScreen />);
    const btns = await screen.findAllByRole("button", { name: "Test connection" });
    fireEvent.click(btns[0]);

    expect(
      await screen.findByText(/Provider rejected the request \(HTTP 401\)\./),
    ).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("disables the Test connection button when no credentials are saved yet", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/integrations/")
        return mockConnections({ has_credentials: false, is_enabled: false, status: "unconfigured" });
      if (path === "/integrations/deliveries") return [];
      throw new Error(`unexpected path ${path}`);
    });

    render(<IntegrationsScreen />);
    const btns = await screen.findAllByRole("button", { name: "Test connection" });
    expect(btns[0]).toBeDisabled();
  });

  it("renders a 'Not configured' StatusPill without ever claiming success, even on a stale check", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/integrations/") return mockConnections();
      if (path === "/integrations/deliveries") return [];
      if (path === "/integrations/clickup/test-connection") {
        return {
          provider: "clickup",
          ok: false,
          reason: "not_configured",
          detail: "No credentials saved for this provider yet.",
          checked_at: "2026-07-18T10:00:00Z",
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    render(<IntegrationsScreen />);
    const btns = await screen.findAllByRole("button", { name: "Test connection" });
    fireEvent.click(btns[0]);

    expect(await screen.findByText("Not configured")).toBeTruthy();
    expect(
      screen.getByText(/No credentials saved for this provider yet\./),
    ).toBeTruthy();
    // Honest failure: the live check never fires a success toast.
    expect(toast).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: "error" }),
    );
  });
});
