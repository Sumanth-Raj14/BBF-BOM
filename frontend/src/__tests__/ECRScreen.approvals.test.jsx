import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const ecoList = vi.fn();
const ecoGet = vi.fn();

vi.mock("../globals", () => ({
  INR: (n) => String(n),
  Icon: new Proxy({}, { get: () => () => null }),
  escapeHtml: (s) => s,
  openPrintWindow: () => {},
  useAppStore: () => null,
  api: { eco: { list: (...a) => ecoList(...a), get: (...a) => ecoGet(...a) } },
}));

vi.mock("../components/ESignDialog.jsx", () => ({
  ESignDialog: () => null,
}));

// One local ECR row backed by real ECO 42, so the demo seed rows (which
// carry their own hardcoded dots) stay out of the assertions.
const localRow = {
  id: "ECR-2026-001",
  title: "Local row",
  project: "ATLAS",
  impact: "med",
  status: "Review",
  requester: "You",
  date: "2026-05-01",
  cost_impact: 0,
  items_affected: 0,
  approvals: { eng: "pending", proc: "pending", fin: "pending" },
  ecoId: 42,
};

vi.mock("../utils/storage.js", () => ({
  storage: { ecrs: { get: () => [localRow], set: () => {} } },
  KEYS: {},
}));

import { ECRScreen } from "../components/advanced/ECRScreen.jsx";

beforeEach(() => {
  ecoList.mockReset();
  ecoGet.mockReset();
});

describe("ECRScreen approvals", () => {
  it("renders eco_approvals rows, not a grid synthesized from ECO status", async () => {
    // Backend says the ECO is approved, but the only real approval row on
    // it is a rejection by approver 7 — status-derived dots would show
    // three green ones.
    ecoList.mockResolvedValue({
      items: [
        {
          id: 42,
          eco_number: "ECO-42",
          title: "Real ECO",
          status: "approved",
          impact_level: "minor",
        },
      ],
    });
    ecoGet.mockResolvedValue({
      id: 42,
      status: "approved",
      approvals: [
        {
          id: 1,
          approver_id: 7,
          approval_order: 1,
          status: "rejected",
          signed_at: "2026-05-02T00:00:00Z",
        },
      ],
    });

    render(<ECRScreen />);

    expect(await screen.findByTitle("APPROVER 7: rejected")).toBeTruthy();
    expect(ecoGet).toHaveBeenCalledWith(42);
    expect(screen.queryByTitle("ENG: approved")).toBeNull();
    expect(screen.queryByTitle("FIN: approved")).toBeNull();
  });

  it("shows an unknown dot when the ECO's approvals cannot be read", async () => {
    ecoList.mockResolvedValue({
      items: [
        {
          id: 42,
          eco_number: "ECO-42",
          title: "Real ECO",
          status: "approved",
          impact_level: "minor",
        },
      ],
    });
    ecoGet.mockRejectedValue(new Error("boom"));

    render(<ECRScreen />);

    expect(await screen.findByTitle(/unknown/i)).toBeTruthy();
    expect(screen.queryByTitle("ENG: approved")).toBeNull();
  });
});
