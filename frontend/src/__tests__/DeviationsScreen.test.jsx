import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const { deviationList, deviationGet, deviationSubmit } = vi.hoisted(() => ({
  deviationList: vi.fn(),
  deviationGet: vi.fn(),
  deviationSubmit: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    deviation: {
      list: deviationList,
      get: deviationGet,
      submit: deviationSubmit,
      approve: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import DeviationsScreen from "../components/screens/DeviationsScreen.jsx";

const DEVIATION = {
  id: 3,
  deviationNumber: "DEV-2026-001",
  title: "Anodising thickness below drawing minimum",
  type: "Waiver",
  partId: 42,
  projectId: null,
  specification: "DWG-1004 rev C, 25 µm min",
  deviationDescription: "Measured 21 µm on the batch.",
  impactAssessment: "No functional impact; cosmetic only.",
  riskLevel: "Medium",
  affectedQuantity: 120,
  requestType: "One-time",
  disposition: "Use As Is",
  expirationDate: null,
  engineeringApproval: "R. Patel",
  qualityApproval: null,
  customerApproval: null,
  allApprovalsReceived: "No",
  status: "Submitted",
  capaId: null,
};

beforeEach(() => {
  deviationList.mockReset();
  deviationGet.mockReset();
  deviationSubmit.mockReset();
});

describe("DeviationsScreen", () => {
  it("renders deviations returned by /deviations", async () => {
    deviationList.mockResolvedValue({ items: [DEVIATION], has_next: false });

    render(<DeviationsScreen />);

    expect(await screen.findByText("DEV-2026-001")).toBeInTheDocument();
    // Scope to the grid — the type/risk/status values are also filter <option>s.
    const grid = within(
      screen.getByRole("table", { name: "Deviations & Waivers" }),
    );
    expect(
      grid.getByText("Anodising thickness below drawing minimum"),
    ).toBeInTheDocument();
    expect(grid.getByText("Waiver")).toBeInTheDocument();
    expect(grid.getByText("Medium")).toBeInTheDocument();
    expect(grid.getByText("Use As Is")).toBeInTheDocument();
    expect(grid.getByText("120")).toBeInTheDocument();
    expect(grid.getByText("Submitted")).toBeInTheDocument();
    expect(deviationList).toHaveBeenCalledWith({ page: 1, per_page: 100 });
  });

  it("opens the detail panel with the approvals the API actually returned", async () => {
    deviationList.mockResolvedValue({ items: [DEVIATION], has_next: false });

    render(<DeviationsScreen />);

    (await screen.findByText("DEV-2026-001")).click();

    expect(await screen.findByText("R. Patel")).toBeInTheDocument();
    expect(screen.getByText("DWG-1004 rev C, 25 µm min")).toBeInTheDocument();
    // Quality and customer are null upstream, so they read as em dashes —
    // never as an invented approver name.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an explicit empty state when no deviations come back", async () => {
    deviationList.mockResolvedValue({ items: [], has_next: false });

    render(<DeviationsScreen />);

    expect(
      await screen.findByText("No deviations match these filters"),
    ).toBeInTheDocument();
  });

  it("shows that the fetch failed instead of falling back to sample rows", async () => {
    deviationList.mockRejectedValue(new Error("403 Forbidden"));

    render(<DeviationsScreen />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("403 Forbidden");
    });
    expect(screen.queryByText("DEV-2026-001")).not.toBeInTheDocument();
  });
});
