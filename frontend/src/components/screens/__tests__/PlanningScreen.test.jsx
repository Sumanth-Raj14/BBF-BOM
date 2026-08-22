import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

window.React = React;

vi.mock("../../../utils/toast", () => ({ toast: vi.fn() }));
vi.mock("../../../../api.js", () => ({
  api: {
    bomEnterprise: { list: vi.fn() },
    planning: { summary: vi.fn(), generatePO: vi.fn() },
  },
}));

import { toast } from "../../../utils/toast";
import { api } from "../../../../api.js";
import PlanningScreen from "../PlanningScreen.jsx";

const SUMMARY = {
  bom_id: 7,
  purchased_as_leaf: true,
  unique_parts: 2,
  total_required_qty: 30,
  total_extended_cost: 250,
  items: [
    {
      part_id: 1, part_number: "P-1", part_name: "Bracket", unit: "EA",
      unit_cost: 10, required_qty: 20, vendor_id: 5, vendor_name: "Acme",
      extended_cost: 200,
    },
    {
      part_id: 2, part_number: "P-2", part_name: "Washer", unit: "EA",
      unit_cost: 5, required_qty: 10, vendor_id: null, vendor_name: "Unassigned",
      extended_cost: 50,
    },
  ],
};

async function selectBom() {
  render(<PlanningScreen />);
  const select = await screen.findByLabelText(/BOM/i);
  fireEvent.change(select, { target: { value: "7" } });
  await waitFor(() => expect(api.planning.summary).toHaveBeenCalledWith("7", true));
}

describe("PlanningScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.bomEnterprise.list.mockResolvedValue({
      items: [{ id: 7, bom_number: "BOM-7", name: "Chassis" }],
    });
    api.planning.summary.mockResolvedValue(SUMMARY);
  });

  it("shows the summary and one draft PO per vendor group", async () => {
    await selectBom();

    expect(await screen.findByText("Bracket")).toBeTruthy();
    expect(screen.getByText("250.00")).toBeTruthy();
    // Acme + the Unassigned group = 2 POs would be created.
    expect(screen.getByText("POs to create").nextSibling.textContent).toBe("2");
  });

  it("does not write until the confirmation is accepted", async () => {
    await selectBom();

    fireEvent.click(await screen.findByText("Generate purchase orders"));
    expect(api.planning.generatePO).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Cancel"));
    expect(api.planning.generatePO).not.toHaveBeenCalled();
  });

  it("reports the real PO numbers the server returned", async () => {
    api.planning.generatePO.mockResolvedValue([
      { id: 11, poNumber: "PO-2026-0001", vendorName: "Acme", status: "draft", line_count: 1, poTotal: 200 },
      { id: 12, poNumber: "PO-2026-0002", vendorName: "Unassigned", status: "draft", line_count: 1, poTotal: 50 },
    ]);

    await selectBom();
    fireEvent.click(await screen.findByText("Generate purchase orders"));
    fireEvent.click(screen.getByText("Yes, create them"));

    await waitFor(() => expect(api.planning.generatePO).toHaveBeenCalledWith("7", true));
    expect(await screen.findByText("PO-2026-0001")).toBeTruthy();
    expect(screen.getByText("PO-2026-0002")).toBeTruthy();
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("PO-2026-0001, PO-2026-0002"),
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("surfaces a failed generation instead of claiming success", async () => {
    api.planning.generatePO.mockRejectedValue(new Error("403 Forbidden"));

    await selectBom();
    fireEvent.click(await screen.findByText("Generate purchase orders"));
    fireEvent.click(screen.getByText("Yes, create them"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining("403 Forbidden"),
        expect.objectContaining({ kind: "error" }),
      ),
    );
  });
});
