import PropTypes from "prop-types";

import { api } from "../../api.js";
import { toast } from "../utils/toast";
import { DataTable, EmptyState, Field, Input, Select, StatusPill, Switch, Button, Spinner } from "./ui";

// RoHS/REACH substance composition + computed compliance for a single part.
// Wired to app.api.endpoints.substance_compliance_api: substance catalog is
// read-only reference data here; the part's declared composition
// (PartSubstance rows) is viewable + editable; rohs_status/svhc_substances
// are server-DERIVED (app.services.substance_compliance_service) and never
// computed client-side.
const ROHS_TONE = {
  compliant: "success",
  non_compliant: "danger",
  exempt: "warning",
  unknown: "neutral",
};

export function PartComplianceTab({ row }) {
  // `row.id` is a synthetic tree-node key ("api-" + backend id for API-backed
  // rows, or a fixture id like "r1.4.1" for demo rows) — never the real
  // backend part id. The real numeric id is threaded separately as
  // `row.partId` by convertApiPartsToTree (utils/bom.js). Demo/fixture rows
  // have no `partId` at all, so this correctly falls through to the
  // honest-failure path below rather than sending a bogus id to the API.
  const partId = typeof row?.partId === "number" ? row.partId : null;
  const [substances, setSubstances] = React.useState([]);
  const [composition, setComposition] = React.useState([]);
  const [compliance, setCompliance] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [newSubstanceId, setNewSubstanceId] = React.useState("");
  const [newMassPpm, setNewMassPpm] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    if (partId == null) {
      setLoading(false);
      setError("This part has no backend id — composition cannot be loaded.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [subs, comp, rohs] = await Promise.all([
        api.substanceCompliance.substances.list(),
        api.substanceCompliance.partComposition.list(partId),
        api.substanceCompliance.partCompliance(partId),
      ]);
      setSubstances(Array.isArray(subs) ? subs : []);
      setComposition(Array.isArray(comp) ? comp : []);
      setCompliance(rohs);
    } catch (e) {
      // Honest failure — no fabricated compliance status.
      setError(e?.message || "Failed to load substance compliance data.");
      setComposition([]);
      setCompliance(null);
    } finally {
      setLoading(false);
    }
  }, [partId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const substanceName = (id) => substances.find((s) => s.id === id)?.name || `#${id}`;

  const saveRow = async (rowId, patch) => {
    try {
      await api.substanceCompliance.partComposition.update(partId, rowId, patch);
      await load();
    } catch (e) {
      toast(e?.message || "Failed to update composition entry", { kind: "error" });
    }
  };

  const deleteRow = async (rowId) => {
    try {
      await api.substanceCompliance.partComposition.delete(partId, rowId);
      toast("Substance declaration removed", { kind: "success" });
      await load();
    } catch (e) {
      toast(e?.message || "Failed to delete composition entry", { kind: "error" });
    }
  };

  const addRow = async (e) => {
    e.preventDefault();
    if (!newSubstanceId) {
      toast("Choose a substance first", { kind: "warn" });
      return;
    }
    setAdding(true);
    try {
      await api.substanceCompliance.partComposition.add(partId, {
        substance_id: Number(newSubstanceId),
        mass_ppm: Number(newMassPpm) || 0,
      });
      toast("Substance declared for this part", { kind: "success" });
      setNewSubstanceId("");
      setNewMassPpm("");
      await load();
    } catch (err) {
      // Honest failure — e.g. duplicate declaration, missing permission.
      toast(err?.message || "Failed to add substance declaration", { kind: "error" });
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-8 fg-3 fs-12" style={{ padding: "24px 0" }}>
        <Spinner size="sm" label="Loading compliance data…" />
        <span aria-hidden="true">Loading…</span>
      </div>
    );
  }

  const columns = [
    {
      key: "substance",
      header: "Substance",
      render: (r) => <span className="fw-500">{substanceName(r.substance_id)}</span>,
    },
    {
      key: "mass_ppm",
      header: "Mass (ppm)",
      align: "num",
      render: (r) => (
        <Input
          type="number"
          mono
          defaultValue={r.mass_ppm ?? 0}
          style={{ width: 90 }}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v) && v !== r.mass_ppm) saveRow(r.id, { mass_ppm: v });
          }}
          aria-label={`Mass ppm for ${substanceName(r.substance_id)}`}
        />
      ),
    },
    {
      key: "is_exempt",
      header: "Exempt",
      render: (r) => (
        <Switch
          checked={!!r.is_exempt}
          onChange={(checked) => saveRow(r.id, { is_exempt: checked })}
          aria-label={`Exempt: ${substanceName(r.substance_id)}`}
        />
      ),
    },
    {
      key: "notes",
      header: "Notes",
      render: (r) => <span className="fs-11 fg-3">{r.notes || "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => deleteRow(r.id)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-12 fs-12"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-2, 6px)",
            background: "color-mix(in oklch, var(--status-danger, red) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {compliance && (
        <div className="flex items-center gap-10 mb-14" style={{ flexWrap: "wrap" }}>
          <StatusPill
            tone={ROHS_TONE[compliance.rohs_status] || "neutral"}
            label={`RoHS: ${String(compliance.rohs_status || "unknown").replace("_", " ")}`}
          />
          {compliance.svhc_substances && compliance.svhc_substances.length > 0 ? (
            compliance.svhc_substances.map((s) => (
              <span
                key={s.id}
                className="fs-10 font-mono"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "color-mix(in oklch, var(--status-warning, orange) 14%, transparent)",
                }}
                title={s.cas_number || undefined}
              >
                SVHC: {s.name}
              </span>
            ))
          ) : (
            <span className="fs-11 fg-3">No SVHC substances declared above threshold.</span>
          )}
        </div>
      )}

      <DataTable
        dense
        ariaLabel="Substance composition"
        columns={columns}
        rows={composition}
        getRowKey={(r) => r.id}
        empty={<EmptyState title="No substances declared for this part yet" />}
      />

      <form onSubmit={addRow} className="d-grid gap-8 mt-14" style={{ gridTemplateColumns: "2fr 1fr auto" }}>
        <Field label="Add substance" htmlFor="add-substance-select">
          <Select
            id="add-substance-select"
            value={newSubstanceId}
            onChange={(e) => setNewSubstanceId(e.target.value)}
          >
            <option value="">Select a substance…</option>
            {substances.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.is_svhc ? " (SVHC)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mass (ppm)" htmlFor="add-substance-ppm">
          <Input
            id="add-substance-ppm"
            type="number"
            mono
            value={newMassPpm}
            onChange={(e) => setNewMassPpm(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="primary" loading={adding} disabled={!newSubstanceId}>
            Add
          </Button>
        </div>
      </form>
    </>
  );
}

PartComplianceTab.propTypes = {
  row: PropTypes.object,
};

export default PartComplianceTab;
