import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { variantGet } = vi.hoisted(() => ({ variantGet: vi.fn() }));

vi.mock("../../api.js", () => ({
  api: {
    bomEnterprise: {
      variants: { get: variantGet, create: vi.fn(), addItem: vi.fn() },
    },
  },
}));

import BomVariantsScreen from "../components/screens/BomVariantsScreen.jsx";

const VARIANT = {
  id: 7,
  base_bom_id: 2,
  variant_name: "230 V / EU",
  description: "European mains configuration",
  status: "active",
  configuration_rules: null,
  created_at: "2026-05-04T10:00:00Z",
  items: [
    {
      id: 11,
      part_id: 55,
      part_number: "PSU-230-EU",
      quantity: "1.0000",
      is_optional: false,
      substitute_part_id: 56,
      condition_expression: "region == 'EU'",
    },
  ],
};

function openVariant(id) {
  const input = screen.getByLabelText(/Open a variant by id/i);
  fireEvent.change(input, { target: { value: String(id) } });
  fireEvent.submit(input.closest("form"));
}

beforeEach(() => {
  variantGet.mockReset();
});

describe("BomVariantsScreen", () => {
  it("starts empty because the API has no variant list endpoint", () => {
    render(<BomVariantsScreen />);

    expect(screen.getByText("No BOM variant open")).toBeInTheDocument();
    expect(variantGet).not.toHaveBeenCalled();
  });

  it("renders the variant and its items returned by /bom/variants/{id}", async () => {
    variantGet.mockResolvedValue(VARIANT);

    render(<BomVariantsScreen />);
    openVariant(7);

    expect(await screen.findByText("230 V / EU")).toBeInTheDocument();
    expect(screen.getByText("European mains configuration")).toBeInTheDocument();
    expect(screen.getByText("PSU-230-EU")).toBeInTheDocument();
    expect(screen.getByText("part #56")).toBeInTheDocument();
    expect(screen.getByText("region == 'EU'")).toBeInTheDocument();
    expect(screen.getByText("BOM #2")).toBeInTheDocument();
  });

  it("shows an explicit empty state for a variant with no items", async () => {
    variantGet.mockResolvedValue({ ...VARIANT, items: [] });

    render(<BomVariantsScreen />);
    openVariant(7);

    expect(
      await screen.findByText("This variant has no items yet"),
    ).toBeInTheDocument();
  });

  it("shows that the lookup failed instead of rendering a blank variant", async () => {
    variantGet.mockRejectedValue(new Error("Variant not found"));

    render(<BomVariantsScreen />);
    openVariant(999);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Variant not found");
    });
    expect(screen.queryByText("230 V / EU")).not.toBeInTheDocument();
  });
});
