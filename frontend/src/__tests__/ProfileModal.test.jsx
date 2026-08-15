import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

window.React = React;

const getMeMock = vi.fn();

vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
  api: { auth: { getMe: (...args) => getMeMock(...args) } },
}));

import ProfileModal from "../components/modals/ProfileModal.jsx";

// Used to show a hardcoded "Elena Chen" profile no matter who was logged
// in, and "Save changes" only toasted success without persisting anything.
describe("ProfileModal", () => {
  beforeEach(() => {
    getMeMock.mockReset();
  });

  it("shows the real logged-in user from GET /auth/me, not the fabricated Elena Chen", async () => {
    getMeMock.mockResolvedValue({
      fullName: "Priya Nair",
      email: "priya@example.com",
      jobTitle: "Procurement Lead",
      department: "Procurement",
    });

    render(<ProfileModal open onClose={() => {}} />);

    await waitFor(() => expect(getMeMock).toHaveBeenCalled());
    expect(await screen.findByText("Priya Nair")).toBeTruthy();
    expect(screen.queryByText("Elena Chen")).toBeNull();
    // No save action that can't actually persist anything.
    expect(screen.queryByText(/save changes/i)).toBeNull();
  });

  it("reports the failure instead of fabricated data when the profile fetch fails", async () => {
    getMeMock.mockRejectedValue(new Error("boom"));

    render(<ProfileModal open onClose={() => {}} />);

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.queryByText("Elena Chen")).toBeNull();
  });
});
