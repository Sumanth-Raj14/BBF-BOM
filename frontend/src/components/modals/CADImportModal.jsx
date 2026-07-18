import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Field.jsx";
import { Checkbox } from "../ui/Choice.jsx";
import { Badge, StatusPill } from "../ui/Badge.jsx";
import { DataTable } from "../ui/DataTable.jsx";

// ============ CAD IMPORT (SolidWorks-style sync) ============
export default function CADImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | scanning | review
  const [progress, setProgress] = React.useState(0);
  const [foundParts, setFoundParts] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [importSource, setImportSource] = React.useState("");
  const [pdmUrl, setPdmUrl] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const intervalRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) {
      setStep("upload");
      setProgress(0);
      setFoundParts([]);
      setSelected(new Set());
      setImportSource("");
      setPdmUrl("");
      setSelectedFile(null);
    }
  }, [open]);

  React.useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const validExts = ["sldasm", "step", "stp", "igs", "iges", "sldprt", "pdf"];
    if (!validExts.includes(ext)) {
      toast(
        (__t("modals.cadImport.unsupportedFile") || "Unsupported file type") +
          ": ." +
          ext +
          " — " +
          (__t("modals.cadImport.useFormats") ||
            "use .sldasm, .step, or .iges"),
        { kind: "warn" },
      );
      return;
    }
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    setSelectedFile({
      name: file.name,
      size: sizeMB + " MB",
      ext: ext.toUpperCase(),
    });
    setImportSource(file.name);
    toast(
      (__t("modals.cadImport.selected") || "Selected") +
        " " +
        file.name +
        " (" +
        sizeMB +
        " MB) — " +
        (__t("modals.cadImport.willBeProcessed") ||
          "will be processed when backend is available"),
      { kind: "success" },
    );
  };

  const startScan = (sourceName) => {
    setStep("scanning");
    setProgress(0);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + Math.random() * 18 + 6;
        if (next >= 100) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          const _baseName = (sourceName || "assembly").replace(/\.[^.]+$/, "");
          const fakeParts = [
            {
              pn: "MEC-PL-040A",
              name: "Side Panel (Anodized)",
              qty: 2,
              status: "matched",
            },
            {
              pn: "MEC-PL-041A",
              name: "Top Plate (Vented)",
              qty: 1,
              status: "matched",
            },
            {
              pn: "MEC-BR-013",
              name: "Mounting Bracket, Type B (NEW)",
              qty: 6,
              status: "new",
            },
            {
              pn: "HW-FAS-M3-08",
              name: "Screw, M3×8",
              qty: 32,
              status: "matched",
            },
            {
              pn: "HW-FAS-M4-12",
              name: "Screw, M4×12 (NEW)",
              qty: 8,
              status: "new",
            },
            {
              pn: "EL-CON-RJ45",
              name: "Connector, RJ45",
              qty: 2,
              status: "matched",
            },
            {
              pn: "MEC-GSK-A",
              name: "Gasket, EPDM (NEW)",
              qty: 1,
              status: "new",
            },
          ];
          setFoundParts(fakeParts);
          setSelected(new Set(fakeParts.map((p) => p.pn)));
          setStep("review");
          return 100;
        }
        return next;
      });
    }, 250);
  };

  const apply = () => {
    onClose();
    const newCount = foundParts.filter(
      (p) => p.status === "new" && selected.has(p.pn),
    ).length;
    const matchedCount = foundParts.filter(
      (p) => p.status === "matched" && selected.has(p.pn),
    ).length;
    toast(
      (__t("modals.cadImport.imported") || "Imported") +
        " · " +
        newCount +
        " " +
        (__t("modals.cadImport.newParts") || "new parts") +
        ", " +
        matchedCount +
        " " +
        (__t("modals.cadImport.matched") || "matched"),
      { kind: "success" },
    );
  };

  const toggleRow = (pn) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pn) ? next.delete(pn) : next.add(pn);
      return next;
    });
  };

  const allSelected =
    foundParts.length > 0 && selected.size === foundParts.length;

  const reviewColumns = [
    {
      key: "sel",
      header: (
        <Checkbox
          checked={allSelected}
          onChange={(e) =>
            setSelected(
              e.target.checked ? new Set(foundParts.map((p) => p.pn)) : new Set(),
            )
          }
          aria-label={
            __t("modals.cadImport.selectAll") || "Select all found parts"
          }
        />
      ),
      render: (row) => (
        <Checkbox
          checked={selected.has(row.pn)}
          onChange={() => toggleRow(row.pn)}
          aria-label={
            (__t("modals.cadImport.selectPart") || "Select") + " " + row.pn
          }
        />
      ),
    },
    {
      key: "pn",
      header: __t("part.partNumber") || "Part No.",
      render: (row) => (
        <span className="cad-import__mono">{row.pn}</span>
      ),
    },
    { key: "name", header: __t("part.name") || "Name" },
    {
      key: "qty",
      header: __t("part.quantity") || "Qty",
      align: "num",
      render: (row) => row.qty,
    },
    {
      key: "status",
      header: __t("part.status") || "Status",
      render: (row) =>
        row.status === "matched" ? (
          <StatusPill
            status={row.status}
            tone="success"
            label={__t("modals.cadImport.matched") || "Matched"}
          />
        ) : (
          <Badge tone="accent" pill>
            {__t("modals.cadImport.new") || "New"}
          </Badge>
        ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("modals.cadImport.title") || "Import from SolidWorks"}
      subtitle={
        __t("modals.cadImport.subtitle") ||
        "Sync assembly BOM → component library"
      }
      size="lg"
      footer={
        step === "review" ? (
          <>
            <span className="cad-import__footer-count">
              {selected.size} {__t("modals.cadImport.of") || "of"}{" "}
              {foundParts.length}{" "}
              {__t("modals.cadImport.partsWillBeImported") ||
                "parts will be imported"}
            </span>
            <Button variant="secondary" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="primary"
              onClick={apply}
              disabled={selected.size === 0}
            >
              <Icon.Check size={12} />{" "}
              {__t("modals.cadImport.import") || "Import"} {selected.size}{" "}
              {__t("modals.cadImport.parts") || "parts"}
            </Button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <p className="cad-import__intro">
            {__t("modals.cadImport.uploadDesc") ||
              "Connect to SolidWorks, upload an assembly file, or paste a PDM link."}
          </p>
          <input
            ref={fileInputRef}
            id="cad-file-input"
            name="cadFile"
            type="file"
            accept=".sldasm,.step,.stp,.igs,.sldprt,.pdf"
            className="d-none"
            onChange={handleFileSelect}
            aria-label={__t("modals.cadImport.uploadAria") || "Upload CAD file"}
          />
          <div className="cad-import__sources">
            {[
              {
                l: __t("modals.cadImport.solidworks") || "SolidWorks",
                s: __t("modals.cadImport.liveApi") || "Live API connection",
                icon: "⌌",
                action: function () {
                  startScan("SolidWorks Assembly");
                },
              },
              {
                l: __t("modals.cadImport.assemblyFile") || "Assembly file",
                s:
                  __t("modals.cadImport.sldasmUpload") ||
                  ".sldasm or .step upload",
                icon: "⤓",
                action: function () {
                  fileInputRef.current && fileInputRef.current.click();
                },
              },
              {
                l: __t("modals.cadImport.pdmLink") || "PDM link",
                s: __t("modals.cadImport.pasteUrl") || "Paste assembly URL",
                icon: "🔗",
                action: function () {
                  setImportSource("pdm");
                },
              },
            ].map(function (opt) {
              return (
                <button
                  key={opt.l}
                  type="button"
                  className="cad-import__tile"
                  onClick={opt.action}
                >
                  <div className="cad-import__tile-icon" aria-hidden="true">
                    {opt.icon}
                  </div>
                  <div className="cad-import__tile-label">{opt.l}</div>
                  <div className="cad-import__tile-sub">{opt.s}</div>
                </button>
              );
            })}
          </div>
          {selectedFile && (
            <div className="cad-import__file">
              <div className="cad-import__file-row">
                <Badge tone="neutral" pill>
                  {selectedFile.ext}
                </Badge>
                <span className="cad-import__file-name">
                  {selectedFile.name}
                </span>
                <span className="cad-import__file-size">
                  {selectedFile.size}
                </span>
              </div>
              <div className="cad-import__file-ok">
                <span aria-hidden="true">{"✓"}</span>
                <span>
                  {__t("modals.cadImport.fileSelected") ||
                    "File selected — will be processed when backend is available"}
                </span>
              </div>
              <Button
                variant="primary"
                className="cad-import__file-action"
                onClick={function () {
                  startScan(selectedFile.name);
                }}
              >
                <Icon.Import size={12} />{" "}
                {__t("modals.cadImport.processNow") || "Process now"}
              </Button>
            </div>
          )}
          {importSource === "pdm" && !selectedFile && (
            <div className="cad-import__pdm">
              <Input
                id="pdm-url-input"
                name="pdmUrl"
                type="url"
                mono
                placeholder={
                  __t("modals.cadImport.pdmPlaceholder") ||
                  "https://pdm.company.com/assembly/..."
                }
                value={pdmUrl}
                onChange={function (e) {
                  setPdmUrl(e.target.value);
                }}
                aria-label={
                  __t("modals.cadImport.pdmAria") || "PDM assembly URL"
                }
                className="cad-import__pdm-input"
              />
              <Button
                variant="primary"
                disabled={!pdmUrl}
                onClick={function () {
                  startScan(pdmUrl.split("/").pop() || "PDM Assembly");
                }}
              >
                <Icon.Import size={12} />{" "}
                {__t("modals.cadImport.fetch") || "Fetch"}
              </Button>
            </div>
          )}
          <div className="cad-import__recent">
            <div className="cad-import__recent-title">
              {__t("modals.cadImport.recentImports") || "Recent imports"}
            </div>
            <div className="cad-import__recent-row">
              <span>ATL-MFR-A_v3.2.sldasm</span>
              <span>5 days ago {"·"} 87 parts</span>
            </div>
            <div className="cad-import__recent-row">
              <span>HZN-POD-CTL_v1.4.sldasm</span>
              <span>12 days ago {"·"} 24 parts</span>
            </div>
          </div>
        </>
      )}

      {step === "scanning" && (
        <div
          className="cad-import__scan"
          role="status"
          aria-live="polite"
        >
          <div className="cad-import__scan-icon" aria-hidden="true">
            {"⬬"}
          </div>
          <div className="cad-import__scan-title">
            {__t("modals.cadImport.scanning") || "Scanning assembly…"}
          </div>
          <div className="cad-import__scan-desc">
            {__t("modals.cadImport.scanningDesc") ||
              "Walking tree · extracting parts · matching against library"}
          </div>
          <div className="cad-import__progress-wrap">
            <div className="cad-import__progress-track">
              <div
                className="cad-import__progress-fill"
                style={{ width: Math.min(100, progress) + "%" }}
              />
            </div>
            <div className="cad-import__progress-meta">
              <span>
                {progress >= 30
                  ? __t("modals.cadImport.walkingSub") ||
                    "Walking subassemblies"
                  : __t("modals.cadImport.loadingAssembly") ||
                    "Loading assembly"}
              </span>
              <span>{Math.round(Math.min(100, progress))}%</span>
            </div>
          </div>
          <div className="cad-import__log">
            {progress > 10 && <div>{"✓"} Loaded ATL-MFR-A_v3.2.sldasm</div>}
            {progress > 30 && (
              <div>{"✓"} Walked 4 subassemblies {"·"} 87 part references</div>
            )}
            {progress > 55 && (
              <div>{"✓"} Captured isometric thumbnails (S3 {"→"} /atlas/v3.2/)</div>
            )}
            {progress > 75 && <div>{"✓"} Matched 64 parts to library</div>}
            {progress > 90 && (
              <div>{"✓"} Identified 3 new parts requiring review</div>
            )}
          </div>
        </div>
      )}

      {step === "review" && (
        <>
          <div className="cad-import__summary">
            <div className="fs-13">
              <strong className="cad-import__summary-ok">
                {foundParts.filter((p) => p.status === "matched").length}{" "}
                {__t("modals.cadImport.matched") || "matched"}
              </strong>{" "}
              {"·"}{" "}
              <strong className="cad-import__summary-new">
                {foundParts.filter((p) => p.status === "new").length}{" "}
                {__t("modals.cadImport.new") || "new"}
              </strong>
            </div>
            <div className="cad-import__meta">
              {foundParts.length} {__t("modals.cadImport.total") || "total"}{" "}
              {"·"} 8.4 MB
            </div>
          </div>
          <DataTable
            columns={reviewColumns}
            rows={foundParts}
            getRowKey={(row) => row.pn}
            isRowSelected={(row) => selected.has(row.pn)}
            ariaLabel={
              __t("modals.cadImport.reviewTableLabel") ||
              "Parts found in assembly"
            }
            dense
          />
        </>
      )}

      <style>{`
        .cad-import__intro {
          margin: 0 0 var(--sp-4);
          font-size: var(--fs-200);
          color: var(--text-secondary);
        }
        .cad-import__sources {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: var(--sp-3);
          margin-bottom: var(--sp-4);
        }
        .cad-import__tile {
          padding: var(--sp-4);
          border: 1.5px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          cursor: pointer;
          text-align: center;
          font: inherit;
          transition: border-color var(--dur-fast, 120ms) var(--ease-standard, ease),
            background var(--dur-fast, 120ms) var(--ease-standard, ease);
        }
        .cad-import__tile:hover {
          border-color: var(--accent-interactive);
          background: var(--bg-hover);
        }
        .cad-import__tile:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 2px;
        }
        .cad-import__tile-icon {
          font-family: var(--font-mono);
          font-size: 24px;
          color: var(--text-muted);
          margin-bottom: var(--sp-2);
        }
        .cad-import__tile-label {
          font-weight: var(--fw-semibold);
          font-size: var(--fs-200);
          color: var(--text-primary);
        }
        .cad-import__tile-sub {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
          margin-top: 2px;
        }
        .cad-import__file {
          margin-bottom: var(--sp-4);
          padding: var(--sp-3);
          border: 1.5px solid var(--ok);
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
        }
        .cad-import__file-row {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }
        .cad-import__file-name {
          flex: 1;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: var(--fs-200);
          font-weight: var(--fw-semibold);
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cad-import__file-size {
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-muted);
        }
        .cad-import__file-ok {
          display: flex;
          align-items: center;
          gap: var(--sp-1);
          margin-top: var(--sp-2);
          font-size: var(--fs-100);
          color: var(--ok-text);
        }
        .cad-import__file-action {
          margin-top: var(--sp-3);
        }
        .cad-import__pdm {
          display: flex;
          gap: var(--sp-2);
          margin-bottom: var(--sp-4);
        }
        .cad-import__pdm-input {
          flex: 1;
        }
        .cad-import__recent {
          padding: var(--sp-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
        }
        .cad-import__recent-title {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: var(--sp-1);
        }
        .cad-import__recent-row {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-primary);
          padding: 4px 0;
        }
        .cad-import__recent-row span:last-child {
          color: var(--text-muted);
        }
        .cad-import__scan {
          text-align: center;
          padding: var(--sp-8) var(--sp-5);
        }
        .cad-import__scan-icon {
          font-family: var(--font-mono);
          color: var(--accent-text);
          font-size: 36px;
          margin-bottom: var(--sp-4);
        }
        .cad-import__scan-title {
          font-size: var(--fs-300);
          font-weight: var(--fw-semibold);
          margin-bottom: var(--sp-1);
        }
        .cad-import__scan-desc {
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-muted);
          margin-bottom: var(--sp-5);
        }
        .cad-import__progress-wrap {
          max-width: 360px;
          margin: 0 auto;
        }
        .cad-import__progress-track {
          height: 8px;
          background: var(--bg-subtle);
          border-radius: 4px;
          overflow: hidden;
        }
        .cad-import__progress-fill {
          height: 100%;
          background: var(--accent-interactive);
          transition: width 0.25s ease-out;
        }
        .cad-import__progress-meta {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
          margin-top: var(--sp-2);
        }
        .cad-import__log {
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
          text-align: left;
          line-height: 1.8;
          max-width: 480px;
          margin: var(--sp-7) auto 0;
        }
        .cad-import__summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--sp-3);
        }
        .cad-import__summary-ok { color: var(--ok-text); }
        .cad-import__summary-new { color: var(--accent-text); }
        .cad-import__meta {
          font-family: var(--font-mono);
          font-size: var(--fs-100);
          color: var(--text-muted);
        }
        .cad-import__mono { font-family: var(--font-mono); }
        .cad-import__footer-count {
          margin-right: auto;
          font-size: var(--fs-100);
          color: var(--text-secondary);
        }
        @media (prefers-reduced-motion: reduce) {
          .cad-import__tile,
          .cad-import__progress-fill {
            transition: none;
          }
        }
      `}</style>
    </Modal>
  );
}

CADImportModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
