import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Icon, useAppStore } from "../../globals";
import { Button, DataTable, Modal, Select, Textarea } from "../ui";
// ============ BULK CSV IMPORT ============

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

export default function BulkImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | mapping | review
  const [csvText, setCsvText] = React.useState("");
  const [rows, setRows] = React.useState([]);
  const [headers, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({});
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const ctx = useAppStore();

  React.useEffect(() => {
    if (open) {
      setStep("upload");
      setCsvText("");
      setRows([]);
      setHeaders([]);
      setMapping({});
      setDragActive(false);
    }
  }, [open]);

  const guess = (h) => {
    const l = h.toLowerCase();
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
  };

  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return;
    const hdrs = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const data = lines.slice(1).map((line) => {
      const cells = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = !q;
        else if (c === "," && !q) {
          cells.push(cur);
          cur = "";
        } else cur += c;
      }
      cells.push(cur);
      return cells;
    });
    setHeaders(hdrs);
    setRows(data);
    const m = {};
    hdrs.forEach((h, i) => {
      const g = guess(h);
      if (g) m[g] = i;
    });
    setMapping(m);
    setStep("mapping");
  };

  const loadSample = () => {
    parseCSV(`Part Number,Description,Rev,Qty,UoM,Category,Vendor,Unit Cost,Lead,Origin,Status
EL-CAP-22UF-50V,Capacitor 22µF 50V,A,12,EA,Electrical,Nichicon,0.18,14,JP,Released
EL-RES-4.7K-1%,Resistor 4.7kΩ 1% 0805,—,48,EA,Electrical,Yageo,0.01,7,TW,Released
EL-DIO-SOD123,Schottky Diode SOD-123,B,8,EA,Electrical,Vishay,0.12,10,DE,Released
EL-CON-MICROHDMI,Connector microHDMI receptacle,A,2,EA,Electrical,Molex,0.84,14,US,Review
MEC-WSH-M3-NL,Nylon Washer M3,—,40,EA,Hardware,McMaster,0.02,2,US,Released
CB-RIBBON-26P,Ribbon Cable 26-pin 200mm,—,2,EA,Cable,3M,3.40,14,US,Released
OPT-DIFF-30,Optical Diffuser 30mm,A,1,EA,Optical,Edmund Optics,18.50,21,US,Released`);
  };

  const onFileChosen = async (file) => {
    const text = await file.text();
    setCsvText(text);
    parseCSV(text);
  };

  const buildPreview = () =>
    rows.map((r) => {
      const o = {};
      FIELDS.forEach((f) => {
        if (mapping[f] != null) o[f] = r[mapping[f]];
      });
      o.qty = Number(o.qty) || 0;
      o.cost = Number(o.cost) || 0;
      o.lead = Number(o.lead) || 0;
      return o;
    });

  const apply = () => {
    const newRows = buildPreview().map((r, i) => ({
      id: "imp-" + Date.now() + "-" + i,
      pn: r.pn,
      name: r.name || "(no name)",
      rev: r.rev || "—",
      qty: r.qty,
      uom: r.uom || "EA",
      category: r.category || "Hardware",
      vendor: r.vendor || "—",
      cost: r.cost,
      lead: r.lead,
      origin: r.origin || "—",
      status: r.status || "Draft",
    }));
    if (ctx?.setRows && ctx.rows) {
      const next = [...ctx.rows];
      if (next[0] && next[0].children) {
        next[0] = { ...next[0], children: [...next[0].children, ...newRows] };
      } else {
        next.push(...newRows);
      }
      ctx.setRows(next);
    }
    onClose();
    toast(
      (
        __t("bulkImport.importedToast") || "Imported {count} parts into BOM"
      ).replace("{count}", newRows.length),
      { kind: "success" },
    );
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const previewColumns = FIELDS.filter((f) => mapping[f] != null).map((f) => ({
    key: f,
    header: FIELD_LABELS[f] || f,
    render: (r) => (
      <span
        className="font-mono"
        style={{ fontWeight: f === "pn" ? 600 : 400 }}
      >
        {r[f] || "—"}
      </span>
    ),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("bulkImport.title") || "Bulk import parts"}
      subtitle={
        step === "upload"
          ? __t("bulkImport.uploadSubtitle") || "Drop a CSV or paste rows"
          : step === "mapping"
            ? (
                __t("bulkImport.mappingSubtitle") ||
                "Map {count} columns to BOM fields"
              ).replace("{count}", headers.length)
            : (
                __t("bulkImport.reviewSubtitle") || "Review {count} rows"
              ).replace("{count}", rows.length)
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
              onClick={() => setStep("review")}
              disabled={!mapping.pn}
            >
              {__t("bulkImport.nextReview") || "Next: Review"}
            </Button>
          </>
        ) : step === "review" ? (
          <>
            <span className="fs-12 fg-3" style={{ marginRight: "auto" }}>
              {rows.length}{" "}
              {__t("bulkImport.rowsWillBeAppended") ||
                "rows will be appended to the active BOM"}
            </span>
            <Button variant="secondary" onClick={() => setStep("mapping")}>
              {__t("common.back") || "Back"}
            </Button>
            <Button variant="primary" onClick={apply}>
              <Icon.Check size={12} />{" "}
              {__t("bulkImport.importRows") || "Import"} {rows.length}{" "}
              {__t("bulkImport.rows") || "rows"}
            </Button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <div
            className={`dropzone${dragActive ? " active" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={
              (__t("bulkImport.dropzone") ||
                "Drop CSV here or click to browse") +
              " — " +
              (__t("bulkImport.dropzoneHint") ||
                "First row = headers. Comma-separated. UTF-8.")
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
              {__t("bulkImport.dropzone") || "Drop CSV here or click to browse"}
            </div>
            <div className="l2">
              {__t("bulkImport.dropzoneHint") ||
                "First row = headers. Comma-separated. UTF-8."}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            id="__bulk-csv-input"
            accept=".csv,text/csv"
            className="d-none"
            tabIndex={-1}
            onChange={(e) =>
              e.target.files[0] && onFileChosen(e.target.files[0])
            }
            aria-label={__t("bulkImport.uploadAria") || "Upload CSV file"}
          />
          <div
            className="flex justify-between items-center"
            style={{ margin: "14px 0 8px" }}
          >
            <label htmlFor="csv-text" className="hint">
              {__t("bulkImport.orPaste") || "Or paste CSV directly"}
            </label>
            <Button variant="ghost" size="sm" onClick={loadSample}>
              <Icon.Sparkles size={11} />{" "}
              {__t("bulkImport.useSampleData") || "Use sample data"}
            </Button>
          </div>
          <Textarea
            id="csv-text"
            name="csvText"
            className="font-mono"
            rows={7}
            style={{ minHeight: 140 }}
            placeholder={
              __t("bulkImport.csvPlaceholder") ||
              "Part Number,Description,Qty,Vendor,Cost…"
            }
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <div className="mt-10 flex justify-end">
            <Button
              variant="primary"
              disabled={!csvText.trim()}
              onClick={() => parseCSV(csvText)}
            >
              {__t("bulkImport.parseCsv") || "Parse CSV →"}
            </Button>
          </div>
        </>
      )}

      {step === "mapping" && (
        <>
          <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
            {__t("bulkImport.mappingInstruction") ||
              "Match your CSV columns to BOM fields."}{" "}
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
                      [f]:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                >
                  <option value="">{__t("bulkImport.skip") || "(skip)"}</option>
                  {headers.map((h, i) => (
                    <option key={h + "-" + i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {step === "review" && (
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          <DataTable
            ariaLabel={__t("bulkImport.reviewSubtitle") || "Review rows"}
            columns={previewColumns}
            rows={buildPreview()}
            dense
            zebra
          />
        </div>
      )}
    </Modal>
  );
}

BulkImportModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
