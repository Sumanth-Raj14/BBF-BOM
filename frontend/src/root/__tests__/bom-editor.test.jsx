import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/toast", () => ({
  toast: vi.fn(),
}));

import { toast } from "../../utils/toast";
import { BomEditor } from "../bom-editor.jsx";

// bom-editor.jsx reaches Icon/DropdownButton/useAppStore/recordUndo/api as
// bare globals (consistent with how the rest of this codebase's root/*.jsx
// files are wired — see AppShell.test.jsx's `window.React = React`
// precedent). Stub them minimally so structural handlers are reachable and
// clickable from a test.
window.React = React;
window.Icon = new Proxy(
  {},
  { get: () => () => null },
);
window.DropdownButton = ({ trigger, items }) => (
  <div>
    {trigger}
    <div data-testid="dropdown-items">
      {items
        .filter((it) => typeof it !== "string")
        .map((it, idx) => (
          <button key={idx} type="button" onClick={it.onClick}>
            {it.label}
          </button>
        ))}
    </div>
  </div>
);
window.recordUndo = vi.fn();
window.downloadBlob = vi.fn();

function makeRow(overrides = {}) {
  return {
    id: "r1",
    pn: "PN-1",
    name: "Part One",
    rev: "A",
    qty: 2,
    uom: "EA",
    category: "Electrical",
    vendor: "Acme",
    cost: 1,
    lead: 5,
    origin: "US",
    status: "Draft",
    trend: null,
    assembly: false,
    bomItemId: 501,
    ...overrides,
  };
}

// Renders BomEditor with a real, mutable rows state (so setRows from the
// component actually re-renders it), mimicking how useAppStore's ctx.rows /
// ctx.setRows behave in the real app.
function Harness({ initialRows, project = { id: 42 } }) {
  const [rows, setRows] = React.useState(initialRows);
  window.useAppStore = () => ({ rows, setRows, project, openModal: vi.fn() });
  return (
    <BomEditor
      data={{ rows: initialRows, project: {}, rollup: {}, vendors: [] }}
      density="dense"
      search=""
      activeCats={[]}
    />
  );
}

let bomEnterpriseItems;

beforeEach(() => {
  bomEnterpriseItems = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  };
  window.api = {
    bomEnterprise: { items: bomEnterpriseItems },
    parts: { update: vi.fn() },
    documents: { upload: vi.fn() },
  };
  // No entity_type='bom_item' custom-attribute definitions in this harness
  // (window.apiRequest is left unstubbed — see bom-editor.jsx's
  // `typeof apiRequest !== "function"` guard); each test that specifically
  // needs the ad-hoc custom columns stubs it itself.
  delete window.apiRequest;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  toast.mockClear();
});

describe("BomEditor structural persistence", () => {
  it("Add Item creates the line in the canonical bom_items_master API, scoped to bomId", async () => {
    bomEnterpriseItems.create.mockResolvedValue({ id: 999 });
    render(<Harness initialRows={[makeRow()]} />);

    fireEvent.click(screen.getByText(/Add Item/i));

    await waitFor(() => expect(bomEnterpriseItems.create).toHaveBeenCalledTimes(1));
    const [bomIdArg, payload] = bomEnterpriseItems.create.mock.calls[0];
    expect(bomIdArg).toBe(42); // ctx.project.id, not a Part id
    expect(payload).toMatchObject({ quantity: 1, unit: "EA" });

    // Optimistic row is visible immediately, before the promise resolves.
    expect(screen.getByText("New Item")).toBeInTheDocument();
  });

  it("rolls back the optimistic row and surfaces an error when create is rejected (no fake success)", async () => {
    bomEnterpriseItems.create.mockRejectedValue(new Error("server down"));
    render(<Harness initialRows={[makeRow()]} />);

    fireEvent.click(screen.getByText(/Add Item/i));
    expect(screen.getByText("New Item")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByText("New Item")).not.toBeInTheDocument(),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("server down"),
      expect.objectContaining({ kind: "error" }),
    );
    // Never a success toast for the failed add.
    expect(toast).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("Delete from BOM calls the canonical delete endpoint for a real bom_items_master line", async () => {
    bomEnterpriseItems.delete.mockResolvedValue({});
    render(<Harness initialRows={[makeRow()]} />);

    fireEvent.click(screen.getByText("Delete from BOM"));

    await waitFor(() =>
      expect(bomEnterpriseItems.delete).toHaveBeenCalledWith(42, 501),
    );
    expect(screen.queryByText("Part One")).not.toBeInTheDocument();
  });

  it("restores the row and surfaces an error when delete is rejected (no silent local-only removal)", async () => {
    bomEnterpriseItems.delete.mockRejectedValue(new Error("network error"));
    render(<Harness initialRows={[makeRow()]} />);

    fireEvent.click(screen.getByText("Delete from BOM"));
    // Optimistically removed right away.
    await waitFor(() => expect(bomEnterpriseItems.delete).toHaveBeenCalled());

    // Rejected write must restore the row, not leave it silently deleted
    // locally while claiming success.
    await waitFor(() => expect(screen.getByText("Part One")).toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("network error"),
      expect.objectContaining({ kind: "error" }),
    );
  });

  it("editing qty on a canonical row calls items.update, not api.parts.update", async () => {
    bomEnterpriseItems.update.mockResolvedValue({ id: 501 });
    render(<Harness initialRows={[makeRow()]} />);

    const qtyCell = screen.getByText("2");
    fireEvent.doubleClick(qtyCell);
    const input = screen.getByDisplayValue("2");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(bomEnterpriseItems.update).toHaveBeenCalledWith(42, 501, {
        quantity: 7,
      }),
    );
    expect(window.api.parts.update).not.toHaveBeenCalled();
  });

  it("reverts qty and surfaces an error when the update is rejected", async () => {
    bomEnterpriseItems.update.mockRejectedValue(new Error("conflict"));
    render(<Harness initialRows={[makeRow()]} />);

    const qtyCell = screen.getByText("2");
    fireEvent.doubleClick(qtyCell);
    const input = screen.getByDisplayValue("2");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);

    await waitFor(() => expect(bomEnterpriseItems.update).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("conflict"),
      expect.objectContaining({ kind: "error" }),
    );
  });
});

describe("BomEditor line-item media / visibility (migration 045)", () => {
  it("toggling Exclude from BOM persists exclude_from_bom via items.update", async () => {
    bomEnterpriseItems.update.mockResolvedValue({ id: 501 });
    render(<Harness initialRows={[makeRow()]} />);

    const toggle = screen.getByRole("switch", {
      name: /exclude from bom/i,
    });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(bomEnterpriseItems.update).toHaveBeenCalledWith(42, 501, {
        exclude_from_bom: true,
      }),
    );
  });

  it("reverts the toggle and surfaces an error when the update is rejected", async () => {
    bomEnterpriseItems.update.mockRejectedValue(new Error("server down"));
    render(<Harness initialRows={[makeRow({ excludeFromBom: false })]} />);

    const toggle = screen.getByRole("switch", {
      name: /exclude from bom/i,
    });
    fireEvent.click(toggle);

    await waitFor(() => expect(bomEnterpriseItems.update).toHaveBeenCalled());
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-checked", "false"),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("server down"),
      expect.objectContaining({ kind: "error" }),
    );
  });

  it("uploads a line image and persists image_document_id/thumbnail_path", async () => {
    window.api.documents.upload.mockResolvedValue({
      id: 77,
      url: "/uploads/77.png",
    });
    bomEnterpriseItems.update.mockResolvedValue({ id: 501 });
    render(<Harness initialRows={[makeRow()]} />);

    const fileInput = screen.getByLabelText(/upload line image/i);
    const file = new File(["x"], "part.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(window.api.documents.upload).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ category: "image" }),
      ),
    );
    await waitFor(() =>
      expect(bomEnterpriseItems.update).toHaveBeenCalledWith(42, 501, {
        image_document_id: 77,
        thumbnail_path: "/uploads/77.png",
      }),
    );
  });

  it("refuses to upload an image for a line not yet saved to the BOM", async () => {
    render(<Harness initialRows={[makeRow({ bomItemId: null })]} />);

    const fileInput = screen.getByLabelText(/upload line image/i);
    const file = new File(["x"], "part.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(window.api.documents.upload).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("before attaching an image"),
      expect.objectContaining({ kind: "warn" }),
    );
  });
});
