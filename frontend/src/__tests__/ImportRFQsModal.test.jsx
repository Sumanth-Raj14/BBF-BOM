import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

window.React = React;

vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
}));

import ImportRFQsModal from "../components/modals/ImportRFQsModal.jsx";

// Used to show 4 hardcoded quotes ("detected from the inbox") and an
// "Import accepted" button that only toasted success. There is no
// email-parsing backend, so this must show an honest empty state instead.
describe("ImportRFQsModal", () => {
  it("shows an honest empty state instead of the fabricated inbox quotes", () => {
    render(<ImportRFQsModal open onClose={() => {}} />);

    expect(screen.queryByText(/Mean Well/i)).toBeNull();
    expect(screen.queryByText(/Daly/i)).toBeNull();
    expect(screen.queryByText(/Import accepted/i)).toBeNull();
    expect(screen.getByText(/No backend is configured/i)).toBeTruthy();
  });
});
