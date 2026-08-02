import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import { Input } from "../ui/Field.jsx";
import { Badge } from "../ui/Badge.jsx";

// ============ CAD IMPORT (SolidWorks-style sync) ============
export default function CADImportModal({ open, onClose }) {
  const [step, setStep] = React.useState("upload"); // upload | addin-required
  const [importSource, setImportSource] = React.useState("");
  const [pdmUrl, setPdmUrl] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState(null);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) {
      setStep("upload");
      setImportSource("");
      setPdmUrl("");
      setSelectedFile(null);
    }
  }, [open]);

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
          "not uploaded; CAD import requires the SolidWorks add-in"),
      { kind: "success" },
    );
  };

  // CAD import is NOT implemented in the web app, and cannot be: .sldasm /
  // .sldprt are proprietary SolidWorks binaries that only SolidWorks itself can
  // open, which is exactly why this product ships a SolidWorks add-in. This
  // used to run a fake progress bar and then display a hardcoded parts list,
  // reporting "Imported N new parts" without uploading the file or calling any
  // API. Telling the user the truth is the only honest behaviour until either
  // the add-in is installed or a real STEP import endpoint exists.
  const startScan = (sourceName) => {
    setImportSource(sourceName || "");
    setStep("addin-required");
  };

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
        step === "addin-required" ? (
          <Button variant="secondary" onClick={onClose}>
            {__t("common.close") || "Close"}
          </Button>
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
                    "File selected — not uploaded; CAD import requires the SolidWorks add-in"}
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

      {step === "addin-required" && (
        <div className="cad-import__addin" role="status" aria-live="polite">
          <div className="cad-import__addin-icon" aria-hidden="true">{"⛏"}</div>
          <div className="cad-import__addin-title">
            {__t("modals.cadImport.addinRequiredTitle") ||
              "CAD import needs the SolidWorks add-in"}
          </div>
          <p className="cad-import__addin-desc">
            {__t("modals.cadImport.addinRequiredDesc") ||
              "Assembly files (.sldasm / .sldprt) are proprietary SolidWorks formats that only SolidWorks itself can open, so Blackbox BOM cannot read them in the browser. The SolidWorks add-in runs inside SolidWorks on your workstation and pushes the assembly BOM here directly."}
          </p>
          {importSource && (
            <p className="cad-import__addin-file">
              {(__t("modals.cadImport.notImported") || "Not imported") +
                ": " +
                importSource}
            </p>
          )}
          <ol className="cad-import__addin-steps">
            <li>
              {__t("modals.cadImport.addinStep1") ||
                "Install the Blackbox BOM add-in on a Windows machine with SolidWorks 2018 or newer."}
            </li>
            <li>
              {__t("modals.cadImport.addinStep2") ||
                "Open the assembly in SolidWorks and sign in to this server from the add-in panel."}
            </li>
            <li>
              {__t("modals.cadImport.addinStep3") ||
                "Choose “Push BOM” — parts appear in your library automatically."}
            </li>
          </ol>
          <p className="cad-import__addin-note">
            {__t("modals.cadImport.addinNote") ||
              "Neutral formats (.step / .iges) are not supported yet either — no import runs, and nothing is uploaded."}
          </p>
        </div>
      )}

      <style>{`
        .cad-import__addin {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--sp-3);
          padding: var(--sp-6) var(--sp-4);
        }
        .cad-import__addin-icon { font-size: 28px; opacity: .75; }
        .cad-import__addin-title {
          font-size: var(--fs-200);
          font-weight: var(--fw-medium);
          color: var(--text-primary);
        }
        .cad-import__addin-desc,
        .cad-import__addin-note {
          margin: 0;
          max-width: 52ch;
          font-size: var(--fs-100);
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .cad-import__addin-note { color: var(--text-muted); }
        .cad-import__addin-file {
          margin: 0;
          font-size: var(--fs-100);
          color: var(--text-muted);
          font-family: var(--font-mono, monospace);
        }
        .cad-import__addin-steps {
          margin: 0;
          padding-left: var(--sp-5);
          text-align: left;
          max-width: 52ch;
          font-size: var(--fs-100);
          color: var(--text-secondary);
          line-height: 1.7;
        }
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
