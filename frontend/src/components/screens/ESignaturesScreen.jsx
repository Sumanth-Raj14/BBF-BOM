import { __t } from "../../i18n";
import { api } from "../../../api.js";
import { Icon } from "../../globals";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Pagination,
  ScreenHeader,
  StatusPill,
} from "../ui";
import { DataTable } from "../ui/DataTable.jsx";

// ============ E-SIGNATURE REGISTER (21 CFR Part 11) ============
//
// Read-only view over GET /esignatures/ (api.esignatures.list). ESignature
// rows are write-once — they are created only as a side effect of a guarded
// action, by app.services.part11_service.sign_action (e.g. the ECO
// approve/implement flow re-authenticates the user and records the
// attestation). There is no create/update/delete endpoint for this model
// anywhere in the backend, so this screen renders NO editing controls and no
// "Sign" button: signing belongs to the action being attested to, not here.
//
// The endpoint is admin-gated and tenant-scoped on the backend, so no
// additional filtering happens client-side. entity_type / entity_id are sent
// as real server-side query params and paging uses page/per_page — this is
// never a client-side filter over one fetched page.

const PER_PAGE = 50;

// The API layer returns whatever the endpoint serialises; this router uses
// response_model=None over the ORM rows, so keys arrive snake_case, while
// most other endpoints in this app hand back camelCase. Read both.
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row?.[k] != null) return row[k];
  }
  return undefined;
};

function fmtWhen(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

// Signature actions are namespaced verbs like "eco.approve" / "eco.reject".
const actionTone = (action) => {
  const a = String(action || "").toLowerCase();
  if (a.includes("reject") || a.includes("cancel") || a.includes("delete")) {
    return "danger";
  }
  if (a.includes("approve") || a.includes("implement") || a.includes("release")) {
    return "success";
  }
  return "info";
};

export default function ESignaturesScreen() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(null);
  const [pageCount, setPageCount] = React.useState(1);

  // Draft vs applied: typing must not fire a request per keystroke, so the
  // drafts are only committed on submit (and that commit is what `load`
  // depends on).
  const [entityTypeDraft, setEntityTypeDraft] = React.useState("");
  const [entityIdDraft, setEntityIdDraft] = React.useState("");
  const [filters, setFilters] = React.useState({ entityType: "", entityId: "" });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No sort_by/sort_dir: this endpoint hardcodes ORDER BY signed_at DESC
      // and ignores those params, so sending them would be theatre.
      const params = { page, per_page: PER_PAGE };
      if (filters.entityType.trim()) params.entity_type = filters.entityType.trim();
      if (filters.entityId.trim()) params.entity_id = filters.entityId.trim();

      const res = await api.esignatures.list(params);
      const items = Array.isArray(res) ? res : res?.items || res?.data || [];
      setRows(items);

      const reported = pick(res, "total", "totalCount", "total_count");
      if (reported != null) {
        setTotal(Number(reported));
        const reportedPages = pick(res, "total_pages", "totalPages");
        setPageCount(
          reportedPages != null
            ? Number(reportedPages)
            : Math.max(1, Math.ceil(Number(reported) / PER_PAGE)),
        );
      } else {
        // No total on the response — do not invent one. A short page means
        // this is the last page, so "next" simply has nowhere to go.
        setTotal(null);
        setPageCount(items.length < PER_PAGE ? page : page + 1);
      }
    } catch (e) {
      // Honest failure: surface it, never fall back to placeholder rows.
      setError(e?.message || String(e));
      setRows([]);
      setTotal(null);
      setPageCount(1);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  React.useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters({ entityType: entityTypeDraft, entityId: entityIdDraft });
  };

  const clearFilters = () => {
    setEntityTypeDraft("");
    setEntityIdDraft("");
    setPage(1);
    setFilters({ entityType: "", entityId: "" });
  };

  const hasFilters = Boolean(filters.entityType || filters.entityId);

  // Suggestions come from what the server actually returned — there is no
  // entity-type enumeration endpoint, so nothing here is hardcoded.
  const knownTypes = Array.from(
    new Set(rows.map((r) => pick(r, "entityType", "entity_type")).filter(Boolean)),
  );

  const columns = [
    {
      key: "signedAt",
      header: __t("esign.signedAt") || "Signed at",
      render: (row) => (
        <span className="esign__when">
          {fmtWhen(pick(row, "signedAt", "signed_at", "createdAt", "created_at"))}
        </span>
      ),
    },
    {
      key: "signer",
      header: __t("esign.signer") || "Signed by",
      render: (row) => {
        const email = pick(row, "userEmail", "user_email");
        const name = pick(row, "userName", "user_name", "fullName", "full_name");
        const uid = pick(row, "userId", "user_id");
        if (email || name) {
          return (
            <div>
              <div className="esign__signer">{name || email}</div>
              {name && email && <div className="esign__signer-sub">{email}</div>}
            </div>
          );
        }
        return (
          <span className="esign__signer">
            {uid != null ? `${__t("esign.user") || "User"} #${uid}` : "—"}
          </span>
        );
      },
    },
    {
      key: "action",
      header: __t("esign.action") || "Action",
      render: (row) => {
        const action = pick(row, "action");
        // StatusPill renders `label ?? status` — it does not render children.
        return action ? (
          <StatusPill tone={actionTone(action)} label={action} />
        ) : (
          <span className="esign__muted">—</span>
        );
      },
    },
    {
      key: "entity",
      header: __t("esign.entity") || "Record signed",
      render: (row) => {
        const type = pick(row, "entityType", "entity_type");
        const id = pick(row, "entityId", "entity_id");
        return (
          <span className="esign__entity">
            {type || "—"}
            {id != null ? ` #${id}` : ""}
          </span>
        );
      },
    },
    {
      key: "meaning",
      header: __t("esign.meaning") || "Meaning / reason",
      render: (row) => {
        const meaning = pick(row, "meaning", "reason");
        return meaning ? (
          <span className="esign__meaning" title={String(meaning)}>
            {String(meaning)}
          </span>
        ) : (
          <span className="esign__muted">—</span>
        );
      },
    },
    {
      key: "hash",
      header: __t("esign.hash") || "Content hash",
      render: (row) => {
        const hash = pick(row, "contentHash", "content_hash");
        if (!hash) return <span className="esign__muted">—</span>;
        return (
          <span className="esign__hash" title={String(hash)}>
            {String(hash).slice(0, 12)}…
          </span>
        );
      },
    },
  ];

  const firstOnPage = (page - 1) * PER_PAGE + 1;

  return (
    <div className="esign">
      <ScreenHeader
        title={__t("esign.title") || "E-Signature Register"}
        description={
          __t("esign.subtitle") ||
          "Immutable record of electronic signatures captured under 21 CFR Part 11. Signatures are created by the action being attested to and cannot be edited here."
        }
      />

      <form className="esign__toolbar" onSubmit={applyFilters}>
        <Field
          label={__t("esign.filterEntityType") || "Entity type"}
          htmlFor="esign-entity-type"
        >
          <Input
            id="esign-entity-type"
            name="esignEntityType"
            list="esign-entity-types"
            placeholder={__t("esign.filterEntityTypeHint") || "e.g. eco"}
            value={entityTypeDraft}
            onChange={(e) => setEntityTypeDraft(e.target.value)}
          />
        </Field>
        <datalist id="esign-entity-types">
          {knownTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <Field
          label={__t("esign.filterEntityId") || "Entity ID"}
          htmlFor="esign-entity-id"
        >
          <Input
            id="esign-entity-id"
            name="esignEntityId"
            type="number"
            min="1"
            placeholder={__t("esign.filterEntityIdHint") || "e.g. 142"}
            value={entityIdDraft}
            onChange={(e) => setEntityIdDraft(e.target.value)}
          />
        </Field>

        <div className="esign__toolbar-actions">
          <Button type="submit" variant="secondary" disabled={loading}>
            {__t("esign.applyFilters") || "Apply filters"}
          </Button>
          {(hasFilters || entityTypeDraft || entityIdDraft) && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearFilters}
              disabled={loading}
            >
              {__t("common.clear") || "Clear"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={load}
            disabled={loading}
          >
            <Icon.Refresh size={12} /> {__t("common.refresh") || "Refresh"}
          </Button>
        </div>
      </form>

      {loading && (
        <div className="esign__state" role="status">
          {__t("common.loading") || "Loading…"}
        </div>
      )}

      {!loading && error && (
        <div className="esign__state esign__state--error" role="alert">
          {(__t("esign.loadFailed") || "Could not load the signature register") +
            ": " +
            error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={__t("esign.emptyTitle") || "No signatures recorded"}
          message={
            hasFilters
              ? __t("esign.emptyFiltered") ||
                "No electronic signature matches this entity type and ID."
              : __t("esign.empty") ||
                "No electronic signatures have been captured yet. They are recorded automatically when a user signs a guarded action, such as approving an ECO."
          }
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            ariaLabel={__t("esign.tableLabel") || "Electronic signature register"}
            dense
          />

          <div className="esign__footer">
            <span className="esign__count">
              {total != null
                ? `${firstOnPage}–${firstOnPage + rows.length - 1} ${__t("common.of") || "of"} ${total}`
                : `${firstOnPage}–${firstOnPage + rows.length - 1}`}
            </span>
            <Pagination
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              ariaLabel={__t("esign.pagination") || "Signature register pages"}
            />
          </div>
        </>
      )}

      <style>{`
        .esign__toolbar {
          display: flex;
          gap: var(--sp-2);
          align-items: flex-end;
          flex-wrap: wrap;
          margin-bottom: var(--sp-3);
        }
        .esign__toolbar-actions {
          display: flex;
          gap: var(--sp-2);
          align-items: center;
        }
        .esign__when {
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary);
          font-size: var(--fs-075);
          white-space: nowrap;
        }
        .esign__signer { font-weight: var(--fw-medium); color: var(--text-primary); }
        .esign__signer-sub { font-size: var(--fs-075); color: var(--text-muted); }
        .esign__entity {
          font-family: var(--font-mono, monospace);
          font-size: var(--fs-075);
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .esign__meaning {
          display: block;
          max-width: 42ch;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-secondary);
        }
        .esign__hash {
          font-family: var(--font-mono, monospace);
          font-size: var(--fs-075);
          color: var(--text-muted);
        }
        .esign__muted { color: var(--text-muted); }
        .esign__state {
          padding: var(--sp-5);
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--fs-100);
        }
        .esign__state--error { color: var(--danger-text, #b42318); }
        .esign__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
          margin-top: var(--sp-3);
        }
        .esign__count {
          font-size: var(--fs-075);
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
