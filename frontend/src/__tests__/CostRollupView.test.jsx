import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// The one thing worth a test here is the money: a leaf's quantity must be
// multiplied through every ancestor, and a percentage must never divide a
// figure in one currency by a base in another.
const { costRollup, currencies, useAppStore } = vi.hoisted(() => ({
  costRollup: vi.fn(),
  currencies: vi.fn(),
  useAppStore: vi.fn(),
}));

vi.mock("../globals", () => ({
  INR: (n) => `Rs${(Number(n) || 0).toFixed(2)}`,
  api: { bomEnterprise: { costRollup }, enterprise: { currencies } },
  useAppStore,
}));

// Force the English fallback strings the component supplies after `||`.
vi.mock("../i18n", () => ({ __t: () => "" }));

import CostRollupView from "../components/CostRollupView.jsx";

// SUB(qty 4) > LEAF(qty 2, Rs10)  -> effective qty 8, Rs80
// EMPTY(qty 3, Rs5) with children: [] is a LEAF, not an empty parent -> Rs15
const rows = () => [
  {
    id: 1,
    pn: "TOP",
    name: "Top",
    rev: "A",
    qty: 1,
    children: [
      {
        id: 2,
        pn: "SUB",
        name: "Sub",
        rev: "A",
        qty: 4,
        cost: 0,
        category: "Mech",
        vendor: "V",
        children: [
          {
            id: 3,
            pn: "LEAF",
            name: "Leaf",
            rev: "A",
            qty: 2,
            cost: 10,
            category: "Mech",
            vendor: "V",
          },
        ],
      },
      {
        id: 4,
        pn: "EMPTY",
        name: "EmptyKids",
        rev: "A",
        qty: 3,
        cost: 5,
        category: "Elec",
        vendor: "V",
        children: [],
      },
    ],
  },
];

beforeEach(() => {
  costRollup.mockReset();
  currencies.mockReset();
  currencies.mockResolvedValue([{ code: "EUR" }]);
  useAppStore.mockReturnValue({ rows: rows() });
});

describe("CostRollupView", () => {
  it("ranks parts on quantity multiplied through every ancestor, and counts a children:[] node as a costed leaf", async () => {
    costRollup.mockResolvedValue({
      total_cost: 95,
      reporting_currency: null,
      uom_warnings: [],
      currency_warnings: [],
    });

    render(<CostRollupView data={{ rows: rows() }} />);

    await waitFor(() => expect(costRollup).toHaveBeenCalled());
    // 2 per parent x 4 parents, not 2.
    expect(await screen.findByText("8")).toBeInTheDocument();
    // Twice each: once in the by-sub-assembly list, once in the parts table.
    // Both traversals must agree — that they print the same number is the check.
    expect(screen.getAllByText("Rs80.00")).toHaveLength(2);
    // Regression: testing `r.children` alone dropped this row from the ranking
    // while its Rs15 stayed in the percentage base.
    // Twice: the sub-assembly list AND the parts ranking. Before the fix it
    // appeared only in the list.
    expect(screen.getAllByText("EmptyKids")).toHaveLength(2);
    expect(screen.getAllByText("Rs15.00")).toHaveLength(2);
  });

  it("does not divide an as-costed row by a converted total, and says so", async () => {
    costRollup.mockResolvedValue({
      total_cost: 500,
      reporting_currency: "EUR",
      uom_warnings: [],
      currency_warnings: [],
    });

    render(<CostRollupView data={{ rows: rows() }} />);

    // Rs80 of Rs95 as-costed = 84.2%. Against the EUR 500 total it would be 16%.
    expect(await screen.findByText("84.2% of BOM")).toBeInTheDocument();
    expect(screen.getByText(/percentages are of the as-costed total/i))
      .toBeInTheDocument();
    // The converted total is never run through the local INR display rate.
    expect(screen.queryByText(/Rs500\.00/)).not.toBeInTheDocument();
  });

  it("excludes unconvertible lines loudly instead of folding them in at 1:1", async () => {
    costRollup.mockResolvedValue({
      total_cost: 80,
      reporting_currency: "EUR",
      uom_warnings: [],
      currency_warnings: [
        {
          part_number: "EMPTY",
          from_currency: "INR",
          to_currency: "EUR",
          unconverted_amount: 15,
          message: "No active exchange rate for INR -> EUR; line excluded.",
        },
      ],
    });

    render(<CostRollupView data={{ rows: rows() }} />);

    expect(
      await screen.findByText(/no exchange rate and are excluded from the total/i),
    ).toBeInTheDocument();
  });

  it("re-fetches with the reporting_currency the user picks", async () => {
    costRollup.mockResolvedValue({
      total_cost: 95,
      reporting_currency: null,
      uom_warnings: [],
      currency_warnings: [],
    });

    render(<CostRollupView data={{ rows: rows() }} />);

    await waitFor(() => expect(costRollup).toHaveBeenCalledWith(1, undefined));
  });
});
