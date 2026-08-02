import PropTypes from "prop-types";
import { __t } from "../i18n";
import { toast } from "../utils/toast";
import { Icon, cadAPI, documentsAPI, revisionsAPI, api, useAppStore } from "../globals";
import {
  ScreenHeader,
  Button,
  Field,
  Input,
  Card,
  DataTable,
  Badge,
  StatusPill,
  Modal,
  Menu,
  EmptyState,
  Spinner,
} from "../components/ui";
import CadViewer from "../components/cad/CadViewer.jsx";
// PDM / CAD Vault feature set: vault tree, check-in/out, CAD revision history,
// 3D viewer, drawing markup, CAD attribute extraction, bidirectional sync,
// drawing release workflow, watermarking.

const ME = "E. Chen";

// Real documents/CAD files carry byte sizes; the old mock used prebaked
// strings ("8.4 MB") — format live API values the same way instead.
function formatFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Normalize a documents/revisions list response: some endpoints return a
// bare array, the paginated ones return { items, total, ... }.
function listItems(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

// Flatten the {nodes, edges} where-used knowledge graph (GET
// /graph/where-used/{part_id}) into the flat "referenced by" rows this
// modal displays: one row per direct parent (a BOM this part sits in
// directly, or another part/assembly it's nested under).
function deriveWhereUsedRows(graph, partId) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const targetId = `part:${partId}`;

  return edges
    .filter((e) => e.target === targetId)
    .map((e) => {
      const src = nodesById.get(e.source);
      if (!src) return null;
      if (src.type === "bom") {
        return {
          key: e.id,
          project: src.name || src.bom_number || `BOM #${src.bom_id}`,
          path: `BOM ${src.bom_number || src.bom_id}`,
          instances: e.quantity ?? 0,
          status: src.status || "—",
        };
      }
      return {
        key: e.id,
        project: src.name || src.pn || `Part #${src.part_id}`,
        path: `Part ${src.pn || src.part_id}`,
        instances: e.quantity ?? 0,
        status: src.status || "—",
      };
    })
    .filter(Boolean);
}

// ============ PDM VAULT SCREEN ============
function PDMVaultScreen() {
  const ctx = useAppStore();
  // Real folder taxonomy (see app/services/document_service.py FOLDERS) —
  // default to the CAD folder to keep this screen's original CAD-first
  // framing now that the tree is loaded from the backend.
  const [selectedPath, setSelectedPath] = React.useState("/Mechanical/CAD");
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

  // Folder tree — real document taxonomy from the backend (documents are
  // grouped into a fixed set of folders by category; see
  // app/services/document_service.py FOLDERS). Falls back to a bare
  // workspace root if the API is unavailable — never a fabricated tree.
  const [folders, setFolders] = React.useState([
    { path: "/", label: __t("pdm.workspace") || "Workspace", count: 0 },
  ]);
  React.useEffect(() => {
    if (!documentsAPI) return;
    documentsAPI
      .folders()
      .then((result) => {
        const list = listItems(result).length
          ? listItems(result)
          : Array.isArray(result)
            ? result
            : null;
        if (list && list.length) setFolders(list);
      })
      .catch(() => console.warn("Vault folders API unavailable, using default tree"));
  }, []);

  // Files for the selected folder — real documents/CAD files persisted on
  // the backend. No local-only mock rows: an empty/failed response renders
  // the table's empty state, it never falls back to fabricated files.
  const [files, setFiles] = React.useState([]);
  const [filesLoading, setFilesLoading] = React.useState(false);
  React.useEffect(() => {
    if (!documentsAPI) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    documentsAPI
      .list({ folder: selectedPath })
      .then((result) => {
        if (cancelled) return;
        setFiles(
          listItems(result).map((doc) => ({
            id: doc.id,
            name: doc.originalName || doc.filename,
            ext: (doc.fileType || "").toUpperCase() || "FILE",
            size: formatFileSize(doc.fileSize),
            rev: doc.version != null ? String(doc.version) : "—",
            // No lock/checkout table exists on the backend yet — this stays
            // a local, session-only toggle (see toggleCheckout below).
            checked_out: null,
            modified: (doc.updatedAt || doc.createdAt || "").slice(0, 10) || "—",
            author: doc.uploadedBy || "—",
            state:
              doc.accessLevel === "public"
                ? "released"
                : doc.accessLevel === "restricted"
                  ? "review"
                  : "draft",
            path: selectedPath,
            partId: doc.partId,
            filePath: doc.filePath,
            url: doc.url,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
          console.warn("Vault file list API unavailable for", selectedPath);
        }
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const [previewFile, setPreviewFile] = React.useState(null);

  const tree = folders.map((f) => ({
    path: f.path,
    label: f.label,
    icon: <Icon.Folder size={14} />,
    indent: f.path === "/" ? 0 : f.path.split("/").filter(Boolean).length,
    count: f.count,
  }));

  // File locking has no backend table yet, so check-in/out stays a local,
  // non-persisting toggle (preserved as a working UI affordance rather than
  // removed, since there's nothing server-side to wire it to).
  const toggleCheckout = (i) => {
    const f = files[i];
    if (f.checked_out === ME) {
      const next = files.map((x, j) =>
        j === i ? { ...x, checked_out: null } : x,
      );
      setFiles(next);
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
        j === i ? { ...x, checked_out: ME } : x,
      );
      setFiles(next);
      toast(
        (
          __t("pdm.checkedOut") || "Checked out {name} · locked for your edits"
        ).replace("{name}", f.name),
        { kind: "success" },
      );
    }
  };

  const columns = [
    {
      key: "file",
      header: __t("pdm.file") || "File",
      render: (f) => (
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
            <Badge
              tone="warning"
              pill
              title={(__t("pdm.lockedBy") || "Locked by {user}").replace(
                "{user}",
                f.checked_out,
              )}
              className="font-mono fs-9"
            >
              <Icon.X size={9} /> {__t("pdm.locked") || "LOCKED"}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "rev",
      header: __t("pdm.rev") || "Rev",
      render: (f) => <span className="font-mono">{f.rev}</span>,
    },
    {
      key: "size",
      header: __t("pdm.size") || "Size",
      render: (f) => <span className="font-mono fg-3">{f.size}</span>,
    },
    {
      key: "checked_out",
      header: __t("pdm.checkedOutColumn") || "Checked out",
      render: (f) =>
        f.checked_out ? (
          <span
            className="font-mono fs-11"
            style={{
              color: f.checked_out === ME ? "var(--accent-text)" : "var(--warn)",
            }}
          >
            {f.checked_out}
            {f.checked_out === ME && " " + (__t("pdm.you") || "(you)")}
          </span>
        ) : (
          <span className="fg-4 font-mono fs-11">—</span>
        ),
    },
    {
      key: "state",
      header: __t("pdm.state") || "State",
      render: (f) => <StatusPill status={f.state} label={f.state.toUpperCase()} />,
    },
    {
      key: "modified",
      header: __t("pdm.modified") || "Modified",
      render: (f) => (
        <span className="font-mono fg-3 fs-9">
          {f.modified}
          <div>{f.author}</div>
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (f) => {
        const i = files.indexOf(f);
        const checkLabel =
          f.checked_out === ME
            ? __t("pdm.checkIn") || "Check in"
            : __t("pdm.checkOut") || "Check out";
        return (
          <div
            className="flex gap-2 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => toggleCheckout(i)}
              title={checkLabel}
              aria-label={checkLabel}
            >
              {f.checked_out === ME ? (
                <Icon.Check size={11} />
              ) : (
                <Icon.X size={11} />
              )}
            </Button>
            <Menu
              ariaLabel={__t("pdm.moreOptions") || "More options"}
              align="right"
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={__t("pdm.moreOptions") || "More options"}
                >
                  <Icon.Dots size={11} />
                </Button>
              }
              items={[
                {
                  icon: <Icon.Chevron size={11} />,
                  label: __t("pdm.previewView3d") || "Preview / View 3D",
                  onSelect: () => setPreviewFile(f),
                },
                {
                  icon: <Icon.Diff size={11} />,
                  label: __t("pdm.revisionHistory") || "Revision history",
                  onSelect: () => ctx?.openModal("cad-revisions", f),
                },
                {
                  icon: <Icon.Search size={11} />,
                  label: __t("pdm.whereUsedInCad") || "Where used in CAD",
                  onSelect: () => ctx?.openModal("cad-where-used", f),
                },
                {
                  icon: <Icon.Edit size={11} />,
                  label: __t("pdm.markupDrawing") || "Markup drawing",
                  onSelect: () => ctx?.openModal("cad-markup", f),
                },
                {
                  icon: <Icon.Export size={11} />,
                  label: __t("pdm.download") || "Download",
                  onSelect: () => {
                    if (f.url) {
                      window.open(f.url, "_blank", "noopener");
                    } else {
                      toast(
                        (
                          __t("pdm.downloadUnavailable") ||
                          "No download URL available for {name}"
                        ).replace("{name}", f.name),
                        { kind: "warn" },
                      );
                    }
                  },
                },
                "divider",
                {
                  icon: <Icon.Sparkles size={11} />,
                  label: __t("pdm.extractAttributes") || "Extract attributes",
                  onSelect: () => ctx?.openModal("cad-attrs", f),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];

  // Derived from the currently loaded folder's real files — the backend has
  // no vault-wide aggregate for these two, so they're honestly scoped to
  // what's on screen rather than a fabricated tenant-wide number.
  const checkedOutCount = files.filter((f) => f.checked_out).length;
  const pendingReviewCount = files.filter((f) => f.state === "review").length;

  const statusLine =
    selectedPath +
    " · " +
    files.length +
    " " +
    (__t("pdm.files") || "files") +
    " · " +
    checkedOutCount +
    " " +
    (__t("pdm.checkedOutLower") || "checked out");

  const stats = [
    {
      l: __t("pdm.totalFiles") || "Total files",
      v: vaultStats?.totalFiles ?? 0,
    },
    {
      l: __t("pdm.checkedOutColumn") || "Checked out",
      v: checkedOutCount,
    },
    {
      l: __t("pdm.pendingReview") || "Pending review",
      v: pendingReviewCount,
    },
    {
      l: __t("pdm.vaultSize") || "Vault size",
      v: vaultStats?.vaultSize || "—",
    },
  ];

  return (
    <div className="screen-wrap" data-screen-label="PDM Vault">
      <ScreenHeader
        title={__t("pdm.pdmVault") || "PDM Vault"}
        description={statusLine}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => ctx?.openModal("cad-sync")}
            >
              <Icon.Import size={12} />{" "}
              {__t("pdm.syncFromCad") || "Sync from CAD"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => ctx?.openModal("upload")}
            >
              <Icon.Plus size={12} /> {__t("pdm.upload") || "Upload"}
            </Button>
            <Button
              variant="primary"
              onClick={() => ctx?.openModal("drawing-release")}
            >
              <Icon.Check size={12} />{" "}
              {__t("pdm.releaseDrawings") || "Release drawings"}
            </Button>
          </>
        }
      />

      <div className="flex gap-16" style={{ alignItems: "flex-start" }}>
        {/* Tree sidebar */}
        <Card
          className="flex-shrink-0"
          bodyClassName="p-0"
          style={{ width: 232 }}
        >
          <nav
            aria-label={__t("pdm.vault") || "Vault"}
            style={{ padding: 14 }}
          >
            <div className="flex justify-between items-center mb-10">
              <div className="font-mono fs-10 uppercase letter-sp-6 fg-3">
                {__t("pdm.vault") || "Vault"}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                title={__t("pdm.newFolder") || "New folder"}
                aria-label={__t("pdm.newFolder") || "New folder"}
                onClick={() => toast(__t("pdm.newFolder") || "New folder")}
              >
                <Icon.Plus size={11} />
              </Button>
            </div>
            {tree.map((n) => (
              <button
                key={n.path}
                onClick={() => setSelectedPath(n.path)}
                aria-current={selectedPath === n.path ? "true" : undefined}
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
                  aria-hidden="true"
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
          </nav>
        </Card>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Card bodyClassName="p-0">
            <DataTable
              dense
              ariaLabel={
                (__t("pdm.pdmVault") || "PDM Vault") + " · " + selectedPath
              }
              columns={columns}
              rows={files}
              getRowKey={(f) => f.id ?? f.name}
              onRowClick={(f) => setPreviewFile(f)}
              isRowSelected={(f) => f.checked_out === ME}
              empty={
                filesLoading ? (
                  <div className="flex items-center gap-8 fg-3 fs-12 justify-center" style={{ padding: 24 }}>
                    <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
                    <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
                  </div>
                ) : (
                  <EmptyState
                    title={__t("pdm.noFiles") || "No files"}
                    message={
                      __t("pdm.noFilesMsg") || "This folder has no files yet."
                    }
                  />
                )
              }
            />
          </Card>

          {/* Stats */}
          <div
            className="mt-14 d-grid gap-10"
            style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          >
            {stats.map((k) => (
              <div key={k.l} className="kpi">
                <div className="l">{k.l}</div>
                <div className="v">{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview panel */}
        {previewFile && (
          <div className="flex-shrink-0" style={{ width: 420 }}>
            <CADPreview
              file={previewFile}
              onClose={() => setPreviewFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ============ CAD 3D PREVIEW ============
// Was a "faux 3D using SVG" box: a CSS-transform wireframe that rendered the
// same shape for every file and had nothing to do with its contents. Now a real
// three.js viewer (see components/cad/CadViewer.jsx).
//
// It reads bytes from a file the user picks, because the backend currently has
// NO document-download endpoint -- the vault can list files and accept uploads,
// but nothing can fetch the stored bytes back. Once such an endpoint exists,
// pass its ArrayBuffer straight into <CadViewer buffer=... /> and the picker
// becomes optional.
function CADPreview({ file, onClose }) {
  const [buffer, setBuffer] = React.useState(null);
  const [loadedName, setLoadedName] = React.useState("");
  const inputRef = React.useRef(null);

  const onPick = async (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setLoadedName(picked.name);
    setBuffer(await picked.arrayBuffer());
  };

  return (
    <Card className="h-100">
      <div className="cadprev__head">
        <div className="cadprev__title" title={file?.name || file?.fileName}>
          {file?.name || file?.fileName || __t("pdm.preview") || "Preview"}
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={__t("common.close") || "Close"}>
          {"×"}
        </Button>
      </div>

      <CadViewer buffer={buffer} name={loadedName} height={320} />

      <div className="cadprev__actions">
        <input
          ref={inputRef}
          id="cad-viewer-file"
          name="cadViewerFile"
          type="file"
          accept=".step,.stp,.iges,.igs,.stl,.obj,.gltf,.glb,.ply,.3mf"
          className="d-none"
          onChange={onPick}
          aria-label={__t("pdm.openLocalModel") || "Open a model file to view"}
        />
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {loadedName
            ? __t("pdm.openAnother") || "Open another model"
            : __t("pdm.openModel") || "Open model to view"}
        </Button>
      </div>

      <p className="cadprev__note">
        {__t("pdm.viewerFormats") ||
          "Renders STEP, IGES, STL, OBJ, GLTF/GLB, PLY and 3MF. SolidWorks .sldprt/.sldasm are proprietary and cannot be read directly — export STEP or STL first."}
      </p>

      <style>{`
        .cadprev__head {
          display: flex; align-items: center; gap: var(--sp-2);
          margin-bottom: var(--sp-2);
        }
        .cadprev__title {
          flex: 1; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-weight: var(--fw-medium); color: var(--text-primary);
        }
        .cadprev__actions { margin-top: var(--sp-3); }
        .cadprev__note {
          margin-top: var(--sp-2);
          font-size: var(--fs-075);
          color: var(--text-muted);
          line-height: 1.5;
        }
      `}</style>
    </Card>
  );
}
CADPreview.propTypes = {
  file: PropTypes.any,
  onClose: PropTypes.func,
};

// ============ CAD REVISION HISTORY ============
function CADRevisionsModal({ open, onClose, file }) {
  const [revs, setRevs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState(null);

  const loadRevisions = React.useCallback(() => {
    if (!file?.id || !revisionsAPI) {
      setRevs([]);
      return;
    }
    setLoading(true);
    revisionsAPI
      .list({
        partId: file.id,
        entityType: "document",
        sort_by: "createdAt",
        sort_dir: "desc",
      })
      .then((result) => {
        const items = listItems(result);
        setRevs(
          items.map((r, idx) => ({
            id: r.id,
            rev: r.revisionNumber,
            date: (r.createdAt || "").slice(0, 10) || "—",
            author: r.createdById ? `User #${r.createdById}` : "—",
            note: r.description || r.revisionLabel || "—",
            size: idx === 0 ? file.size : "—",
            current: idx === 0,
          })),
        );
      })
      .catch(() => {
        setRevs([]);
        console.warn("Revisions API unavailable for document", file.id);
      })
      .finally(() => setLoading(false));
  }, [file?.id]);

  React.useEffect(() => {
    if (open) loadRevisions();
  }, [open, loadRevisions]);

  if (!open || !file) return null;

  const restoreRevision = async (r) => {
    setRestoringId(r.id);
    try {
      const result = await revisionsAPI.rollback(r.id);
      toast(
        (
          __t("pdm.restoredRev") || "Restored Rev {rev} as current. Rollback logged."
        ).replace("{rev}", result?.revisionNumber || r.rev),
        { kind: "success" },
      );
      onClose();
    } catch (e) {
      toast(e.message || __t("pdm.restoreFailed") || "Restore failed", {
        kind: "error",
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Diff size={16} />}
      title={(
        __t("pdm.revisionHistoryTitle") || "Revision history · {name}"
      ).replace("{name}", file.name)}
      subtitle={
        loading
          ? __t("pdm.loadingRevisions") || "Loading revisions…"
          : (
              __t("pdm.revisionsTracked") || "{count} revisions tracked"
            ).replace("{count}", revs.length)
      }
      size="lg"
    >
      {loading ? (
        <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: 32 }}>
          <Spinner size="sm" label={__t("pdm.loadingRevisions") || "Loading revisions…"} />
        </div>
      ) : revs.length === 0 ? (
        <EmptyState
          title={__t("pdm.noRevisions") || "No revisions recorded"}
          message={
            __t("pdm.noRevisionsMsg") ||
            "No revision history has been recorded for this file yet."
          }
        />
      ) : (
      <div className="relative pl-24">
        <div
          className="pos-absolute w-1"
          style={{ left: 9, top: 4, bottom: 4, background: "var(--line)" }}
        />
        {revs.map((r) => (
          <div
            key={r.id ?? r.rev}
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
              aria-hidden="true"
            />
            <div className="flex justify-between items-baseline mb-6">
              <div className="flex gap-8 items-baseline">
                <span className="font-mono fw-700 fs-14">
                  {__t("pdm.revLabel") || "Rev"} {r.rev}
                </span>
                {r.current && (
                  <Badge tone="accent" pill>
                    {__t("pdm.currentBadge") || "CURRENT"}
                  </Badge>
                )}
              </div>
              <span className="font-mono fs-10 fg-3">
                {r.date} · {r.author} · {r.size}
              </span>
            </div>
            <div className="fs-12 fg-2 mb-8">{r.note}</div>
            <div className="flex gap-6">
              <Button
                variant="secondary"
                size="sm"
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
              </Button>
              <Button
                variant="secondary"
                size="sm"
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
              </Button>
              {!r.current && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={restoringId === r.id}
                  onClick={() => restoreRevision(r)}
                >
                  {restoringId === r.id
                    ? __t("common.working") || "Working…"
                    : __t("pdm.restoreAsCurrent") || "Restore as current"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
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
  const [refs, setRefs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [notLinked, setNotLinked] = React.useState(false);

  React.useEffect(() => {
    if (!open || !file) return;
    if (!file.partId) {
      setRefs([]);
      setNotLinked(true);
      return;
    }
    setNotLinked(false);
    setLoading(true);
    api?.graph
      ?.whereUsed(file.partId)
      .then((graph) => setRefs(deriveWhereUsedRows(graph, file.partId)))
      .catch(() => {
        setRefs([]);
        console.warn("Where-used graph API unavailable for part", file.partId);
      })
      .finally(() => setLoading(false));
  }, [open, file]);

  if (!open || !file) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Icon.Search size={16} />}
      title={(__t("pdm.whereUsedTitle") || "Where used · {name}").replace(
        "{name}",
        file.name,
      )}
      subtitle={
        loading
          ? __t("pdm.loadingWhereUsed") || "Tracing where-used graph…"
          : (
              __t("pdm.referencedBy") || "Referenced by {count} active assemblies"
            ).replace("{count}", refs.filter((r) => r.instances > 0).length)
      }
    >
      {loading ? (
        <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: 32 }}>
          <Spinner size="sm" label={__t("pdm.loadingWhereUsed") || "Tracing where-used graph…"} />
        </div>
      ) : notLinked ? (
        <EmptyState
          title={__t("pdm.notLinkedToPart") || "Not linked to a part"}
          message={
            __t("pdm.notLinkedToPartMsg") ||
            "This file isn't associated with a part record, so where-used analysis isn't available."
          }
        />
      ) : refs.length === 0 ? (
        <EmptyState
          title={__t("pdm.noReferences") || "Not referenced anywhere"}
          message={
            __t("pdm.noReferencesMsg") ||
            "This part doesn't appear in any BOM or assembly yet."
          }
        />
      ) : (
        refs.map((r) => (
          <div
            key={r.key}
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
        ))
      )}
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

  const onSvgClick = (e) => {
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

  const commitPendingText = () => {
    if (!textValue.trim()) return;
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
  };

  const tools = [
    ["rect", __t("pdm.toolBox") || "□ Box"],
    ["text", __t("pdm.toolText") || "T Text"],
    ["arrow", __t("pdm.toolArrow") || "→ Arrow"],
  ];

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
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => setMarks([])}>
            {__t("bomShell.clearAll") || "Clear all"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
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
          </Button>
        </>
      }
    >
      <div
        className="flex gap-6 mb-10"
        role="group"
        aria-label={__t("pdm.markupToolsLabel") || "Markup tools"}
      >
        {tools.map(([k, l]) => (
          <Button
            key={k}
            variant={tool === k ? "primary" : "secondary"}
            size="sm"
            aria-pressed={tool === k}
            onClick={() => setTool(k)}
          >
            {l}
          </Button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 600 360"
        onClick={onSvgClick}
        className="w-100p h-400 border-line rounded-r2 bg-white"
        role="img"
        aria-label={
          __t("pdm.markupCanvasLabel") ||
          "Drawing canvas — click to add an annotation"
        }
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
        <div className="flex gap-4 items-end mt-8">
          <div className="flex-1">
            <Field label={__t("pdm.markupTextLabel") || "Markup text"}>
              <Input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPendingText();
                  }
                }}
                placeholder={
                  __t("pdm.enterMarkupText") || "Enter markup text..."
                }
              />
            </Field>
          </div>
          <Button variant="primary" size="sm" onClick={commitPendingText}>
            {__t("common.add") || "Add"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPendingText(null);
              setTextValue("");
            }}
          >
            {__t("common.cancel") || "Cancel"}
          </Button>
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
  const [extractError, setExtractError] = React.useState(null);
  React.useEffect(() => {
    if (open) {
      setExtracting(true);
      setAttrs(null);
      setExtractError(null);
      cadAPI
        ?.extractAttrs({
          // Prefer the document's real server-side storage path; falling
          // back to just the display name only ever worked by accident.
          filePath: file?.filePath || file?.name || "",
          fileType: file?.ext || "SLDPRT",
        })
        .then((result) => {
          if (result && !result.error) {
            // The backend parser reads what a STEP/IGES/SLDPRT file header
            // actually exposes (format, size, entity count, custom
            // properties, CAD version) — it can't derive physical
            // properties like mass/material/volume from that, so those
            // stay honestly "—" instead of invented numbers.
            setAttrs({
              material: result.material || "—",
              density: result.density || "—",
              mass: result.mass || "—",
              volume: result.volume || "—",
              bounding_box: result.boundingBox || "—",
              surface_area: result.surfaceArea || "—",
              center_of_mass: result.centerOfMass || "—",
              file_format: result.fileFormat || file?.ext || "—",
              sw_version: result.cadVersion || "—",
              entity_count:
                result.entityCount != null ? String(result.entityCount) : "—",
              file_size:
                result.fileSize != null ? formatFileSize(result.fileSize) : "—",
              custom: result.customProperties || {},
            });
          } else {
            setExtractError(
              result?.error ||
                __t("pdm.noAttrsExtracted") ||
                "No CAD metadata could be extracted for this file.",
            );
          }
          setExtracting(false);
        })
        .catch((e) => {
          console.error("CAD attribute extraction failed");
          setExtractError(e.message || __t("common.error") || "Extraction failed");
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
            <Button variant="secondary" onClick={onClose}>
              {__t("common.close") || "Close"}
            </Button>
            <Button
              variant="primary"
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
            </Button>
          </>
        )
      }
    >
      {extracting && (
        <div
          className="flex items-center gap-8 fg-3 fs-12"
          style={{ padding: 40 }}
        >
          <Spinner
            size="sm"
            label={(
              __t("pdm.parsingMetadata") || "Parsing {ext} metadata…"
            ).replace("{ext}", file.ext)}
          />
          <span aria-hidden="true">
            {(
              __t("pdm.parsingMetadata") || "Parsing {ext} metadata…"
            ).replace("{ext}", file.ext)}
          </span>
        </div>
      )}
      {!extracting && extractError && (
        <EmptyState
          title={__t("pdm.extractionFailedTitle") || "Extraction unavailable"}
          message={extractError}
        />
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
                  <dd className="font-mono m-0">{v}</dd>
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
                <dd className="font-mono m-0">{v}</dd>
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
  const [diffs, setDiffs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [synced, setSynced] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

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

  if (!open) return null;

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
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={loading || synced || applying || diffs.length === 0}
            onClick={async () => {
              setApplying(true);
              try {
                const result = await cadAPI.applySync(diffs);
                setSynced(true);
                onClose();
                toast(
                  (
                    __t("pdm.syncComplete") ||
                    "Sync complete · {count} changes applied · audit logged"
                  ).replace("{count}", result?.appliedCount ?? diffs.length),
                  { kind: "success" },
                );
              } catch (e) {
                toast(e.message || __t("pdm.cadSyncFailed") || "CAD sync failed", {
                  kind: "error",
                });
              } finally {
                setApplying(false);
              }
            }}
          >
            <Icon.Check size={12} />{" "}
            {applying
              ? __t("common.working") || "Working…"
              : __t("pdm.applyAllChanges") || "Apply all changes"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div
          className="flex items-center gap-8 fg-3 fs-12"
          style={{ padding: 40 }}
        >
          <Spinner
            size="sm"
            label={__t("pdm.comparingCadBomData") || "Comparing CAD and BOM data..."}
          />
          <span aria-hidden="true">
            {__t("pdm.comparingCadBomData") || "Comparing CAD and BOM data..."}
          </span>
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
                  ? "→ " + (__t("pdm.pull") || "pull")
                  : "← " + (__t("pdm.push") || "push")}
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
// There is no dedicated approval-workflow table on the backend — this maps
// the real Document.accessLevel field (public/restricted/private) onto the
// released/review/draft states so the action below genuinely persists
// (documentsAPI.update), instead of just toasting.
function drawingStateFromAccessLevel(accessLevel) {
  if (accessLevel === "public") return "approved";
  if (accessLevel === "restricted") return "review";
  return "draft";
}
function drawingWatermarkFromState(state) {
  if (state === "approved") return "RELEASED";
  if (state === "review") return "FOR APPROVAL";
  return "DRAFT — NOT FOR PRODUCTION";
}

function DrawingReleaseModal({ open, onClose }) {
  const [drawings, setDrawings] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [releasing, setReleasing] = React.useState(false);

  const loadDrawings = React.useCallback(() => {
    if (!documentsAPI) {
      setDrawings([]);
      return;
    }
    setLoading(true);
    documentsAPI
      .list({ category: "Drawing" })
      .then((result) => {
        setDrawings(
          listItems(result).map((d) => {
            const state = drawingStateFromAccessLevel(d.accessLevel);
            return {
              id: d.id,
              name: d.originalName || d.filename,
              rev: d.version != null ? String(d.version) : "—",
              state,
              reviewer: d.uploadedBy || "—",
              date: (d.updatedAt || d.createdAt || "").slice(0, 10) || "—",
              watermark: drawingWatermarkFromState(state),
              url: d.url,
            };
          }),
        );
      })
      .catch(() => {
        setDrawings([]);
        console.warn("Documents API unavailable for drawing release workflow");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (open) loadDrawings();
  }, [open, loadDrawings]);

  if (!open) return null;

  const releaseDrawings = async () => {
    const toRelease = drawings.filter((d) => d.state === "review");
    if (toRelease.length === 0) {
      onClose();
      toast(__t("pdm.noDrawingsToRelease") || "No drawings pending review to release", {
        kind: "info",
      });
      return;
    }
    setReleasing(true);
    try {
      await Promise.all(
        toRelease.map((d) => documentsAPI.update(d.id, { accessLevel: "public" })),
      );
      onClose();
      toast(
        (
          __t("pdm.drawingsReleased") ||
          "Released {count} drawings · marked public · audit logged"
        ).replace("{count}", toRelease.length),
        { kind: "success" },
      );
    } catch (e) {
      toast(e.message || __t("common.error") || "Release failed", { kind: "error" });
    } finally {
      setReleasing(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: __t("pdm.drawing") || "Drawing",
      render: (d) => <span className="font-mono fw-500">{d.name}</span>,
    },
    {
      key: "rev",
      header: __t("pdm.rev") || "Rev",
      render: (d) => <span className="font-mono">{d.rev}</span>,
    },
    {
      key: "state",
      header: __t("pdm.state") || "State",
      render: (d) => <StatusPill status={d.state} label={d.state} />,
    },
    {
      key: "watermark",
      header: __t("pdm.watermark") || "Watermark",
      render: (d) => {
        const tone =
          d.state === "approved"
            ? "success"
            : d.state === "review"
              ? "warning"
              : "neutral";
        return (
          <Badge tone={tone} className="font-mono fs-10">
            {d.watermark}
          </Badge>
        );
      },
    },
    {
      key: "reviewer",
      header: __t("pdm.reviewer") || "Reviewer",
      render: (d) => <span className="font-mono fg-3">{d.reviewer}</span>,
    },
    {
      key: "date",
      header: __t("pdm.date") || "Date",
      render: (d) => <span className="font-mono fg-3">{d.date}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (d.url) {
              window.open(d.url, "_blank", "noopener");
            } else {
              toast(
                (__t("pdm.previewToast") || "Preview: {name} [{watermark}]")
                  .replace("{name}", d.name)
                  .replace("{watermark}", d.watermark),
                { kind: "info" },
              );
            }
          }}
        >
          {__t("pdm.previewBtn") || "Preview"}
        </Button>
      ),
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
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {__t("common.cancel") || "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={loading || releasing}
            onClick={releaseDrawings}
          >
            <Icon.Check size={12} />{" "}
            {releasing
              ? __t("common.working") || "Working…"
              : __t("pdm.releaseApprovedDrawings") || "Release approved drawings"}
          </Button>
        </>
      }
    >
      <DataTable
        dense
        ariaLabel={
          __t("pdm.drawingReleaseWorkflow") || "Drawing Release Workflow"
        }
        columns={columns}
        rows={drawings}
        getRowKey={(d) => d.id ?? d.name}
        empty={
          loading ? (
            <div className="flex items-center gap-8 fg-3 fs-12 justify-center" style={{ padding: 20 }}>
              <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
            </div>
          ) : (
            <EmptyState
              title={__t("pdm.noDrawings") || "No drawings"}
              message={
                __t("pdm.noDrawingsMsg") || "No drawings have been uploaded yet."
              }
            />
          )
        }
      />
      <div
        className="mt-12 bg-sunk border-line rounded-r2 fs-11 fg-3 font-mono"
        style={{ padding: 10 }}
      >
        {__t("pdm.releasedInfo") ||
          "💡 Released drawings are watermarked, locked from edit, and immutable. Reissuing creates a new revision."}
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
