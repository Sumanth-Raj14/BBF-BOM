import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../../globals";
// ============ HELP / SHORTCUTS ============
export default function HelpModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<span className="font-mono fs-14 fw-700">?</span>}
      title={__t("help.title") || "Help & keyboard shortcuts"}
      subtitle={
        __t("help.subtitle") || "Blackbox BOM v3.2 · Press ? anywhere to open"
      }
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(__t("help.openingDocs") || "Opening docs in new tab…");
            }}
          >
            <Icon.Link size={12} />{" "}
            {__t("help.openFullDocs") || "Open full docs"}
          </button>
        </>
      }
    >
      <div
        className="d-grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 18 }}
      >
        {[
          [
            __t("help.sectionGlobal") || "Global",
            [
              [__t("help.openSearch") || "Open search", "⌘ K"],
              [__t("help.openHelp") || "Open help", "?"],
              [__t("help.quickNew") || "Quick new (PO/Vendor/Part)", "⌘ N"],
            ],
          ],
          [
            __t("help.sectionBomEditor") || "BOM Editor",
            [
              [__t("help.expandAll") || "Expand all", "⌥ ⇧ →"],
              [__t("help.collapseAll") || "Collapse all", "⌥ ⇧ ←"],
              [__t("help.editCell") || "Edit cell", "Double-click"],
              [__t("help.selectRow") || "Select row", "Space"],
              [__t("help.openDetail") || "Open detail", "↵"],
            ],
          ],
          [
            __t("help.sectionEditing") || "Editing",
            [
              [__t("help.commitEdit") || "Commit edit", "↵"],
              [__t("help.cancelEdit") || "Cancel edit", "Esc"],
              [__t("help.sendComment") || "Send comment", "⌘ ↵"],
              [__t("help.undoLastAction") || "Undo last action", "⌘ Z"],
            ],
          ],
          [
            __t("help.sectionNavigation") || "Navigation",
            [
              [__t("help.goToBom") || "Go to BOM", "G B"],
              [__t("help.goToComponents") || "Go to Components", "G C"],
              [__t("help.goToVendors") || "Go to Vendors", "G V"],
              [__t("help.goToProcurement") || "Go to Procurement", "G P"],
            ],
          ],
        ].map(([section, items]) => (
          <div key={section}>
            <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
              {section}
            </div>
            {items.map(([label, key], j) => (
              <div
                key={j}
                className="flex justify-between fs-12"
                style={{
                  padding: "5px 0",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                <span>{label}</span>
                <span
                  className="font-mono fs-10 fg-3 border-line bg-sunk"
                  style={{ padding: "1px 6px", borderRadius: 3 }}
                >
                  {key}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

HelpModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
