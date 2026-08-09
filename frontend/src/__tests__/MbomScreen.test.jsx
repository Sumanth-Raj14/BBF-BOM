import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const { bomList, mbomHeadersList, mbomHeadersGet, mbomDerive } = vi.hoisted(() => ({
  bomList: vi.fn(),
  mbomHeadersList: vi.fn(),
  mbomHeadersGet: vi.fn(),
  mbomDerive: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    bomEnterprise: { list: bomList, get: vi.fn(), create: vi.fn() },
    mbom: {
      headers: { list: mbomHeadersList, get: mbomHeadersGet, create: vi.fn(), update: vi.fn() },
      items: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
      operations: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
      derive: mbomDerive,
    },
  },
}));

import MbomScreen from "../components/screens/MbomScreen.jsx";

const BOMS = {
  items: [
    { id: 1, bom_number: "BOM-0001", name: "Widget", status: "active", bom_type: "EBOM" },
    { id: 2, bom_number: "BOM-0002", name: "Widget MBOM", status: "draft", bom_type: "MBOM" },
  ],
  total: 2,
};

const MBOMS = {
  items: [
    { id: 5, mbom_number: "MBOM-0001", name: "Widget MBOM", ebom_id: 1, status: "draft" },
  ],
  total: 1,
};

beforeEach(() => {
  bomList.mockReset().mockResolvedValue(BOMS);
  mbomHeadersList.mockReset().mockResolvedValue(MBOMS);
  mbomHeadersGet.mockReset();
  mbomDerive.mockReset();
});

describe("MbomScreen", () => {
  it("lists BOMs with their type and manufacturing BOMs, from the real endpoints", async () => {
    render(<MbomScreen />);

    expect(await screen.findByText("BOM-0001")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
    expect(screen.getAllByText("EBOM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("MBOM").length).toBeGreaterThan(0);

    expect(await screen.findByText("MBOM-0001")).toBeInTheDocument();
    expect(screen.getByText("BOM #1")).toBeInTheDocument();
    expect(bomList).toHaveBeenCalledWith({});
    expect(mbomHeadersList).toHaveBeenCalled();
  });

  it("filters the BOM list by type via the real query param", async () => {
    render(<MbomScreen />);
    await screen.findByText("BOM-0001");

    const select = screen.getByLabelText(/Filter by type/i);
    fireEvent.change(select, { target: { value: "MBOM" } });

    await waitFor(() => {
      expect(bomList).toHaveBeenLastCalledWith({ bom_type: "MBOM" });
    });
  });

  it("derives an MBOM from an EBOM and shows the copied structure", async () => {
    const derived = {
      id: 9,
      mbom_number: "MBOM-0002",
      name: "Widget (MBOM)",
      ebom_id: 1,
      status: "draft",
      items: [{ id: 1, part_id: 42, quantity: "2.0000", unit: "EA" }],
    };
    mbomDerive.mockResolvedValue(derived);
    mbomHeadersList.mockResolvedValueOnce(MBOMS).mockResolvedValue({
      items: [...MBOMS.items, derived],
      total: 2,
    });

    render(<MbomScreen />);
    await screen.findByText("BOM-0001");

    // Row-level "Derive MBOM" action pre-fills the EBOM row's id.
    const row = screen.getByText("BOM-0001").closest("tr");
    fireEvent.click(within(row).getByText(/Derive MBOM/i));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/Derive MBOM/i));

    await waitFor(() => {
      expect(mbomDerive).toHaveBeenCalledWith({ ebom_id: 1, name: "Widget (MBOM)" });
    });

    expect((await screen.findAllByText("MBOM-0002")).length).toBeGreaterThan(0);
    expect(screen.getByText("part #42")).toBeInTheDocument();
  });

  it("shows the failure instead of a fabricated success when derive fails", async () => {
    mbomDerive.mockRejectedValue(new Error("EBOM is a MBOM, not an EBOM"));

    render(<MbomScreen />);
    await screen.findByText("BOM-0001");

    const row = screen.getByText("BOM-0001").closest("tr");
    fireEvent.click(within(row).getByText(/Derive MBOM/i));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/Derive MBOM/i));

    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "EBOM is a MBOM, not an EBOM",
      );
    });
    // Dialog stays open — no false "success" navigation/close on failure.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows an honest empty state instead of fabricated rows", async () => {
    bomList.mockResolvedValue({ items: [], total: 0 });
    mbomHeadersList.mockResolvedValue({ items: [], total: 0 });

    render(<MbomScreen />);

    expect(await screen.findByText("No BOMs of this type")).toBeInTheDocument();
    expect(screen.getByText("No manufacturing BOMs yet")).toBeInTheDocument();
  });
});
