import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { bomList, bomCompare, snapshotsList } = vi.hoisted(() => ({
  bomList: vi.fn(),
  bomCompare: vi.fn(),
  snapshotsList: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    bomEnterprise: {
      list: bomList,
      compare: bomCompare,
      snapshots: { list: snapshotsList },
    },
  },
}));

import DiffScreen from "../components/screens/DiffScreen.jsx";

beforeEach(() => {
  bomList.mockReset();
  bomCompare.mockReset();
  snapshotsList.mockReset();
  snapshotsList.mockResolvedValue([]);
});

describe("DiffScreen", () => {
  it("does not 404 and shows an honest empty state when the current BOM has nothing to compare against", async () => {
    bomList.mockResolvedValue({ items: [{ id: 1 }], total: 1 });

    render(<DiffScreen data={{}} bomId={1} />);

    await waitFor(() => expect(bomList).toHaveBeenCalled());
    expect(bomCompare).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/nothing to compare yet/i),
    ).toBeInTheDocument();
  });

  it("compares against the real second BOM (never hardcoded ids) once one exists", async () => {
    bomList.mockResolvedValue({
      items: [{ id: 1 }, { id: 7 }],
      total: 2,
    });
    bomCompare.mockResolvedValue({
      added: [],
      removed: [],
      modified: [],
      version_1: "A",
      version_2: "B",
    });

    render(<DiffScreen data={{}} bomId={1} />);

    await waitFor(() => expect(bomCompare).toHaveBeenCalledWith(1, 7));
  });
});
