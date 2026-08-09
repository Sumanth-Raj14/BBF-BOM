import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

window.React = React;

const {
  columnsMock,
  templatesListMock,
  templatesCreateMock,
  templatesDeleteMock,
  runMock,
  downloadFileMock,
  toastMock,
} = vi.hoisted(() => ({
  columnsMock: vi.fn(),
  templatesListMock: vi.fn(),
  templatesCreateMock: vi.fn(),
  templatesDeleteMock: vi.fn(),
  runMock: vi.fn(),
  downloadFileMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    export: {
      columns: columnsMock,
      templates: {
        list: templatesListMock,
        create: templatesCreateMock,
        delete: templatesDeleteMock,
      },
      run: runMock,
    },
  },
}));

vi.mock("../utils/download.js", () => ({ downloadFile: downloadFileMock }));
vi.mock("../utils/toast", () => ({ toast: toastMock }));
vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
}));

import ExportDialog from "../components/modals/ExportDialog.jsx";

const BOM_COLUMNS = {
  columns: [
    { key: "pn", label: "Part Number", default: true },
    { key: "name", label: "Name", default: true },
    { key: "cost", label: "Unit Cost", default: false },
  ],
};

// The column grid (Available / Selected) only renders once loading finishes
// and columns arrived — "Available" is a unique heading, unlike column
// labels, which can legitimately appear in both panes at once.
async function waitForLoaded() {
  return screen.findByText("Available");
}

beforeEach(() => {
  vi.clearAllMocks();
  columnsMock.mockResolvedValue(BOM_COLUMNS);
  templatesListMock.mockResolvedValue([]);
});

describe("ExportDialog", () => {
  it("fetches the column list live from GET /export/columns instead of hardcoding it", async () => {
    render(<ExportDialog open onClose={() => {}} entity="bom" bomId={42} />);

    await waitFor(() => expect(columnsMock).toHaveBeenCalledWith("bom"));
    const availablePane = (await waitForLoaded()).parentElement;
    expect(within(availablePane).getByText("Part Number")).toBeTruthy();
    expect(within(availablePane).getByText("Name")).toBeTruthy();
    expect(within(availablePane).getByText("Unit Cost")).toBeTruthy();
  });

  it("pre-selects only the columns the server marked default", async () => {
    render(<ExportDialog open onClose={() => {}} entity="bom" bomId={42} />);
    await waitForLoaded();

    const selectedPane = screen.getByText("Selected (export order)").parentElement;
    expect(selectedPane.textContent).toContain("Part Number");
    expect(selectedPane.textContent).toContain("Name");
    expect(selectedPane.textContent).not.toContain("Unit Cost");
  });

  it("sends bom_id/indented/include_sub_assemblies for a bom export and downloads the real file", async () => {
    runMock.mockResolvedValue({
      blob: new Blob(["csv"], { type: "text/csv" }),
      filename: "bom-42-20260809.csv",
    });
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} entity="bom" bomId={42} />);
    await waitForLoaded();

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => expect(runMock).toHaveBeenCalled());
    const body = runMock.mock.calls[0][0];
    expect(body).toMatchObject({
      entity: "bom",
      format: "csv",
      bom_id: 42,
      indented: true,
      include_sub_assemblies: true,
      columns: ["pn", "name"],
    });
    await waitFor(() =>
      expect(downloadFileMock).toHaveBeenCalledWith(
        expect.any(Blob),
        "bom-42-20260809.csv",
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("omits bom-only fields for a non-bom entity", async () => {
    runMock.mockResolvedValue({ blob: new Blob(["[]"]), filename: "parts.json" });
    render(<ExportDialog open onClose={() => {}} entity="parts" />);
    await waitForLoaded();

    expect(screen.queryByText(/Include sub-assemblies/i)).toBeNull();

    fireEvent.click(screen.getByText("Export"));
    await waitFor(() => expect(runMock).toHaveBeenCalled());
    const body = runMock.mock.calls[0][0];
    expect(body.entity).toBe("parts");
    expect(body).not.toHaveProperty("bom_id");
    expect(body).not.toHaveProperty("indented");
  });

  it("surfaces a real export failure instead of a fake success toast, and does not close", async () => {
    runMock.mockRejectedValue(new Error("unknown column: foo"));
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} entity="bom" bomId={1} />);
    await waitForLoaded();

    fireEvent.click(screen.getByText("Export"));

    expect(await screen.findByText(/unknown column: foo/i)).toBeTruthy();
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("loading a saved template applies its format and columns", async () => {
    templatesListMock.mockResolvedValue([
      { id: 9, name: "Cost review", entity: "bom", config: { format: "xlsx", columns: ["cost"] } },
    ]);
    render(<ExportDialog open onClose={() => {}} entity="bom" bomId={1} />);
    await waitForLoaded();

    fireEvent.change(screen.getByLabelText(/load saved template/i), {
      target: { value: "9" },
    });

    expect(screen.getByLabelText("Excel (.xlsx)").checked).toBe(true);
    const selectedPane = screen.getByText("Selected (export order)").parentElement;
    expect(selectedPane.textContent).toContain("Unit Cost");
    expect(selectedPane.textContent).not.toContain("Part Number");
  });

  it("saves the current configuration as a named template via POST /export/templates", async () => {
    templatesCreateMock.mockResolvedValue({ id: 5, name: "Mine", entity: "bom", config: {} });
    render(<ExportDialog open onClose={() => {}} entity="bom" bomId={1} />);
    await waitForLoaded();

    fireEvent.change(screen.getByPlaceholderText(/new template name/i), {
      target: { value: "Mine" },
    });
    fireEvent.click(screen.getByText("Save as template"));

    await waitFor(() => expect(templatesCreateMock).toHaveBeenCalled());
    const [payload] = templatesCreateMock.mock.calls[0];
    expect(payload.name).toBe("Mine");
    expect(payload.entity).toBe("bom");
    expect(payload.config).not.toHaveProperty("entity");
    expect(payload.config).not.toHaveProperty("bom_id");
  });
});
