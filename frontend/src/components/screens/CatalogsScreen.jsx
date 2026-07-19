import React from "react";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Field,
  Input,
  Textarea,
  Button,
  StatusPill,
  DataTable,
  EmptyState,
  Modal,
  Spinner,
} from "../ui";

// Track A — Catalogs. A catalog is a named grouping of parts (catalogs /
// part_catalogs, see migration 045_catalogs_and_bom_item_media). This screen
// lists catalogs, creates one from scratch or from a folder/file upload, and
// opens a catalog to manage the parts assigned to it.

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

const emptyCreateDraft = { catalogCode: "", catalogName: "", description: "" };

export default function CatalogsScreen() {
  const [catalogs, setCatalogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Master/detail: null = list view, otherwise the open catalog's parts show.
  const [selected, setSelected] = React.useState(null);
  const [catalogParts, setCatalogParts] = React.useState([]);
  const [partsLoading, setPartsLoading] = React.useState(false);

  const [showCreate, setShowCreate] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState(emptyCreateDraft);
  const [creating, setCreating] = React.useState(false);

  const [showUpload, setShowUpload] = React.useState(false);
  const [uploadDraft, setUploadDraft] = React.useState(emptyCreateDraft);
  const [uploadFiles, setUploadFiles] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);

  const [addPartValue, setAddPartValue] = React.useState("");
  const [addingPart, setAddingPart] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.catalogs.list();
      setCatalogs(Array.isArray(r) ? r : r?.items || []);
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      setError(e?.message || "Failed to load catalogs.");
      setCatalogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadParts = React.useCallback(async (catalogId) => {
    setPartsLoading(true);
    try {
      const r = await api.catalogs.parts(catalogId);
      setCatalogParts(Array.isArray(r) ? r : r?.items || []);
    } catch (e) {
      toast("Could not load parts: " + (e.message || ""), { kind: "error" });
      setCatalogParts([]);
    } finally {
      setPartsLoading(false);
    }
  }, []);

  const openCatalog = (cat) => {
    setSelected(cat);
    setAddPartValue("");
    loadParts(cat.id);
  };

  const closeCatalog = () => {
    setSelected(null);
    setCatalogParts([]);
    setAddPartValue("");
  };

  const createCatalog = async () => {
    const code = createDraft.catalogCode.trim();
    const name = createDraft.catalogName.trim();
    if (!code || !name) {
      toast("Catalog code and name are required", { kind: "error" });
      return;
    }
    setCreating(true);
    try {
      const created = await api.catalogs.create({
        catalogCode: code,
        catalogName: name,
        description: createDraft.description.trim() || undefined,
      });
      toast(`Catalog "${name}" created`, { kind: "success" });
      setShowCreate(false);
      setCreateDraft(emptyCreateDraft);
      await load();
      if (created && created.id != null) openCatalog(created);
    } catch (e) {
      toast("Could not create catalog: " + (e.message || ""), {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length) setUploadFiles(list);
    e.target.value = "";
  };

  const importFromUpload = async () => {
    const code = uploadDraft.catalogCode.trim();
    const name = uploadDraft.catalogName.trim();
    if (!code || !name) {
      toast("Catalog code and name are required", { kind: "error" });
      return;
    }
    if (!uploadFiles.length) {
      toast("Choose a folder or files to upload", { kind: "error" });
      return;
    }
    setUploading(true);
    try {
      const r = await api.catalogs.importUpload(uploadFiles, {
        catalogCode: code,
        catalogName: name,
        description: uploadDraft.description.trim() || undefined,
      });
      const created = (r && r.partsCreated) ?? (Array.isArray(r?.parts) ? r.parts.length : null);
      toast(
        created != null
          ? `Catalog "${name}" created — ${created} part(s) added`
          : `Catalog "${name}" created from upload`,
        { kind: "success" },
      );
      setShowUpload(false);
      setUploadDraft(emptyCreateDraft);
      setUploadFiles([]);
      await load();
      if (r && r.catalog && r.catalog.id != null) openCatalog(r.catalog);
      else if (r && r.id != null) openCatalog(r);
    } catch (e) {
      toast("Upload failed: " + (e.message || ""), { kind: "error" });
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (cat) => {
    try {
      await api.catalogs.update(cat.id, { isActive: !cat.isActive });
      toast(`${cat.catalogName} ${cat.isActive ? "deactivated" : "activated"}`, {
        kind: "success",
      });
      load();
    } catch (e) {
      toast("Could not update catalog: " + (e.message || ""), {
        kind: "error",
      });
    }
  };

  const deleteCatalog = async (cat) => {
    try {
      await api.catalogs.delete(cat.id);
      toast(`${cat.catalogName} deleted`, { kind: "success" });
      if (selected && selected.id === cat.id) closeCatalog();
      load();
    } catch (e) {
      toast("Could not delete catalog: " + (e.message || ""), {
        kind: "error",
      });
    }
  };

  const addPart = async () => {
    const value = addPartValue.trim();
    if (!value || !selected) return;
    setAddingPart(true);
    try {
      await api.catalogs.addPart(selected.id, { partNumber: value });
      toast(`Added ${value} to ${selected.catalogName}`, { kind: "success" });
      setAddPartValue("");
      loadParts(selected.id);
    } catch (e) {
      toast("Could not add part: " + (e.message || ""), { kind: "error" });
    } finally {
      setAddingPart(false);
    }
  };

  const removePart = async (part) => {
    if (!selected) return;
    try {
      await api.catalogs.removePart(selected.id, part.id);
      toast(`Removed ${part.partNumber || "part"} from ${selected.catalogName}`, {
        kind: "success",
      });
      loadParts(selected.id);
    } catch (e) {
      toast("Could not remove part: " + (e.message || ""), { kind: "error" });
    }
  };

  const catalogColumns = [
    {
      key: "catalogCode",
      header: __t("catalogs.colCode") || "Code",
      render: (c) => <span className="font-mono fs-12">{c.catalogCode}</span>,
    },
    { key: "catalogName", header: __t("catalogs.colName") || "Name" },
    {
      key: "description",
      header: __t("catalogs.colDescription") || "Description",
      render: (c) => c.description || "—",
    },
    {
      key: "partCount",
      header: __t("catalogs.colParts") || "Parts",
      align: "num",
      render: (c) => c.partCount ?? c.part_count ?? "—",
    },
    {
      key: "isActive",
      header: __t("catalogs.colStatus") || "Status",
      render: (c) => (
        <StatusPill
          tone={c.isActive ? "success" : "neutral"}
          label={c.isActive ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: __t("catalogs.colUpdated") || "Updated",
      render: (c) => fmtDate(c.updatedAt || c.updated_at),
    },
    {
      key: "actions",
      header: "",
      render: (c) => (
        <div
          className="flex gap-8"
          onClick={(e) => e.stopPropagation()}
          style={{ justifyContent: "flex-end" }}
        >
          <Button size="sm" variant="secondary" onClick={() => toggleActive(c)}>
            {c.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button size="sm" variant="danger" onClick={() => deleteCatalog(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const partColumns = [
    {
      key: "partNumber",
      header: __t("part.partNumber") || "Part No.",
      render: (p) => <span className="font-mono fs-12">{p.partNumber || "—"}</span>,
    },
    { key: "description", header: __t("catalogs.colDescription") || "Description", render: (p) => p.description || p.partName || "—" },
    { key: "manufacturer", header: __t("part.manufacturer") || "Manufacturer", render: (p) => p.manufacturer || "—" },
    { key: "category", header: __t("part.category") || "Category", render: (p) => p.category || "—" },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div className="flex" style={{ justifyContent: "flex-end" }}>
          <Button size="sm" variant="danger" onClick={() => removePart(p)}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  if (selected) {
    return (
      <div className="screen-wrap">
        <ScreenHeader
          title={selected.catalogName}
          description={
            <>
              <span className="font-mono">{selected.catalogCode}</span>
              {selected.description ? ` · ${selected.description}` : ""}
              {` · ${catalogParts.length} ${catalogParts.length === 1 ? "part" : "parts"}`}
            </>
          }
          actions={
            <div className="flex gap-8" style={{ alignItems: "center" }}>
              <StatusPill
                tone={selected.isActive ? "success" : "neutral"}
                label={selected.isActive ? "Active" : "Inactive"}
              />
              <Button variant="secondary" size="sm" onClick={closeCatalog}>
                ← Back to catalogs
              </Button>
            </div>
          }
        />

        <Card title="Add a part to this catalog">
          <div className="flex gap-8" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="Part number" htmlFor="catalog-add-part">
                <Input
                  id="catalog-add-part"
                  value={addPartValue}
                  placeholder="e.g. R-0402-10K"
                  onChange={(e) => setAddPartValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPart();
                    }
                  }}
                />
              </Field>
            </div>
            <Button
              variant="primary"
              size="md"
              loading={addingPart}
              onClick={addPart}
            >
              Add part
            </Button>
          </div>
        </Card>

        <DataTable
          dense
          ariaLabel={`Parts in ${selected.catalogName}`}
          columns={partColumns}
          rows={catalogParts}
          getRowKey={(p) => p.id}
          empty={
            partsLoading ? (
              <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
                <Spinner size="sm" label="Loading parts…" />
                <span aria-hidden="true">Loading…</span>
              </div>
            ) : (
              <EmptyState
                title="No parts in this catalog yet"
                message="Add a part above, or use Create from folder/upload from the catalogs list to populate it in bulk."
              />
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("catalogs.title") || "Catalogs"}
        description={
          loading
            ? __t("common.loading") || "Loading…"
            : `${catalogs.length} ${catalogs.length === 1 ? "catalog" : "catalogs"}`
        }
        actions={
          <div className="flex gap-8">
            <Button variant="secondary" size="sm" onClick={() => setShowUpload(true)}>
              Create from folder/upload
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              + New catalog
            </Button>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-14 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        dense
        zebra
        ariaLabel={__t("catalogs.title") || "Catalogs"}
        columns={catalogColumns}
        rows={catalogs}
        getRowKey={(c) => c.id}
        onRowClick={openCatalog}
        empty={
          loading ? (
            <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "32px 0" }}>
              <Spinner size="sm" label="Loading…" />
              <span aria-hidden="true">Loading…</span>
            </div>
          ) : (
            <EmptyState
              title="No catalogs yet"
              message="Create a catalog from scratch, or use Create from folder/upload to populate one in bulk."
            />
          )
        }
      />

      <Modal
        open={showCreate}
        onClose={() => (creating ? null : setShowCreate(false))}
        title="New catalog"
        footer={
          <div className="flex gap-8" style={{ justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={creating} onClick={createCatalog}>
              Create catalog
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-16">
          <Field label="Catalog code" htmlFor="catalog-create-code" required>
            <Input
              id="catalog-create-code"
              value={createDraft.catalogCode}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, catalogCode: e.target.value }))
              }
              placeholder="e.g. ELEC-2026"
            />
          </Field>
          <Field label="Catalog name" htmlFor="catalog-create-name" required>
            <Input
              id="catalog-create-name"
              value={createDraft.catalogName}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, catalogName: e.target.value }))
              }
              placeholder="e.g. Electrical Components 2026"
            />
          </Field>
          <Field label="Description" htmlFor="catalog-create-desc">
            <Textarea
              id="catalog-create-desc"
              value={createDraft.description}
              onChange={(e) =>
                setCreateDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={showUpload}
        onClose={() => (uploading ? null : setShowUpload(false))}
        title="Create catalog from folder/upload"
        subtitle="Pick a folder (or select multiple files) of part datasheets, drawings, or images — a new catalog is created and populated with parts extracted from the upload."
        size="lg"
        footer={
          <div className="flex gap-8" style={{ justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowUpload(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={uploading} onClick={importFromUpload}>
              Create &amp; import
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-16">
          <Field label="Catalog code" htmlFor="catalog-upload-code" required>
            <Input
              id="catalog-upload-code"
              value={uploadDraft.catalogCode}
              onChange={(e) =>
                setUploadDraft((d) => ({ ...d, catalogCode: e.target.value }))
              }
              placeholder="e.g. VENDOR-ACME-01"
            />
          </Field>
          <Field label="Catalog name" htmlFor="catalog-upload-name" required>
            <Input
              id="catalog-upload-name"
              value={uploadDraft.catalogName}
              onChange={(e) =>
                setUploadDraft((d) => ({ ...d, catalogName: e.target.value }))
              }
              placeholder="e.g. Acme Supplier Catalog"
            />
          </Field>
          <Field label="Description" htmlFor="catalog-upload-desc">
            <Textarea
              id="catalog-upload-desc"
              value={uploadDraft.description}
              onChange={(e) =>
                setUploadDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={2}
            />
          </Field>
          <Field
            label="Files"
            hint={
              uploadFiles.length
                ? `${uploadFiles.length} file(s) selected`
                : "Choose an entire folder or pick individual files."
            }
          >
            <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
              <label className="ui-btn ui-btn--secondary ui-btn--md" style={{ cursor: "pointer" }}>
                Choose folder
                <input
                  type="file"
                  webkitdirectory=""
                  multiple
                  onChange={onPickFiles}
                  style={{ display: "none" }}
                />
              </label>
              <label className="ui-btn ui-btn--secondary ui-btn--md" style={{ cursor: "pointer" }}>
                Choose files
                <input
                  type="file"
                  multiple
                  onChange={onPickFiles}
                  style={{ display: "none" }}
                />
              </label>
            </div>
            {uploadFiles.length > 0 && (
              <ul
                className="fs-11 fg-3"
                style={{ margin: "8px 0 0", paddingLeft: 18, maxHeight: 120, overflowY: "auto" }}
              >
                {uploadFiles.slice(0, 20).map((f, i) => (
                  <li key={f.webkitRelativePath || f.name + i}>
                    {f.webkitRelativePath || f.name}
                  </li>
                ))}
                {uploadFiles.length > 20 && <li>+ {uploadFiles.length - 20} more…</li>}
              </ul>
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

CatalogsScreen.displayName = "CatalogsScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.CatalogsScreen = CatalogsScreen;
