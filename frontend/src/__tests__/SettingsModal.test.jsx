import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

window.React = React;

const usersListMock = vi.fn();

vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
  api: { users: { list: (...args) => usersListMock(...args) }, rbac: { roles: vi.fn(), permissions: vi.fn() } },
}));
vi.mock("../../api.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../context/AppCtx.jsx", () => ({ AppContext: React.createContext(null) }));
vi.mock("../services/navigation.js", () => ({ navigateTo: vi.fn() }));

import SettingsModal from "../components/modals/SettingsModal.jsx";

// Used to show a hardcoded "24 members" list (E. Chen, M. Park, ...) and a
// hardcoded permission matrix, roles, integrations, and billing — none of
// it backed by any endpoint. Members now come from GET /users.
describe("SettingsModal", () => {
  beforeEach(() => {
    usersListMock.mockReset();
  });

  it("loads real members from GET /users instead of the fabricated roster", async () => {
    usersListMock.mockResolvedValue({
      items: [{ id: 1, fullName: "Priya Nair", email: "priya@example.com", isActive: true, isSuperuser: false }],
      total: 1,
    });

    render(<SettingsModal open onClose={() => {}} />);
    screen.getByText(/Members/i).click();

    await waitFor(() => expect(usersListMock).toHaveBeenCalled());
    expect(await screen.findByText("Priya Nair")).toBeTruthy();
    expect(screen.queryByText("E. Chen")).toBeNull();
  });
});
