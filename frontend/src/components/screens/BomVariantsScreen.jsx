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

// ============ BOM VARIANTS ============
//
// Configurable-BOM variants (bom_variants / bom_variant_items, see
// app/models/bom_variant.py). A variant is a named deviation from a base BOM:
// its own item set, with optional lines, substitutes and a condition
// expression that decides when a line applies.
//
// Deliberate scope limit — the backend exposes exactly three routes for this
// (POST /bom/variants, GET /bom/variants/{id}, POST /bom/variants/items) and
// there is NO list endpoint, so this screen cannot show "all variants": it
// opens one variant at a time by id, and remembers the ones opened this
// session so the user isn't retyping ids. Nothing is invented to fill that
// gap. When a GET /bom/variants list route lands, this screen becomes a
// straight table over it.
// ponytail: no list route upstream, so recents live in component state only;
// replace with a real list fetch once the endpoint exists.

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function fmtQty(v) {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : String(n);
}

const emptyDraft = { base_bom_id: "", variant_name: "", description: "" };

export default function BomVariantsScreen() {
  const [variantId, setVariantId] = React.useState("");
  const [variant, setVariant] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Variants opened during this session — the only "list" honestly available.
  const [recent, setRecent] = React.useState([]);

  const [showCreate, setShowCreate] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const open = React.useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const found = await api.bomEnterprise.variants.get(id);
      setVariant(found);
      setVariantId(String(id));
      setRecent((prev) => {
        const without = prev.filter((v) => v.id !== found.id);
        return [found, ...without].slice(0, 10);
      });
    } catch (e) {
      // Honest failure — do not fall back to fabricated/sample rows.
      setVariant(null);
      setError(e?.message || `No BOM variant found for id ${id}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const onLookup = (e) => {
    e.preventDefault();
    const id = variantId.trim();
    if (id) open(id);
  };

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.bomEnterprise.variants.create({
        base_bom_id: Number(draft.base_bom_id),
        variant_name: draft.variant_name.trim(),
        description: draft.description.trim() || null,
      });
      toast(
        (__t("bomVariants.created") || "Variant created") +
          ": " +
          (created?.variant_name || draft.variant_name),
        { kind: "success" },
      );
      setShowCreate(false);
      setDraft(emptyDraft);
      // The create response is a different (thinner) shape than the detail
      // response, so re-read the variant rather than rendering the POST body.
      if (created?.id != null) await open(created.id);
    } catch (e) {
      setCreateError(e?.message || "Could not create the variant.");
    } finally {
      setCreating(false);
    }
  };

  const canCreate = draft.base_bom_id && draft.variant_name.trim();

  const itemColumns = [
    {
      key: "part_number",
      header: __t("bomVariants.colPart") || "Part number",
      render: (i) =>
        i.part_number ? (
          <span className="font-mono fs-12">{i.part_number}</span>
        ) : (
          <span className="font-mono fs-11 fg-3">
            {i.part_id != null ? `part #${i.part_id}` : "—"}
          </span>
        ),
    },
    {
      key: "quantity",
      header: __t("bomVariants.colQty") || "Qty",
      align: "num",
      render: (i) => fmtQty(i.quantity),
    },
    {
      key: "is_optional",
      header: __t("bomVariants.colOptional") || "Optional",
      render: (i) =>
        i.is_optional
          ? __t("common.yes") || "Yes"
          : __t("common.no") || "No",
    },
    {
      key: "substitute_part_id",
      header: __t("bomVariants.colSubstitute") || "Substitute",
      render: (i) => (
        <span className="font-mono fs-11">
          {i.substitute_part_id != null ? `part #${i.substitute_part_id}` : "—"}
        </span>
      ),
    },
    {
      key: "condition_expression",
      header: __t("bomVariants.colCondition") || "Applies when",
      render: (i) =>
        i.condition_expression ? (
          <span className="font-mono fs-11">{i.condition_expression}</span>
        ) : (
          <span className="fg-3">{__t("bomVariants.always") || "Always"}</span>
        ),
    },
  ];

  const recentColumns = [
    {
      key: "id",
      header: __t("bomVariants.colId") || "Variant",
      render: (v) => <span className="font-mono fs-11">#{v.id}</span>,
    },
    {
      key: "variant_name",
      header: __t("bomVariants.colName") || "Name",
      render: (v) => <span className="fs-12">{v.variant_name}</span>,
    },
    {
      key: "base_bom_id",
      header: __t("bomVariants.colBaseBom") || "Base BOM",
      render: (v) => (
        <span className="font-mono fs-11">
          {v.base_bom_id != null ? `BOM #${v.base_bom_id}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("bomVariants.colStatus") || "Status",
      render: (v) => <StatusPill status={v.status} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (v) => (
        <Button variant="ghost" size="sm" onClick={() => open(v.id)}>
          {__t("common.open") || "Open"}
        </Button>
      ),
    },
  ];

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("bomVariants.title") || "BOM Variants"}
        description={
          __t("bomVariants.subtitle") ||
          "Configurable variants of a base BOM — their item set, optional lines, substitutes and applicability rules"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCreateError(null);
              setShowCreate(true);
            }}
          >
            {__t("bomVariants.new") || "New variant"}
          </Button>
        }
      />

      <form className="flex items-end gap-8 mb-14" onSubmit={onLookup}>
        <Field
          label={__t("bomVariants.lookup") || "Open a variant by id"}
          hint={
            __t("bomVariants.lookupHint") ||
            "The API has no list endpoint for variants yet, so variants are opened by id."
          }
          htmlFor="variant-lookup"
        >
          <Input
            id="variant-lookup"
            name="variantLookup"
            type="number"
            mono
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="e.g. 7"
          />
        </Field>
        <Button type="submit" variant="secondary" size="sm" loading={loading}>
          {__t("common.open") || "Open"}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="mb-14 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background:
              "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {loading && !variant && (
        <div
          className="flex items-center gap-8 fg-3 fs-12"
          style={{ padding: "32px 0" }}
        >
          <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
          <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
        </div>
      )}

      {!loading && !error && !variant && (
        <EmptyState
          title={
            __t("bomVariants.empty") || "No BOM variant open"
          }
          message={
            __t("bomVariants.emptyMsg") ||
            "Open a variant by its id, or create one against a base BOM."
          }
        />
      )}

      {variant && (
        <Card
          title={variant.variant_name}
          subtitle={variant.description || undefined}
          actions={<StatusPill status={variant.status} />}
        >
          <dl className="bomvar__facts">
            <div>
              <dt>{__t("bomVariants.colId") || "Variant"}</dt>
              <dd className="font-mono">#{variant.id}</dd>
            </div>
            <div>
              <dt>{__t("bomVariants.colBaseBom") || "Base BOM"}</dt>
              <dd className="font-mono">
                {variant.base_bom_id != null
                  ? `BOM #${variant.base_bom_id}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{__t("bomVariants.created") || "Created"}</dt>
              <dd>{fmtDate(variant.created_at)}</dd>
            </div>
          </dl>

          {variant.configuration_rules != null && (
            <>
              <h4 className="fs-12 fw-600 mt-14 mb-8">
                {__t("bomVariants.rules") || "Configuration rules"}
              </h4>
              <pre className="bomvar__rules">
                {JSON.stringify(variant.configuration_rules, null, 2)}
              </pre>
            </>
          )}

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("bomVariants.items") || "Variant items"}
          </h4>
          <DataTable
            dense
            zebra
            ariaLabel={__t("bomVariants.items") || "Variant items"}
            columns={itemColumns}
            rows={Array.isArray(variant.items) ? variant.items : []}
            getRowKey={(i) => i.id}
            empty={
              <EmptyState
                title={
                  __t("bomVariants.noItems") ||
                  "This variant has no items yet"
                }
                message={
                  __t("bomVariants.noItemsMsg") ||
                  "Variant lines are added from the BOM editor against the base BOM."
                }
              />
            }
          />
        </Card>
      )}

      {recent.length > 1 && (
        <div className="mt-14">
          <h4 className="fs-12 fw-600 mb-8">
            {__t("bomVariants.recent") || "Opened this session"}
          </h4>
          <DataTable
            dense
            ariaLabel={__t("bomVariants.recent") || "Opened this session"}
            columns={recentColumns}
            rows={recent}
            getRowKey={(v) => v.id}
          />
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={__t("bomVariants.new") || "New BOM variant"}
        subtitle={
          __t("bomVariants.newSubtitle") ||
          "A variant is created against an existing base BOM and starts with no items."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {__t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="primary"
              loading={creating}
              disabled={!canCreate}
              onClick={create}
            >
              {__t("common.create") || "Create"}
            </Button>
          </>
        }
      >
        {createError && (
          <div role="alert" className="mb-14 fs-12 fg-danger">
            {createError}
          </div>
        )}
        <Field
          label={__t("bomVariants.colBaseBom") || "Base BOM id"}
          htmlFor="variant-new-bom"
          required
        >
          <Input
            id="variant-new-bom"
            type="number"
            value={draft.base_bom_id}
            onChange={(e) => setDraft({ ...draft, base_bom_id: e.target.value })}
          />
        </Field>
        <Field
          label={__t("bomVariants.colName") || "Variant name"}
          htmlFor="variant-new-name"
          required
        >
          <Input
            id="variant-new-name"
            value={draft.variant_name}
            onChange={(e) =>
              setDraft({ ...draft, variant_name: e.target.value })
            }
            placeholder="230 V / EU"
          />
        </Field>
        <Field
          label={__t("common.description") || "Description"}
          htmlFor="variant-new-desc"
        >
          <Textarea
            id="variant-new-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
      </Modal>

      <style>{`
        .bomvar__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--sp-3, 12px);
          margin: 0;
        }
        .bomvar__facts dt {
          font-size: var(--fs-075, 11px);
          color: var(--text-muted, var(--fg-3));
          margin-bottom: 2px;
        }
        .bomvar__facts dd {
          margin: 0;
          font-size: var(--fs-100, 13px);
          color: var(--text-primary, var(--fg));
        }
        .bomvar__rules {
          margin: 0;
          padding: var(--sp-2, 8px);
          border-radius: var(--r-2, 6px);
          background: var(--bg-sunken, var(--bg-2, transparent));
          font-size: var(--fs-075, 11px);
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}

BomVariantsScreen.displayName = "BomVariantsScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.BomVariantsScreen = BomVariantsScreen;
