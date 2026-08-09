import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

window.React = React;

vi.mock("../globals", () => ({
  Icon: new Proxy({}, { get: () => (props) => <span {...props} /> }),
}));

import AutoScrapeModal from "../components/modals/AutoScrapeModal.jsx";

// Used to fake a full scrape pipeline that always resolved to the same
// hardcoded STM32H743 dataset regardless of the part typed in. There's no
// backend endpoint for PN-based multi-source lookup, so this must never
// show that dataset (or any "success" state) again.
describe("AutoScrapeModal", () => {
  it("shows an honest unavailable state instead of the fabricated STM32H743 dataset", () => {
    render(<AutoScrapeModal open row={{ pn: "R47" }} onClose={() => {}} />);

    expect(screen.queryByText(/STMicroelectronics/i)).toBeNull();
    expect(screen.queryByText(/LQFP-100/i)).toBeNull();
    expect(screen.queryByText(/Start scraping/i)).toBeNull();
    expect(screen.getByText(/isn't available yet/i)).toBeTruthy();
  });
});
