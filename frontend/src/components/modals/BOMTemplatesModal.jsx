import PropTypes from "prop-types";
import { AppContext } from "../../context/AppCtx.jsx";
import { storage } from "../../utils/storage.js";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, api } from "../../globals";
import {
  Modal,
  Button,
  Field,
  Input,
  Select,
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

  // ── Effectivity tab (migration 053_bom_effectivity) ──
  // Operates on the real `bom_items` rows for a saved (server-side) template,
  // independent of the save/load tabs above which push/pull a `bomData` JSON
  // blob and never touch those rows.
  const [effTemplateId, setEffTemplateId] = React.useState("");
  const [effItems, setEffItems] = React.useState([]);
  const [effLoading, setEffLoading] = React.useState(false);
  const [effAsOfDate, setEffAsOfDate] = React.useState(
    new Date().toISOString().slice(0, 10),
  );
  const [effResolvedIds, setEffResolvedIds] = React.useState(null);
  const [effNewPartId, setEffNewPartId] = React.useState("");
  const [effNewQty, setEffNewQty] = React.useState("1");

  const serverTemplates = templates.filter((t) => Number.isInteger(t.id));

  const loadEffItems = async (templateId) => {
    if (!templateId) {
      setEffItems([]);
      return;
    }
    setEffLoading(true);
    setEffResolvedIds(null);
    try {
      const data = await api.bomItems.list({ bomTemplateId: templateId });
      setEffItems(data?.items || []);
    } catch (e) {
      toast(e.message || "Failed to load BOM lines", { kind: "warn" });
      setEffItems([]);
    } finally {
      setEffLoading(false);
    }
  };

  const patchEffField = (itemId, field, value) => {
    setEffItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)),
    );
  };

  const saveEffItem = async (item) => {
    try {
      await api.bomItems.update(item.id, {
        effectiveFrom: item.effectiveFrom || null,
        effectiveTo: item.effectiveTo || null,
        effectiveSerialFrom: item.effectiveSerialFrom || null,
        effectiveSerialTo: item.effectiveSerialTo || null,
        effectiveLot: item.effectiveLot || null,
      });
      toast("Effectivity saved", { kind: "success" });
      setEffResolvedIds(null);
    } catch (e) {
      toast(e.message || "Failed to save effectivity", { kind: "warn" });
    }
  };

  const addEffItem = async () => {
    const partId = parseInt(effNewPartId, 10);
    if (!effTemplateId || !partId) return;
    try {
      await api.bomItems.create({
        bomTemplateId: effTemplateId,
        partId,
        quantity: parseInt(effNewQty, 10) || 1,
      });
      setEffNewPartId("");
      setEffNewQty("1");
      await loadEffItems(effTemplateId);
      toast("Line added", { kind: "success" });
    } catch (e) {
      toast(e.message || "Failed to add line", { kind: "warn" });
    }
  };

  const resolveAsOf = async () => {
    try {
      const resolved = await api.bomItems.resolved(effTemplateId, {
        asOfDate: effAsOfDate,
      });
      setEffResolvedIds(new Set((resolved || []).map((r) => r.id)));
    } catch (e) {
      toast(e.message || "Failed to resolve BOM", { kind: "warn" });
    }
  };
  // Reads the app context directly. (useAppStore() is now equivalent — the
  // two context objects were unified in context/appContext.js — but the
  // explicit import keeps the dependency visible.)
    const ctx = React.useContext(AppContext);

  React.useEffect(() => {
    if (open && ctx?.apiConnected) {
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
  }, [open, ctx?.apiConnected]);

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
    if (ctx?.apiConnected) {
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
    if (tmpl.id && !bomData && ctx?.apiConnected) {
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
    if (ctx?.apiConnected) {
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
    { value: "effectivity", label: "Effectivity" },
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
          {ctx?.apiConnected ? (
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

      <TabPanel id={TABS_ID} value="effectivity" active={tab === "effectivity"}>
        {!ctx?.apiConnected ? (
          <EmptyState
            icon={<span aria-hidden="true">∅</span>}
            title="Connect to the server to manage line effectivity"
          />
        ) : serverTemplates.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">∅</span>}
            title="Save a template to the server first, then manage its line effectivity here"
          />
        ) : (
          <div className="flex flex-col gap-12">
            <Field label="Template" htmlFor="eff-template">
              <Select
                id="eff-template"
                value={effTemplateId}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : "";
                  setEffTemplateId(val);
                  loadEffItems(val);
                }}
              >
                <option value="">Select a template…</option>
                {serverTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            {effTemplateId !== "" && (
              <>
                <div className="flex items-end gap-8">
                  <Field label="As of date" htmlFor="eff-asof">
                    <Input
                      id="eff-asof"
                      type="date"
                      value={effAsOfDate}
                      onChange={(e) => setEffAsOfDate(e.target.value)}
                    />
                  </Field>
                  <Button variant="secondary" size="sm" onClick={resolveAsOf}>
                    Resolve
                  </Button>
                  {effResolvedIds && (
                    <Badge tone="neutral">
                      {effResolvedIds.size} / {effItems.length} effective as of {effAsOfDate}
                    </Badge>
                  )}
                </div>

                {effLoading ? (
                  <Spinner size="sm" label="Loading lines…" />
                ) : effItems.length === 0 ? (
                  <EmptyState
                    icon={<span aria-hidden="true">∅</span>}
                    title="No lines yet — add one below"
                  />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="w-full fs-11">
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Part ID</th>
                          <th style={{ textAlign: "left" }}>From</th>
                          <th style={{ textAlign: "left" }}>To</th>
                          <th style={{ textAlign: "left" }}>Serial from</th>
                          <th style={{ textAlign: "left" }}>Serial to</th>
                          <th style={{ textAlign: "left" }}>Lot</th>
                          <th />
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {effItems.map((item) => (
                          <tr key={item.id}>
                            <td>{item.partId}</td>
                            <td>
                              <Input
                                type="date"
                                value={item.effectiveFrom || ""}
                                onChange={(e) =>
                                  patchEffField(item.id, "effectiveFrom", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="date"
                                value={item.effectiveTo || ""}
                                onChange={(e) =>
                                  patchEffField(item.id, "effectiveTo", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <Input
                                value={item.effectiveSerialFrom || ""}
                                onChange={(e) =>
                                  patchEffField(item.id, "effectiveSerialFrom", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <Input
                                value={item.effectiveSerialTo || ""}
                                onChange={(e) =>
                                  patchEffField(item.id, "effectiveSerialTo", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              <Input
                                value={item.effectiveLot || ""}
                                onChange={(e) =>
                                  patchEffField(item.id, "effectiveLot", e.target.value)
                                }
                              />
                            </td>
                            <td>
                              {effResolvedIds && (
                                <Badge tone={effResolvedIds.has(item.id) ? "success" : "neutral"}>
                                  {effResolvedIds.has(item.id) ? "effective" : "not effective"}
                                </Badge>
                              )}
                            </td>
                            <td>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => saveEffItem(item)}
                              >
                                Save
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-end gap-8">
                  <Field label="Add line — Part ID" htmlFor="eff-new-part">
                    <Input
                      id="eff-new-part"
                      type="number"
                      value={effNewPartId}
                      onChange={(e) => setEffNewPartId(e.target.value)}
                    />
                  </Field>
                  <Field label="Qty" htmlFor="eff-new-qty">
                    <Input
                      id="eff-new-qty"
                      type="number"
                      value={effNewQty}
                      onChange={(e) => setEffNewQty(e.target.value)}
                    />
                  </Field>
                  <Button variant="primary" size="sm" onClick={addEffItem}>
                    <Icon.Plus size={12} /> Add
                  </Button>
                </div>
              </>
            )}
          </div>
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
