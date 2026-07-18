import PropTypes from "prop-types";

import { api } from "../../api.js";
import { toast } from "../utils/toast";
import { Modal, Field, Input, Textarea, Button } from "./ui";

// 21 CFR Part 11 electronic-signature dialog. Requires password
// re-authentication + a meaning/reason before calling the guarded ECO
// state-transition action (approve/implement). Mirrors
// app.services.part11_service.sign_action's contract on the backend:
// a missing/invalid password or an illegal transition returns an error
// and the ECO is NOT mutated — this dialog surfaces that failure honestly
// (toast + inline message) and never reports success unless the backend
// actually confirmed it.
const ACTION_COPY = {
  approve: {
    verb: "Approve",
    meaningLabel: "Reason for approval",
    meaningPlaceholder: "e.g. Reviewed BOM impact, cost delta acceptable",
  },
  implement: {
    verb: "Implement",
    meaningLabel: "Implementation note",
    meaningPlaceholder: "e.g. Released to production as of this date",
  },
};

export function ESignDialog({ open, onClose, ecoId, ecoLabel, action, onSuccess }) {
  const [password, setPassword] = React.useState("");
  const [meaning, setMeaning] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const copy = ACTION_COPY[action] || ACTION_COPY.approve;

  const reset = () => {
    setPassword("");
    setMeaning("");
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    if (onClose) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!password) {
      setError("Your password is required to sign this action.");
      return;
    }
    if (!meaning.trim()) {
      setError(`${copy.meaningLabel} is required.`);
      return;
    }
    if (ecoId == null) {
      // Honest failure: nothing to sign against — never fake success.
      const msg = "No linked ECO record to sign — this action was not applied.";
      setError(msg);
      toast(msg, { kind: "error" });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.eco.action(ecoId, {
        action,
        password,
        signature_meaning: meaning.trim(),
        comments: meaning.trim(),
      });
      toast(
        `${copy.verb}d and electronically signed${ecoLabel ? ` — ${ecoLabel}` : ""}`,
        { kind: "success" },
      );
      const applied = { ...result };
      reset();
      if (onSuccess) onSuccess(applied);
      if (onClose) onClose();
    } catch (err) {
      // Honest failure: surface the real backend error, do not close the
      // dialog and do not report success. The ECO state is unchanged.
      const msg = err?.message || "Signature failed — action was not applied.";
      setError(msg);
      toast(msg, { kind: "error" });
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Electronic signature — ${copy.verb} ${ecoLabel || (ecoId != null ? `ECO #${ecoId}` : "")}`}
      subtitle="21 CFR Part 11 — re-enter your password and record the reason for this action."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Sign &amp; {copy.verb}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div
            role="alert"
            className="ui-field__error"
            style={{
              marginBottom: 12,
              padding: "8px 10px",
              borderRadius: "var(--r-2, 6px)",
              background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
            }}
          >
            {error}
          </div>
        )}
        <Field label="Password" required htmlFor="esign-password">
          <Input
            id="esign-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label={copy.meaningLabel} required htmlFor="esign-meaning" hint="Recorded verbatim as the signature's stated meaning.">
          <Textarea
            id="esign-meaning"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder={copy.meaningPlaceholder}
            disabled={submitting}
          />
        </Field>
        {/* Submit via Enter in the form without a second visible button. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

ESignDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  ecoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  ecoLabel: PropTypes.string,
  action: PropTypes.oneOf(["approve", "implement"]).isRequired,
  onSuccess: PropTypes.func,
};

export default ESignDialog;
