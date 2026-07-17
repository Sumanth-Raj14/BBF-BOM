import PropTypes from "prop-types";
import { storage } from "../../utils/storage.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal, api, useAppStore } from "../../globals";
function BOMTemplatesModal({ open, onClose }) {
  const [tab, setTab] = React.useState("save");
  const [templateName, setTemplateName] = React.useState("");
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const ctx = useAppStore();

  React.useEffect(() => {
    if (open && window.apiConnected) {
      setLoading(true);
      api.bomTemplates
        .list()
        .then((data) => {
          setTemplates(data || []);
          setLoading(false);
        })
        .catch((e) => {
          console.warn("Failed to load templates from API:", e);
          toast(
            __t("bomTemplates.loadFailedFromServer") ||
              "Could not load templates from server, using local cache",
            { kind: "warn" },
          );
          try {
            setTemplates(storage.templates.get());
          } catch {
            setTemplates([]);
          }
          setLoading(false);
        });
    }
  }, [open, window.apiConnected]);

  const saveTemplate = async () => {
    if (!templateName.trim() || !ctx) return;
    setSaving(true);
    const templateData = {
      name: templateName.trim(),
      bomData: JSON.parse(JSON.stringify(ctx.rows)),
      partCount: ctx.rows.reduce(
        (sum, r) => sum + (r.children ? r.children.length : 1),
        0,
      ),
      projectCode: ctx.project?.code || null,
    };
    if (window.apiConnected) {
      try {
        const saved = await api.bomTemplates.create(templateData);
        setTemplates((prev) => [
          { ...templateData, id: saved.id, createdAt: saved.createdAt },
          ...prev,
        ]);
        setTemplateName("");
        toast(
          (
            __t("bomTemplates.savedToServer") ||
            'Template "{name}" saved to server'
          ).replace("{name}", templateData.name),
          { kind: "success" },
        );
      } catch (e) {
        console.warn("Failed to save template to API:", e);
        toast(
          __t("bomTemplates.saveFailedToServer") ||
            "Failed to save to server, saving locally",
          { kind: "warn" },
        );
        const local = {
          id: "tpl-" + Date.now(),
          ...templateData,
          saved: new Date().toISOString().slice(0, 10),
        };
        const next = [local, ...templates];
        setTemplates(next);
        storage.templates.set(next);
        setTemplateName("");
      }
    } else {
      const local = {
        id: "tpl-" + Date.now(),
        ...templateData,
        saved: new Date().toISOString().slice(0, 10),
      };
      const next = [local, ...templates];
      setTemplates(next);
      storage.templates.set(next);
      setTemplateName("");
      toast(
        (
          __t("bomTemplates.savedLocally") || 'Template "{name}" saved locally'
        ).replace("{name}", templateData.name),
        { kind: "success" },
      );
    }
    setSaving(false);
  };

  const loadTemplate = async (tmpl) => {
    if (!ctx) return;
    let bomData = tmpl.bomData || tmpl.rows;
    if (tmpl.id && !bomData && window.apiConnected) {
      try {
        const loaded = await api.bomTemplates.load(tmpl.id);
        bomData = loaded.bomData;
      } catch (e) {
        console.warn("Failed to load template from API:", e);
        toast(__t("bomTemplates.failedToLoad") || "Failed to load template", {
          kind: "warn",
        });
        return;
      }
    }
    if (bomData) {
      ctx.setRows(JSON.parse(JSON.stringify(bomData)));
      onClose();
      toast(
        (
          __t("bomTemplates.loadedToast") ||
          'Template "{name}" loaded into current BOM'
        ).replace("{name}", tmpl.name),
        {
          kind: "success",
          action: {
            label: __t("bomTemplates.undo") || "Undo",
            onClick: () => ctx.setRows(ctx.rows),
          },
        },
      );
    }
  };

  const deleteTemplate = async (id) => {
    if (window.apiConnected) {
      try {
        await api.bomTemplates.delete(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast(
          __t("bomTemplates.deletedFromServer") ||
            "Template deleted from server",
          { kind: "warn" },
        );
      } catch (e) {
        console.warn("Failed to delete template from API:", e);
        toast(
          __t("bomTemplates.deleteFailed") || "Failed to delete from server",
          { kind: "warn" },
        );
      }
    } else {
      const next = templates.filter((t) => t.id !== id);
      setTemplates(next);
      storage.templates.set(next);
      toast(__t("bomTemplates.deletedLocal") || "Template deleted", {
        kind: "warn",
      });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return __t("common.unknown") || "Unknown date";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={__t("bomTemplates.title") || "BOM Templates"}
      subtitle={__t("bomTemplates.subtitle") || "Save and load BOM structures"}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.close") || "Close"}
          </button>
        </>
      }
    >
      <div className="flex gap-6 mb-14">
        {[
          ["save", __t("bomTemplates.saveCurrent") || "Save current BOM"],
          ["load", __t("bomTemplates.loadTemplate") || "Load template"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={"btn small " + (tab === id ? "primary" : "")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        {window.apiConnected && (
          <span
            className="font-mono fs-10 fg-ok"
            style={{ marginLeft: "auto" }}
          >
            {__t("bomTemplates.connectedToApi") || "● Connected to API"}
          </span>
        )}
        {!window.apiConnected && (
          <span className="font-mono fs-10 fg-3" style={{ marginLeft: "auto" }}>
            {__t("bomTemplates.offlineMode") || "○ Offline mode"}
          </span>
        )}
      </div>
      {tab === "save" && (
        <div className="field">
          <label htmlFor="template-name">
            {__t("bomTemplates.templateName") || "Template name"}
          </label>
          <div className="flex gap-8">
            <input
              id="template-name"
              name="templateName"
              className="input flex-1"
              autoFocus
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={
                __t("bomTemplates.namePlaceholder") ||
                "e.g. ATLAS chassis template"
              }
            />
            <button
              className="btn primary"
              disabled={!templateName.trim() || saving}
              onClick={saveTemplate}
            >
              {saving ? (
                __t("bomTemplates.saving") || "Saving..."
              ) : (
                <>
                  <Icon.Plus size={12} /> {__t("common.save") || "Save"}
                </>
              )}
            </button>
          </div>
          {loading && (
            <div className="mt-10 font-mono fs-11 fg-3">
              {__t("bomTemplates.loadingTemplates") || "Loading templates..."}
            </div>
          )}
          {!loading && templates.length > 0 && (
            <div className="mt-14">
              <div className="font-mono fs-10 uppercase letter-sp-6 fg-3 mb-8">
                {(
                  __t("bomTemplates.savedTemplates") ||
                  "Saved templates ({count})"
                ).replace("{count}", templates.length)}
              </div>
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex justify-between items-center border-line rounded-r2 mb-4"
                  style={{ padding: "8px 10px" }}
                >
                  <div>
                    <div className="fw-600 fs-12">{t.name}</div>
                    <div className="font-mono fs-10 fg-3">
                      {__t("bomTemplates.savedLabel") || "Saved"}{" "}
                      {formatDate(t.saved || t.createdAt)}
                    </div>
                  </div>
                  <span className="inline-flex gap-4">
                    <button
                      className="btn small"
                      onClick={() => loadTemplate(t)}
                    >
                      {__t("bomTemplates.load") || "Load"}
                    </button>
                    <button
                      className="icon-btn w-22 h-22 fg-danger"
                      aria-label={__t("common.delete") || "Delete"}
                      onClick={() => deleteTemplate(t.id)}
                    >
                      <Icon.Trash size={11} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "load" &&
        (loading ? (
          <div className="text-center fg-3" style={{ padding: 40 }}>
            {__t("bomTemplates.loadingTemplates") || "Loading templates..."}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center fg-3" style={{ padding: 40 }}>
            <div className="fs-32 font-mono mb-6 fg-4">∅</div>
            <div>
              {__t("bomTemplates.noTemplates") ||
                "No saved templates yet. Save a template first."}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {templates.map((t) => (
              <div
                key={t.id}
                className="border-line rounded-r2 c-pointer bg-canvas"
                style={{ padding: 12 }}
                onClick={() => loadTemplate(t)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="fw-600">{t.name}</div>
                    <div className="font-mono fs-10 fg-3">
                      {__t("bomTemplates.savedLabel") || "Saved"}{" "}
                      {formatDate(t.saved || t.createdAt)}
                    </div>
                  </div>
                  <div>
                    <span className="tag-pill">
                      {t.partCount || t.rows?.[0]?.children?.length || 0}{" "}
                      {__t("bomTemplates.parts") || "parts"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
    </Modal>
  );
}
BOMTemplatesModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { BOMTemplatesModal };
window.BOMTemplatesModal = BOMTemplatesModal;
