import PropTypes from "prop-types";
import { storage } from "../../utils/storage.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api, useAppStore } from "../../globals";
import {
  Modal,
  Button,
  Field,
  Input,
  Tabs,
  TabPanel,
  Badge,
  EmptyState,
  Spinner,
} from "../ui";

const TABS_ID = "bom-templates-tabs";

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

  const tabItems = [
    {
      value: "save",
      label: __t("bomTemplates.saveCurrent") || "Save current BOM",
    },
    {
      value: "load",
      label: __t("bomTemplates.loadTemplate") || "Load template",
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Doc size={16} />}
      title={__t("bomTemplates.title") || "BOM Templates"}
      subtitle={__t("bomTemplates.subtitle") || "Save and load BOM structures"}
      size="lg"
      closeLabel={
        __t("bomTemplates.closeDialog") || "Close BOM templates dialog"
      }
      footer={
        <Button variant="secondary" onClick={onClose}>
          {__t("common.close") || "Close"}
        </Button>
      }
    >
      <div className="flex items-center gap-8 mb-14">
        <Tabs
          id={TABS_ID}
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel={__t("bomTemplates.title") || "BOM Templates"}
        />
        <span style={{ marginLeft: "auto" }}>
          {window.apiConnected ? (
            <Badge tone="success">
              {__t("bomTemplates.connectedToApi") || "Connected to API"}
            </Badge>
          ) : (
            <Badge tone="neutral">
              {__t("bomTemplates.offlineMode") || "Offline mode"}
            </Badge>
          )}
        </span>
      </div>

      <TabPanel id={TABS_ID} value="save" active={tab === "save"}>
        <div className="flex gap-8 items-end">
          <div className="flex-1">
            <Field
              label={__t("bomTemplates.templateName") || "Template name"}
              htmlFor="template-name"
            >
              <Input
                id="template-name"
                name="templateName"
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={
                  __t("bomTemplates.namePlaceholder") ||
                  "e.g. ATLAS chassis template"
                }
              />
            </Field>
          </div>
          <Button
            variant="primary"
            disabled={!templateName.trim() || saving}
            loading={saving}
            onClick={saveTemplate}
          >
            <Icon.Plus size={12} /> {__t("common.save") || "Save"}
          </Button>
        </div>
        {loading && (
          <div className="flex items-center gap-8 mt-10 fs-11 fg-3">
            <Spinner
              size="sm"
              label={
                __t("bomTemplates.loadingTemplates") || "Loading templates…"
              }
            />
            <span aria-hidden="true">
              {__t("bomTemplates.loadingTemplates") || "Loading templates..."}
            </span>
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
            <ul className="flex flex-col gap-4" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex justify-between items-center border-line rounded-r2"
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => loadTemplate(t)}
                    >
                      {__t("bomTemplates.load") || "Load"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      iconOnly
                      aria-label={
                        (__t("common.delete") || "Delete") + " " + t.name
                      }
                      onClick={() => deleteTemplate(t.id)}
                    >
                      <Icon.Trash size={11} />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </TabPanel>

      <TabPanel id={TABS_ID} value="load" active={tab === "load"}>
        {loading ? (
          <div
            className="flex items-center justify-center gap-8 fg-3"
            style={{ padding: 40 }}
          >
            <Spinner
              size="sm"
              label={
                __t("bomTemplates.loadingTemplates") || "Loading templates…"
              }
            />
            <span aria-hidden="true">
              {__t("bomTemplates.loadingTemplates") || "Loading templates..."}
            </span>
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">∅</span>}
            title={
              __t("bomTemplates.noTemplates") ||
              "No saved templates yet. Save a template first."
            }
          />
        ) : (
          <ul
            className="flex flex-col gap-6"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="border-line rounded-r2 bg-canvas w-full"
                  style={{ padding: 12, textAlign: "left", cursor: "pointer" }}
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </TabPanel>
    </Modal>
  );
}
BOMTemplatesModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

export { BOMTemplatesModal };
window.BOMTemplatesModal = BOMTemplatesModal;
