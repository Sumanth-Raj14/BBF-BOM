import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Badge, Button, Field, Input, Spinner } from "../ui";

// Account security: change password, and enrol in / disable TOTP MFA.
//
// Why this file exists: the backend has had POST /auth/mfa/{setup,verify,
// disable} and /auth/change-password the whole time, with NO client wrapper
// and no UI anywhere. MFA was listed as a shipped security feature while
// being unreachable — a user could not turn on two-factor auth, or change
// their own password, from inside the application.
//
// Deliberately NOT a QR image. Rendering one needs a QR encoder dependency,
// and this repo's npm audit is already carrying 4 high advisories. Every
// authenticator app accepts manual secret entry, so the secret is shown as
// copyable text and labelled as manual setup rather than implying a scan.

function CopyRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center gap-8" style={{ marginTop: 8 }}>
      <Input value={value} readOnly mono={mono} aria-label={label} />
      <Button
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast(__t("common.copied") || "Copied", { kind: "success" });
          } catch {
            // Clipboard is blocked outside a secure context; the value is
            // already visible and selectable, so say nothing rather than
            // raise an error for a convenience that failed.
          }
        }}
      >
        {__t("common.copy") || "Copy"}
      </Button>
    </div>
  );
}
CopyRow.propTypes = { label: PropTypes.string, value: PropTypes.string, mono: PropTypes.bool };

export default function AccountSecurity({ mfaEnabled, onChanged }) {
  const [pw, setPw] = React.useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = React.useState(false);

  // enrolment holds the ONE-TIME payload from /auth/mfa/setup.
  const [enrolment, setEnrolment] = React.useState(null);
  const [code, setCode] = React.useState("");
  const [mfaBusy, setMfaBusy] = React.useState(false);

  const [disable, setDisable] = React.useState({ open: false, password: "", code: "" });

  const fail = (e, fallback) =>
    toast(`${fallback}: ${e?.message || String(e)}`, { kind: "error" });

  async function submitPassword(e) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      toast(__t("security.pwMismatch") || "New password and confirmation do not match", {
        kind: "error",
      });
      return;
    }
    setPwBusy(true);
    try {
      await api.auth.changePassword(pw.current, pw.next);
      // Only after the awaited call resolved.
      toast(__t("security.pwChanged") || "Password changed", { kind: "success" });
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      fail(err, __t("security.pwFailed") || "Could not change password");
    } finally {
      setPwBusy(false);
    }
  }

  async function beginEnrol() {
    setMfaBusy(true);
    try {
      const r = await api.auth.mfaSetup();
      setEnrolment(r);
      setCode("");
    } catch (err) {
      fail(err, __t("security.mfaSetupFailed") || "Could not start MFA setup");
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmEnrol(e) {
    e.preventDefault();
    setMfaBusy(true);
    try {
      await api.auth.mfaVerify(code, enrolment?.secret);
      toast(__t("security.mfaEnabled") || "Two-factor authentication enabled", {
        kind: "success",
      });
      setEnrolment(null);
      setCode("");
      if (onChanged) await onChanged();
    } catch (err) {
      fail(err, __t("security.mfaVerifyFailed") || "Code rejected");
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setMfaBusy(true);
    try {
      await api.auth.mfaDisable(disable.password, disable.code);
      toast(__t("security.mfaDisabled") || "Two-factor authentication disabled", {
        kind: "success",
      });
      setDisable({ open: false, password: "", code: "" });
      if (onChanged) await onChanged();
    } catch (err) {
      fail(err, __t("security.mfaDisableFailed") || "Could not disable two-factor");
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--bd-1)", paddingTop: 16 }}>
      <h3 className="m-0 fs-13 fw-600">{__t("security.title") || "Security"}</h3>

      {/* ---------------- password ---------------- */}
      <form onSubmit={submitPassword} style={{ marginTop: 12 }}>
        <div className="field-row">
          <Field label={__t("security.currentPw") || "Current password"}>
            <Input
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <Field label={__t("security.newPw") || "New password"}>
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </Field>
          <Field label={__t("security.confirmPw") || "Confirm new password"}>
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </Field>
        </div>
        <Button
          type="submit"
          disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}
        >
          {pwBusy
            ? __t("common.saving") || "Saving…"
            : __t("security.changePw") || "Change password"}
        </Button>
        <p className="fs-11 fg-3" style={{ margin: "6px 0 0" }}>
          {__t("security.pwPolicyHint") ||
            "The server enforces its own strength policy and will reject a weak password with the reason."}
        </p>
      </form>

      {/* ---------------- MFA ---------------- */}
      <div style={{ marginTop: 20 }}>
        <div className="flex items-center gap-8">
          <h4 className="m-0 fs-12 fw-600">
            {__t("security.mfa") || "Two-factor authentication"}
          </h4>
          <Badge tone={mfaEnabled ? "success" : "neutral"}>
            {mfaEnabled
              ? __t("security.on") || "On"
              : __t("security.off") || "Off"}
          </Badge>
          {mfaBusy && <Spinner />}
        </div>

        {/* not enrolled, not mid-enrolment */}
        {!mfaEnabled && !enrolment && (
          <div style={{ marginTop: 8 }}>
            <p className="fs-11 fg-3" style={{ margin: "0 0 8px" }}>
              {__t("security.mfaIntro") ||
                "Protects your account with a time-based code from an authenticator app, in addition to your password."}
            </p>
            <Button onClick={beginEnrol} disabled={mfaBusy}>
              {__t("security.mfaSetUp") || "Set up two-factor"}
            </Button>
          </div>
        )}

        {/* mid-enrolment: the one-time payload */}
        {!mfaEnabled && enrolment && (
          <form onSubmit={confirmEnrol} style={{ marginTop: 8 }}>
            <p className="fs-11 fg-3" style={{ margin: 0 }}>
              {__t("security.mfaManualHint") ||
                "Add this secret to your authenticator app using its \"enter key manually\" option, then type the 6-digit code it shows."}
            </p>
            <CopyRow label={__t("security.mfaSecret") || "Secret"} value={enrolment.secret || ""} />

            {enrolment.qr_uri ? (
              <details style={{ marginTop: 8 }}>
                <summary className="fs-11 fg-3">
                  {__t("security.mfaUri") || "otpauth:// URI (for apps that accept a pasted link)"}
                </summary>
                <CopyRow label="otpauth" value={enrolment.qr_uri} />
              </details>
            ) : null}

            {Array.isArray(enrolment.backup_codes) && enrolment.backup_codes.length > 0 && (
              <div
                className="rounded-r2"
                style={{
                  marginTop: 12,
                  padding: 10,
                  border: "1px solid var(--warn, #b45309)",
                }}
              >
                <div className="fw-600 fs-12">
                  {__t("security.backupCodes") || "Backup codes — save them now"}
                </div>
                <p className="fs-11 fg-3" style={{ margin: "4px 0 8px" }}>
                  {__t("security.backupOnce") ||
                    "These are shown once. The server keeps only hashes of them, so they cannot be retrieved or re-displayed — if you lose them and your authenticator, you lose access to the account."}
                </p>
                <div className="font-mono fs-12" style={{ lineHeight: 1.7 }}>
                  {enrolment.backup_codes.join("   ")}
                </div>
                <CopyRow
                  label={__t("security.backupCodes") || "Backup codes"}
                  value={enrolment.backup_codes.join("\n")}
                />
              </div>
            )}

            <div className="field-row" style={{ marginTop: 12 }}>
              <Field label={__t("security.mfaCode") || "6-digit code"}>
                <Input
                  mono
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center gap-8">
              <Button type="submit" disabled={mfaBusy || !code}>
                {__t("security.mfaConfirm") || "Verify and enable"}
              </Button>
              <Button variant="ghost" onClick={() => setEnrolment(null)} disabled={mfaBusy}>
                {__t("common.cancel") || "Cancel"}
              </Button>
            </div>
            <p className="fs-11 fg-3" style={{ margin: "6px 0 0" }}>
              {__t("security.mfaNotYetOn") ||
                "Two-factor is not active until this code is accepted."}
            </p>
          </form>
        )}

        {/* enrolled */}
        {mfaEnabled && !disable.open && (
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" onClick={() => setDisable({ ...disable, open: true })}>
              {__t("security.mfaDisable") || "Disable two-factor"}
            </Button>
          </div>
        )}

        {mfaEnabled && disable.open && (
          <form onSubmit={confirmDisable} style={{ marginTop: 8 }}>
            <p className="fs-11 fg-3" style={{ margin: 0 }}>
              {__t("security.mfaDisableHint") ||
                "Turning this off needs both your password and a current code, so a borrowed session cannot remove it."}
            </p>
            <div className="field-row" style={{ marginTop: 8 }}>
              <Field label={__t("security.confirmIdentityPw") || "Your password"}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={disable.password}
                  onChange={(e) => setDisable({ ...disable, password: e.target.value })}
                />
              </Field>
              <Field label={__t("security.mfaCode") || "6-digit code"}>
                <Input
                  mono
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={disable.code}
                  onChange={(e) => setDisable({ ...disable, code: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center gap-8">
              <Button type="submit" disabled={mfaBusy || !disable.password || !disable.code}>
                {__t("security.mfaDisableConfirm") || "Disable"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDisable({ open: false, password: "", code: "" })}
                disabled={mfaBusy}
              >
                {__t("common.cancel") || "Cancel"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

AccountSecurity.propTypes = {
  mfaEnabled: PropTypes.bool,
  onChanged: PropTypes.func,
};
