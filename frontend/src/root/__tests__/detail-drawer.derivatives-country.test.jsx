/**
 * Wiring check for the two part-level surfaces the drawer now reaches:
 * CAD derivatives (/derivatives/) and country-of-origin history
 * (/country-history/parts/{id}/country-history).
 *
 * Both were live server-side with no caller. What can silently break is the
 * WIRING, not the rendering: wrong part id, an unhandled {items}/{data}/array
 * envelope, or an "edit" that posts instead of replacing the ordered list
 * (the backend has no per-entry PUT — editing rewrites the whole list and
 * deleting addresses an entry by index).
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/toast", () => ({ toast: vi.fn() }));

import { Drawer } from "../detail-drawer.jsx";

// Same bare-global wiring the other root/*.jsx tests use.
window.React = React;
window.Icon = new Proxy({}, { get: () => () => null });
window.DropdownButton = ({ trigger }) => <div>{trigger}</div>;
window.useAppStore = () => ({ openModal: vi.fn() });
window.fmt = new Proxy({}, { get: () => (v) => String(v ?? "") });

const row = { id: "api-42", partId: 42, pn: "W-1", name: "Widget", qty: 1, cost: 0 };

let derivatives;
let countryHistory;

beforeEach(() => {
  derivatives = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    attach: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn().mockResolvedValue({}),
  };
  countryHistory = {
    getPartHistory: vi.fn().mockResolvedValue({
      countryHistory: [
        { country: "CN", date: "2024-01-01", reason: "initial" },
        { country: "IN", date: "2025-06-01", reason: "tariff" },
      ],
    }),
    addEntry: vi.fn().mockResolvedValue({ countryHistory: [] }),
    updateHistory: vi.fn().mockResolvedValue({ countryHistory: [] }),
    deleteEntry: vi.fn().mockResolvedValue({ countryHistory: [] }),
  };
  window.api = { derivatives, countryHistory, documents: { list: vi.fn().mockResolvedValue({ items: [] }) } };
});

const open = () => render(<Drawer row={row} data={{ rows: [] }} onClose={() => {}} />);

describe("CAD derivatives tab", () => {
  it("lists a part's derivatives from the real part id", async () => {
    derivatives.list.mockResolvedValue({
      items: [{ id: 7, partId: 42, kind: "step", url: "cad/exports/W-1.step" }],
    });
    open();
    fireEvent.click(screen.getByRole("tab", { name: /CAD/i }));
    await screen.findByText("cad/exports/W-1.step");
    expect(derivatives.list).toHaveBeenCalledWith(
      expect.objectContaining({ partId: 42 }),
    );
  });

  it("accepts a bare-array response too", async () => {
    derivatives.list.mockResolvedValue([{ id: 9, kind: "pdf", url: "cad/W-1.pdf" }]);
    open();
    fireEvent.click(screen.getByRole("tab", { name: /CAD/i }));
    await screen.findByText("cad/W-1.pdf");
  });

  it("attaches a derivative and reloads", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: /CAD/i }));
    await waitFor(() => expect(derivatives.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Attach/i }));
    fireEvent.change(screen.getByPlaceholderText("cad/exports/W-1.step"), {
      target: { value: "cad/exports/W-1.step" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() =>
      expect(derivatives.attach).toHaveBeenCalledWith({
        partId: 42,
        kind: "step",
        url: "cad/exports/W-1.step",
        drawingStatus: null,
      }),
    );
    await waitFor(() => expect(derivatives.list).toHaveBeenCalledTimes(2));
  });

  it("does not attach an empty url", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: /CAD/i }));
    await waitFor(() => expect(derivatives.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Attach/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(derivatives.attach).not.toHaveBeenCalled());
  });
});

describe("country-of-origin editor", () => {
  it("loads history from the endpoint, not from row.countryHistory", async () => {
    open();
    await screen.findByText("IN");
    expect(countryHistory.getPartHistory).toHaveBeenCalledWith(42);
  });

  it("adds an entry via POST", async () => {
    open();
    await screen.findByText("IN");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.change(screen.getByPlaceholderText("IN"), { target: { value: "VN" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() =>
      expect(countryHistory.addEntry).toHaveBeenCalledWith(42, {
        country: "VN",
        date: null,
        reason: null,
      }),
    );
  });

  it("edits an entry by replacing the whole ordered list", async () => {
    open();
    await screen.findByText("IN");
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/i })[1]);
    fireEvent.change(screen.getByPlaceholderText("IN"), { target: { value: "VN" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() =>
      expect(countryHistory.updateHistory).toHaveBeenCalledWith(42, [
        { country: "CN", date: "2024-01-01", reason: "initial" },
        { country: "VN", date: "2025-06-01", reason: "tariff" },
      ]),
    );
    expect(countryHistory.addEntry).not.toHaveBeenCalled();
  });

  it("deletes an entry by its index", async () => {
    open();
    await screen.findByText("IN");
    fireEvent.click(screen.getAllByRole("button", { name: /Delete/i })[1]);
    await waitFor(() => expect(countryHistory.deleteEntry).toHaveBeenCalledWith(42, 1));
  });
});
