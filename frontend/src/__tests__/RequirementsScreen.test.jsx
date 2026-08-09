import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const {
  requirementList,
  requirementLinkedParts,
  requirementLinkPart,
  requirementCoverage,
} = vi.hoisted(() => ({
  requirementList: vi.fn(),
  requirementLinkedParts: vi.fn(),
  requirementLinkPart: vi.fn(),
  requirementCoverage: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    requirement: {
      list: requirementList,
      get: vi.fn(),
      create: vi.fn(),
      linkedParts: requirementLinkedParts,
      linkPart: requirementLinkPart,
      unlinkPart: vi.fn(),
      coverage: requirementCoverage,
    },
  },
}));

import RequirementsScreen from "../components/screens/RequirementsScreen.jsx";

const REQUIREMENT = {
  id: 7,
  key: "REQ-0042",
  title: "Enclosure must be IP67 rated",
  description: "Sealed against dust and immersion per IEC 60529.",
  type: "regulatory",
  status: "approved",
  priority: "high",
  version: 2,
  parent_id: null,
  createdAt: "2026-01-05T00:00:00Z",
};

beforeEach(() => {
  requirementList.mockReset();
  requirementLinkedParts.mockReset();
  requirementLinkedParts.mockResolvedValue([]);
  requirementLinkPart.mockReset();
  requirementCoverage.mockReset();
});

describe("RequirementsScreen", () => {
  it("renders requirements returned by /requirements", async () => {
    requirementList.mockResolvedValue({ items: [REQUIREMENT], has_next: false });

    render(<RequirementsScreen />);

    expect(await screen.findByText("REQ-0042")).toBeInTheDocument();
    const grid = within(screen.getByRole("table", { name: "Requirements" }));
    expect(
      grid.getByText("Enclosure must be IP67 rated"),
    ).toBeInTheDocument();
    expect(grid.getByText("regulatory")).toBeInTheDocument();
    expect(grid.getByText("high")).toBeInTheDocument();
    expect(grid.getByText("approved")).toBeInTheDocument();
    expect(requirementList).toHaveBeenCalledWith({ page: 1, per_page: 100 });
  });

  it("opens the detail panel and shows real linked parts, or an honest uncovered message", async () => {
    requirementList.mockResolvedValue({ items: [REQUIREMENT], has_next: false });
    requirementLinkedParts.mockResolvedValue([
      { id: 1, requirement_id: 7, part_id: 55 },
    ]);

    render(<RequirementsScreen />);

    (await screen.findByText("REQ-0042")).click();

    expect(
      await screen.findByText("Sealed against dust and immersion per IEC 60529."),
    ).toBeInTheDocument();
    expect(await screen.findByText("part #55")).toBeInTheDocument();
  });

  it("shows an honest 'uncovered' message when a requirement has no linked parts", async () => {
    requirementList.mockResolvedValue({ items: [REQUIREMENT], has_next: false });
    requirementLinkedParts.mockResolvedValue([]);

    render(<RequirementsScreen />);

    (await screen.findByText("REQ-0042")).click();

    expect(
      await screen.findByText(
        "No parts linked yet — this requirement is uncovered.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an explicit empty state when no requirements come back", async () => {
    requirementList.mockResolvedValue({ items: [], has_next: false });

    render(<RequirementsScreen />);

    expect(
      await screen.findByText("No requirements match these filters"),
    ).toBeInTheDocument();
  });

  it("shows that the fetch failed instead of falling back to sample rows", async () => {
    requirementList.mockRejectedValue(new Error("403 Forbidden"));

    render(<RequirementsScreen />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("403 Forbidden");
    });
    expect(screen.queryByText("REQ-0042")).not.toBeInTheDocument();
  });

  it("shows the coverage view with real uncovered requirements", async () => {
    requirementList.mockResolvedValue({ items: [REQUIREMENT], has_next: false });
    requirementCoverage.mockResolvedValue({
      total: 3,
      covered_count: 2,
      uncovered_count: 1,
      uncovered: [{ id: 9, key: "REQ-0099", title: "Uncovered one" }],
    });

    render(<RequirementsScreen />);
    await screen.findByText("REQ-0042");

    screen.getByText("Coverage").click();

    expect(await screen.findByText("REQ-0099")).toBeInTheDocument();
    expect(screen.getByText(/Uncovered one/)).toBeInTheDocument();
  });
});
