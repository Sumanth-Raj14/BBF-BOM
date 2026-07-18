import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

window.React = React;

const actionMock = vi.fn();
vi.mock("../../../api.js", () => ({
  api: { eco: { action: (...args) => actionMock(...args) } },
}));

vi.mock("../../utils/toast", () => ({
  toast: vi.fn(),
}));

import { ESignDialog } from "../ESignDialog.jsx";
import { toast } from "../../utils/toast";

beforeEach(() => {
  actionMock.mockReset();
  toast.mockReset();
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "secret" } });
  fireEvent.change(screen.getByLabelText(/Reason for approval/i), {
    target: { value: "Reviewed and acceptable" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Sign & Approve/i }));
}

describe("ESignDialog", () => {
  it("requires a password and meaning before it will call the guarded action", () => {
    render(
      <ESignDialog open ecoId={42} ecoLabel="ECO-1" action="approve" onClose={() => {}} onSuccess={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sign & Approve/i }));
    expect(actionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/password is required/i);
  });

  it("calls the real guarded ECO action and reports success only after the backend confirms it", async () => {
    actionMock.mockResolvedValueOnce({ eco_id: 42, status: "approved" });
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <ESignDialog open ecoId={42} ecoLabel="ECO-1" action="approve" onClose={onClose} onSuccess={onSuccess} />,
    );

    fillAndSubmit();

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    expect(actionMock).toHaveBeenCalledWith(42, expect.objectContaining({
      action: "approve",
      password: "secret",
      signature_meaning: "Reviewed and acceptable",
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" }),
    ));
    expect(onClose).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/signed/i), expect.objectContaining({ kind: "success" }));
  });

  it("surfaces a failed signature honestly and does not report success or close", async () => {
    actionMock.mockRejectedValueOnce(new Error("Password re-authentication required for electronic signature"));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <ESignDialog open ecoId={42} ecoLabel="ECO-1" action="approve" onClose={onClose} onSuccess={onSuccess} />,
    );

    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Password re-authentication required/i),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.stringMatching(/Password re-authentication required/i),
      expect.objectContaining({ kind: "error" }),
    );
  });
});
