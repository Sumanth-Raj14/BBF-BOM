import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const listMock = vi.fn();

vi.mock("../globals", () => ({
  INR: (n) => String(n),
  Icon: { Search: () => null },
  LeadHeat: ({ days }) => <span>{days}d</span>,
  Sparkline: () => null,
  useAppStore: () => null,
  api: { partVendors: { list: (...args) => listMock(...args) } },
}));

import SourcingView from "../components/SourcingView.jsx";

// pn "A-1000" at index 0 makes the old fabricated formula
// (charCodeAt(0) + i) % 4 produce 1 — deliberately different from the 3
// alternates the AVL table below actually holds.
const data = {
  rows: [
    {
      id: "api-7",
      pn: "A-1000",
      name: "Widget",
      vendor: "Acme",
      origin: "IN",
      lead: 10,
      cost: 5,
      trend: [1, 2, 3],
    },
  ],
};

beforeEach(() => {
  listMock.mockReset();
});

describe("SourcingView alt vendors", () => {
  it("shows the alternate-vendor count from part_vendors, not from the part number", async () => {
    listMock.mockResolvedValue({
      items: [
        { id: 1, partId: 7, isAlternate: false, isPreferred: true },
        { id: 2, partId: 7, isAlternate: true },
        { id: 3, partId: 7, isAlternate: true },
        { id: 4, partId: 7, isAlternate: true },
      ],
      total: 4,
      total_pages: 1,
    });

    render(<SourcingView data={data} onOpenDetail={() => {}} />);

    expect(await screen.findByText("3")).toBeTruthy();
    expect(listMock).toHaveBeenCalled();
    // 1 is what the part number would have fabricated.
    expect(screen.queryByText("1")).toBeNull();
  });

  it("reports the failure instead of a number when the AVL fetch fails", async () => {
    listMock.mockRejectedValue(new Error("boom"));

    render(<SourcingView data={data} onOpenDetail={() => {}} />);

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
  });
});
