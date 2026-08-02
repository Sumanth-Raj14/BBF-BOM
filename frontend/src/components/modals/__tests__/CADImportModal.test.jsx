import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

window.React = React;
// The modal renders <Icon.Import/> from the legacy window.* shim layer.
window.Icon = new Proxy({}, { get: () => () => null });

vi.mock("../../../utils/toast", () => ({ toast: vi.fn() }));

import CADImportModal from "../CADImportModal.jsx";

/**
 * CAD import is not implemented and cannot be in the browser: .sldasm/.sldprt
 * are proprietary SolidWorks binaries. This modal previously ran a fake
 * progress bar and then showed a HARDCODED parts list, reporting
 * "Imported N new parts" without uploading anything or calling any API.
 *
 * These tests pin the honest behaviour so the fake cannot come back.
 */
describe("CADImportModal", () => {
  it("tells the user the SolidWorks add-in is required instead of faking an import", () => {
    render(<CADImportModal open onClose={() => {}} />);

    fireEvent.click(screen.getByText("SolidWorks"));

    expect(
      screen.getByText(/CAD import needs the SolidWorks add-in/i),
    ).toBeTruthy();
    // The fake parts list must never reappear.
    expect(screen.queryByText(/MEC-PL-040A/)).toBeNull();
    expect(screen.queryByText(/parts will be imported/i)).toBeNull();
  });

  it("never claims a successful import", () => {
    render(<CADImportModal open onClose={() => {}} />);
    fireEvent.click(screen.getByText("SolidWorks"));

    expect(screen.queryByText(/^Imported/i)).toBeNull();
    expect(screen.queryByText(/new parts,/i)).toBeNull();
  });

  it("resets cleanly when closed", () => {
    // Regression guard: the close/reset effect used to call setters
    // (setProgress/setFoundParts/setSelected) that were removed along with the
    // fake review flow, throwing on every close.
    const { rerender } = render(<CADImportModal open onClose={() => {}} />);
    fireEvent.click(screen.getByText("SolidWorks"));

    expect(() =>
      rerender(<CADImportModal open={false} onClose={() => {}} />),
    ).not.toThrow();

    rerender(<CADImportModal open onClose={() => {}} />);
    // Back to the upload step, not stuck on the add-in notice.
    expect(screen.getByText("SolidWorks")).toBeTruthy();
  });
});
