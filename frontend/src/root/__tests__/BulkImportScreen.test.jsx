import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * BulkImportScreen (the NavRail/"/bulk-import"-routed screen) used to call
 * bulkImportAPI.upload() and then POST /import/{job}/process with an empty
 * {} mapping — the backend honestly created zero Part rows and the feature
 * was dead. It now just opens the existing, already-correct BulkImportModal
 * (modal key "bulk-import", same one ModalsHost/NavRail/command-palette
 * use) instead of driving a broken flow of its own.
 *
 * These tests render the screen together with the real modal under a
 * minimal stand-in for the app's modal context, exactly like ModalsHost
 * wires them in production, and pin the real upload -> mapping ->
 * validate -> commit lifecycle against a mocked api layer.
 */

const { uploadMock, mappingMock, commitMock, listMock, toastMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  mappingMock: vi.fn(),
  commitMock: vi.fn(),
  listMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("../../../api.js", () => ({
  api: {
    import: {
      upload: uploadMock,
      mapping: mappingMock,
      commit: commitMock,
    },
  },
}));

vi.mock("../../utils/toast", () => ({ toast: toastMock }));

vi.mock("../../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
}));

import { BulkImportScreen } from "../integration-screens.jsx";
import BulkImportModal from "../../components/modals/BulkImportModal.jsx";

// integration-screens.jsx reads Icon/bulkImportAPI/useAppStore as bare
// globals (legacy window-global build convention, not an ES import) — stub
// them on `window`, which is jsdom's global object, same as the app's own
// SupplierPortalScreen.test.jsx does for this file.
function Harness() {
  const [modal, setModal] = React.useState(null);
  const ctxValue = React.useMemo(
    () => ({ modal, openModal: (name) => setModal(name), closeModal: () => setModal(null) }),
    [modal],
  );
  window.useAppStore = () => ctxValue;
  return (
    <>
      <BulkImportScreen />
      <BulkImportModal open={modal === "bulk-import"} onClose={() => setModal(null)} />
    </>
  );
}

function csvFile() {
  return new File(["Part No,Qty\nR1,10"], "parts.csv", { type: "text/csv" });
}

async function openModalAndUpload() {
  fireEvent.click(screen.getByRole("button", { name: /upload & import/i }));
  const input = document.getElementById("__bulk-import-input");
  fireEvent.change(input, { target: { files: [csvFile()] } });
  await waitFor(() => expect(uploadMock).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.Icon = new Proxy({}, { get: () => (props) => <span {...props} /> });
  window.bulkImportAPI = { list: listMock };
  listMock.mockResolvedValue([]);
});

describe("BulkImportScreen", () => {
  it("opens the real column-mapping modal instead of calling /process with an empty mapping", async () => {
    render(<Harness />);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /upload & import/i }));

    expect(await screen.findByText(/drop csv here/i)).toBeTruthy();
  });

  it("drives upload -> mapping -> validate and blocks commit on server-reported row errors", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "bad" }],
      row_count: 1,
    });
    mappingMock.mockResolvedValue({
      valid: false,
      errors: [{ row: 2, column: "Qty", message: "not a number" }],
      will_create: 0,
      will_update: 0,
    });
    render(<Harness />);
    await openModalAndUpload();
    await screen.findByLabelText(/Part No\./i);

    fireEvent.click(screen.getByText("Next: Review"));

    expect(await screen.findByText(/not a number/i)).toBeTruthy();
    expect(screen.getByText("Import").closest("button")).toBeDisabled();
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("commits real created/updated/failed counts and reloads the job history when the modal closes", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "10" }],
      row_count: 1,
    });
    mappingMock.mockResolvedValue({ valid: true, errors: [], will_create: 1, will_update: 0 });
    commitMock.mockResolvedValue({ created: 1, updated: 0, failed: 0, errors: [] });
    render(<Harness />);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await openModalAndUpload();
    await screen.findByLabelText(/Part No\./i);
    fireEvent.click(screen.getByText("Next: Review"));
    await screen.findByText("Import");

    fireEvent.click(screen.getByText("Import"));

    await waitFor(() => expect(commitMock).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText(/created/i)).toBeTruthy();

    fireEvent.click(screen.getByText("Done"));

    // Closing the modal re-fetches /import/jobs so the History table shows
    // the just-completed job without a manual page reload.
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces a failed upload honestly instead of silently reporting success", async () => {
    uploadMock.mockRejectedValue(new Error("file too large"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /upload & import/i }));
    const input = document.getElementById("__bulk-import-input");
    fireEvent.change(input, { target: { files: [csvFile()] } });

    expect(await screen.findByText(/file too large/i)).toBeTruthy();
    expect(mappingMock).not.toHaveBeenCalled();
    expect(commitMock).not.toHaveBeenCalled();
  });
});
