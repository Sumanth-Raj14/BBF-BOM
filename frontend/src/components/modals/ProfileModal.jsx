import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon } from "../../globals";
import { Modal, Button, Field, Input, Select, Textarea } from "../ui";
// ============ PROFILE ============
export default function ProfileModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Parts size={16} />}
      title={__t("modals.profile.title") || "Profile"}
      subtitle={
        "Elena Chen · " +
        (__t("modals.profile.engineeringLead") || "Engineering Lead")
      }
      closeLabel={__t("modals.profile.closeDialog") || "Close profile dialog"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              toast(__t("modals.profile.saved") || "Profile saved", {
                kind: "success",
              });
            }}
          >
            {__t("modals.profile.saveChanges") || "Save changes"}
          </Button>
        </>
      }
    >
      <div
        className="flex items-center gap-14 bg-sunk rounded-r2"
        style={{ marginBottom: 18, padding: 14 }}
      >
        <span className="avatar fs-20" style={{ width: 56, height: 56 }} aria-hidden="true">
          EC
        </span>
        <div className="flex-1">
          <div className="fw-600 fs-14">Elena Chen</div>
          <div className="font-mono fs-11 fg-3">
            {(__t("modals.profile.engineeringLead") || "ENGINEERING LEAD") +
              " · 4 " +
              (__t("modals.profile.projects") || "projects") +
              " · 312 " +
              (__t("modals.profile.contributions") || "contributions")}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast(
              __t("modals.profile.photoUpload") ||
                "Photo upload — choose a file",
            )
          }
        >
          {__t("modals.profile.changePhoto") || "Change photo"}
        </Button>
      </div>
      <div className="field-row">
        <Field
          label={__t("modals.profile.fullName") || "Full name"}
          htmlFor="profile-name"
        >
          <Input id="profile-name" name="profileName" defaultValue="Elena Chen" />
        </Field>
        <Field
          label={__t("modals.profile.title") || "Title"}
          htmlFor="profile-title"
        >
          <Input
            id="profile-title"
            name="profileTitle"
            defaultValue="Engineering Lead"
          />
        </Field>
      </div>
      <div className="field-row">
        <Field
          label={__t("modals.profile.email") || "Email"}
          htmlFor="profile-email"
        >
          <Input
            id="profile-email"
            name="profileEmail"
            mono
            defaultValue="elena@blackboxfactories.com"
          />
        </Field>
        <Field
          label={__t("modals.profile.phone") || "Phone"}
          htmlFor="profile-phone"
        >
          <Input
            id="profile-phone"
            name="profilePhone"
            mono
            defaultValue="+1-555-0142"
          />
        </Field>
      </div>
      <Field label={__t("modals.profile.role") || "Role"} htmlFor="profile-role">
        <Select id="profile-role" name="profileRole" defaultValue="Admin">
          <option>Admin</option>
          <option>Engineering</option>
          <option>Procurement</option>
          <option>Finance</option>
          <option>Viewer</option>
        </Select>
      </Field>
      <Field label={__t("modals.profile.bio") || "Bio"} htmlFor="profile-bio">
        <Textarea
          id="profile-bio"
          name="profileBio"
          defaultValue="ME/EE generalist. Leading mechanical for ATLAS + HORIZON. Previously @ Boring Co., Skunkworks."
        />
      </Field>
    </Modal>
  );
}

ProfileModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
