import React from "react";

import { __t } from "../../i18n";
import { toast } from "../../utils/toast";
import { api } from "../../../api.js";
import {
  ScreenHeader,
  Card,
  Field,
  Input,
  Select,
  Button,
  Badge,
  StatusPill,
  DataTable,
  EmptyState,
  Modal,
  Spinner,
} from "../ui";

// ============ xBOM ============
//
// Multi-BOM types (EBOM/MBOM/SBOM, migration 052 — see app/models/bom.py
// bom_type) and the manufacturing BOM tables (mbom_headers/mbom_items/
// mbom_operations, app/models/mbom.py) that previously had zero routes/UI.
// Two panes: the BOM list filterable by type, and manufacturing BOMs with
// the actual point of xBOM — deriving an MBOM from an EBOM's structure.

const TYPE_OPTIONS = ["", "EBOM", "MBOM", "SBOM"];

function typeTone(t) {
  if (t === "MBOM") return "info";
  if (t === "SBOM") return "warning";
  return "accent"; // EBOM
}

export default function MbomScreen() {
  const [typeFilter, setTypeFilter] = React.useState("");
  const [boms, setBoms] = React.useState([]);
  const [bomsLoading, setBomsLoading] = React.useState(false);
  const [bomsError, setBomsError] = React.useState(null);

  const [mboms, setMboms] = React.useState([]);
  const [mbomsLoading, setMbomsLoading] = React.useState(false);
  const [mbomsError, setMbomsError] = React.useState(null);

  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [showDerive, setShowDerive] = React.useState(false);
  const [deriveDraft, setDeriveDraft] = React.useState({ ebom_id: "", name: "" });
  const [deriving, setDeriving] = React.useState(false);
  const [deriveError, setDeriveError] = React.useState(null);

  const loadBoms = React.useCallback(async (type) => {
    setBomsLoading(true);
    setBomsError(null);
    try {
      const params = type ? { bom_type: type } : {};
      const resp = await api.bomEnterprise.list(params);
      setBoms(Array.isArray(resp?.items) ? resp.items : []);
    } catch (e) {
      setBoms([]);
      setBomsError(e?.message || "Could not load BOMs.");
    } finally {
      setBomsLoading(false);
    }
  }, []);

  const loadMboms = React.useCallback(async () => {
    setMbomsLoading(true);
    setMbomsError(null);
    try {
      const resp = await api.mbom.headers.list();
      setMboms(Array.isArray(resp?.items) ? resp.items : []);
    } catch (e) {
      setMboms([]);
      setMbomsError(e?.message || "Could not load manufacturing BOMs.");
    } finally {
      setMbomsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadBoms(typeFilter);
  }, [typeFilter, loadBoms]);

  React.useEffect(() => {
    loadMboms();
  }, [loadMboms]);

  const openMbom = async (id) => {
    setDetailLoading(true);
    try {
      const found = await api.mbom.headers.get(id);
      setDetail(found);
    } catch (e) {
      toast(e?.message || "Could not open that MBOM.", { kind: "error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const derive = async () => {
    setDeriving(true);
    setDeriveError(null);
    try {
      const created = await api.mbom.derive({
        ebom_id: Number(deriveDraft.ebom_id),
        name: deriveDraft.name.trim() || undefined,
      });
      toast(
        (__t("mbom.derived") || "Manufacturing BOM created") + ": " + created.mbom_number,
        { kind: "success" },
      );
      setShowDerive(false);
      setDeriveDraft({ ebom_id: "", name: "" });
      await loadMboms();
      setDetail(created);
    } catch (e) {
      setDeriveError(e?.message || "Could not derive an MBOM from that EBOM.");
    } finally {
      setDeriving(false);
    }
  };

  const bomColumns = [
    {
      key: "bom_number",
      header: __t("mbom.colNumber") || "BOM #",
      render: (b) => <span className="font-mono fs-11">{b.bom_number}</span>,
    },
    { key: "name", header: __t("common.name") || "Name" },
    {
      key: "bom_type",
      header: __t("mbom.colType") || "Type",
      render: (b) => <Badge tone={typeTone(b.bom_type)}>{b.bom_type || "EBOM"}</Badge>,
    },
    {
      key: "status",
      header: __t("common.status") || "Status",
      render: (b) => <StatusPill status={b.status} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (b) =>
        (b.bom_type || "EBOM") === "EBOM" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeriveError(null);
              setDeriveDraft({ ebom_id: String(b.id), name: `${b.name} (MBOM)` });
              setShowDerive(true);
            }}
          >
            {__t("mbom.deriveAction") || "Derive MBOM"}
          </Button>
        ) : null,
    },
  ];

  const mbomColumns = [
    {
      key: "mbom_number",
      header: __t("mbom.colNumber") || "MBOM #",
      render: (m) => <span className="font-mono fs-11">{m.mbom_number}</span>,
    },
    { key: "name", header: __t("common.name") || "Name" },
    {
      key: "ebom_id",
      header: __t("mbom.colSourceEbom") || "Source EBOM",
      render: (m) => (
        <span className="font-mono fs-11">
          {m.ebom_id != null ? `BOM #${m.ebom_id}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("common.status") || "Status",
      render: (m) => <StatusPill status={m.status} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (m) => (
        <Button variant="ghost" size="sm" onClick={() => openMbom(m.id)}>
          {__t("common.open") || "Open"}
        </Button>
      ),
    },
  ];

  const detailItemColumns = [
    {
      key: "part_id",
      header: __t("mbom.colPart") || "Part",
      render: (i) => <span className="font-mono fs-11">{`part #${i.part_id}`}</span>,
    },
    { key: "quantity", header: __t("mbom.colQty") || "Qty", align: "num" },
    { key: "unit", header: __t("mbom.colUnit") || "Unit" },
    {
      key: "work_center",
      header: __t("mbom.colWorkCenter") || "Work center",
      render: (i) => i.work_center || "—",
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("mbom.title") || "xBOM — Multi-BOM Types"}
        description={
          __t("mbom.subtitle") ||
          "Every BOM is tagged EBOM, MBOM or SBOM. Derive a manufacturing view from an engineering BOM to let it diverge without touching the source."
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setDeriveError(null);
              setDeriveDraft({ ebom_id: "", name: "" });
              setShowDerive(true);
            }}
          >
            {__t("mbom.deriveAction") || "Derive MBOM"}
          </Button>
        }
      />

      <Card
        title={__t("mbom.bomsTitle") || "Bills of Material"}
        actions={
          <Field label={__t("mbom.filterByType") || "Filter by type"} htmlFor="bom-type-filter">
            <Select
              id="bom-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t || __t("common.all") || "All types"}
                </option>
              ))}
            </Select>
          </Field>
        }
      >
        {bomsError && (
          <div role="alert" className="mb-14 fs-12 fg-danger">
            {bomsError}
          </div>
        )}
        {bomsLoading ? (
          <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
        ) : (
          <DataTable
            dense
            zebra
            ariaLabel={__t("mbom.bomsTitle") || "Bills of Material"}
            columns={bomColumns}
            rows={boms}
            getRowKey={(b) => b.id}
            empty={
              <EmptyState
                title={__t("mbom.noBoms") || "No BOMs of this type"}
                message={
                  __t("mbom.noBomsMsg") ||
                  "Create a BOM, or clear the type filter to see every BOM."
                }
              />
            }
          />
        )}
      </Card>

      <Card
        title={__t("mbom.mbomsTitle") || "Manufacturing BOMs"}
        className="mt-14"
      >
        {mbomsError && (
          <div role="alert" className="mb-14 fs-12 fg-danger">
            {mbomsError}
          </div>
        )}
        {mbomsLoading ? (
          <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
        ) : (
          <DataTable
            dense
            zebra
            ariaLabel={__t("mbom.mbomsTitle") || "Manufacturing BOMs"}
            columns={mbomColumns}
            rows={mboms}
            getRowKey={(m) => m.id}
            empty={
              <EmptyState
                title={__t("mbom.noMboms") || "No manufacturing BOMs yet"}
                message={
                  __t("mbom.noMbomsMsg") ||
                  "Derive one from an existing EBOM to give manufacturing its own view of the structure."
                }
              />
            }
          />
        )}
      </Card>

      {detailLoading && (
        <div className="mt-14 flex items-center gap-8 fg-3 fs-12">
          <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
        </div>
      )}

      {detail && !detailLoading && (
        <Card
          className="mt-14"
          title={detail.name}
          subtitle={detail.mbom_number}
          actions={<StatusPill status={detail.status} />}
        >
          <dl className="mbom__facts">
            <div>
              <dt>{__t("mbom.colSourceEbom") || "Source EBOM"}</dt>
              <dd className="font-mono">
                {detail.ebom_id != null ? `BOM #${detail.ebom_id}` : "—"}
              </dd>
            </div>
          </dl>
          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("mbom.items") || "Items (copied from the source EBOM)"}
          </h4>
          <DataTable
            dense
            zebra
            ariaLabel={__t("mbom.items") || "MBOM items"}
            columns={detailItemColumns}
            rows={Array.isArray(detail.items) ? detail.items : []}
            getRowKey={(i) => i.id}
            empty={
              <EmptyState
                title={__t("mbom.noItems") || "This MBOM has no items"}
              />
            }
          />
        </Card>
      )}

      <Modal
        open={showDerive}
        onClose={() => setShowDerive(false)}
        title={__t("mbom.deriveTitle") || "Derive a manufacturing BOM"}
        subtitle={
          __t("mbom.deriveSubtitle") ||
          "Copies the EBOM's structure into a new MBOM. The source EBOM is never modified."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDerive(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="primary"
              loading={deriving}
              disabled={!deriveDraft.ebom_id}
              onClick={derive}
            >
              {__t("mbom.deriveAction") || "Derive MBOM"}
            </Button>
          </>
        }
      >
        {deriveError && (
          <div role="alert" className="mb-14 fs-12 fg-danger">
            {deriveError}
          </div>
        )}
        <Field label={__t("mbom.sourceEbomId") || "Source EBOM id"} htmlFor="derive-ebom-id" required>
          <Input
            id="derive-ebom-id"
            type="number"
            value={deriveDraft.ebom_id}
            onChange={(e) => setDeriveDraft({ ...deriveDraft, ebom_id: e.target.value })}
          />
        </Field>
        <Field label={__t("mbom.newName") || "MBOM name (optional)"} htmlFor="derive-name">
          <Input
            id="derive-name"
            value={deriveDraft.name}
            onChange={(e) => setDeriveDraft({ ...deriveDraft, name: e.target.value })}
            placeholder="Defaults to “<EBOM name> (MBOM)”"
          />
        </Field>
      </Modal>

      <style>{`
        .mbom__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--sp-3, 12px);
          margin: 0 0 var(--sp-3, 12px);
        }
        .mbom__facts dt {
          font-size: var(--fs-075, 11px);
          color: var(--text-muted, var(--fg-3));
          margin-bottom: 2px;
        }
        .mbom__facts dd {
          margin: 0;
          font-size: var(--fs-100, 13px);
          color: var(--text-primary, var(--fg));
        }
      `}</style>
    </div>
  );
}

MbomScreen.displayName = "MbomScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.MbomScreen = MbomScreen;
