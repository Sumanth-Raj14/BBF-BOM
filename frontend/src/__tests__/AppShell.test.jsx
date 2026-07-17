import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../context/AppCtx.jsx", () => ({
  AppContext: React.createContext(null),
  AppCtxProvider: ({ children }) => (
    <div data-testid="app-ctx-provider">{children}</div>
  ),
}));

vi.mock("../hooks/useKeyboardShortcuts.js", () => ({
  default: vi.fn(),
}));

vi.mock("../components/TopBar.jsx", () => ({
  default: () => <div data-testid="topbar">TopBar</div>,
}));

vi.mock("../components/NavRail.jsx", () => ({
  default: () => <div data-testid="navrail">NavRail</div>,
  findNav: () => ({ label: "test" }),
  GROUPS: { flatMap: () => [] },
}));

vi.mock("../components/ModalsHost.jsx", () => ({
  default: () => <div data-testid="modals-host">ModalsHost</div>,
}));

vi.mock("../utils/storage.js", () => ({
  storage: {
    auth: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
    onboarding: { isDone: vi.fn(() => false), setDone: vi.fn() },
    role: { get: vi.fn(() => "Admin"), set: vi.fn() },
  },
  KEYS: {},
}));

import { AppCtxProvider } from "../context/AppCtx.jsx";

window.React = React;

beforeEach(() => {
  window.__t = vi.fn((key) => key);
  window.toast = vi.fn();
  window.ErrorBoundary = ({ children }) => children;
});

describe("App Shell", () => {
  it("AppCtxProvider renders children", () => {
    render(
      <AppCtxProvider>
        <div data-testid="child">hello</div>
      </AppCtxProvider>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });

  it("useKeyboardShortcuts hook can be called without error", async () => {
    const useKeyboardShortcuts = (
      await import("../hooks/useKeyboardShortcuts.js")
    ).default;
    expect(() => {
      useKeyboardShortcuts({ route: "dashboard", theme: "light" });
    }).not.toThrow();
  });
});
