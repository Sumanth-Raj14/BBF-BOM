import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api, useAppStore } from "../../globals";
import { Modal, Button, Field, Input, Checkbox, Badge } from "../ui";

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
      closeLabel={
        __t("bomDuplication.closeDialog") || "Close duplicate BOM dialog"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || duplicating}
            loading={duplicating}
            onClick={duplicate}
          >
            <Icon.Bom size={12} />{" "}
            {__t("bomDuplication.duplicate") || "Duplicate"}
          </Button>
        </>
      }
    >
      <Field
        label={__t("bomDuplication.variantName") || "Variant name"}
        htmlFor="dup-name"
        required
      >
        <Input
          id="dup-name"
          name="variantName"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            __t("bomDuplication.namePlaceholder") ||
            "e.g. ATLAS - High-temp variant"
          }
        />
      </Field>

      <div className="flex flex-col gap-8 mt-10">
        <Checkbox
          id="dup-rev"
          name="resetRev"
          checked={includeRev}
          onChange={(e) => setIncludeRev(e.target.checked)}
          label={__t("bomDuplication.resetRev") || "Reset revision to A"}
        />
        <Checkbox
          id="dup-costs"
          name="includeCosts"
          checked={includeCosts}
          onChange={(e) => setIncludeCosts(e.target.checked)}
          label={
            __t("bomDuplication.includeCosts") ||
            "Include cost data (clear for fresh costing)"
          }
        />
      </div>

      <div className="flex items-center gap-8 mt-14">
        <Badge tone={window.apiConnected ? "success" : "neutral"}>
          {window.apiConnected
            ? __t("bomDuplication.connected") || "Connected"
            : __t("bomDuplication.offline") || "Offline"}
        </Badge>
        <span className="fs-11 fg-3">
          {window.apiConnected
            ? __t("bomDuplication.apiConnectedInfo") ||
              "Will create a new project and save BOM to server"
            : __t("bomDuplication.offlineInfo") ||
              "Offline mode: BOM will be duplicated in browser only"}
        </span>
      </div>

      <p className="fs-11 fg-3 mt-14" style={{ margin: "14px 0 0" }}>
        {__t("bomDuplication.info") ||
          "The duplicated BOM will contain all the same parts and structure. Part IDs will be regenerated to prevent conflicts."}
      </p>
    </Modal>
  );
}
BOMDuplicationModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { BOMDuplicationModal };
window.BOMDuplicationModal = BOMDuplicationModal;
