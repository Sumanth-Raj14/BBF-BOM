import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppContext } from "../context/AppCtx.jsx";
import SyncStatus from "../components/SyncStatus.jsx";

function createMockContext(overrides = {}) {
  const defaults = {
    syncStatus: {
      online: true,
      syncing: false,
      lastSync: null,
      pendingCount: 0,
    },
    apiConnected: true,
  };
  return { ...defaults, ...overrides };
}

function renderSyncStatus(ctxOverrides) {
  const ctx = createMockContext(ctxOverrides);
  return render(
    React.createElement(
      AppContext.Provider,
      { value: ctx },
      React.createElement(SyncStatus),
    ),
  );
}

describe("SyncStatus", () => {
  it("renders nothing when api is disconnected", () => {
    const { container } = renderSyncStatus({ apiConnected: false });
    expect(container.innerHTML).toBe("");
  });

  it("shows syncing indicator when syncing is true", () => {
    renderSyncStatus({
      syncStatus: { syncing: true, pendingCount: 0, lastSync: null },
    });
    expect(screen.getByText("SYNC")).toBeTruthy();
  });

  it("shows pending count when there are pending changes", () => {
    renderSyncStatus({
      syncStatus: { syncing: false, pendingCount: 3, lastSync: null },
    });
    expect(screen.getByText("3 PENDING")).toBeTruthy();
  });

  it("shows SAVED when lastSync is set and no pending changes", () => {
    renderSyncStatus({
      syncStatus: { syncing: false, pendingCount: 0, lastSync: Date.now() },
    });
    expect(screen.getByText("SAVED")).toBeTruthy();
  });
});
