import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusPill } from "../Badge.jsx";

// Callers pass the pill text either as children (ShareLinkModal, AdminOpsScreen)
// or as `label` (ComplianceReportPanel). The explicit JSX children inside
// StatusPill used to override a spread `children`, so the first form rendered
// an empty pill — a dot and no text.
describe("StatusPill", () => {
  it("renders children", () => {
    render(<StatusPill tone="neutral">Revoked</StatusPill>);
    expect(screen.getByText("Revoked")).toBeTruthy();
  });

  it("still prefers an explicit label", () => {
    render(<StatusPill tone="success" label="Active" status="ignored" />);
    expect(screen.getByText("Active")).toBeTruthy();
  });
});
