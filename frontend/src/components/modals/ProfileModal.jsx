import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../../globals";
// ============ PROFILE ============
export default function ProfileModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16} />}
      title={__t("modals.profile.title") || "Profile"}
      subtitle={
        "Elena Chen \u00B7 " +
        (__t("modals.profile.engineeringLead") || "Engineering Lead")
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(__t("modals.profile.saved") || "Profile saved", {
                kind: "success",
              });
            }}
          >
            {__t("modals.profile.saveChanges") || "Save changes"}
          </button>
        </>
      }
    >
      <div
        className="flex items-center gap-14 bg-sunk rounded-r2"
        style={{ marginBottom: 18, padding: 14 }}
      >
        <span className="avatar fs-20" style={{ width: 56, height: 56 }}>
          EC
        </span>
        <div className="flex-1">
          <div className="fw-600 fs-14">Elena Chen</div>
          <div className="font-mono fs-11 fg-3">
            {(__t("modals.profile.engineeringLead") || "ENGINEERING LEAD") +
              " \u00B7 4 " +
              (__t("modals.profile.projects") || "projects") +
              " \u00B7 312 " +
              (__t("modals.profile.contributions") || "contributions")}
          </div>
        </div>
        <button
          className="btn small"
          onClick={() =>
            toast(
              __t("modals.profile.photoUpload") ||
                "Photo upload \u2014 choose a file",
            )
          }
        >
          {__t("modals.profile.changePhoto") || "Change photo"}
        </button>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="profile-name">
            {__t("modals.profile.fullName") || "Full name"}
          </label>
          <input
            id="profile-name"
            name="profileName"
            className="input"
            defaultValue="Elena Chen"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-title">
            {__t("modals.profile.title") || "Title"}
          </label>
          <input
            id="profile-title"
            name="profileTitle"
            className="input"
            defaultValue="Engineering Lead"
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="profile-email">
            {__t("modals.profile.email") || "Email"}
          </label>
          <input
            id="profile-email"
            name="profileEmail"
            className="input mono"
            defaultValue="elena@blackboxfactories.com"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-phone">
            {__t("modals.profile.phone") || "Phone"}
          </label>
          <input
            id="profile-phone"
            name="profilePhone"
            className="input mono"
            defaultValue="+1-555-0142"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="profile-role">
          {__t("modals.profile.role") || "Role"}
        </label>
        <select id="profile-role" name="profileRole" className="select">
          <option>Admin</option>
          <option>Engineering</option>
          <option>Procurement</option>
          <option>Finance</option>
          <option>Viewer</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="profile-bio">
          {__t("modals.profile.bio") || "Bio"}
        </label>
        <textarea
          id="profile-bio"
          name="profileBio"
          className="input"
          defaultValue="ME/EE generalist. Leading mechanical for ATLAS + HORIZON. Previously @ Boring Co., Skunkworks."
        />
      </div>
    </Modal>
  );
}

ProfileModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
