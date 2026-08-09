import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { Icon, api } from "../../globals";
import { Field, Input, Modal, Spinner, Tooltip } from "../ui";

// Fix (dead-fakes cleanup): this modal used to show a hardcoded "Elena Chen"
// profile with editable-looking fields, and "Save changes" only toasted
// success without persisting anything. GET /auth/me is real and now backs
// the display. There is no self-service profile-update endpoint (PUT/PATCH
// /users/{id} both require superuser — see backend/app/api/endpoints/users.py)
// so the fields are read-only and there is no Save button pretending to work.
export default function ProfileModal({ open, onClose }) {
  const [state, setState] = React.useState({ loading: true, user: null, error: null });

  React.useEffect(() => {
    if (!open) return undefined;
    if (!api?.auth?.getMe) {
      setState({ loading: false, user: null, error: "unavailable" });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, user: null, error: null });
    api.auth
      .getMe()
      .then((user) => {
        if (!cancelled) setState({ loading: false, user, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ loading: false, user: null, error: e?.message || "Failed to load profile" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const { loading, user, error } = state;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16} />}
      title={__t("modals.profile.title") || "Profile"}
      subtitle={user?.jobTitle || user?.department || ""}
      closeLabel={__t("modals.profile.closeDialog") || "Close profile dialog"}
    >
      {loading && <Spinner label={__t("common.loading") || "Loading…"} />}
      {!loading && error && (
        <p className="fs-12 fg-3">
          {__t("common.loadFailed") || "Load failed"}: {error}
        </p>
      )}
      {!loading && !error && user && (
        <>
          <div
            className="flex items-center gap-14 bg-sunk rounded-r2"
            style={{ marginBottom: 18, padding: 14 }}
          >
            <span className="avatar fs-20" style={{ width: 56, height: 56 }} aria-hidden="true">
              {(user.fullName || user.username || "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="fw-600 fs-14">{user.fullName || user.username}</div>
              <div className="font-mono fs-11 fg-3">
                {user.department || ""}
                {user.department && user.jobTitle ? " · " : ""}
                {user.jobTitle || ""}
              </div>
            </div>
          </div>
          <div className="field-row">
            <Field label={__t("modals.profile.fullName") || "Full name"}>
              <Input value={user.fullName || ""} readOnly disabled />
            </Field>
            <Field label={__t("modals.profile.email") || "Email"}>
              <Input mono value={user.email || ""} readOnly disabled />
            </Field>
          </div>
          <div className="field-row">
            <Field label={__t("modals.profile.title") || "Title"}>
              <Input value={user.jobTitle || ""} readOnly disabled />
            </Field>
            <Field label={__t("workspace.department") || "Department"}>
              <Input value={user.department || ""} readOnly disabled />
            </Field>
          </div>
          <Tooltip label={__t("modals.profile.editUnavailable") || "Self-service profile editing isn't available yet — this requires admin action."}>
            <p className="fs-11 fg-3" style={{ margin: "8px 0 0" }}>
              {__t("modals.profile.editUnavailable") ||
                "Editing your own profile isn't available yet — this requires admin action."}
            </p>
          </Tooltip>
        </>
      )}
    </Modal>
  );
}

ProfileModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
