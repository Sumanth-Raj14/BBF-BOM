import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon } from "../../globals";
import { Modal, Button } from "../ui";

// ============ HELP / SHORTCUTS ============
export default function HelpModal({ open, onClose }) {
  const sections = [
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
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<span aria-hidden="true">?</span>}
      title={__t("help.title") || "Help & keyboard shortcuts"}
      subtitle={
        __t("help.subtitle") || "Blackbox BOM v3.2 · Press ? anywhere to open"
      }
      size="lg"
      closeLabel={__t("help.closeDialog") || "Close help dialog"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              toast(__t("help.openingDocs") || "Opening docs in new tab…");
            }}
          >
            <Icon.Link size={12} /> {__t("help.openFullDocs") || "Open full docs"}
          </Button>
        </>
      }
    >
      <div className="help__grid">
        {sections.map(([section, items]) => (
          <div key={section}>
            <div className="help__section-label">{section}</div>
            {items.map(([label, key], j) => (
              <div key={j} className="help__row">
                <span>{label}</span>
                <kbd className="help__key">{key}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        .help__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--sp-5, 18px);
        }
        @media (max-width: 520px) {
          .help__grid {
            grid-template-columns: 1fr;
          }
        }
        .help__section-label {
          font-family: var(--font-mono);
          font-size: var(--fs-50, 10px);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .help__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-2, 8px);
          font-size: var(--fs-100, 12px);
          padding: 5px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .help__row:last-child {
          border-bottom: none;
        }
        .help__key {
          font-family: var(--font-mono);
          font-size: var(--fs-50, 11px);
          color: var(--text-muted);
          background: var(--bg-sunk);
          border: 1px solid var(--border-subtle);
          border-radius: 3px;
          padding: 1px 6px;
        }
      `}</style>
    </Modal>
  );
}

HelpModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
