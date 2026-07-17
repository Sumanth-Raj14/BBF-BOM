import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal, api, useAppStore } from "../../globals";
function BOMDuplicationModal({ open, onClose }) {
  const ctx = useAppStore();
  const [name, setName] = React.useState("");
  const [includeRev, setIncludeRev] = React.useState(true);
  const [includeCosts, setIncludeCosts] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  React.useEffect(() => {
    if (open && ctx?.project) setName(ctx.project.name + " (Variant)");
  }, [open, ctx]);

  const duplicate = async () => {
    if (!name.trim() || !ctx) return;
    setDuplicating(true);
    const newRows = JSON.parse(JSON.stringify(ctx.rows));
    const stamp = Date.now();
    const relabel = (rs) =>
      rs.map((r) => ({
        ...r,
        id: r.id + "-dup-" + stamp,
        children: r.children ? relabel(r.children) : undefined,
        cost: includeCosts ? r.cost : 0,
      }));
    const dupRows = relabel(newRows);

    if (window.apiConnected) {
      try {
        const newCode =
          (ctx.project?.code || "BOM") + "-V" + Math.floor(Math.random() * 100);
        await api.projects.create({
          code: newCode,
          name: name.trim(),
          description: `Duplicated from ${ctx.project?.name || "BOM"} on ${new Date().toISOString().slice(0, 10)}`,
          status: "active",
        });
        await api.bomTemplates.create({
          name: name.trim(),
          bomData: dupRows,
          partCount: dupRows.reduce(
            (sum, r) => sum + (r.children ? r.children.length : 1),
            0,
          ),
          projectCode: newCode,
        });
        ctx.setRows(dupRows);
        onClose();
        toast(
          (
            __t("bomDuplication.duplicatedApi") ||
            'BOM duplicated as "{name}" ({code})'
          )
            .replace("{name}", name)
            .replace("{code}", newCode),
          {
            kind: "success",
            action: {
              label: __t("bomDuplication.switch") || "Switch",
              onClick: () => {
                window.__nav?.("bom");
              },
            },
          },
        );
      } catch (e) {
        console.warn("Failed to duplicate via API:", e);
        ctx.setRows(dupRows);
        onClose();
        toast(
          (
            __t("bomDuplication.duplicatedLocal") ||
            'BOM duplicated locally as "{name}"'
          ).replace("{name}", name),
          {
            kind: "success",
            action: {
              label: __t("bomDuplication.switch") || "Switch",
              onClick: () => {
                window.__nav?.("bom");
              },
            },
          },
        );
      }
    } else {
      ctx.setRows(dupRows);
      onClose();
      toast(
        (
          __t("bomDuplication.duplicatedOffline") ||
          'BOM duplicated as "{name}"'
        ).replace("{name}", name),
        {
          kind: "success",
          action: {
            label: __t("bomDuplication.switch") || "Switch",
            onClick: () => {
              window.__nav?.("bom");
            },
          },
        },
      );
    }
    setDuplicating(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Bom size={16} />}
      title={__t("bomDuplication.title") || "Duplicate BOM"}
      subtitle={
        __t("bomDuplication.subtitle") ||
        "Create a variant copy of the current BOM"
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            disabled={!name.trim() || duplicating}
            onClick={duplicate}
          >
            {duplicating ? (
              __t("bomDuplication.duplicating") || "Duplicating..."
            ) : (
              <>
                <Icon.Bom size={12} />{" "}
                {__t("bomDuplication.duplicate") || "Duplicate"}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="dup-name">
          {__t("bomDuplication.variantName") || "Variant name"}{" "}
          <span className="req">*</span>
        </label>
        <input
          id="dup-name"
          name="variantName"
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            __t("bomDuplication.namePlaceholder") ||
            "e.g. ATLAS - High-temp variant"
          }
        />
      </div>
      <div className="field mt-10">
        <label
          htmlFor="dup-rev"
          className="flex items-center gap-8 cursor-pointer"
        >
          <input
            id="dup-rev"
            name="resetRev"
            type="checkbox"
            className="row-checkbox"
            checked={includeRev}
            onChange={(e) => setIncludeRev(e.target.checked)}
          />
          <span className="fs-12">
            {__t("bomDuplication.resetRev") || "Reset revision to A"}
          </span>
        </label>
      </div>
      <div className="field">
        <label
          htmlFor="dup-costs"
          className="flex items-center gap-8 cursor-pointer"
        >
          <input
            id="dup-costs"
            name="includeCosts"
            type="checkbox"
            className="row-checkbox"
            checked={includeCosts}
            onChange={(e) => setIncludeCosts(e.target.checked)}
          />
          <span className="fs-12">
            {__t("bomDuplication.includeCosts") ||
              "Include cost data (clear for fresh costing)"}
          </span>
        </label>
      </div>
      {window.apiConnected && (
        <div
          className="mt-14 rounded-r2 fs-11 fg-2 font-mono"
          style={{
            padding: 10,
            background: "color-mix(in oklch, var(--ok) 8%, var(--bg))",
            border: "1px solid var(--ok)",
          }}
        >
          {__t("bomDuplication.apiConnectedInfo") ||
            "● Will create a new project and save BOM to server"}
        </div>
      )}
      {!window.apiConnected && (
        <div
          className="mt-14 bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
          style={{ padding: 10 }}
        >
          {__t("bomDuplication.offlineInfo") ||
            "○ Offline mode: BOM will be duplicated in browser only"}
        </div>
      )}
      <div
        className="mt-14 bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
        style={{ padding: 12 }}
      >
        {__t("bomDuplication.info") ||
          "The duplicated BOM will contain all the same parts and structure. Part IDs will be regenerated to prevent conflicts."}
      </div>
    </Modal>
  );
}
BOMDuplicationModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { BOMDuplicationModal };
window.BOMDuplicationModal = BOMDuplicationModal;
