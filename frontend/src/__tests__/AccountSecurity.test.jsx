import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

window.React = React;

const mfaSetup = vi.fn();
const mfaVerify = vi.fn();
const mfaDisable = vi.fn();
const changePassword = vi.fn();
const toastMock = vi.fn();

vi.mock("../../api.js", () => ({
  api: {
    auth: {
      mfaSetup: (...a) => mfaSetup(...a),
      mfaVerify: (...a) => mfaVerify(...a),
      mfaDisable: (...a) => mfaDisable(...a),
      changePassword: (...a) => changePassword(...a),
    },
  },
}));
vi.mock("../utils/toast", () => ({ toast: (...a) => toastMock(...a) }));

import AccountSecurity from "../components/modals/AccountSecurity.jsx";

// MFA and change-password existed server-side with no client wrapper and no
// UI at all — two-factor was advertised as a shipped feature while being
// unreachable from the application.
describe("AccountSecurity", () => {
  beforeEach(() => {
    [mfaSetup, mfaVerify, mfaDisable, changePassword, toastMock].forEach((m) => m.mockReset());
  });

  it("states that backup codes cannot be retrieved again, and does not claim MFA is on before verification", async () => {
    mfaSetup.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qr_uri: "otpauth://totp/Blackbox%20BOM:a@b.c?secret=JBSWY3DPEHPK3PXP",
      backup_codes: ["aaaa1111", "bbbb2222"],
    });

    render(<AccountSecurity mfaEnabled={false} />);
    await userEvent.click(screen.getByText(/set up two-factor/i));

    await waitFor(() => expect(mfaSetup).toHaveBeenCalled());

    // The codes are returned in plaintext exactly once; the server keeps only
    // hashes. If the UI does not say so, a user closes the dialog and is
    // permanently locked out when they lose their phone.
    expect(await screen.findByText(/cannot be retrieved or re-displayed/i)).toBeTruthy();
    expect(screen.getByText(/aaaa1111/)).toBeTruthy();

    // Setup alone does NOT enable MFA — verify_mfa_enable does. Saying
    // "enabled" here would be a lie that costs the user their account.
    expect(screen.getByText(/not active until this code is accepted/i)).toBeTruthy();
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/enabled/i),
      expect.anything(),
    );
  });

  it("only reports MFA enabled after the verify call resolves", async () => {
    mfaSetup.mockResolvedValue({ secret: "S", qr_uri: "", backup_codes: [] });
    let resolve;
    mfaVerify.mockReturnValue(new Promise((r) => (resolve = r)));
    const onChanged = vi.fn();

    render(<AccountSecurity mfaEnabled={false} onChanged={onChanged} />);
    await userEvent.click(screen.getByText(/set up two-factor/i));
    await waitFor(() => expect(mfaSetup).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText(/6-digit code/i), "123456");
    await userEvent.click(screen.getByText(/verify and enable/i));

    // In flight: nothing claimed yet.
    expect(toastMock).not.toHaveBeenCalled();

    resolve({ ok: true });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringMatching(/enabled/i),
        expect.objectContaining({ kind: "success" }),
      ),
    );
    // The badge is driven by /auth/me, so the parent must refetch.
    expect(onChanged).toHaveBeenCalled();
  });

  it("surfaces a rejected code as an error and leaves enrolment open", async () => {
    mfaSetup.mockResolvedValue({ secret: "S", qr_uri: "", backup_codes: [] });
    mfaVerify.mockRejectedValue(new Error("Invalid code"));

    render(<AccountSecurity mfaEnabled={false} />);
    await userEvent.click(screen.getByText(/set up two-factor/i));
    await waitFor(() => expect(mfaSetup).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText(/6-digit code/i), "000000");
    await userEvent.click(screen.getByText(/verify and enable/i));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringMatching(/Invalid code/),
        expect.objectContaining({ kind: "error" }),
      ),
    );
    // Still in enrolment so the user can retype — not silently reset.
    expect(screen.getByText(/verify and enable/i)).toBeTruthy();
  });

  it("refuses a password change whose confirmation does not match, without calling the API", async () => {
    render(<AccountSecurity mfaEnabled={false} />);

    await userEvent.type(screen.getByLabelText(/current password/i), "old");
    await userEvent.type(screen.getByLabelText(/^new password$/i), "newpass1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "newpass2");
    await userEvent.click(screen.getByText(/change password/i));

    expect(changePassword).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringMatching(/do not match/i),
      expect.objectContaining({ kind: "error" }),
    );
  });

  it("requires BOTH a password and a current code to disable MFA", async () => {
    render(<AccountSecurity mfaEnabled onChanged={vi.fn()} />);
    await userEvent.click(screen.getByText(/disable two-factor/i));

    const btn = screen.getByText(/^Disable$/);
    // Disabled until both are supplied — a borrowed session must not be able
    // to strip MFA with the password alone.
    expect(btn.closest("button").disabled).toBe(true);

    // "Your password", not "Current password": the change-password form also
    // renders a "Current password" field, and two identical accessible names
    // on one screen is a real a11y defect, not just an ambiguous query.
    await userEvent.type(screen.getByLabelText(/your password/i), "pw");
    expect(screen.getByText(/^Disable$/).closest("button").disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/6-digit code/i), "123456");
    expect(screen.getByText(/^Disable$/).closest("button").disabled).toBe(false);
  });
});
