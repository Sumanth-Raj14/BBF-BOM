import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

window.React = React;

const listMock = vi.fn();

vi.mock("../globals", () => ({
  INR: (n) => String(n),
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
  api: { priceHistory: { list: (...args) => listMock(...args) } },
}));

import QuoteHistoryModal from "../components/modals/QuoteHistoryModal.jsx";

const vendor = { id: 9, name: "Acme Corp" };

// Used to show the same fixed 8 fake quotes (Q-2026-0182 etc.) for every
// vendor. Real per-vendor data comes from GET /price-history?vendorId=.
describe("QuoteHistoryModal", () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it("loads real price history for the vendor instead of the fabricated quote list", async () => {
    listMock.mockResolvedValue({
      items: [{ id: 1, partId: 42, price: 12.5, currency: "USD", source: "manual", effectiveDate: "2026-05-01" }],
      total: 1,
    });

    render(<QuoteHistoryModal open vendor={vendor} onClose={() => {}} />);

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ vendorId: 9, per_page: 100 }));
    expect(await screen.findByText("42")).toBeTruthy();
    expect(screen.queryByText(/Q-2026-0182/)).toBeNull();
    expect(screen.queryByText(/New RFQ/i)).toBeNull();
  });

  it("reports the failure instead of a fabricated number when the fetch fails", async () => {
    listMock.mockRejectedValue(new Error("boom"));

    render(<QuoteHistoryModal open vendor={vendor} onClose={() => {}} />);

    expect(await screen.findByText(/failed/i)).toBeTruthy();
  });
});
