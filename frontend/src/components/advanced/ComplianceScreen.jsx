import { api, Icon } from "../../globals";
import {
  ScreenHeader,
  Tabs,
  TabPanel,
  Button,
  DataTable,
  StatusPill,
  Badge,
  EmptyState,
  Spinner,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  toast,
} from "../ui";

const COMPLIANCE_TABS_ID = "compliance-tabs";
const NEW_PACK_FORM_ID = "new-compliance-pack-form";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Domain compliance status -> semantic tone (not covered by the shared
// STATUS_TONES map, so resolved explicitly here).
const COMPLIANCE_TONE = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "neutral",
};

const EMPTY_PACK_FORM = { name: "", standard_id: "", description: "", checklist: "" };

// Derive a display status for one compliance standard's certification row
// (as returned by GET /compliance/compliance/parts/{id}) — real data only,
// never fabricated. `certified_by` absent means the part has no
// certification on file for that standard yet.
function certStatus(std) {
  if (!std || !std.certified_by) return "missing";
  if (!std.expiry_date) return "valid";
  const expiry = new Date(std.expiry_date);
  if (Number.isNaN(expiry.getTime())) return "valid";
  const now = new Date();
  if (expiry < now) return "expired";
  if (expiry.getTime() - now.getTime() <= NINETY_DAYS_MS) return "expiring";
  return "valid";
}

function findStandard(list, re) {
  return (list || []).find((c) => re.test(c.name || ""));
}

function ComplianceScreen() {
  const [docs, setDocs] = React.useState([]);
  const [packs, setPacks] = React.useState([]);
  const [standards, setStandards] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("parts");

  const [packModalOpen, setPackModalOpen] = React.useState(false);
  const [packForm, setPackForm] = React.useState(EMPTY_PACK_FORM);
  const [savingPack, setSavingPack] = React.useState(false);

  const loadCompliance = React.useCallback(() => {
    setLoading(true);
    return Promise.all([
      api.compliance.packs.list().catch(() => []),
      api.compliance.list().catch(() => []),
      api.parts.list({ limit: 100 }).catch(() => ({ items: [] })),
    ])
      .then(([packsData, standardsData, partsData]) => {
        setPacks(Array.isArray(packsData) ? packsData : []);
        setStandards(Array.isArray(standardsData) ? standardsData : []);
        const items = (partsData && partsData.items) || [];

        if (!items.length) {
          setDocs([]);
          return null;
        }

        // Per-part certification status is only exposed per-part by the
        // backend (no bulk endpoint yet) — fan out across the loaded page
        // of parts and gracefully drop any part whose lookup fails.
        return Promise.all(
          items.map((p) =>
            api.compliance.parts
              .status(p.id)
              .then((res) => ({ p, compliance: (res && res.compliance) || [] }))
              .catch(() => ({ p, compliance: [] })),
          ),
        ).then((rows) => {
          setDocs(
            rows.map(({ p, compliance }) => {
              const rohsStd = findStandard(compliance, /rohs/i);
              const reachStd = findStandard(compliance, /reach/i);
              const conflictStd = findStandard(compliance, /conflict/i);
              const lab =
                (reachStd && reachStd.certified_by) ||
                (rohsStd && rohsStd.certified_by) ||
                (conflictStd && conflictStd.certified_by) ||
                "—";
              return {
                pn: p.pn,
                id: p.id,
                rohs: certStatus(rohsStd),
                reach: certStatus(reachStd),
                conflict: certStatus(conflictStd),
                reach_expires: (reachStd && reachStd.expiry_date) || null,
                lab,
              };
            }),
          );
        });
      })
      .catch(() => {
        setDocs([]);
        setPacks([]);
        setStandards([]);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  const totals = {
    valid: docs.filter(
      (d) =>
        d.rohs === "valid" && d.reach === "valid" && d.conflict === "valid",
    ).length,
    expiring: docs.filter((d) => Object.values(d).includes("expiring")).length,
    missing: docs.filter((d) => Object.values(d).includes("missing")).length,
    expired: docs.filter((d) => Object.values(d).includes("expired")).length,
  };

  const tabItems = [
    { value: "parts", label: "Parts", count: docs.length },
    { value: "packs", label: "Compliance Packs", count: packs.length },
  ];

  const loadingRow = (label) => (
    <div
      className="flex items-center gap-8 fg-3 fs-12"
      style={{ padding: "32px 0" }}
    >
      <Spinner size="sm" label={label} />
      <span aria-hidden="true">Loading…</span>
    </div>
  );

  const statusCell = (status) => (
    <StatusPill
      tone={COMPLIANCE_TONE[status] || "neutral"}
      label={String(status || "—").toUpperCase()}
    />
  );

  const partColumns = [
    {
      key: "pn",
      header: "Part No.",
      render: (d) => <span className="mono fw-600">{d.pn}</span>,
    },
    { key: "rohs", header: "RoHS", render: (d) => statusCell(d.rohs) },
    { key: "reach", header: "REACH", render: (d) => statusCell(d.reach) },
    {
      key: "conflict",
      header: "Conflict Minerals",
      render: (d) => statusCell(d.conflict),
    },
    {
      key: "lab",
      header: "Lab / Source",
      render: (d) => <span className="mono fg-3">{d.lab}</span>,
    },
    {
      key: "reach_expires",
      header: "Cert expires",
      render: (d) => (
        <span
          className="mono"
          style={{
            color:
              d.reach === "expiring" || d.reach === "expired"
                ? "var(--warn)"
                : "var(--fg-3)",
          }}
        >
          {d.reach_expires || "—"}
        </span>
      ),
    },
  ];

  const packColumns = [
    {
      key: "name",
      header: "Pack Name",
      render: (p) => <span className="fw-600">{p.name || p.pack_name}</span>,
    },
    {
      key: "standard",
      header: "Standard",
      render: (p) => (
        <Badge tone="accent">{p.standard_name || p.standard || "—"}</Badge>
      ),
    },
    {
      key: "requirement_count",
      header: "Requirements",
      align: "right",
      render: (p) => (
        <span className="mono">
          {(p.checklist && p.checklist.length) || p.requirement_count || 0}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        const std = standards.find((s) => s.id === p.standard_id);
        const active = std ? std.isActive : undefined;
        return (
          <StatusPill
            tone={active ? "success" : "neutral"}
            label={active == null ? "—" : active ? "Active" : "Inactive"}
          />
        );
      },
    },
  ];

  function openPackModal() {
    setPackForm({
      ...EMPTY_PACK_FORM,
      standard_id: standards[0] ? String(standards[0].id) : "",
    });
    setPackModalOpen(true);
  }

  function closePackModal() {
    if (savingPack) return;
    setPackModalOpen(false);
  }

  function updatePackForm(field) {
    return (e) => {
      const value = e.target.value;
      setPackForm((f) => ({ ...f, [field]: value }));
    };
  }

  async function handleCreatePack(e) {
    e.preventDefault();
    if (!packForm.name.trim() || !packForm.standard_id) {
      toast("Pack name and standard are required.", { kind: "error" });
      return;
    }
    setSavingPack(true);
    try {
      const created = await api.compliance.packs.create({
        name: packForm.name.trim(),
        standard_id: Number(packForm.standard_id),
        description: packForm.description.trim() || undefined,
        checklist: packForm.checklist
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setPacks((prev) => [...prev, created]);
      toast(`Compliance pack "${created.name || packForm.name}" created.`, {
        kind: "success",
      });
      setPackModalOpen(false);
    } catch (err) {
      toast((err && err.message) || "Failed to create compliance pack.", {
        kind: "error",
      });
    } finally {
      setSavingPack(false);
    }
  }

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title="Compliance"
        description={
          loading
            ? "Loading…"
            : `${docs.length} parts tracked · ${packs.length} compliance packs · RoHS · REACH · Conflict Minerals`
        }
      />

      <Tabs
        id={COMPLIANCE_TABS_ID}
        items={tabItems}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Compliance view"
        className="mb-16"
      />

      <div
        className="kpi-grid mb-16"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          { l: "Fully compliant", v: totals.valid, c: "var(--ok)" },
          { l: "Expiring < 90d", v: totals.expiring, c: "var(--warn)" },
          { l: "Missing certs", v: totals.missing, c: "var(--fg-3)" },
          { l: "Expired", v: totals.expired, c: "var(--danger)" },
        ].map((k) => (
          <div key={k.l} className="kpi">
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: k.c }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      <TabPanel
        id={COMPLIANCE_TABS_ID}
        value="parts"
        active={activeTab === "parts"}
      >
        <DataTable
          dense
          ariaLabel="Parts compliance"
          columns={partColumns}
          rows={docs}
          getRowKey={(d) => d.pn}
          empty={loading ? loadingRow("Loading compliance data…") : <EmptyState title="No parts tracked" />}
        />
      </TabPanel>

      <TabPanel
        id={COMPLIANCE_TABS_ID}
        value="packs"
        active={activeTab === "packs"}
      >
        <div className="flex justify-between items-center mb-12">
          <h3 className="m-0 fs-14 fw-600">Compliance Packs</h3>
          <Button variant="primary" size="sm" onClick={openPackModal}>
            <Icon.Plus size={12} /> New Pack
          </Button>
        </div>
        <DataTable
          dense
          ariaLabel="Compliance packs"
          columns={packColumns}
          rows={packs}
          getRowKey={(p) => p.id}
          empty={
            loading
              ? loadingRow("Loading compliance packs…")
              : <EmptyState title="No compliance packs configured." />
          }
        />
      </TabPanel>

      <Modal
        open={packModalOpen}
        onClose={closePackModal}
        title="New Compliance Pack"
        subtitle="Group requirements under a standard for tracking."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closePackModal} disabled={savingPack}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={NEW_PACK_FORM_ID}
              loading={savingPack}
              disabled={!standards.length}
            >
              Create Pack
            </Button>
          </>
        }
      >
        <form id={NEW_PACK_FORM_ID} onSubmit={handleCreatePack}>
          <Field label="Pack name" required>
            <Input
              value={packForm.name}
              onChange={updatePackForm("name")}
              placeholder="e.g. RoHS 3 Declaration Pack"
              required
            />
          </Field>
          <Field
            label="Standard"
            required
            hint={
              standards.length
                ? undefined
                : "No compliance standards configured yet — create one via the Compliance API before adding a pack."
            }
          >
            <Select
              value={packForm.standard_id}
              onChange={updatePackForm("standard_id")}
              disabled={!standards.length}
              required
            >
              <option value="">
                {standards.length ? "Select a standard…" : "No standards available"}
              </option>
              {standards.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Textarea
              value={packForm.description}
              onChange={updatePackForm("description")}
              rows={2}
              placeholder="Optional summary of this pack's scope"
            />
          </Field>
          <Field
            label="Checklist"
            hint="One requirement per line (optional)"
          >
            <Textarea
              value={packForm.checklist}
              onChange={updatePackForm("checklist")}
              rows={4}
              placeholder={"e.g.\nSupplier declaration on file\nLab test report attached"}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

export { ComplianceScreen };
export default ComplianceScreen;
