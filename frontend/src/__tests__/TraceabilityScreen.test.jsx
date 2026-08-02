import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

// The screen reads the real traceability client (frontend/api.js). Mock the
// module, not fetch, so the test asserts on exactly what the endpoints return.
const { serialList, lotList } = vi.hoisted(() => ({
  serialList: vi.fn(),
  lotList: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    traceability: {
      serialNumbers: { list: serialList, lookup: vi.fn() },
      lots: { list: lotList },
    },
  },
}));

import TraceabilityScreen from "../components/screens/TraceabilityScreen.jsx";

const SERIAL = {
  id: 1,
  serialNumber: "SN-000123",
  partId: 42,
  lotBatchNumber: "LOT-2026-001",
  status: "In Stock",
  currentLocation: "Warehouse A",
  installedOnAsset: null,
  incomingInspectionResult: "Pass",
  expirationDate: null,
  statusHistory: [],
};

const LOT = {
  id: 9,
  lotBatchNumber: "LOT-2026-001",
  partId: 42,
  vendorId: 7,
  status: "Accepted",
  quantityReceived: 500,
  quantityAccepted: 480,
  quantityRejected: 20,
  incomingInspectionResult: "Pass",
  expirationDate: null,
};

beforeEach(() => {
  serialList.mockReset();
  lotList.mockReset();
});

describe("TraceabilityScreen", () => {
  it("renders serial numbers returned by /traceability/serial-numbers", async () => {
    serialList.mockResolvedValue({ items: [SERIAL], has_next: false });
    lotList.mockResolvedValue({ items: [LOT], has_next: false });

    render(<TraceabilityScreen />);

    expect(await screen.findByText("SN-000123")).toBeInTheDocument();
    // Scope to the grid — "In Stock" is also a filter <option>.
    const grid = within(screen.getByRole("table", { name: "Serial numbers" }));
    expect(grid.getByText("Warehouse A")).toBeInTheDocument();
    expect(grid.getByText("In Stock")).toBeInTheDocument();
    // partId is rendered as the id the API returned, never a fabricated part number.
    expect(grid.getByText("part #42")).toBeInTheDocument();
    expect(serialList).toHaveBeenCalledWith({ page: 1, per_page: 100 });
  });

  it("shows the lots tab values once selected", async () => {
    serialList.mockResolvedValue({ items: [], has_next: false });
    lotList.mockResolvedValue({ items: [LOT], has_next: false });

    render(<TraceabilityScreen />);

    const lotsTab = await screen.findByRole("tab", { name: /Lots & batches/i });
    lotsTab.click();

    expect(await screen.findByText("LOT-2026-001")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("480")).toBeInTheDocument();
    expect(screen.getByText("vendor #7")).toBeInTheDocument();
  });

  it("shows an explicit empty state when no serials come back", async () => {
    serialList.mockResolvedValue({ items: [], has_next: false });
    lotList.mockResolvedValue({ items: [], has_next: false });

    render(<TraceabilityScreen />);

    expect(
      await screen.findByText("No serialised units match these filters"),
    ).toBeInTheDocument();
  });

  it("shows that the fetch failed instead of falling back to sample rows", async () => {
    serialList.mockRejectedValue(new Error("traceability service unavailable"));
    lotList.mockResolvedValue({ items: [], has_next: false });

    render(<TraceabilityScreen />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "traceability service unavailable",
      );
    });
    expect(screen.queryByText("SN-000123")).not.toBeInTheDocument();
  });
});
