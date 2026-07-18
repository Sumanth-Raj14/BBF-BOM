import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

window.React = React;

// ECRScreen (via globals.js) and ESignDialog (directly) both resolve to the
// same underlying frontend/api.js module — mocking it here intercepts both
// api.eco.create (ECRScreen) and api.eco.action (ESignDialog). We keep the
// real module for everything else (importOriginal) because globals.js pulls
// in a large legacy chain that relies on api.js's own module-scope
// window.api side effect; only api.eco is overridden.
const ecoCreateMock = vi.fn();
const ecoActionMock = vi.fn();
vi.mock("../../../../api.js", async (importOriginal) => {
  const actual = await importOriginal();
  const api = {
    ...actual.api,
    eco: {
      create: (...args) => ecoCreateMock(...args),
      action: (...args) => ecoActionMock(...args),
    },
  };
  return { ...actual, api };
});

vi.mock("../../../utils/toast", () => ({
  toast: vi.fn(),
}));

import { ECRScreen } from "../ECRScreen.jsx";

async function flush() {
  // Flush the microtask queue (and any state updates it triggers) inside
  // an act() so React commits the resulting re-render before we proceed.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openDetail(title) {
  const cell = screen.getByText(title);
  const row = cell.closest("tr");
  fireEvent.click(row);
}

beforeEach(() => {
  localStorage.clear();
  ecoCreateMock.mockReset();
  ecoActionMock.mockReset();
});

describe("ECRScreen — e-sign wiring", () => {
  it("never falls back to the local ECR id: a demo ECR with no real backing ECO honestly fails to sign instead of hitting the backend with a fake id", async () => {
    render(<ECRScreen />);

    // Seed data ships "ECR-2026-014" already in Review status.
    openDetail("Replace STM32F4 with H7 in ATLAS-LITE");
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));

    // ESignDialog is now open — fill it in and submit.
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: "secret" },
    });
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: "Looks fine" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign & Approve/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/no linked eco/i),
    );
    expect(ecoActionMock).not.toHaveBeenCalled();
  });

  it("creates a real backend ECO on ECR creation, syncs it to 'review' on submit, and signs approve/implement against the real numeric ecoId end to end", async () => {
    ecoCreateMock.mockResolvedValueOnce({ id: 501, status: "draft" });
    ecoActionMock.mockResolvedValue({ eco_id: 501, status: "approved" });

    render(<ECRScreen />);

    fireEvent.click(screen.getByRole("button", { name: /New ECR/i }));
    fireEvent.change(screen.getByLabelText(/^Title$/i), {
      target: { value: "Swap connector footprint" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create ECR/i }));

    // The ECR is created locally immediately; the backing ECO is created
    // best-effort in the background.
    expect(await screen.findByText("Swap connector footprint")).toBeTruthy();
    expect(ecoCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Swap connector footprint", change_type: "design" }),
    );
    await flush(); // let createBackingEco's setEcrs(ecoId) commit

    // Submit for review: this ECR now carries a real ecoId, so the local
    // Draft -> Review advance must be mirrored to the backend as
    // action:"submit" (perform_eco_action requires "review" status before
    // "approve" is legal).
    openDetail("Swap connector footprint");
    fireEvent.click(screen.getByRole("button", { name: /Submit for Review/i }));
    expect(ecoActionMock).toHaveBeenCalledWith(501, { action: "submit" });
    ecoActionMock.mockClear();

    // Approve: ESignDialog must receive the real numeric ecoId (501), not
    // the client-generated "ECR-2026-…" string id.
    openDetail("Swap connector footprint");
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: "secret" },
    });
    fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
      target: { value: "Reviewed BOM impact" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sign & Approve/i }));

    await waitFor(() =>
      expect(ecoActionMock).toHaveBeenCalledWith(
        501,
        expect.objectContaining({ action: "approve", password: "secret" }),
      ),
    );
  });
});
