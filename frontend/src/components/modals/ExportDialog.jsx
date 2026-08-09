import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { downloadFile } from "../../utils/download.js";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Button, Checkbox, Input, Modal, Select } from "../ui";

// Shared export contract (see CLUSTER export-import-frontend): the format
// list is fixed by the backend contract, not something the UI can discover
// via an endpoint, so it stays a constant here (unlike the column list).
const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF" },
  { value: "json", label: "JSON" },
];

/**
 * ExportDialog — the ONE export surface for an entity. Columns and saved
 * templates are always fetched live (GET /export/columns, GET
 * /export/templates); nothing here is hardcoded except the fixed format
 * list above. The actual file always comes from POST /export — there is no
 * client-side CSV/XLSX/PDF fabrication path.
 */
export default function ExportDialog({ open, onClose, entity = "bom", bomId }) {
  const [columns, setColumns] = React.useState([]);
  const [selected, setSelected] = React.useState([]);
  const [format, setFormat] = React.useState("csv");
  const [indented, setIndented] = React.useState(true);
  const [includeSubAssemblies, setIncludeSubAssemblies] = React.useState(true);
  const [currency, setCurrency] = React.useState("");
  const [templates, setTemplates] = React.useState([]);
  const [templateId, setTemplateId] = React.useState("");
  const [templateName, setTemplateName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setError("");
    setFormat("csv");
    setIndented(true);
    setIncludeSubAssemblies(true);
    setCurrency("");
    setTemplateId("");
    setTemplateName("");
    setLoading(true);
    Promise.all([api.export.columns(entity), api.export.templates.list(entity)])
      .then(([colRes, tplRes]) => {
        const cols = colRes?.columns || [];
        setColumns(cols);
        setSelected(cols.filter((c) => c.default).map((c) => c.key));
        setTemplates(Array.isArray(tplRes) ? tplRes : []);
      })
      .catch((err) => {
        setColumns([]);
        setError(err?.message || __t("export.loadFailed") || "Failed to load export options");
      })
      .finally(() => setLoading(false));
  }, [open, entity]);

  const toggleColumn = (key) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );

  const moveColumn = (index, dir) =>
    setSelected((cur) => {
      const next = [...cur];
      const j = index + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const applyTemplateConfig = (config) => {
    if (!config) return;
    if (config.format) setFormat(config.format);
    if (Array.isArray(config.columns)) setSelected(config.columns);
    if (typeof config.indented === "boolean") setIndented(config.indented);
    if (typeof config.include_sub_assemblies === "boolean") {
      setIncludeSubAssemblies(config.include_sub_assemblies);
    }
    setCurrency(config.currency || "");
  };

  const loadTemplate = (id) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => String(t.id) === String(id));
    if (tpl) applyTemplateConfig(tpl.config);
  };

  const buildBody = () => {
    const body = {
      entity,
      format,
      columns: selected.length ? selected : null,
      filters: null,
      currency: currency || null,
      template_id: null,
    };
    if (entity === "bom") {
      body.bom_id = bomId;
      body.indented = indented;
      body.include_sub_assemblies = includeSubAssemblies;
    }
    return body;
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const { blob, filename } = await api.export.run(buildBody());
      downloadFile(blob, filename);
      toast(`${filename} ${__t("export.downloaded") || "downloaded"}`, { kind: "success" });
      onClose();
    } catch (err) {
      const msg = err?.message || __t("export.failed") || "Export failed";
      setError(msg);
      toast(msg, { kind: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      const { entity: _e, bom_id: _b, ...config } = buildBody();
      const created = await api.export.templates.create({ name, entity, config });
      setTemplates((cur) => [...cur, created]);
      setTemplateName("");
      toast(__t("export.templateSaved") || "Template saved", { kind: "success" });
    } catch (err) {
      toast(err?.message || __t("export.templateSaveFailed") || "Failed to save template", { kind: "error" });
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await api.export.templates.delete(id);
      setTemplates((cur) => cur.filter((t) => t.id !== id));
      if (String(templateId) === String(id)) setTemplateId("");
    } catch (err) {
      toast(err?.message || __t("export.templateDeleteFailed") || "Failed to delete template", { kind: "error" });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Export size={16} />}
      title={__t("export.title") || "Export " + entity}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            loading={exporting}
            disabled={loading}
            onClick={handleExport}
          >
            <Icon.Export size={12} /> {__t("export.export") || "Export"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="fs-12" style={{ color: "var(--danger)", marginBottom: 10 }} role="alert">
          {error}
        </div>
      )}

      {templates.length > 0 && (
        <div className="mb-12">
          <label className="hint" htmlFor="export-template-select">
            {__t("export.loadTemplate") || "Load saved template"}
          </label>
          <div className="flex items-center gap-6" style={{ marginTop: 4 }}>
            <Select
              id="export-template-select"
              value={templateId}
              onChange={(e) => loadTemplate(e.target.value)}
            >
              <option value="">{__t("export.noTemplate") || "(none)"}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {templateId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteTemplate(templateId)}
                aria-label={__t("export.deleteTemplate") || "Delete template"}
              >
                <Icon.Trash size={11} />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mb-12">
        <span className="hint">{__t("export.format") || "Format"}</span>
        <div className="flex gap-12" style={{ marginTop: 4 }}>
          {FORMATS.map((f) => (
            <label key={f.value} className="flex items-center gap-4 fs-12">
              <input
                type="radio"
                name="exportFormat"
                value={f.value}
                checked={format === f.value}
                onChange={() => setFormat(f.value)}
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {entity === "bom" && (
        <div className="mb-12 flex gap-16">
          <Checkbox
            label={__t("export.indented") || "Indented (multi-level, with a level column)"}
            checked={indented}
            onChange={(e) => setIndented(e.target.checked)}
          />
          <Checkbox
            label={__t("export.includeSubAssemblies") || "Include sub-assemblies"}
            checked={includeSubAssemblies}
            onChange={(e) => setIncludeSubAssemblies(e.target.checked)}
          />
        </div>
      )}

      <div className="mb-12">
        <label className="hint" htmlFor="export-currency-select">
          {__t("export.currency") || "Currency"}
        </label>
        <Select
          id="export-currency-select"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="">{__t("export.storedValues") || "Stored values (no conversion)"}</option>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </Select>
      </div>

      <div className="mb-12">
        <span className="hint">{__t("export.columns") || "Columns"}</span>
        {loading ? (
          <div className="fs-12 fg-3">{__t("common.loading") || "Loading…"}</div>
        ) : columns.length === 0 ? (
          <div className="fs-12 fg-3">{__t("export.noColumns") || "No columns available"}</div>
        ) : (
          <div className="d-grid gap-12" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 4 }}>
            <div>
              <div className="fs-11 fg-3 mb-4">{__t("export.available") || "Available"}</div>
              <div style={{ maxHeight: 240, overflow: "auto" }}>
                {columns.map((c) => (
                  <Checkbox
                    key={c.key}
                    label={c.label || c.key}
                    checked={selected.includes(c.key)}
                    onChange={() => toggleColumn(c.key)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="fs-11 fg-3 mb-4">
                {__t("export.selectedOrder") || "Selected (export order)"}
              </div>
              <div style={{ maxHeight: 240, overflow: "auto" }}>
                {selected.length === 0 && (
                  <div className="fs-11 fg-4">
                    {__t("export.noneSelected") || "None selected — all default columns will be used"}
                  </div>
                )}
                {selected.map((key, i) => {
                  const col = columns.find((c) => c.key === key);
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-4 fs-12"
                      style={{ padding: "2px 0" }}
                    >
                      <span style={{ flex: 1 }}>{col?.label || key}</span>
                      <button
                        type="button"
                        className="icon-btn w-18 h-18"
                        disabled={i === 0}
                        onClick={() => moveColumn(i, -1)}
                        aria-label={(__t("export.moveUp") || "Move up") + " " + (col?.label || key)}
                      >
                        <Icon.Chevron size={10} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn w-18 h-18"
                        disabled={i === selected.length - 1}
                        onClick={() => moveColumn(i, 1)}
                        aria-label={(__t("export.moveDown") || "Move down") + " " + (col?.label || key)}
                      >
                        <Icon.Chevron size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <Input
          placeholder={__t("export.templateNamePlaceholder") || "New template name"}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          aria-label={__t("export.templateNamePlaceholder") || "New template name"}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!templateName.trim()}
          onClick={handleSaveTemplate}
        >
          {__t("export.saveTemplate") || "Save as template"}
        </Button>
      </div>
    </Modal>
  );
}

ExportDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  entity: PropTypes.oneOf(["bom", "parts", "vendors", "purchase_orders"]),
  bomId: PropTypes.any,
};
