import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import { Button, DataTable, Modal, Select } from "../ui";
// ============ BULK IMPORT (real backend flow) ============
// Shared contract (see CLUSTER export-import-frontend):
//   upload -> POST /import/upload            (job_id, detected_columns, sample_rows, row_count)
//   mapping -> POST /import/{job_id}/mapping (validate WITHOUT writing)
//   commit -> POST /import/{job_id}/commit   (actually creates/updates, tenant-scoped)
// This modal used to push client-generated "imp-<timestamp>" rows straight
// into React state — nothing was ever imported. It now does nothing except
// drive that real job lifecycle and report exactly what the server did.

const ENTITY = "parts";

// Target entity fields this modal maps CSV/XLSX columns onto. Mirrors the
// payload api.parts.update() already accepts elsewhere in the app (see
// root/bom-editor.jsx's inline-edit sync) — there is no dedicated
// "import target fields" endpoint in the contract, so this stays a constant
// (the *source* column list always comes live from the uploaded file itself).
const FIELDS = [
  "pn",
  "name",
  "rev",
  "qty",
  "uom",
  "category",
  "vendor",
  "cost",
  "lead",
  "origin",
  "status",
];

const FIELD_LABELS = {
  pn: "Part No.",
  name: "Name",
  rev: "Rev",
  qty: "Qty",
  uom: "UoM",
  category: "Category",
  vendor: "Vendor",
  cost: "Unit Cost",
  lead: "Lead (days)",
  origin: "Origin",
  status: "Status",
};

function guessField(columnName) {
  const l = String(columnName || "").toLowerCase();
  if (/part.?no|^pn$|sku/.test(l)) return "pn";
  if (/name|desc/.test(l)) return "name";
  if (/^rev|revision/.test(l)) return "rev";
  if (/^qty|quantity/.test(l)) return "qty";
  if (/uom|unit$/.test(l)) return "uom";
  if (/cat/.test(l)) return "category";
  if (/vendor|supplier/.test(l)) return "vendor";
  if (/cost|price/.test(l)) return "cost";
  if (/lead/.test(l)) return "lead";
  if (/origin|country/.test(l)) return "origin";
  if (/status/.test(l)) return "status";
  return "";
}

function guessMapping(columns) {
  const m = {};
  (columns || []).forEach((col) => {
    const field = guessField(col);
    if (field && !m[field]) m[field] = col;
  });
  return m;
}

export default function BulkImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | mapping | review | result
  const [dragActive, setDragActive] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const [jobId, setJobId] = React.useState(null);
  const [detectedColumns, setDetectedColumns] = React.useState([]);
  const [sampleRows, setSampleRows] = React.useState([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [mapping, setMapping] = React.useState({}); // { entityField: fileColumnName }
  const [validation, setValidation] = React.useState(null); // { valid, errors, will_create, will_update }
  const [commitResult, setCommitResult] = React.useState(null); // { created, updated, failed, errors }

  const fileInputRef = React.useRef(null);

  const reset = () => {
    setStep("upload");
    setDragActive(false);
    setUploading(false);
    setValidating(false);
    setCommitting(false);
    setError("");
    setJobId(null);
    setDetectedColumns([]);
    setSampleRows([]);
    setRowCount(0);
    setMapping({});
    setValidation(null);
    setCommitResult(null);
  };

  React.useEffect(() => {
    if (open) reset();
  }, [open]);

  const onFileChosen = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const res = await api.import.upload(file, ENTITY);
      setJobId(res.job_id);
      setDetectedColumns(res.detected_columns || []);
      setSampleRows(res.sample_rows || []);
      setRowCount(res.row_count || 0);
      setMapping(guessMapping(res.detected_columns));
      setStep("mapping");
    } catch (err) {
      const msg = err?.message || __t("bulkImport.uploadFailed") || "Upload failed";
      setError(msg);
      toast(msg, { kind: "error" });
    } finally {
      setUploading(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  // mapping state is keyed by entity field for easy UI binding; the contract
  // wants it inverted (file column -> entity field) on the wire.
  const invertedMapping = () =>
    Object.fromEntries(
      Object.entries(mapping)
        .filter(([, col]) => col)
        .map(([field, col]) => [col, field]),
    );

  const goToReview = async () => {
    setValidating(true);
    setError("");
    try {
      const res = await api.import.mapping(jobId, invertedMapping());
      setValidation(res);
      setStep("review");
    } catch (err) {
      const msg = err?.message || __t("bulkImport.validationFailed") || "Validation failed";
      setError(msg);
      toast(msg, { kind: "error" });
    } finally {
      setValidating(false);
    }
  };

  const commit = async () => {
    setCommitting(true);
    setError("");
    try {
      const res = await api.import.commit(jobId);
      setCommitResult(res);
      setStep("result");
      toast(
        `${res.created ?? 0} ${__t("bulkImport.created") || "created"}, ${res.updated ?? 0} ${__t("bulkImport.updated") || "updated"}` +
          (res.failed ? `, ${res.failed} ${__t("bulkImport.failed") || "failed"}` : ""),
        { kind: res.failed ? "warn" : "success" },
      );
    } catch (err) {
      const msg = err?.message || __t("bulkImport.commitFailed") || "Import failed";
      setError(msg);
      toast(msg, { kind: "error" });
    } finally {
      setCommitting(false);
    }
  };

  const buildPreview = () =>
    sampleRows.map((r) => {
      const o = {};
      FIELDS.forEach((f) => {
        if (mapping[f]) o[f] = r[mapping[f]];
      });
      return o;
    });

  const previewColumns = FIELDS.filter((f) => mapping[f]).map((f) => ({
    key: f,
    header: FIELD_LABELS[f] || f,
    render: (r) => (
      <span className="font-mono" style={{ fontWeight: f === "pn" ? 600 : 400 }}>
        {r[f] ?? "—"}
      </span>
    ),
  }));

  const canCommit = validation ? validation.valid !== false : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("bulkImport.title") || "Bulk import parts"}
      subtitle={
        step === "upload"
          ? __t("bulkImport.uploadSubtitle") || "Upload a CSV or Excel file"
          : step === "mapping"
            ? __t("bulkImport.mappingSubtitle", { count: detectedColumns.length }) ||
              `Map ${detectedColumns.length} columns to part fields`
            : step === "review"
              ? __t("bulkImport.reviewSubtitle", { count: rowCount }) ||
                `Review ${rowCount} rows`
              : __t("bulkImport.resultSubtitle") || "Import complete"
      }
      size="lg"
      footer={
        step === "mapping" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("upload")}>
              {__t("common.back") || "Back"}
            </Button>
            <Button
              variant="primary"
              loading={validating}
              disabled={!mapping.pn}
              onClick={goToReview}
            >
              {__t("bulkImport.nextReview") || "Next: Review"}
            </Button>
          </>
        ) : step === "review" ? (
          <>
            <span className="fs-12 fg-3" style={{ marginRight: "auto" }}>
              {validation
                ? `${validation.will_create ?? 0} ${__t("bulkImport.willCreate") || "will be created"}, ${validation.will_update ?? 0} ${__t("bulkImport.willUpdate") || "will be updated"}`
                : ""}
            </span>
            <Button variant="secondary" onClick={() => setStep("mapping")}>
              {__t("common.back") || "Back"}
            </Button>
            <Button
              variant="primary"
              loading={committing}
              disabled={!canCommit}
              onClick={commit}
            >
              <Icon.Check size={12} /> {__t("bulkImport.importRows") || "Import"}
            </Button>
          </>
        ) : step === "result" ? (
          <>
            <Button variant="secondary" onClick={reset}>
              {__t("bulkImport.importAnother") || "Import another file"}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {__t("common.done") || "Done"}
            </Button>
          </>
        ) : null
      }
    >
      {error && (
        <div className="fs-12" style={{ color: "var(--danger)", marginBottom: 10 }} role="alert">
          {error}
        </div>
      )}

      {step === "upload" && (
        <>
          <div
            className={`dropzone${dragActive ? " active" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={
              (__t("bulkImport.dropzone") || "Drop a file here or click to browse") +
              " — " +
              (__t("bulkImport.dropzoneHint") || "CSV or Excel (.xlsx). First row = headers.")
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files[0];
              if (f) onFileChosen(f);
            }}
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFilePicker();
              }
            }}
          >
            <div className="big" aria-hidden="true">
              ⤓
            </div>
            <div className="l1">
              {uploading
                ? __t("bulkImport.uploading") || "Uploading…"
                : __t("bulkImport.dropzone") || "Drop a file here or click to browse"}
            </div>
            <div className="l2">
              {__t("bulkImport.dropzoneHint") || "CSV or Excel (.xlsx). First row = headers."}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            id="__bulk-import-input"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="d-none"
            tabIndex={-1}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files[0];
              e.target.value = "";
              if (f) onFileChosen(f);
            }}
            aria-label={__t("bulkImport.uploadAria") || "Upload file"}
          />
        </>
      )}

      {step === "mapping" && (
        <>
          <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
            {__t("bulkImport.mappingInstruction") ||
              "Match your file's columns to part fields."}{" "}
            <strong className="fg-accent">
              {__t("bulkImport.partNumberRequired") || "Part Number"}
            </strong>{" "}
            {__t("bulkImport.isRequired") || "is required."}
          </p>
          <div
            className="d-grid gap-10 items-center oy-auto pr-6"
            style={{ gridTemplateColumns: "1fr 24px 1fr", maxHeight: 360 }}
          >
            {FIELDS.map((f) => (
              <React.Fragment key={f}>
                <label
                  htmlFor={"map-" + f}
                  className="bg-sunk border-line rounded-r2 font-mono fs-12"
                  style={{ padding: "8px 12px", display: "block" }}
                >
                  {FIELD_LABELS[f] || f}
                  {f === "pn" && (
                    <>
                      <span className="fg-accent" aria-hidden="true">
                        {" "}
                        *
                      </span>
                      <span className="sr-only">
                        {" "}
                        ({__t("common.required") || "required"})
                      </span>
                    </>
                  )}
                </label>
                <div className="text-center fg-3" aria-hidden="true">
                  ←
                </div>
                <Select
                  id={"map-" + f}
                  name={"mapField_" + f}
                  value={mapping[f] ?? ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [f]: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">{__t("bulkImport.skip") || "(skip)"}</option>
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </Select>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {step === "review" && (
        <>
          {validation && validation.errors && validation.errors.length > 0 && (
            <div
              className="fs-11 border-line rounded-r2"
              style={{ maxHeight: 140, overflow: "auto", marginBottom: 12, padding: 8 }}
            >
              <div className="fg-3 mb-4">
                {validation.errors.length} {__t("bulkImport.validationIssues") || "validation issue(s)"}
              </div>
              {validation.errors.map((e, i) => (
                <div key={i} className="font-mono" style={{ color: "var(--danger)" }}>
                  {__t("bulkImport.row") || "Row"} {e.row}
                  {e.column ? ` · ${e.column}` : ""}: {e.message}
                </div>
              ))}
            </div>
          )}
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <DataTable
              ariaLabel={__t("bulkImport.reviewSubtitle") || "Review rows"}
              columns={previewColumns}
              rows={buildPreview()}
              dense
              zebra
            />
          </div>
        </>
      )}

      {step === "result" && commitResult && (
        <div className="fs-13">
          <div className="mb-8">
            <strong>{commitResult.created ?? 0}</strong>{" "}
            {__t("bulkImport.created") || "created"} ·{" "}
            <strong>{commitResult.updated ?? 0}</strong>{" "}
            {__t("bulkImport.updated") || "updated"}
            {commitResult.failed ? (
              <>
                {" "}
                ·{" "}
                <strong style={{ color: "var(--danger)" }}>
                  {commitResult.failed}
                </strong>{" "}
                {__t("bulkImport.failed") || "failed"}
              </>
            ) : null}
          </div>
          {commitResult.errors && commitResult.errors.length > 0 && (
            <div
              className="fs-11 border-line rounded-r2"
              style={{ maxHeight: 200, overflow: "auto", padding: 8 }}
            >
              {commitResult.errors.map((e, i) => (
                <div key={i} className="font-mono" style={{ color: "var(--danger)" }}>
                  {__t("bulkImport.row") || "Row"} {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

BulkImportModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
