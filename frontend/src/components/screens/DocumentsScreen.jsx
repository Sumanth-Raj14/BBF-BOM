import PropTypes from "prop-types";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { DocumentFolderTree, Icon, api, useAppStore } from "../../globals";
import { Button, Menu, EmptyState, ScreenHeader } from "../ui";
// ============ DOCUMENTS ============
export default function DocumentsScreen({ data, openModal, perms }) {
  const ctx = useAppStore();
  const tags = [
    "All",
    "Datasheet",
    "Drawing",
    "CAD",
    "Quote",
    "Compliance",
    "Test",
  ];
  const [tag, setTag] = React.useState("All");
  const [sort, setSort] = React.useState("Recent");
  const [selectedFolder, setSelectedFolder] = React.useState(null);
  const [showTree, setShowTree] = React.useState(true);
  const [apiDocs, setApiDocs] = React.useState(null);
  const [apiFolders, setApiFolders] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const fetchDocs = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      api?.documents?.list?.() || Promise.resolve(null),
      api?.documents?.folders?.() || Promise.resolve(null),
    ])
      .then(([docs, folders]) => {
        if (docs && docs.length) setApiDocs(docs);
        if (folders && folders.length) setApiFolders(folders);
      })
      .catch((err) => {
        console.warn(
          "[DocumentsScreen] Failed to load documents:",
          err?.message || err,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchDocs();
    const handler = () => fetchDocs();
    window.addEventListener("documents-changed", handler);
    return () => window.removeEventListener("documents-changed", handler);
  }, [fetchDocs]);

  const folders =
    apiFolders && apiFolders.length
      ? (() => {
          const byPath = {};
          apiFolders.forEach((f) => {
            byPath[f.path] = { ...f, children: [] };
          });
          apiFolders.forEach((f) => {
            if (f.path !== "/") {
              const parts = f.path.split("/").slice(0, -1);
              const parentPath = parts.length > 1 ? parts.join("/") : "/";
              if (byPath[parentPath])
                byPath[parentPath].children.push(byPath[f.path]);
            }
          });
          return byPath["/"] ? [byPath["/"]] : null;
        })()
      : null;

  const folderTagMap = {
    "/Electrical/Datasheets": "Datasheet",
    "/Electrical/Schematics": "Drawing",
    "/Electrical/CAD Models": "CAD",
    "/Mechanical/Drawings": "Drawing",
    "/Mechanical/CAD": "CAD",
    "/Mechanical/Specs": "Datasheet",
    "/Procurement/Quotes": "Quote",
    "/Procurement/POs": "Quote",
    "/Compliance/RoHS": "Compliance",
    "/Compliance/REACH": "Compliance",
    "/Compliance/Conflict Minerals": "Compliance",
    "/Software/Firmware": "Test",
    "/Software/Drivers": "Test",
    "/Software/Tools": "Test",
    "/Test": "Test",
  };

  const sourceDocs = React.useMemo(() => {
    if (apiDocs && apiDocs.length) {
      return apiDocs.map((d) => ({
        id: d.id,
        name: d.originalName,
        tag: d.category || "Other",
        ext: (d.fileType || "").toUpperCase(),
        size: d.fileSize
          ? d.fileSize < 1024 * 1024
            ? (d.fileSize / 1024).toFixed(1) + " KB"
            : (d.fileSize / (1024 * 1024)).toFixed(1) + " MB"
          : "—",
        updated: (function (d) {
          try {
            const dt = new Date(d);
            return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString();
          } catch (_e) {
            return "-";
          }
        })(d.updatedAt || d.createdAt),
        icon: "📄",
        apiId: d.id,
        version: d.version,
        accessLevel: d.accessLevel,
      }));
    }
    return data.docs;
  }, [apiDocs, data.docs]);

  const filtered = sourceDocs
    .filter((d) => {
      if (tag !== "All" && d.tag !== tag) return false;
      if (selectedFolder && selectedFolder.path !== "/") {
        const folderTag = folderTagMap[selectedFolder.path];
        if (folderTag && d.tag !== folderTag) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "Name A-Z") return a.name.localeCompare(b.name);
      if (sort === "Size") {
        const parseSize = (s) => {
          if (!s || s === "—") return 0;
          const m = s.match(/([\d.]+)\s*(KB|MB|GB)?/i);
          if (!m) return 0;
          const n = parseFloat(m[1]);
          const u = (m[2] || "KB").toUpperCase();
          return n * (u === "GB" ? 1024 * 1024 : u === "MB" ? 1024 : 1);
        };
        return parseSize(b.size) - parseSize(a.size);
      }
      if (sort === "Type") return (a.ext || "").localeCompare(b.ext || "");
      return (b.updated || "").localeCompare(a.updated || "");
    });

  const sortLabels = [
    __t("documents.recent") || "Recent",
    __t("documents.nameAZ") || "Name A-Z",
    __t("documents.size") || "Size",
    __t("documents.type") || "Type",
  ];

  return (
    <div className="screen-wrap flex flex-col">
      <ScreenHeader
        title={__t("nav.docs") || "Documents"}
        description={
          <>
            {loading
              ? __t("common.loading") || "Loading..."
              : `${filtered.length} ${__t("documents.files") || "files"}`}
            {selectedFolder && selectedFolder.path !== "/"
              ? ` · ${selectedFolder.label}`
              : ""}
          </>
        }
        actions={
          <div className="flex gap-8">
            <Button
              variant={showTree ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showTree}
              onClick={() => setShowTree(!showTree)}
            >
              <Icon.Folder size={12} /> {__t("documents.folders") || "Folders"}
            </Button>
            <Menu
              ariaLabel={__t("documents.sortBy") || "Sort by"}
              trigger={
                <Button variant="secondary" size="sm">
                  {sort} <Icon.ChevronDown size={10} />
                </Button>
              }
              items={sortLabels.map((s) => ({
                icon:
                  s === sort ? (
                    <Icon.Check size={11} />
                  ) : (
                    <span className="w-11" />
                  ),
                label: s,
                onSelect: () => setSort(s),
              }))}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => openModal("upload")}
            >
              <Icon.Import size={12} /> {__t("common.upload") || "Upload"}
            </Button>
          </div>
        }
      />
      <div
        role="group"
        aria-label={__t("documents.filterByTag") || "Filter by tag"}
        style={{ flexWrap: "wrap" }}
        className="flex gap-8 mb-14"
      >
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(t)}
            aria-pressed={t === tag}
            className={"chip cursor-pointer " + (t === tag ? "active" : "")}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-1 min-h-0 gap-14">
        {showTree && (
          <div className="card flex-shrink-0">
            <DocumentFolderTree
              folders={folders}
              onSelect={setSelectedFolder}
              selected={selectedFolder}
            />
          </div>
        )}
        <div className="doc-grid flex-1">
          {filtered.length === 0 ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <EmptyState
                title={
                  __t("documents.noDocuments") || "No documents in this view"
                }
              />
            </div>
          ) : (
            filtered.map((d) => (
              <div key={d.name} className="doc-card cursor-pointer">
                <div
                  className="doc-thumb"
                  data-ext={d.ext}
                  data-icon={d.icon}
                />
                <div className="doc-meta">
                  <div className="nm font-mono fs-11">{d.name}</div>
                  <div className="sub flex justify-between items-center">
                    <span>
                      {d.tag} · {d.size} · {d.updated}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Menu
                        ariaLabel={__t("common.moreOptions") || "More options"}
                        align="right"
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            className="w-18 h-18"
                            aria-label={
                              __t("common.moreOptions") || "More options"
                            }
                          >
                            <Icon.Dots size={11} />
                          </Button>
                        }
                        items={[
                          {
                            label: __t("common.open") || "Open",
                            icon: <Icon.Chevron size={11} />,
                            onSelect: () =>
                              (ctx || { openModal }).openModal?.(
                                "doc-preview",
                                d,
                              ),
                          },
                          {
                            label: __t("common.download") || "Download",
                            icon: <Icon.Export size={11} />,
                            onSelect: () =>
                              toast(
                                __t("documents.downloaded") ||
                                  "Downloaded " + d.name,
                                { kind: "success" },
                              ),
                          },
                          {
                            label: __t("common.copyLink") || "Copy link",
                            icon: <Icon.Link size={11} />,
                            onSelect: () =>
                              toast(__t("common.copied") || "Link copied"),
                          },
                          "divider",
                          ...(perms?.canDelete
                            ? [
                                {
                                  label: __t("common.delete") || "Delete",
                                  icon: <Icon.Trash size={11} />,
                                  danger: true,
                                  onSelect: () =>
                                    toast(
                                      d.name +
                                        " " +
                                        (__t("documents.deleted") ||
                                          "deleted"),
                                      { kind: "warn" },
                                    ),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
DocumentsScreen.propTypes = {
  data: PropTypes.object,
  openModal: PropTypes.func,
  perms: PropTypes.any,
};
