import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

window.React = React;

const { uploadMock, mappingMock, commitMock, toastMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  mappingMock: vi.fn(),
  commitMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("../../api.js", () => ({
  api: {
    import: {
      upload: uploadMock,
      mapping: mappingMock,
      commit: commitMock,
    },
  },
}));

vi.mock("../utils/toast", () => ({ toast: toastMock }));
vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
}));

import BulkImportModal from "../components/modals/BulkImportModal.jsx";

/**
 * BulkImportModal used to parse CSV client-side and push fabricated
 * "imp-<timestamp>" rows straight into React state — nothing was ever
 * imported. These tests pin the real upload -> mapping -> commit lifecycle
 * against the shared contract (see CLUSTER export-import-frontend) and
 * make sure no fabricated success path can come back.
 */
function csvFile() {
  return new File(["Part No,Qty\nR1,10"], "parts.csv", { type: "text/csv" });
}

// Queried by id, not label text: the "uploadAria" i18n key still carries
// stale copy from the old paste-CSV flow ("Upload CSV file"), which is a
// locale-content fix outside this cluster's owned files (see writeup).
async function upload() {
  const file = csvFile();
  const input = document.getElementById("__bulk-import-input");
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(uploadMock).toHaveBeenCalled());
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BulkImportModal", () => {
  it("uploads the real file to POST /import/upload with entity=parts", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "10" }],
      row_count: 1,
    });
    render(<BulkImportModal open onClose={() => {}} />);

    const file = await upload();

    expect(uploadMock).toHaveBeenCalledWith(file, "parts");
    expect(await screen.findByText(/map 2 columns/i)).toBeTruthy();
  });

  it("auto-guesses the mapping from the server's detected_columns", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "10" }],
      row_count: 1,
    });
    render(<BulkImportModal open onClose={() => {}} />);
    await upload();

    const pnSelect = await screen.findByLabelText(/Part No\./i);
    expect(pnSelect.value).toBe("Part No");
  });

  it("validates via POST /import/{job_id}/mapping before writing anything", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "10" }],
      row_count: 1,
    });
    mappingMock.mockResolvedValue({ valid: true, errors: [], will_create: 1, will_update: 0 });
    render(<BulkImportModal open onClose={() => {}} />);
    await upload();
    await screen.findByLabelText(/Part No\./i);

    fireEvent.click(screen.getByText("Next: Review"));

    await waitFor(() => expect(mappingMock).toHaveBeenCalled());
    const [jobId, mapping] = mappingMock.mock.calls[0];
    expect(jobId).toBe("job-1");
    expect(mapping).toEqual({ "Part No": "pn", Qty: "qty" });
    expect(commitMock).not.toHaveBeenCalled(); // mapping must not write

    expect(await screen.findByText(/1.*will be created/i)).toBeTruthy();
  });

  it("commits via POST /import/{job_id}/commit and reports real created/updated/failed counts", async () => {
    uploadMock.mockResolvedValue({
      job_id: "job-1",
      detected_columns: ["Part No", "Qty"],
      sample_rows: [{ "Part No": "R1", Qty: "10" }],
      row_count: 1,
    });
    mappingMock.mockResolvedValue({ valid: true, errors: [], will_create: 1, will_update: 0 });
    commitMock.mockResolvedValue({ created: 1, updated: 0, failed: 0, errors: [] });
    render(<BulkImportModal open onClose={() => {}} />);
    await upload();
    await screen.findByLabelText(/Part No\./i);
    fireEvent.click(screen.getByText("Next: Review"));
    await screen.findByText("Import");

    fireEvent.click(screen.getByText("Import"));

    await waitFor(() => expect(commitMock).toHaveBeenCalledWith("job-1"));
    expect(await screen.findByText(/created/i)).toBeTruthy();
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining("1"),
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("blocks commit and shows server-reported row errors when validation fails", async () => {
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
    render(<BulkImportModal open onClose={() => {}} />);
    await upload();
    await screen.findByLabelText(/Part No\./i);
    fireEvent.click(screen.getByText("Next: Review"));

    expect(await screen.findByText(/not a number/i)).toBeTruthy();
    expect(screen.getByText("Import").closest("button")).toBeDisabled();
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed upload honestly instead of silently faking a job", async () => {
    uploadMock.mockRejectedValue(new Error("file too large"));
    render(<BulkImportModal open onClose={() => {}} />);

    const file = csvFile();
    fireEvent.change(document.getElementById("__bulk-import-input"), {
      target: { files: [file] },
    });

    expect(await screen.findByText(/file too large/i)).toBeTruthy();
    expect(mappingMock).not.toHaveBeenCalled();
    expect(commitMock).not.toHaveBeenCalled();
  });
});
