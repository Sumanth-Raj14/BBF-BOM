import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

window.React = React;

const listSubstances = vi.fn();
const listComposition = vi.fn();
const partCompliance = vi.fn();

vi.mock("../../../api.js", () => ({
  api: {
    substanceCompliance: {
      substances: { list: (...args) => listSubstances(...args) },
      partComposition: { list: (...args) => listComposition(...args) },
      partCompliance: (...args) => partCompliance(...args),
    },
  },
}));

vi.mock("../../utils/toast", () => ({
  toast: vi.fn(),
}));

import { PartComplianceTab } from "../PartComplianceTab.jsx";

beforeEach(() => {
  listSubstances.mockReset();
  listComposition.mockReset();
  partCompliance.mockReset();
});

describe("PartComplianceTab", () => {
  it("resolves the real backend part id from row.partId (not the synthetic tree-node row.id) when fetching compliance data", async () => {
    listSubstances.mockResolvedValueOnce([{ id: 5, name: "Lead", is_svhc: false }]);
    listComposition.mockResolvedValueOnce([
      { id: 1, substance_id: 5, mass_ppm: 1200, is_exempt: false, notes: null },
    ]);
    partCompliance.mockResolvedValueOnce({
      part_id: 42,
      part_number: "EL-CON-RJ45",
      rohs_status: "non_compliant",
      svhc_substances: [],
    });

    // As produced by convertApiPartsToTree: row.id is the synthetic
    // "api-"+id tree-node key, row.partId is the real backend id.
    render(<PartComplianceTab row={{ id: "api-42", partId: 42, pn: "EL-CON-RJ45" }} />);

    await waitFor(() => expect(listComposition).toHaveBeenCalledWith(42));
    expect(partCompliance).toHaveBeenCalledWith(42);

    expect(await screen.findByText(/RoHS: non compliant/i)).toBeInTheDocument();
  });

  it("fails honestly (no API call, no fabricated status) when the row has no real backend part id", async () => {
    render(<PartComplianceTab row={{ id: "r1.4.1", pn: "EL-CON-RJ45" }} />);

    expect(
      await screen.findByText(/no backend id.*cannot be loaded/i),
    ).toBeInTheDocument();
    expect(listComposition).not.toHaveBeenCalled();
    expect(partCompliance).not.toHaveBeenCalled();
  });
});
