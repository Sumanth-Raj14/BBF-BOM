import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../utils/toast", () => ({
  toast: vi.fn(),
}));
vi.mock("../../../../api.js", () => ({
  api: {
    cadConnectors: {
      types: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      test: vi.fn(),
      documents: vi.fn(),
      importAssembly: vi.fn(),
      importAltiumFile: vi.fn(),
    },
  },
}));

import { toast } from "../../../utils/toast";
import { api } from "../../../../api.js";
import CadConnectorsScreen from "../CadConnectorsScreen.jsx";

function mockConnections() {
  return [
    {
      id: 1,
      name: "Main Onshape",
      connector_type: "onshape",
      status: "ok",
      last_error: null,
      last_sync_at: "2026-08-01T10:00:00Z",
      config: {},
    },
    {
      id: 2,
      name: "Broken Fusion",
      connector_type: "fusion",
      status: "error",
      last_error: "no refresh_token stored",
      last_sync_at: null,
      config: {},
    },
  ];
}

describe("CadConnectorsScreen", () => {
  beforeEach(() => {
    Object.values(api.cadConnectors).forEach((fn) => fn.mockReset && fn.mockReset());
    toast.mockReset();
  });

  it("loads and lists connections with honest status", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape", "fusion", "altium"] });
    api.cadConnectors.list.mockResolvedValue({ items: mockConnections() });

    render(<CadConnectorsScreen />);

    expect(await screen.findByText("Main Onshape")).toBeTruthy();
    expect(screen.getByText("Broken Fusion")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Connection error")).toBeTruthy();
    // Never fabricate success — the honest failure reason is shown.
    expect(screen.getByText("no refresh_token stored")).toBeTruthy();
  });

  it("shows a plain 'not tested' status for an unconfigured connection", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape"] });
    api.cadConnectors.list.mockResolvedValue({
      items: [
        {
          id: 3,
          name: "New connection",
          connector_type: "onshape",
          status: "unconfigured",
          last_error: null,
          last_sync_at: null,
          config: {},
        },
      ],
    });

    render(<CadConnectorsScreen />);

    expect(await screen.findByText("Not tested yet")).toBeTruthy();
  });

  it("creates a connection with type-specific credential fields and never re-displays them", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape"] });
    api.cadConnectors.list.mockResolvedValue({ items: [] });
    api.cadConnectors.create.mockResolvedValue({
      id: 5,
      name: "New Onshape",
      connector_type: "onshape",
      status: "unconfigured",
    });

    render(<CadConnectorsScreen />);

    fireEvent.click(await screen.findByText("Add connection"));

    fireEvent.change(screen.getByLabelText(/^Name/i), {
      target: { value: "New Onshape" },
    });
    fireEvent.change(screen.getByLabelText(/Access key/i), {
      target: { value: "AK123" },
    });
    fireEvent.change(screen.getByLabelText(/Secret key/i), {
      target: { value: "SK456" },
    });

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() =>
      expect(api.cadConnectors.create).toHaveBeenCalledWith({
        name: "New Onshape",
        connector_type: "onshape",
        credentials: { access_key: "AK123", secret_key: "SK456" },
        config: {},
      }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("stored encrypted"),
      expect.objectContaining({ kind: "success" }),
    );
    // The secret values typed into the form never appear in the document
    // after the modal closes.
    await waitFor(() => expect(screen.queryByLabelText(/Access key/i)).toBeNull());
    expect(screen.queryByText("AK123")).toBeNull();
    expect(screen.queryByText("SK456")).toBeNull();
  });

  it("blocks create until required credential fields are filled", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape"] });
    api.cadConnectors.list.mockResolvedValue({ items: [] });

    render(<CadConnectorsScreen />);

    fireEvent.click(await screen.findByText("Add connection"));
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: "X" } });

    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("runs a connectivity test and reports the honest result via toast", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape"] });
    api.cadConnectors.list.mockResolvedValue({ items: mockConnections() });
    api.cadConnectors.test.mockResolvedValue({
      ok: false,
      reason: "auth_failed",
      detail: "Onshape rejected these credentials",
    });

    render(<CadConnectorsScreen />);
    await screen.findByText("Main Onshape");

    fireEvent.click(screen.getAllByText("Test")[0]);

    await waitFor(() => expect(api.cadConnectors.test).toHaveBeenCalledWith(1));
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("auth_failed"),
      expect.objectContaining({ kind: "error" }),
    );
  });

  it("browses documents for a connection and surfaces a load failure honestly", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: ["onshape"] });
    api.cadConnectors.list.mockResolvedValue({ items: mockConnections() });
    api.cadConnectors.documents.mockRejectedValue(new Error("Onshape rejected these credentials"));

    render(<CadConnectorsScreen />);

    fireEvent.click(await screen.findByText("Main Onshape"));

    await waitFor(() => expect(api.cadConnectors.documents).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Onshape rejected these credentials")).toBeTruthy();
  });

  it("previews an Altium file dry-run before committing", async () => {
    api.cadConnectors.types.mockResolvedValue({ types: [] });
    api.cadConnectors.list.mockResolvedValue({ items: [] });
    api.cadConnectors.importAltiumFile.mockResolvedValue({
      dry_run: true,
      bom_name: "Altium BOM",
      filename: "bom.csv",
      items_to_create: 2,
      parts_to_create: 2,
      components: [
        { external_id: "R1", name: "10k resistor", quantity: 3, designators: ["R1", "R2", "R5"] },
      ],
    });

    render(<CadConnectorsScreen />);
    await screen.findByText("Altium BOM file import");

    const file = new File(["designator,comment\nR1,10k"], "bom.csv", { type: "text/csv" });
    const fileInput = document.getElementById("altium-file");
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Preview (dry run)"));

    await waitFor(() =>
      expect(api.cadConnectors.importAltiumFile).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ dryRun: true }),
      ),
    );
    expect(await screen.findByText(/10k resistor/)).toBeTruthy();
    expect(screen.getByText(/R1, R2, R5/)).toBeTruthy();
  });
});
