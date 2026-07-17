import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { DropdownButton, Modal, cadAPI, useAppStore } from "../globals";
// PDM / CAD Vault feature set: vault tree, check-in/out, CAD revision history,
// 3D viewer, drawing markup, CAD attribute extraction, bidirectional sync,
// drawing release workflow, watermarking.

// ============ PDM VAULT SCREEN ============
function PDMVaultScreen() {
  const ctx = useAppStore();
  const [selectedPath, setSelectedPath] = React.useState(
    "/ATLAS/Mainframe/CAD",
  );
  const [vaultStats, setVaultStats] = React.useState(null);

  // Load vault stats from API
  React.useEffect(() => {
    if (!cadAPI) {
      console.warn("Vault stats API unavailable, using defaults");
      return;
    }
    cadAPI
      .vaultStats()
      .then((result) => {
        if (result) setVaultStats(result);
      })
      .catch(() => console.warn("Vault stats API unavailable, using defaults"));
  }, []);

  // Per-folder file sets so clicking the tree actually changes contents
  const FILES_BY_PATH = {
    "/": [
      {
        name: "Workspace_archive.zip",
        ext: "ZIP",
        size: "412 MB",
        rev: "—",
        checked_out: null,
        modified: "2026-04-30",
        author: "System",
        state: "released",
        path: "/",
      },
    ],
    "/ATLAS": [
      {
        name: "ATLAS_master_BOM.xlsx",
        ext: "XLSX",
        size: "248 KB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
        path: "/ATLAS",
      },
      {
        name: "ATLAS_project_charter.PDF",
        ext: "PDF",
        size: "1.1 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-02-10",
        author: "E. Chen",
        state: "released",
        path: "/ATLAS",
      },
    ],
    "/ATLAS/Mainframe": [
      {
        name: "Mainframe_overview.PDF",
        ext: "PDF",
        size: "2.4 MB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
        path: "/ATLAS/Mainframe",
      },
    ],
    "/ATLAS/Mainframe/CAD": [
      {
        name: "ATL-MFR-A_v3.2.SLDASM",
        ext: "SLDASM",
        size: "8.4 MB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "ATL-MFR-CHS_v2.SLDPRT",
        ext: "SLDPRT",
        size: "1.2 MB",
        rev: "B",
        checked_out: "M. Park",
        modified: "2026-05-24",
        author: "M. Park",
        state: "wip",
      },
      {
        name: "ATL-MFR-PWR_v1.SLDPRT",
        ext: "SLDPRT",
        size: "924 KB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-09",
        author: "R. Sato",
        state: "released",
      },
      {
        name: "MEC-PL-040A.STEP",
        ext: "STEP",
        size: "612 KB",
        rev: "D",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "MEC-PL-040A_drawing.PDF",
        ext: "PDF",
        size: "184 KB",
        rev: "D",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "EL-PCB-MAIN-R3.zip",
        ext: "ZIP",
        size: "3.4 MB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-09",
        author: "R. Sato",
        state: "review",
      },
      {
        name: "Chassis_3D_v3.STEP",
        ext: "STEP",
        size: "8.7 MB",
        rev: "B",
        checked_out: "E. Chen",
        modified: "2026-05-25",
        author: "E. Chen",
        state: "wip",
      },
    ],
    "/ATLAS/Mainframe/Drawings": [
      {
        name: "MEC-PL-040A_drawing.PDF",
        ext: "PDF",
        size: "184 KB",
        rev: "D",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "MEC-PL-041A_drawing.PDF",
        ext: "PDF",
        size: "210 KB",
        rev: "B",
        checked_out: null,
        modified: "2026-05-09",
        author: "M. Park",
        state: "review",
      },
      {
        name: "Chassis_assembly.PDF",
        ext: "PDF",
        size: "892 KB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-12",
        author: "E. Chen",
        state: "draft",
      },
      {
        name: "Mainframe_exploded.PDF",
        ext: "PDF",
        size: "1.4 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-08",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "Schematic_main_R3.PDF",
        ext: "PDF",
        size: "640 KB",
        rev: "C",
        checked_out: null,
        modified: "2026-05-09",
        author: "R. Sato",
        state: "released",
      },
    ],
    "/ATLAS/Mainframe/Datasheets": [
      {
        name: "STM32H743_datasheet.PDF",
        ext: "PDF",
        size: "4.2 MB",
        rev: "B",
        checked_out: null,
        modified: "2026-05-12",
        author: "STMicro",
        state: "released",
      },
      {
        name: "MeanWell_PSU_240W.PDF",
        ext: "PDF",
        size: "1.8 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-04-22",
        author: "Mean Well",
        state: "released",
      },
      {
        name: "IMX477_specs.PDF",
        ext: "PDF",
        size: "2.1 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-04-28",
        author: "Sony",
        state: "released",
      },
      {
        name: "Daly_BMS_12S.PDF",
        ext: "PDF",
        size: "924 KB",
        rev: "C",
        checked_out: null,
        modified: "2026-04-15",
        author: "Daly",
        state: "released",
      },
    ],
    "/ATLAS/Mainframe/Tests": [
      {
        name: "Thermal_test_report.PDF",
        ext: "PDF",
        size: "892 KB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-07",
        author: "M. Park",
        state: "released",
      },
      {
        name: "EMC_compliance_results.PDF",
        ext: "PDF",
        size: "1.2 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-02",
        author: "Intertek",
        state: "released",
      },
      {
        name: "Burn_in_24h.xlsx",
        ext: "XLSX",
        size: "186 KB",
        rev: "—",
        checked_out: null,
        modified: "2026-04-30",
        author: "R. Sato",
        state: "released",
      },
    ],
    "/ATLAS/Eval": [
      {
        name: "ATL-EV-A_v1.SLDASM",
        ext: "SLDASM",
        size: "2.8 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-08",
        author: "R. Sato",
        state: "draft",
      },
      {
        name: "Eval_board_schematic.PDF",
        ext: "PDF",
        size: "412 KB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-08",
        author: "R. Sato",
        state: "draft",
      },
    ],
    "/HORIZON": [
      {
        name: "HORIZON_charter.PDF",
        ext: "PDF",
        size: "780 KB",
        rev: "A",
        checked_out: null,
        modified: "2026-04-12",
        author: "M. Park",
        state: "released",
      },
    ],
    "/HORIZON/Pod": [
      {
        name: "HZN-POD-A_v1.4.SLDASM",
        ext: "SLDASM",
        size: "4.2 MB",
        rev: "B",
        checked_out: null,
        modified: "2026-05-21",
        author: "M. Park",
        state: "review",
      },
      {
        name: "MEC-SHELL-A.STEP",
        ext: "STEP",
        size: "1.4 MB",
        rev: "B",
        checked_out: null,
        modified: "2026-05-18",
        author: "M. Park",
        state: "released",
      },
      {
        name: "Pod_drawing_pkg.zip",
        ext: "ZIP",
        size: "5.8 MB",
        rev: "A",
        checked_out: null,
        modified: "2026-05-19",
        author: "M. Park",
        state: "review",
      },
    ],
    "/_archive": [
      {
        name: "ATL-MFR-A_v2.0_LEGACY.SLDASM",
        ext: "SLDASM",
        size: "7.2 MB",
        rev: "Z",
        checked_out: null,
        modified: "2025-09-12",
        author: "E. Chen",
        state: "released",
      },
      {
        name: "Old_camera_module.STEP",
        ext: "STEP",
        size: "1.1 MB",
        rev: "D",
        checked_out: null,
        modified: "2025-08-04",
        author: "Archive",
        state: "released",
      },
    ],
  };

  const [filesByPath, setFilesByPath] = React.useState(FILES_BY_PATH);
  const files = filesByPath[selectedPath] || [];
  const [previewFile, setPreviewFile] = React.useState(null);

  const tree = [
    { path: "/", label: "Workspace", icon: <Icon.Folder size={14} /> },
    {
      path: "/ATLAS",
      label: "ATLAS",
      icon: <Icon.Folder size={14} />,
      indent: 1,
    },
    {
      path: "/ATLAS/Mainframe",
      label: "Mainframe",
      icon: <Icon.Folder size={14} />,
      indent: 2,
    },
    {
      path: "/ATLAS/Mainframe/CAD",
      label: "CAD",
      icon: <Icon.Folder size={14} />,
      indent: 3,
      count: FILES_BY_PATH["/ATLAS/Mainframe/CAD"].length,
    },
    {
      path: "/ATLAS/Mainframe/Drawings",
      label: "Drawings",
      icon: <Icon.Folder size={14} />,
      indent: 3,
      count: FILES_BY_PATH["/ATLAS/Mainframe/Drawings"].length,
    },
    {
      path: "/ATLAS/Mainframe/Datasheets",
      label: "Datasheets",
      icon: <Icon.Folder size={14} />,
      indent: 3,
      count: FILES_BY_PATH["/ATLAS/Mainframe/Datasheets"].length,
    },
    {
      path: "/ATLAS/Mainframe/Tests",
      label: "Test Reports",
      icon: <Icon.Folder size={14} />,
      indent: 3,
      count: FILES_BY_PATH["/ATLAS/Mainframe/Tests"].length,
    },
    {
      path: "/ATLAS/Eval",
      label: "Eval Board",
      icon: <Icon.Folder size={14} />,
      indent: 2,
      count: FILES_BY_PATH["/ATLAS/Eval"].length,
    },
    {
      path: "/HORIZON",
      label: "HORIZON",
      icon: <Icon.Folder size={14} />,
      indent: 1,
    },
    {
      path: "/HORIZON/Pod",
      label: "Sensor Pod",
      icon: <Icon.Folder size={14} />,
      indent: 2,
      count: FILES_BY_PATH["/HORIZON/Pod"].length,
    },
    {
      path: "/_archive",
      label: "Archive",
      icon: <Icon.Doc size={14} />,
      indent: 1,
      count: FILES_BY_PATH["/_archive"].length,
    },
  ];

  const toggleCheckout = (i) => {
    const f = files[i];
    const me = "E. Chen";
    if (f.checked_out === me) {
      const next = files.map((x, j) =>
        j === i ? { ...x, checked_out: null } : x,
      );
      setFilesByPath({ ...filesByPath, [selectedPath]: next });
      toast(
        (
          __t("pdm.checkedIn") || "Checked in {name} · others can now edit"
        ).replace("{name}", f.name),
        { kind: "success" },
      );
    } else if (f.checked_out) {
      toast(
        (
          __t("pdm.cannotCheckOut") || "Cannot check out — locked by {user}"
        ).replace("{user}", f.checked_out),
        { kind: "warn" },
      );
    } else {
      const next = files.map((x, j) =>
        j === i ? { ...x, checked_out: me } : x,
      );
      setFilesByPath({ ...filesByPath, [selectedPath]: next });
      toast(
        (
          __t("pdm.checkedOut") || "Checked out {name} · locked for your edits"
        ).replace("{name}", f.name),
        { kind: "success" },
      );
    }
  };

  return (
    <div className="screen-wrap flex h-100p min-h-0 overflow-h" className="p-0">
      {/* Tree sidebar */}
      <aside
        className="w-240 flex-shrink-0 bri-1 bg-elev oy-auto ox-hidden"
        style={{ padding: 14 }}
      >
        <div className="flex justify-between items-center mb-10">
          <div className="font-mono fs-10 uppercase letter-sp-6 fg-3">
            {__t("pdm.vault") || "Vault"}
          </div>
          <button
            className="icon-btn w-22 h-22"
            title={__t("pdm.newFolder") || "New folder"}
            aria-label={__t("pdm.newFolder") || "New folder"}
            onClick={() => toast(__t("pdm.newFolder") || "New folder")}
          >
            <Icon.Plus size={11} />
          </button>
        </div>
        {tree.map((n) => (
          <button
            key={n.path}
            onClick={() => setSelectedPath(n.path)}
            className="flex items-center w-100p text-left c-pointer transition-fast"
            style={{
              padding: `6px 8px 6px ${8 + (n.indent || 0) * 16}px`,
              background:
                selectedPath === n.path ? "var(--bg-sunk)" : "transparent",
              border: "1px solid transparent",
              borderRadius: "var(--r-2)",
              color: selectedPath === n.path ? "var(--fg)" : "var(--fg-2)",
              marginBottom: 2,
            }}
            onMouseOver={(e) => {
              if (selectedPath !== n.path)
                e.currentTarget.style.background = "var(--bg)";
            }}
            onMouseOut={(e) => {
              if (selectedPath !== n.path)
                e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                marginRight: 8,
                display: "flex",
                color:
                  selectedPath === n.path ? "var(--accent)" : "var(--fg-3)",
              }}
            >
              {n.icon}
            </span>
            <span className="flex-1 fs-12 fw-500">{n.label}</span>
            {n.count !== undefined && (
              <span className="font-mono fs-10 fg-4">{n.count}</span>
            )}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div
        className="flex-1 overflow-x-a min-w-0 min-h-0"
        style={{ padding: 20 }}
      >
        <div className="screen-header">
          <div>
            <h1>{__t("pdm.pdmVault") || "PDM Vault"}</h1>
            <div className="sub font-mono fg-3 fs-11">
              {selectedPath} · {files.length} {__t("pdm.files") || "files"} · 2{" "}
              {__t("pdm.checkedOutLower") || "checked out"}
            </div>
          </div>
          <div className="flex gap-8">
            <button className="btn" onClick={() => ctx?.openModal("cad-sync")}>
              <Icon.Import size={12} />{" "}
              {__t("pdm.syncFromCad") || "Sync from CAD"}
            </button>
            <button className="btn" onClick={() => ctx?.openModal("upload")}>
              <Icon.Plus size={12} /> {__t("pdm.upload") || "Upload"}
            </button>
            <button
              className="btn primary"
              onClick={() => ctx?.openModal("drawing-release")}
            >
              <Icon.Check size={12} />{" "}
              {__t("pdm.releaseDrawings") || "Release drawings"}
            </button>
          </div>
        </div>

        <div className="card">
          <table className="bom-table table-auto">
            <thead>
              <tr>
                <th className="pl-16">{__t("pdm.file") || "File"}</th>
                <th>{__t("pdm.rev") || "Rev"}</th>
                <th>{__t("pdm.size") || "Size"}</th>
                <th>{__t("pdm.checkedOutColumn") || "Checked out"}</th>
                <th>{__t("pdm.state") || "State"}</th>
                <th>{__t("pdm.modified") || "Modified"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr
                  key={f.name}
                  onClick={() => setPreviewFile(f)}
                  className="c-pointer"
                  style={{
                    background:
                      f.checked_out === "E. Chen"
                        ? "color-mix(in oklch, var(--accent) 6%, var(--bg))"
                        : undefined,
                  }}
                >
                  <td className="pl-16">
                    <div className="flex items-center gap-8">
                      <span
                        className="font-mono fs-9 br-2 letter-sp-6"
                        style={{
                          padding: "2px 5px",
                          background: "var(--fg)",
                          color: "var(--bg)",
                        }}
                      >
                        {f.ext}
                      </span>
                      <span className="font-mono fs-12 fw-500">{f.name}</span>
                      {f.checked_out && (
                        <span
                          title={(
                            __t("pdm.lockedBy") || "Locked by {user}"
                          ).replace("{user}", f.checked_out)}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--warn)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 2,
                            background:
                              "color-mix(in oklch, var(--warn) 14%, var(--bg))",
                            padding: "1px 5px",
                            borderRadius: 3,
                            border:
                              "1px solid color-mix(in oklch, var(--warn) 30%, transparent)",
                          }}
                        >
                          <Icon.X size={9} /> {__t("pdm.locked") || "LOCKED"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="mono">{f.rev}</td>
                  <td className="mono fg-3">{f.size}</td>
                  <td>
                    {f.checked_out ? (
                      <span
                        className="font-mono fs-11"
                        style={{
                          color:
                            f.checked_out === "E. Chen"
                              ? "var(--accent-text)"
                              : "var(--warn)",
                        }}
                      >
                        {f.checked_out}
                        {f.checked_out === "E. Chen" &&
                          " " + (__t("pdm.you") || "(you)")}
                      </span>
                    ) : (
                      <span className="fg-4 font-mono fs-11">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        "status " +
                        (f.state === "released"
                          ? "released"
                          : f.state === "review"
                            ? "review"
                            : "draft")
                      }
                    >
                      {f.state.toUpperCase()}
                    </span>
                  </td>
                  <td className="mono fg-3 fs-9">
                    {f.modified}
                    <div>{f.author}</div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className="inline-flex gap-2">
                      <button
                        className="icon-btn w-22 h-22"
                        onClick={() => toggleCheckout(i)}
                        title={
                          f.checked_out === "E. Chen"
                            ? __t("pdm.checkIn") || "Check in"
                            : __t("pdm.checkOut") || "Check out"
                        }
                        aria-label={
                          f.checked_out === "E. Chen"
                            ? __t("pdm.checkIn") || "Check in"
                            : __t("pdm.checkOut") || "Check out"
                        }
                      >
                        {f.checked_out === "E. Chen" ? (
                          <Icon.Check size={11} />
                        ) : (
                          <Icon.X size={11} />
                        )}
                      </button>
                      <DropdownButton
                        width={180}
                        trigger={
                          <button
                            className="icon-btn w-22 h-22"
                            aria-label={
                              __t("pdm.moreOptions") || "More options"
                            }
                          >
                            <Icon.Dots size={11} />
                          </button>
                        }
                        items={[
                          {
                            icon: <Icon.Chevron size={11} />,
                            label:
                              __t("pdm.previewView3d") || "Preview / View 3D",
                            onClick: () => setPreviewFile(f),
                          },
                          {
                            icon: <Icon.Diff size={11} />,
                            label:
                              __t("pdm.revisionHistory") || "Revision history",
                            onClick: () => ctx?.openModal("cad-revisions", f),
                          },
                          {
                            icon: <Icon.Search size={11} />,
                            label:
                              __t("pdm.whereUsedInCad") || "Where used in CAD",
                            onClick: () => ctx?.openModal("cad-where-used", f),
                          },
                          {
                            icon: <Icon.Edit size={11} />,
                            label: __t("pdm.markupDrawing") || "Markup drawing",
                            onClick: () => ctx?.openModal("cad-markup", f),
                          },
                          {
                            icon: <Icon.Export size={11} />,
                            label: __t("pdm.download") || "Download",
                            onClick: () =>
                              toast(
                                (
                                  __t("pdm.downloadedToast") ||
                                  "Downloaded {name}"
                                ).replace("{name}", f.name),
                                { kind: "success" },
                              ),
                          },
                          "divider",
                          {
                            icon: <Icon.Sparkles size={11} />,
                            label:
                              __t("pdm.extractAttributes") ||
                              "Extract attributes",
                            onClick: () => ctx?.openModal("cad-attrs", f),
                          },
                        ]}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stats */}
        <div
          className="mt-14 d-grid gap-10"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {[
            {
              l: __t("pdm.totalFiles") || "Total files",
              v: vaultStats?.totalFiles || 182,
            },
            {
              l: __t("pdm.checkedOutColumn") || "Checked out",
              v: vaultStats?.checkedOut || 2,
            },
            {
              l: __t("pdm.pendingReview") || "Pending review",
              v: vaultStats?.pendingReview || 1,
            },
            {
              l: __t("pdm.vaultSize") || "Vault size",
              v: vaultStats?.vaultSize || "412 MB",
            },
          ].map((k) => (
            <div key={k.l} className="kpi">
              <div className="l">{k.l}</div>
              <div className="v">{k.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview panel */}
      {previewFile && (
        <div
          className="flex-shrink-0 flex flex-col min-h-0"
          style={{ width: 460 }}
        >
          <CADPreview file={previewFile} onClose={() => setPreviewFile(null)} />
        </div>
      )}
    </div>
  );
}

// ============ CAD 3D PREVIEW (faux 3D using SVG) ============
function CADPreview({ file, onClose }) {
  const [rot, setRot] = React.useState({ x: -15, y: 25, z: 0 });
  const [zoom, setZoom] = React.useState(1);
  const dragRef = React.useRef(null);
  const dragging = React.useRef(false);
  const last = React.useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({
      ...r,
      y: r.y + dx * 0.5,
      x: Math.max(-89, Math.min(89, r.x - dy * 0.5)),
    }));
  };
  const onMouseUp = () => {
    dragging.current = false;
  };
  React.useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // 3D-ish wireframe box rendered using CSS transforms
  return (
    <div className="flex-1 bl-1 bg-elev flex flex-col min-h-0 overflow-h">
      <div
        className="border-bottom flex justify-between items-center"
        style={{ padding: 12 }}
      >
        <div>
          <div className="fw-600 fs-13">{file.name}</div>
          <div className="font-mono fs-10 fg-3">
            {file.ext} · Rev {file.rev} · {file.size}
          </div>
        </div>
        <button
          className="icon-btn w-26 h-26"
          aria-label={__t("common.close") || "Close"}
          onClick={onClose}
        >
          <Icon.X size={12} />
        </button>
      </div>

      <div
        className="flex-1 bg-sunk flex items-center justify-center pos-relative overflow-h"
        style={{
          padding: 20,
          cursor: dragging.current ? "grabbing" : "grab",
          perspective: 1000,
        }}
        onMouseDown={onMouseDown}
      >
        <div
          ref={dragRef}
          style={{
            width: 200 * zoom,
            height: 140 * zoom,
            position: "relative",
            transformStyle: "preserve-3d",
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(${rot.z}deg)`,
            transition: dragging.current ? "none" : "transform 0.1s",
          }}
        >
          {/* 6 faces of a box */}
          {[
            { t: "translateZ(70px)", c: "oklch(0.7 0.06 60)" },
            {
              t: "translateZ(-70px) rotateY(180deg)",
              c: "oklch(0.55 0.06 60)",
            },
            { t: "translateX(100px) rotateY(90deg)", c: "oklch(0.65 0.06 60)" },
            {
              t: "translateX(-100px) rotateY(-90deg)",
              c: "oklch(0.6 0.06 60)",
            },
            { t: "translateY(-70px) rotateX(90deg)", c: "oklch(0.75 0.06 60)" },
            { t: "translateY(70px) rotateX(-90deg)", c: "oklch(0.5 0.06 60)" },
          ].map((f) => (
            <div
              key={f.t}
              className="pos-absolute"
              style={{
                inset: 0,
                background: f.c,
                border: "1.5px solid #1a1a1a",
                transform: f.t,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
        {/* Tri-axis indicator */}
        <div
          className="pos-absolute font-mono fs-10 fg-3"
          style={{ bottom: 10, left: 10 }}
        >
          <div>X: {rot.x.toFixed(0)}°</div>
          <div>Y: {rot.y.toFixed(0)}°</div>
          <div>Z: {rot.z.toFixed(0)}°</div>
        </div>
        <div className="pos-absolute flex gap-4" style={{ top: 10, right: 10 }}>
          <button
            className="icon-btn w-26 h-26"
            aria-label={__t("pdm.zoomIn") || "Zoom in"}
            onClick={() => setZoom((z) => Math.min(2, z * 1.2))}
          >
            +
          </button>
          <button
            className="icon-btn w-26 h-26"
            aria-label={__t("pdm.zoomOut") || "Zoom out"}
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
          >
            −
          </button>
          <button
            className="icon-btn w-26 h-26"
            aria-label={__t("pdm.resetView") || "Reset view"}
            onClick={() => {
              setRot({ x: -15, y: 25, z: 0 });
              setZoom(1);
            }}
          >
            ⟲
          </button>
        </div>
      </div>

      <div className="font-mono fs-10 fg-3 border-top" style={{ padding: 12 }}>
        {__t("pdm.viewerHelp") ||
          "Drag to rotate · Scroll to zoom · Auto-extracted: 120×80×12mm, 89g, Aluminum 6061-T6"}
      </div>
    </div>
  );
}
CADPreview.propTypes = {
  file: PropTypes.any,
  onClose: PropTypes.func,
};

// ============ CAD REVISION HISTORY ============
function CADRevisionsModal({ open, onClose, file }) {
  if (!open || !file) return null;
  const revs = [
    {
      rev: "C",
      date: "2026-05-12",
      author: "E. Chen",
      note: "Vented top plate cutout sized for 92mm fan",
      size: file.size,
      current: file.rev === "C",
    },
    {
      rev: "B",
      date: "2026-04-22",
      author: "M. Park",
      note: "Wall thickness 2mm → 2.5mm for stiffness",
      size: "8.1 MB",
      current: file.rev === "B",
    },
    {
      rev: "A",
      date: "2026-03-08",
      author: "E. Chen",
      note: "Initial release",
      size: "7.8 MB",
      current: file.rev === "A",
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={(
        __t("pdm.revisionHistoryTitle") || "Revision history · {name}"
      ).replace("{name}", file.name)}
      subtitle={(
        __t("pdm.revisionsTracked") || "{count} revisions tracked"
      ).replace("{count}", revs.length)}
      wide
    >
      <div className="relative pl-24">
        <div
          className="pos-absolute w-1"
          style={{ left: 9, top: 4, bottom: 4, background: "var(--line)" }}
        />
        {revs.map((r, i) => (
          <div
            key={r.rev}
            className="pos-relative mb-16 rounded-r2"
            style={{
              padding: 14,
              background: r.current ? "var(--accent-soft)" : "var(--bg)",
              border:
                "1px solid " + (r.current ? "var(--accent)" : "var(--line)"),
            }}
          >
            <div
              className="pos-absolute"
              style={{
                left: -19,
                top: 16,
                width: 12,
                height: 12,
                borderRadius: 99,
                background: r.current ? "var(--accent)" : "var(--bg)",
                border:
                  "2px solid " + (r.current ? "var(--accent)" : "var(--fg-3)"),
              }}
            />
            <div className="flex justify-between items-baseline mb-6">
              <div className="flex gap-8 items-baseline">
                <span className="font-mono fw-700 fs-14">
                  {__t("pdm.revLabel") || "Rev"} {r.rev}
                </span>
                {r.current && (
                  <span className="tag-pill bg-accent border-color-accent fg-white">
                    {__t("pdm.currentBadge") || "CURRENT"}
                  </span>
                )}
              </div>
              <span className="font-mono fs-10 fg-3">
                {r.date} · {r.author} · {r.size}
              </span>
            </div>
            <div className="fs-12 fg-2 mb-8">{r.note}</div>
            <div className="flex gap-6">
              <button
                className="btn small"
                onClick={() => {
                  toast(
                    (
                      __t("pdm.downloadNotAvailable") ||
                      "Download Rev {rev} not available — fetch from server"
                    ).replace("{rev}", r.rev),
                    { kind: "info" },
                  );
                }}
              >
                <Icon.Export size={11} /> {__t("pdm.download") || "Download"}
              </button>
              <button
                className="btn small"
                onClick={() =>
                  toast(
                    (
                      __t("pdm.revCompare") ||
                      "Diff view — Rev {rev} vs current. Compare BOM and CAD."
                    ).replace("{rev}", r.rev),
                    {
                      kind: "info",
                      action: {
                        label: __t("pdm.openDiff") || "Open diff",
                        onClick: () => window.__nav?.("diff"),
                      },
                    },
                  )
                }
              >
                <Icon.Diff size={11} /> {__t("pdm.compare") || "Compare"}
              </button>
              {!r.current && (
                <button
                  className="btn small"
                  onClick={() => {
                    onClose();
                    toast(
                      (
                        __t("pdm.restoredRev") ||
                        "Restored Rev {rev} as current. Rollback logged."
                      ).replace("{rev}", r.rev),
                      { kind: "warn" },
                    );
                  }}
                >
                  {__t("pdm.restoreAsCurrent") || "Restore as current"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
CADRevisionsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  file: PropTypes.any,
};

// ============ CAD WHERE-USED ============
function CADWhereUsedModal({ open, onClose, file }) {
  if (!open || !file) return null;
  const refs = [
    {
      project: "ATLAS / Mainframe",
      path: "/CAD/ATL-MFR-A_v3.2.SLDASM",
      instances: 2,
      status: "Released",
    },
    {
      project: "ATLAS / Mainframe",
      path: "/CAD/Service spares/SVC-001.SLDASM",
      instances: 4,
      status: "Released",
    },
    {
      project: "ATLAS-LITE / Eval",
      path: "/CAD/ATL-EV-A_v1.SLDASM",
      instances: 1,
      status: "Draft",
    },
    {
      project: "HORIZON / Sensor Pod",
      path: "/CAD/HZN-POD-A_v1.4.SLDASM",
      instances: 0,
      status: "Archived",
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title={(__t("pdm.whereUsedTitle") || "Where used · {name}").replace(
        "{name}",
        file.name,
      )}
      subtitle={(
        __t("pdm.referencedBy") || "Referenced by {count} active assemblies"
      ).replace("{count}", refs.filter((r) => r.instances > 0).length)}
    >
      {refs.map((r) => (
        <div
          key={r.path}
          className="border-line rounded-r2 mb-6"
          style={{ padding: 10, opacity: r.instances === 0 ? 0.5 : 1 }}
        >
          <div className="flex justify-between items-baseline">
            <div>
              <div className="fw-600 fs-12">{r.project}</div>
              <div className="font-mono fs-10 fg-3">{r.path}</div>
            </div>
            <div className="text-right">
              <div className="font-mono fs-12 fw-700">×{r.instances}</div>
              <div className="font-mono fs-9 fg-3">{r.status}</div>
            </div>
          </div>
        </div>
      ))}
    </Modal>
  );
}
CADWhereUsedModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  file: PropTypes.any,
};

// ============ DRAWING MARKUP ============
function CADMarkupModal({ open, onClose, file }) {
  const [tool, setTool] = React.useState("rect");
  const [marks, setMarks] = React.useState([]);
  const [pendingText, setPendingText] = React.useState(null);
  const [textValue, setTextValue] = React.useState("");
  const svgRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setMarks([]);
      setPendingText(null);
      setTextValue("");
    }
  }, [open]);
  if (!open || !file) return null;

  const onClick = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (tool === "rect")
      setMarks([
        ...marks,
        {
          type: "rect",
          x: x - 30,
          y: y - 20,
          w: 60,
          h: 40,
          color: "var(--danger)",
          id: Date.now(),
        },
      ]);
    else if (tool === "text") {
      setPendingText({ x, y });
      setTextValue(__t("pdm.checkTolerance") || "Check tolerance");
    } else if (tool === "arrow")
      setMarks([
        ...marks,
        {
          type: "arrow",
          x: x - 60,
          y: y - 30,
          x2: x,
          y2: y,
          color: "var(--danger)",
          id: Date.now(),
        },
      ]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Edit size={16} />}
      title={(__t("pdm.markupTitle") || "Markup · {name}").replace(
        "{name}",
        file.name,
      )}
      subtitle={(
        __t("pdm.markupSubtitle") ||
        "{count} annotations · click drawing to add"
      ).replace("{count}", marks.length)}
      wide
      footer={
        <>
          <button className="btn" onClick={() => setMarks([])}>
            {__t("bomShell.clearAll") || "Clear all"}
          </button>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(
                (
                  __t("pdm.markupSaved") || "Saved {count} markup annotations"
                ).replace("{count}", marks.length),
                { kind: "success" },
              );
            }}
          >
            <Icon.Check size={12} />{" "}
            {(__t("pdm.saveMarkup") || "Save markup ({count})").replace(
              "{count}",
              marks.length,
            )}
          </button>
        </>
      }
    >
      <div className="flex gap-6 mb-10">
        {[
          ["rect", __t("pdm.toolBox") || "□ Box"],
          ["text", __t("pdm.toolText") || "T Text"],
          ["arrow", __t("pdm.toolArrow") || "→ Arrow"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={"btn small " + (tool === k ? "primary" : "")}
            onClick={() => setTool(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 600 360"
        onClick={onClick}
        className="w-100p h-400 border-line rounded-r2 bg-white"
      >
        {/* Background drawing */}
        {Array.from({ length: 31 }).map((_, i) => (
          <line
            key={"v" + i}
            x1={i * 20}
            x2={i * 20}
            y1={0}
            y2={360}
            stroke="#eee"
            strokeWidth="0.5"
          />
        ))}
        {Array.from({ length: 19 }).map((_, i) => (
          <line
            key={"h" + i}
            x1={0}
            x2={600}
            y1={i * 20}
            y2={360}
            stroke="#eee"
            strokeWidth="0.5"
          />
        ))}
        <rect
          x="100"
          y="100"
          width="400"
          height="160"
          stroke="#1a1a1a"
          strokeWidth="2"
          fill="none"
        />
        <circle
          cx="140"
          cy="140"
          r="8"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          fill="none"
        />
        <circle
          cx="460"
          cy="140"
          r="8"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          fill="none"
        />
        <circle
          cx="140"
          cy="220"
          r="8"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          fill="none"
        />
        <circle
          cx="460"
          cy="220"
          r="8"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          fill="none"
        />
        <text
          x="300"
          y="80"
          textAnchor="middle"
          fontSize="12"
          fontFamily="monospace"
        >
          MEC-PL-040A · Side Panel · Rev D
        </text>
        {marks.map((m) => {
          if (m.type === "rect")
            return (
              <rect
                key={m.id}
                x={m.x}
                y={m.y}
                width={m.w}
                height={m.h}
                stroke={m.color}
                strokeWidth="2"
                fill="rgba(232, 93, 31, 0.1)"
              />
            );
          if (m.type === "text")
            return (
              <text
                key={m.id}
                x={m.x}
                y={m.y}
                fill={m.color}
                fontSize="14"
                fontFamily="sans-serif"
                fontWeight="600"
              >
                {m.text}
              </text>
            );
          if (m.type === "arrow")
            return (
              <g key={m.id}>
                <line
                  x1={m.x}
                  y1={m.y}
                  x2={m.x2}
                  y2={m.y2}
                  stroke={m.color}
                  strokeWidth="2"
                />
                <polygon
                  points={`${m.x2},${m.y2} ${m.x2 - 8},${m.y2 - 4} ${m.x2 - 8},${m.y2 + 4}`}
                  fill={m.color}
                />
              </g>
            );
          return null;
        })}
      </svg>
      {pendingText && (
        <div className="flex gap-4 items-center mt-8">
          <input
            autoFocus
            className="twk-field flex-1"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textValue.trim()) {
                setMarks([
                  ...marks,
                  {
                    type: "text",
                    x: pendingText.x,
                    y: pendingText.y,
                    text: textValue,
                    color: "var(--danger)",
                    id: Date.now(),
                  },
                ]);
                setPendingText(null);
                setTextValue("");
              }
            }}
            placeholder={__t("pdm.enterMarkupText") || "Enter markup text..."}
          />
          <button
            className="btn small primary"
            onClick={() => {
              if (textValue.trim()) {
                setMarks([
                  ...marks,
                  {
                    type: "text",
                    x: pendingText.x,
                    y: pendingText.y,
                    text: textValue,
                    color: "var(--danger)",
                    id: Date.now(),
                  },
                ]);
                setPendingText(null);
                setTextValue("");
              }
            }}
          >
            {__t("common.add") || "Add"}
          </button>
          <button
            className="btn small"
            onClick={() => {
              setPendingText(null);
              setTextValue("");
            }}
          >
            {__t("common.cancel") || "Cancel"}
          </button>
        </div>
      )}
    </Modal>
  );
}
CADMarkupModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  file: PropTypes.any,
};

// ============ CAD ATTRIBUTE EXTRACTION ============
function CADAttrsModal({ open, onClose, file }) {
  const [extracting, setExtracting] = React.useState(false);
  const [attrs, setAttrs] = React.useState(null);
  React.useEffect(() => {
    if (open) {
      setExtracting(true);
      setAttrs(null);
      // Try API first, fall back to mock
      cadAPI
        ?.extractAttrs({
          filePath: file?.name || "",
          fileType: file?.ext || "SLDPRT",
        })
        .then((result) => {
          if (result && result.material) {
            setAttrs({
              material: result.material,
              density: result.density,
              mass: result.mass,
              volume: result.volume,
              bounding_box: result.boundingBox,
              surface_area: result.surfaceArea,
              center_of_mass: result.centerOfMass,
              file_format: result.fileFormat,
              sw_version: result.cadVersion,
              custom: result.customProperties || {},
            });
          } else {
            setAttrs({
              material: "Aluminum 6061-T6",
              density: "2.70 g/cm\u00B3",
              mass: "89.4 g",
              volume: "33.1 cm\u00B3",
              bounding_box: "120 \u00D7 80 \u00D7 12 mm",
              surface_area: "264 cm\u00B2",
              center_of_mass: "(60.0, 40.0, 6.0) mm",
              file_format: file?.ext + " (ASCII)",
              sw_version: "SolidWorks 2026 SP2",
              custom: {
                Part_Number: "MEC-PL-040A",
                Revision: file?.rev || "D",
                Vendor: "Protolabs",
                Finish: "Type II Anodized, Black",
              },
            });
          }
          setExtracting(false);
        })
        .catch(() => {
          console.error("CAD attribute extraction failed");
          toast(__t("common.error") || "Extraction failed", { kind: "error" });
          setExtracting(false);
        });
    }
  }, [open]);
  if (!open || !file) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Sparkles size={16} />}
      title={(
        __t("pdm.extractAttributesTitle") || "Extract attributes · {name}"
      ).replace("{name}", file.name)}
      subtitle={__t("pdm.autoParsedFromCad") || "Auto-parsed from CAD metadata"}
      footer={
        attrs && (
          <>
            <button className="btn" onClick={onClose}>
              {__t("common.close") || "Close"}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                onClose();
                toast(
                  __t("pdm.attributesSynced") ||
                    "Attributes synced to part record",
                  { kind: "success" },
                );
              }}
            >
              <Icon.Check size={12} /> {__t("pdm.syncToPart") || "Sync to part"}
            </button>
          </>
        )
      }
    >
      {extracting && (
        <div style={{ padding: 40 }}>
          <span className="spinner text-center" />{" "}
          {(
            __t("pdm.parsingMetadata") || "Parsing {ext} metadata\u2026"
          ).replace("{ext}", file.ext)}
        </div>
      )}
      {attrs && (
        <>
          <div className="font-mono fs-10 fg-3 uppercase letter-sp-6 mb-8">
            {__t("pdm.geometricProperties") || "Geometric properties"}
          </div>
          <dl
            className="d-grid fs-12"
            style={{
              gridTemplateColumns: "140px 1fr",
              gap: "6px 14px",
              margin: "0 0 18px",
            }}
          >
            {Object.entries(attrs)
              .filter(([k]) => k !== "custom")
              .map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="font-mono fs-10 uppercase letter-sp-4 fg-3">
                    {k.replace(/_/g, " ")}
                  </dt>
                  <dd className="font-mono" className="m-0">
                    {v}
                  </dd>
                </React.Fragment>
              ))}
          </dl>
          <div className="font-mono fs-10 fg-3 uppercase letter-sp-6 mb-8">
            {__t("pdm.customPropertiesSw") || "Custom properties (SW)"}
          </div>
          <dl
            className="d-grid fs-12"
            style={{
              gridTemplateColumns: "140px 1fr",
              gap: "6px 14px",
              margin: 0,
            }}
          >
            {Object.entries(attrs.custom).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="font-mono fs-10 uppercase letter-sp-4 fg-3">
                  {k.replace(/_/g, " ")}
                </dt>
                <dd className="font-mono" className="m-0">
                  {v}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}
    </Modal>
  );
}
CADAttrsModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  file: PropTypes.any,
};

// ============ BIDIRECTIONAL CAD SYNC ============
function CADSyncModal({ open, onClose }) {
  if (!open) return null;
  const [diffs, setDiffs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [synced, setSynced] = React.useState(false);

  React.useEffect(() => {
    if (open && !synced) {
      setLoading(true);
      cadAPI
        ?.sync()
        .then((result) => {
          if (result && result.diffs) setDiffs(result.diffs);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          toast(__t("pdm.cadSyncFailed") || "CAD sync failed", {
            kind: "error",
          });
        });
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={__t("pdm.bidirectionalSync") || "Bidirectional CAD ↔ BOM sync"}
      subtitle={
        loading
          ? __t("pdm.comparingCadBom") || "Comparing CAD and BOM..."
          : (
              __t("pdm.changesDetected") ||
              "{count} changes detected · review and apply each direction"
            ).replace("{count}", diffs.length)
      }
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            disabled={loading || synced}
            onClick={() => {
              setSynced(true);
              onClose();
              toast(
                (
                  __t("pdm.syncComplete") ||
                  "Sync complete · {count} changes applied · audit logged"
                ).replace("{count}", diffs.length),
                { kind: "success" },
              );
            }}
          >
            <Icon.Check size={12} />{" "}
            {__t("pdm.applyAllChanges") || "Apply all changes"}
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ padding: 40 }}>
          <span className="spinner text-center" />{" "}
          {__t("pdm.comparingCadBomData") || "Comparing CAD and BOM data..."}
        </div>
      ) : (
        <>
          <div
            className="d-grid gap-12 mb-14 font-mono fs-10 uppercase letter-sp-8 fg-3"
            style={{ gridTemplateColumns: "1fr 100px 1fr" }}
          >
            <div className="text-center">
              {__t("pdm.solidworks") || "SolidWorks"}
            </div>
            <div className="text-center">
              {__t("pdm.direction") || "Direction"}
            </div>
            <div className="text-center">{__t("pdm.bomLabel") || "BOM"}</div>
          </div>
          {diffs.map((d, i) => (
            <div
              key={d.pn + "-" + i}
              className="d-grid gap-12 border-line rounded-r2 mb-6 items-center"
              style={{ gridTemplateColumns: "1fr 100px 1fr", padding: 12 }}
            >
              <div
                className="text-right"
                style={{ opacity: d.direction === "pull" ? 1 : 0.4 }}
              >
                <div className="fw-600 fs-12">{d.pn}</div>
                {d.direction === "pull" && (
                  <div className="font-mono fs-10 fg-accent">{d.change}</div>
                )}
              </div>
              <div className="text-center fg-accent font-mono fs-14 fw-700">
                {d.direction === "pull"
                  ? "\u2192 " + (__t("pdm.pull") || "pull")
                  : "\u2190 " + (__t("pdm.push") || "push")}
              </div>
              <div style={{ opacity: d.direction === "push" ? 1 : 0.4 }}>
                <div className="fw-600 fs-12">{d.pn}</div>
                {d.direction === "push" && (
                  <div className="font-mono fs-10 fg-accent">{d.change}</div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
CADSyncModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

// ============ DRAWING RELEASE WORKFLOW ============
function DrawingReleaseModal({ open, onClose }) {
  if (!open) return null;
  const drawings = [
    {
      name: "MEC-PL-040A_drawing.PDF",
      rev: "D",
      state: "approved",
      reviewer: "M. Park",
      date: "2026-05-12",
      watermark: "RELEASED",
    },
    {
      name: "MEC-PL-041A_drawing.PDF",
      rev: "B",
      state: "review",
      reviewer: "—",
      date: "—",
      watermark: "FOR APPROVAL",
    },
    {
      name: "Chassis_assembly.PDF",
      rev: "C",
      state: "draft",
      reviewer: "—",
      date: "—",
      watermark: "DRAFT — NOT FOR PRODUCTION",
    },
    {
      name: "Mainframe_exploded.PDF",
      rev: "A",
      state: "approved",
      reviewer: "E. Chen",
      date: "2026-05-08",
      watermark: "RELEASED",
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Check size={16} />}
      title={__t("pdm.drawingReleaseWorkflow") || "Drawing Release Workflow"}
      subtitle={
        __t("pdm.separateSignoff") ||
        "Separate sign-off for drawings before production"
      }
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onClose();
              toast(
                __t("pdm.drawingsReleased") ||
                  "Approved drawings released · PDFs watermarked · audit logged",
                { kind: "success" },
              );
            }}
          >
            <Icon.Check size={12} />{" "}
            {__t("pdm.releaseApprovedDrawings") || "Release approved drawings"}
          </button>
        </>
      }
    >
      <div className="card overflow-vis">
        <table className="bom-table table-auto">
          <thead>
            <tr>
              <th className="pl-16">{__t("pdm.drawing") || "Drawing"}</th>
              <th>{__t("pdm.rev") || "Rev"}</th>
              <th>{__t("pdm.state") || "State"}</th>
              <th>{__t("pdm.watermark") || "Watermark"}</th>
              <th>{__t("pdm.reviewer") || "Reviewer"}</th>
              <th>{__t("pdm.date") || "Date"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drawings.map((d) => (
              <tr key={d.name}>
                <td className="mono pl-16 fw-500">{d.name}</td>
                <td className="mono">{d.rev}</td>
                <td>
                  <span
                    className={
                      "status " +
                      (d.state === "approved"
                        ? "released"
                        : d.state === "review"
                          ? "review"
                          : "draft")
                    }
                  >
                    {d.state}
                  </span>
                </td>
                <td>
                  <span
                    className="font-mono fs-10 br-2"
                    style={{
                      padding: "2px 6px",
                      background:
                        d.state === "approved"
                          ? "var(--ok)"
                          : d.state === "review"
                            ? "var(--warn)"
                            : "var(--fg-3)",
                      color: "white",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {d.watermark}
                  </span>
                </td>
                <td className="mono fg-3">{d.reviewer}</td>
                <td className="mono fg-3">{d.date}</td>
                <td>
                  <button
                    className="btn small"
                    onClick={() =>
                      toast(
                        (
                          __t("pdm.previewToast") ||
                          "Preview: {name} [{watermark}]"
                        )
                          .replace("{name}", d.name)
                          .replace("{watermark}", d.watermark),
                        { kind: "info" },
                      )
                    }
                  >
                    {__t("pdm.previewBtn") || "Preview"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mt-12 bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
        style={{ padding: 10 }}
      >
        {__t("pdm.releasedInfo") ||
          "\uD83D\uDCA1 Released drawings are watermarked, locked from edit, and immutable. Reissuing creates a new revision."}
      </div>
    </Modal>
  );
}
DrawingReleaseModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};

Object.assign(window, {
  PDMVaultScreen,
  CADRevisionsModal,
  CADWhereUsedModal,
  CADMarkupModal,
  CADAttrsModal,
  CADSyncModal,
  DrawingReleaseModal,
});
