import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

window.React = React;
globalThis.React = React;

// A plain function, not vi.fn(): the spy wrapper chains its own .then() onto
// whatever the mock returns, so a rejected promise surfaces as an unhandled
// rejection even though the component does catch it.
let impl = async () => ({ results: [] });
const calls = [];
vi.mock("../../../../api.js", () => ({
  api: {
    search: {
      query: (...a) => {
        calls.push(a);
        return impl(...a);
      },
    },
  },
}));

const { default: GlobalSearchModal } = await import("../GlobalSearchModal.jsx");

describe("GlobalSearchModal", () => {
  beforeEach(() => {
    calls.length = 0;
    impl = async () => ({ results: [] });
  });

  /**
   * The palette is debounced, so a slow early request can land AFTER a fast
   * late one. If it is allowed to win, the user sees results for a query they
   * already typed over. Guarded by a monotonic request id in the component.
   */
  it("ignores a stale response that resolves after a newer one", async () => {
    const user = userEvent.setup();
    let releaseSlow;
    impl = () =>
      new Promise((res) => {
        releaseSlow = () =>
          res({
            results: [
              { entity_type: "parts", entity_id: 1, title: "STALE-PART" },
            ],
          });
      });

    render(<GlobalSearchModal open onClose={() => {}} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "ab");
    await waitFor(() => expect(calls.length).toBe(1));

    impl = async () => ({
      results: [
        { entity_type: "vendors", entity_id: 2, title: "FRESH-VENDOR" },
      ],
    });
    await user.type(input, "c");
    await waitFor(() => expect(calls.length).toBe(2));
    await screen.findByText("FRESH-VENDOR");

    releaseSlow();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("STALE-PART")).toBeNull();
    expect(screen.getByText("FRESH-VENDOR")).toBeTruthy();
  });

  it("groups results by entity type with a count", async () => {
    const user = userEvent.setup();
    impl = async () => ({
      results: [
        { entity_type: "parts", entity_id: 1, title: "P-1" },
        { entity_type: "parts", entity_id: 2, title: "P-2" },
        { entity_type: "pos", entity_id: 3, title: "PO-9" },
      ],
    });
    render(<GlobalSearchModal open onClose={() => {}} />);
    await user.type(screen.getByRole("combobox"), "zz");
    await screen.findByText("Parts (2)");
    expect(screen.getByText("Purchase orders (1)")).toBeTruthy();
  });

  // Graceful degradation: say the search failed, never quietly show a narrower
  // in-memory result set as if it were the whole index.
  it("surfaces a failed search", async () => {
    const user = userEvent.setup();
    impl = async () => {
      throw new Error("boom");
    };
    render(<GlobalSearchModal open onClose={() => {}} />);
    await user.type(screen.getByRole("combobox"), "zz");
    await screen.findByText("Search failed");
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("does not hit the server below the minimum query length", async () => {
    const user = userEvent.setup();
    render(<GlobalSearchModal open onClose={() => {}} />);
    await user.type(screen.getByRole("combobox"), "z");
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.length).toBe(0);
  });
});
