import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../utils/toast", () => ({
  toast: vi.fn(),
}));
vi.mock("../../../../api.js", () => ({
  api: {
    catalogs: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      parts: vi.fn(),
      addPart: vi.fn(),
      removePart: vi.fn(),
      importUpload: vi.fn(),
    },
  },
}));

import { toast } from "../../../utils/toast";
import { api } from "../../../../api.js";
import CatalogsScreen from "../CatalogsScreen.jsx";

function mockCatalogs() {
  return [
    {
      id: 1,
      catalogCode: "ELEC-01",
      catalogName: "Electrical Components",
      description: "Resistors, capacitors, ICs",
      partCount: 2,
      isActive: true,
      updatedAt: "2026-07-18T10:00:00Z",
    },
  ];
}

describe("CatalogsScreen", () => {
  beforeEach(() => {
    Object.values(api.catalogs).forEach((fn) => fn.mockReset && fn.mockReset());
    toast.mockReset();
  });

  it("loads and lists catalogs", async () => {
    api.catalogs.list.mockResolvedValue(mockCatalogs());

    render(<CatalogsScreen />);

    await waitFor(() => expect(api.catalogs.list).toHaveBeenCalled());
    expect(await screen.findByText("Electrical Components")).toBeTruthy();
    expect(screen.getByText("ELEC-01")).toBeTruthy();
  });

  it("opens a catalog and loads its parts", async () => {
    api.catalogs.list.mockResolvedValue(mockCatalogs());
    api.catalogs.parts.mockResolvedValue([
      { id: 10, partNumber: "R-0402-10K", description: "Resistor 10k", manufacturer: "Yageo", category: "Electrical" },
    ]);

    render(<CatalogsScreen />);

    const row = await screen.findByText("Electrical Components");
    fireEvent.click(row.closest("tr"));

    await waitFor(() => expect(api.catalogs.parts).toHaveBeenCalledWith(1));
    expect(await screen.findByText("R-0402-10K")).toBeTruthy();
    expect(screen.getByText("← Back to catalogs")).toBeTruthy();
  });

  it("creates a new catalog from the New catalog dialog", async () => {
    api.catalogs.list.mockResolvedValue([]);
    api.catalogs.create.mockResolvedValue({
      id: 2,
      catalogCode: "NEW-01",
      catalogName: "New Catalog",
      isActive: true,
    });
    api.catalogs.parts.mockResolvedValue([]);

    render(<CatalogsScreen />);

    fireEvent.click(await screen.findByText("+ New catalog"));

    fireEvent.change(screen.getByLabelText(/Catalog code/i), {
      target: { value: "NEW-01" },
    });
    fireEvent.change(screen.getByLabelText(/Catalog name/i), {
      target: { value: "New Catalog" },
    });

    fireEvent.click(screen.getByText("Create catalog"));

    await waitFor(() =>
      expect(api.catalogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ catalogCode: "NEW-01", catalogName: "New Catalog" }),
      ),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("New Catalog"),
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("requires code and name before creating a catalog", async () => {
    api.catalogs.list.mockResolvedValue([]);

    render(<CatalogsScreen />);
    fireEvent.click(await screen.findByText("+ New catalog"));
    fireEvent.click(screen.getByText("Create catalog"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining("required"),
        expect.objectContaining({ kind: "error" }),
      ),
    );
    expect(api.catalogs.create).not.toHaveBeenCalled();
  });

  it("uploads files via Create from folder/upload and reports parts created", async () => {
    api.catalogs.list.mockResolvedValue([]);
    api.catalogs.importUpload.mockResolvedValue({
      catalog: { id: 3, catalogCode: "UP-01", catalogName: "Uploaded Catalog", isActive: true },
      partsCreated: 5,
    });
    api.catalogs.parts.mockResolvedValue([]);

    render(<CatalogsScreen />);

    fireEvent.click(await screen.findByText("Create from folder/upload"));

    fireEvent.change(screen.getByLabelText(/Catalog code/i), {
      target: { value: "UP-01" },
    });
    fireEvent.change(screen.getByLabelText(/Catalog name/i), {
      target: { value: "Uploaded Catalog" },
    });

    const file = new File(["dummy"], "part1.pdf", { type: "application/pdf" });
    const fileInput = screen.getByText("Choose files").querySelector("input[type=file]");
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Create & import"));

    await waitFor(() => expect(api.catalogs.importUpload).toHaveBeenCalled());
    const [files, metadata] = api.catalogs.importUpload.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(metadata).toEqual(
      expect.objectContaining({ catalogCode: "UP-01", catalogName: "Uploaded Catalog" }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("5 part(s) added"),
      expect.objectContaining({ kind: "success" }),
    );
  });
});
