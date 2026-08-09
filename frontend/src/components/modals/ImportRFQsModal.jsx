import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { Icon } from "../../globals";
import { Button, EmptyState, Modal } from "../ui";

// Fix (dead-fakes cleanup): this modal used to show 4 hardcoded fake quotes
// "detected from the inbox" and its "Import accepted" button only toasted
// success without importing anything. There is no inbound-email/quote
// parsing backend (see EmailParseModal in root/power-features.jsx, which was
// fixed the same way for the identical feature) so there is nothing real to
// list here. This is now an honest empty state instead of a second fake
// dataset, and there is no button offering an import that can't happen.
export default function ImportRFQsModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("importRfqs.title") || "Import RFQs"}
      subtitle={
        __t("importRfqs.unavailableSubtitle") ||
        "Inbox quote detection isn't configured"
      }
      size="md"
      closeLabel={__t("importRfqs.closeDialog") || "Close import RFQs dialog"}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      <EmptyState
        message={
          __t("importRfqs.noBackend") ||
          "No backend is configured to parse quotes from an email inbox yet, so there are no RFQs to review or import here."
        }
      />
    </Modal>
  );
}

ImportRFQsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
