import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

window.React = React;
window.Icon = new Proxy({}, { get: () => () => null });

const mockUnits = vi.fn();
const mockConvert = vi.fn();
vi.mock("../../../../api.js", () => ({
  api: { uom: { units: (...a) => mockUnits(...a), convert: (...a) => mockConvert(...a) } },
}));

import UomConverterModal from "../UomConverterModal.jsx";

describe("UomConverterModal", () => {
  it("shows the converted result on success", async () => {
    mockUnits.mockResolvedValue([
      { code: "M", name: "Metre" },
      { code: "CM", name: "Centimetre" },
    ]);
    mockConvert.mockResolvedValue({ result: 100 });

    render(<UomConverterModal open onClose={() => {}} />);
    await waitFor(() => expect(mockUnits).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Convert"));

    await waitFor(() => expect(screen.getByText(/= 100 CM/)).toBeTruthy());
    expect(mockConvert).toHaveBeenCalledWith("1", "M", "CM");
  });

  it("surfaces the backend's exact error instead of a fake result", async () => {
    mockUnits.mockResolvedValue([
      { code: "M", name: "Metre" },
      { code: "KG", name: "Kilogram" },
    ]);
    mockConvert.mockRejectedValue(
      new Error("Cannot convert 'M' (length) to 'KG' (mass) — different physical dimensions."),
    );

    render(<UomConverterModal open onClose={() => {}} />);
    await waitFor(() => expect(mockUnits).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Convert"));

    await waitFor(() =>
      expect(screen.getByText(/different physical dimensions/i)).toBeTruthy(),
    );
    // Never a silently-fabricated number alongside/instead of the error.
    expect(screen.queryByText(/^1 M =/)).toBeNull();
  });
});
