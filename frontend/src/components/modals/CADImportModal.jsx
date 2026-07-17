import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { Modal } from "../../globals";
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
          " \u2014 " +
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
        " MB) \u2014 " +
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
        " \u00B7 " +
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Import size={16} />}
      title={__t("modals.cadImport.title") || "Import from SolidWorks"}
      subtitle={
        __t("modals.cadImport.subtitle") ||
        "Sync assembly BOM \u2192 component library"
      }
      wide
      footer={
        step === "review" ? (
          <>
            <span className="left">
              {selected.size} {__t("modals.cadImport.of") || "of"}{" "}
              {foundParts.length}{" "}
              {__t("modals.cadImport.partsWillBeImported") ||
                "parts will be imported"}
            </span>
            <button className="btn" onClick={onClose}>
              {__t("common.cancel") || "Cancel"}
            </button>
            <button
              className="btn primary"
              onClick={apply}
              disabled={selected.size === 0}
            >
              <Icon.Check size={12} />{" "}
              {__t("modals.cadImport.import") || "Import"} {selected.size}{" "}
              {__t("modals.cadImport.parts") || "parts"}
            </button>
          </>
        ) : null
      }
    >
      {step === "upload" && (
        <>
          <p className="fs-12 fg-3" style={{ margin: "0 0 14px" }}>
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
          <div
            className="d-grid gap-10 mb-14"
            style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
          >
            {[
              {
                l: __t("modals.cadImport.solidworks") || "SolidWorks",
                s: __t("modals.cadImport.liveApi") || "Live API connection",
                icon: "\u230C",
                action: function () {
                  startScan("SolidWorks Assembly");
                },
              },
              {
                l: __t("modals.cadImport.assemblyFile") || "Assembly file",
                s:
                  __t("modals.cadImport.sldasmUpload") ||
                  ".sldasm or .step upload",
                icon: "\u2913",
                action: function () {
                  fileInputRef.current && fileInputRef.current.click();
                },
              },
              {
                l: __t("modals.cadImport.pdmLink") || "PDM link",
                s: __t("modals.cadImport.pasteUrl") || "Paste assembly URL",
                icon: "\uD83D\uDD17",
                action: function () {
                  setImportSource("pdm");
                },
              },
            ].map(function (opt) {
              return (
                <button
                  key={opt.l}
                  onClick={opt.action}
                  style={{
                    padding: 18,
                    border: "1.5px solid var(--line)",
                    borderRadius: "var(--r-3)",
                    background: "var(--bg)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "border-color 0.1s, background 0.1s",
                  }}
                  onMouseEnter={function (e) {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.background = "var(--bg-elev)";
                  }}
                  onMouseLeave={function (e) {
                    e.currentTarget.style.borderColor = "var(--line)";
                    e.currentTarget.style.background = "var(--bg)";
                  }}
                >
                  <div className="font-mono fs-26 fg-3 mb-6">{opt.icon}</div>
                  <div className="fw-600 fs-13">{opt.l}</div>
                  <div className="font-mono fs-10 fg-3 mt-2">{opt.s}</div>
                </button>
              );
            })}
          </div>
          {selectedFile && (
            <div
              className="mb-14 rounded-r2 bg-elev"
              style={{ padding: 14, border: "1.5px solid var(--ok)" }}
            >
              <div className="flex items-center gap-10">
                <span
                  className="font-mono fs-9 br-2 letter-sp-6"
                  style={{
                    padding: "3px 6px",
                    background: "var(--fg)",
                    color: "var(--bg)",
                  }}
                >
                  {selectedFile.ext}
                </span>
                <span className="flex-1 font-mono fs-12 fw-600">
                  {selectedFile.name}
                </span>
                <span className="font-mono fs-11 fg-3">
                  {selectedFile.size}
                </span>
              </div>
              <div className="mt-8 fs-11 fg-ok font-mono">
                \u2713{" "}
                {__t("modals.cadImport.fileSelected") ||
                  "File selected \u2014 will be processed when backend is available"}
              </div>
              <button
                className="btn primary mt-10"
                onClick={function () {
                  startScan(selectedFile.name);
                }}
              >
                <Icon.Import size={12} />{" "}
                {__t("modals.cadImport.processNow") || "Process now"}
              </button>
            </div>
          )}
          {importSource === "pdm" && !selectedFile && (
            <div className="mb-14 flex gap-8">
              <input
                id="pdm-url-input"
                name="pdmUrl"
                type="url"
                placeholder={
                  __t("modals.cadImport.pdmPlaceholder") ||
                  "https://pdm.company.com/assembly/..."
                }
                value={pdmUrl}
                onChange={function (e) {
                  setPdmUrl(e.target.value);
                }}
                className="flex-1 rounded-r2 bg-canvas font-mono fs-12"
                style={{
                  padding: "8px 12px",
                  border: "1.5px solid var(--line)",
                }}
              />
              <button
                className="btn primary"
                disabled={!pdmUrl}
                onClick={function () {
                  startScan(pdmUrl.split("/").pop() || "PDM Assembly");
                }}
              >
                <Icon.Import size={12} />{" "}
                {__t("modals.cadImport.fetch") || "Fetch"}
              </button>
            </div>
          )}
          <div
            className="bg-sunk border-line rounded-r2 fs-12 fg-3"
            style={{ padding: 12 }}
          >
            <div className="font-mono fs-10 fg-3 letter-sp-6 uppercase mb-4">
              {__t("modals.cadImport.recentImports") || "RECENT IMPORTS"}
            </div>
            <div
              className="flex justify-between font-mono fs-11"
              style={{ padding: "4px 0" }}
            >
              <span>ATL-MFR-A_v3.2.sldasm</span>
              <span className="fg-3">5 days ago \u00B7 87 parts</span>
            </div>
            <div
              className="flex justify-between font-mono fs-11"
              style={{ padding: "4px 0" }}
            >
              <span>HZN-POD-CTL_v1.4.sldasm</span>
              <span className="fg-3">12 days ago \u00B7 24 parts</span>
            </div>
          </div>
        </>
      )}

      {step === "scanning" && (
        <div className="text-center" style={{ padding: "40px 20px" }}>
          <div className="font-mono fg-accent mb-14" style={{ fontSize: 36 }}>
            ⌬
          </div>
          <div className="fs-14 fw-600 mb-6">
            {__t("modals.cadImport.scanning") || "Scanning assembly\u2026"}
          </div>
          <div className="font-mono fs-11 fg-3 mb-20">
            {__t("modals.cadImport.scanningDesc") ||
              "Walking tree \u00B7 extracting parts \u00B7 matching against library"}
          </div>
          <div style={{ maxWidth: 360, margin: "0 auto" }}>
            <div className="h-8 bg-sunk br-4 overflow-h">
              <div
                className="h-100p bg-accent"
                style={{
                  width: Math.min(100, progress) + "%",
                  transition: "width 0.25s ease-out",
                }}
              />
            </div>
            <div className="font-mono fs-10 fg-3 mt-6 flex justify-between">
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
          <div
            className="font-mono fs-10 fg-4 text-left"
            style={{
              marginTop: 30,
              lineHeight: 1.8,
              maxWidth: 480,
              margin: "30px auto 0",
            }}
          >
            {progress > 10 && <div>✓ Loaded ATL-MFR-A_v3.2.sldasm</div>}
            {progress > 30 && (
              <div>✓ Walked 4 subassemblies · 87 part references</div>
            )}
            {progress > 55 && (
              <div>✓ Captured isometric thumbnails (S3 → /atlas/v3.2/)</div>
            )}
            {progress > 75 && <div>✓ Matched 64 parts to library</div>}
            {progress > 90 && (
              <div>✓ Identified 3 new parts requiring review</div>
            )}
          </div>
        </div>
      )}

      {step === "review" && (
        <>
          <div className="flex items-center justify-between mb-12">
            <div className="fs-13">
              <strong className="fg-ok">
                {foundParts.filter((p) => p.status === "matched").length}{" "}
                {__t("modals.cadImport.matched") || "matched"}
              </strong>{" "}
              \u00B7{" "}
              <strong className="fg-accent">
                {foundParts.filter((p) => p.status === "new").length}{" "}
                {__t("modals.cadImport.new") || "new"}
              </strong>
            </div>
            <div className="font-mono fs-11 fg-3">
              {foundParts.length} {__t("modals.cadImport.total") || "total"}{" "}
              \u00B7 8.4 MB
            </div>
          </div>
          <div className="border-line rounded-r2 overflow-h">
            <table className="bom-table table-auto">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      id="cad-select-all"
                      name="cadSelectAll"
                      type="checkbox"
                      className="row-checkbox"
                      checked={selected.size === foundParts.length}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(foundParts.map((p) => p.pn))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                  <th>{__t("part.partNumber") || "Part No."}</th>
                  <th>{__t("part.name") || "Name"}</th>
                  <th className="num">{__t("part.quantity") || "Qty"}</th>
                  <th>{__t("part.status") || "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {foundParts.map((p) => (
                  <tr key={p.pn}>
                    <td className="col-check">
                      <input
                        id={"cad-select-" + p.pn}
                        name="cadSelected"
                        type="checkbox"
                        className="row-checkbox"
                        checked={selected.has(p.pn)}
                        onChange={() => {
                          const next = new Set(selected);
                          next.has(p.pn) ? next.delete(p.pn) : next.add(p.pn);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="mono">{p.pn}</td>
                    <td>{p.name}</td>
                    <td className="num mono">{p.qty}</td>
                    <td>
                      {p.status === "matched" ? (
                        <span className="status released">Matched</span>
                      ) : (
                        <span
                          className="font-mono fs-10 fg-accent"
                          style={{
                            padding: "1px 6px",
                            background: "var(--accent-soft)",
                            border: "1px solid var(--accent)",
                            borderRadius: 99,
                          }}
                        >
                          NEW
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

CADImportModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
