import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { SupplierPortalScreen } from "../integration-screens.jsx";

// integration-screens.jsx reads supplierPortalAPI as a bare global (legacy
// window-global build convention, not an ES import) — stub it on `window`,
// which is jsdom's global object, so the bare identifier resolves the same
// way it would in a browser.
beforeEach(() => {
  window.supplierPortalAPI = {
    listUsers: vi.fn().mockResolvedValue([]),
    listPriceUpdates: vi.fn(),
  };
  window.Icon = new Proxy(
    {},
    { get: () => (props) => <span {...props} /> },
  );
  window.SkeletonCards = () => <div />;
  window.INR = (v) => String(v ?? "");
});

describe("SupplierPortalScreen", () => {
  it("shows an honest 'not available for your role' state on a 403, not a failed/empty request", async () => {
    const err = new Error("Forbidden");
    err.status = 403;
    window.supplierPortalAPI.listPriceUpdates.mockRejectedValue(err);

    render(<SupplierPortalScreen />);

    expect(
      await screen.findByText(/not available for your role/i),
    ).toBeInTheDocument();
  });
});
