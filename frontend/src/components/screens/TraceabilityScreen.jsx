import React from "react";

import { __t } from "../../i18n";
import { api } from "../../../api.js";
import {
  ScreenHeader,
  Tabs,
  TabPanel,
  Card,
  Field,
  Input,
  Select,
  Button,
  Badge,
  StatusPill,
  DataTable,
  EmptyState,
  Spinner,
} from "../ui";

// ============ SERIAL / LOT TRACEABILITY ============
//
// Read surface over the traceability tables (serial_numbers, lot_batches —
// see app/models/traceability.py). The backend has had the full router for a
// while (GET/POST/PUT /traceability/serial-numbers, the
// /serial-numbers/lookup/{serial} single-unit lookup, and GET/POST/PUT
// /traceability/lots) but nothing in the UI called it, so a regulated buyer
// asking "show me the genealogy of this unit" had nowhere to go. This screen
// is that missing surface.
//
// Scope note: creating serials/lots happens where the physical event happens
// (receiving, work orders), not here — this screen is the query/inspection
// side. The third traceability table, serial_number_events, has no HTTP route
// of its own; per-unit history is read from the serial's own `statusHistory`
// JSON, which is what the API actually returns.

const SERIAL_STATUSES = [
  "In Stock",
  "Installed",
  "Consumed",
  "Scrapped",
  "Quarantine",
];

const LOT_STATUSES = [
  "Received",
  "Inspected",
  "Accepted",
  "Rejected",
  "Quarantine",
  "Depleted",
];

// The traceability statuses are domain-specific, so they don't all resolve
// through the shared toneForStatus map — spell out the ones that matter.
const TRACE_TONES = {
  "in stock": "success",
  installed: "info",
  consumed: "neutral",
  scrapped: "danger",
  quarantine: "warning",
  received: "info",
  inspected: "info",
  accepted: "success",
  rejected: "danger",
  depleted: "neutral",
};

function toneFor(status) {
  return TRACE_TONES[String(status || "").toLowerCase()] || "neutral";
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

function fmtWhen(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

// Inspection results come back as free text ("Pass" / "Fail" / "Conditional")
// or null — render null as an em dash rather than an empty badge.
function inspectionBadge(result) {
  if (!result) return <span className="fg-3">—</span>;
  const r = String(result).toLowerCase();
  const tone = r === "pass" ? "success" : r === "fail" ? "danger" : "warning";
  return <Badge tone={tone}>{result}</Badge>;
}

export default function TraceabilityScreen() {
  const [tab, setTab] = React.useState("serials");

  const [serials, setSerials] = React.useState([]);
  const [serialsLoading, setSerialsLoading] = React.useState(true);
  const [serialsError, setSerialsError] = React.useState(null);
  const [serialsPage, setSerialsPage] = React.useState(1);
  const [serialsHasNext, setSerialsHasNext] = React.useState(false);
  const [serialStatus, setSerialStatus] = React.useState("");
  const [serialPartId, setSerialPartId] = React.useState("");
  const [serialLotFilter, setSerialLotFilter] = React.useState("");

  const [lots, setLots] = React.useState([]);
  const [lotsLoading, setLotsLoading] = React.useState(true);
  const [lotsError, setLotsError] = React.useState(null);
  const [lotsPage, setLotsPage] = React.useState(1);
  const [lotsHasNext, setLotsHasNext] = React.useState(false);
  const [lotStatus, setLotStatus] = React.useState("");
  const [lotPartId, setLotPartId] = React.useState("");

  // Single-unit genealogy: either a row the user clicked, or the result of
  // GET /traceability/serial-numbers/lookup/{serialNumber}. Both shapes carry
  // the same five fields plus statusHistory, and the detail panel renders
  // only those — nothing is displayed that the endpoint did not return.
  const [unit, setUnit] = React.useState(null);
  const [lookupValue, setLookupValue] = React.useState("");
  const [lookupBusy, setLookupBusy] = React.useState(false);
  const [lookupError, setLookupError] = React.useState(null);

  const loadSerials = React.useCallback(
    async (pageNum, append) => {
      setSerialsLoading(true);
      setSerialsError(null);
      try {
        const params = { page: pageNum, per_page: 100 };
        if (serialStatus) params.status = serialStatus;
        if (serialPartId) params.partId = serialPartId;
        if (serialLotFilter) params.lotBatchNumber = serialLotFilter;
        const result = await api.traceability.serialNumbers.list(params);
        const items = Array.isArray(result) ? result : result?.items || [];
        setSerials((prev) => (append ? [...prev, ...items] : items));
        setSerialsHasNext(Boolean(result?.has_next));
        setSerialsPage(pageNum);
      } catch (e) {
        // Honest failure — do not fall back to fabricated/sample rows.
        setSerialsError(e?.message || "Failed to load serial numbers.");
        if (!append) setSerials([]);
      } finally {
        setSerialsLoading(false);
      }
    },
    [serialStatus, serialPartId, serialLotFilter],
  );

  const loadLots = React.useCallback(
    async (pageNum, append) => {
      setLotsLoading(true);
      setLotsError(null);
      try {
        const params = { page: pageNum, per_page: 100 };
        if (lotStatus) params.status = lotStatus;
        if (lotPartId) params.partId = lotPartId;
        const result = await api.traceability.lots.list(params);
        const items = Array.isArray(result) ? result : result?.items || [];
        setLots((prev) => (append ? [...prev, ...items] : items));
        setLotsHasNext(Boolean(result?.has_next));
        setLotsPage(pageNum);
      } catch (e) {
        setLotsError(e?.message || "Failed to load lots and batches.");
        if (!append) setLots([]);
      } finally {
        setLotsLoading(false);
      }
    },
    [lotStatus, lotPartId],
  );

  React.useEffect(() => {
    loadSerials(1, false);
  }, [loadSerials]);

  React.useEffect(() => {
    loadLots(1, false);
  }, [loadLots]);

  const runLookup = async (e) => {
    e.preventDefault();
    const sn = lookupValue.trim();
    if (!sn) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const found = await api.traceability.serialNumbers.lookup(sn);
      setUnit(found);
      setTab("serials");
    } catch (err) {
      setUnit(null);
      setLookupError(err?.message || `No unit found for "${sn}".`);
    } finally {
      setLookupBusy(false);
    }
  };

  // Recall drill-down: "which units came out of this lot?" is the one
  // cross-table question the API can actually answer server-side
  // (GET /traceability/serial-numbers?lotBatchNumber=…). The reverse
  // direction has no lot-number filter on /traceability/lots, so the lot
  // number on a serial row stays plain text rather than a dead link.
  const showUnitsInLot = (lotBatchNumber) => {
    setSerialStatus("");
    setSerialPartId("");
    setSerialLotFilter(lotBatchNumber);
    setUnit(null);
    setLookupError(null);
    setTab("serials");
  };

  const serialColumns = [
    {
      key: "serialNumber",
      header: __t("traceability.colSerial") || "Serial number",
      render: (r) => <span className="font-mono fs-12">{r.serialNumber}</span>,
    },
    {
      key: "partId",
      header: __t("traceability.colPart") || "Part",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.partId != null ? `part #${r.partId}` : "—"}
        </span>
      ),
    },
    {
      key: "lotBatchNumber",
      header: __t("traceability.colLot") || "Lot / batch",
      render: (r) =>
        r.lotBatchNumber ? (
          <span className="font-mono fs-11">{r.lotBatchNumber}</span>
        ) : (
          <span className="fg-3">—</span>
        ),
    },
    {
      key: "status",
      header: __t("traceability.colStatus") || "Status",
      render: (r) => <StatusPill status={r.status} tone={toneFor(r.status)} />,
    },
    {
      key: "currentLocation",
      header: __t("traceability.colLocation") || "Location",
      render: (r) => r.currentLocation || "—",
    },
    {
      key: "installedOnAsset",
      header: __t("traceability.colInstalledOn") || "Installed on",
      render: (r) => r.installedOnAsset || "—",
    },
    {
      key: "incomingInspectionResult",
      header: __t("traceability.colInspection") || "Incoming inspection",
      render: (r) => inspectionBadge(r.incomingInspectionResult),
    },
    {
      key: "expirationDate",
      header: __t("traceability.colExpires") || "Expires",
      render: (r) => <span className="fs-11">{fmtDate(r.expirationDate)}</span>,
    },
  ];

  const lotColumns = [
    {
      key: "lotBatchNumber",
      header: __t("traceability.colLot") || "Lot / batch",
      render: (r) => (
        <span className="font-mono fs-12">{r.lotBatchNumber}</span>
      ),
    },
    {
      key: "partId",
      header: __t("traceability.colPart") || "Part",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.partId != null ? `part #${r.partId}` : "—"}
        </span>
      ),
    },
    {
      key: "vendorId",
      header: __t("traceability.colVendor") || "Vendor",
      render: (r) => (
        <span className="font-mono fs-11">
          {r.vendorId != null ? `vendor #${r.vendorId}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: __t("traceability.colStatus") || "Status",
      render: (r) => <StatusPill status={r.status} tone={toneFor(r.status)} />,
    },
    {
      key: "quantityReceived",
      header: __t("traceability.colReceived") || "Received",
      align: "num",
    },
    {
      key: "quantityAccepted",
      header: __t("traceability.colAccepted") || "Accepted",
      align: "num",
    },
    {
      key: "quantityRejected",
      header: __t("traceability.colRejected") || "Rejected",
      align: "num",
    },
    {
      key: "incomingInspectionResult",
      header: __t("traceability.colInspection") || "Incoming inspection",
      render: (r) => inspectionBadge(r.incomingInspectionResult),
    },
    {
      key: "expirationDate",
      header: __t("traceability.colExpires") || "Expires",
      render: (r) => <span className="fs-11">{fmtDate(r.expirationDate)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => showUnitsInLot(r.lotBatchNumber)}
        >
          {__t("traceability.viewUnits") || "View units"}
        </Button>
      ),
    },
  ];

  const historyColumns = [
    {
      key: "date",
      header: __t("traceability.histWhen") || "When",
      render: (h) => <span className="font-mono fs-11">{fmtWhen(h.date)}</span>,
    },
    {
      key: "status",
      header: __t("traceability.histStatus") || "Status",
      render: (h) => (h.status ? <Badge tone={toneFor(h.status)}>{h.status}</Badge> : "—"),
    },
    {
      key: "location",
      header: __t("traceability.histLocation") || "Location",
      render: (h) => h.location || "—",
    },
    {
      key: "user",
      header: __t("traceability.histUser") || "By",
      render: (h) => h.user || "—",
    },
  ];

  const tabsId = "traceability-tabs";
  const loadingBlock = (
    <div
      className="flex items-center gap-8 fg-3 fs-12"
      style={{ padding: "32px 0" }}
    >
      <Spinner size="sm" label={__t("common.loading") || "Loading…"} />
      <span aria-hidden="true">{__t("common.loading") || "Loading…"}</span>
    </div>
  );

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title={__t("traceability.title") || "Serial & Lot Traceability"}
        description={
          __t("traceability.subtitle") ||
          "Track individual units and received lots end to end — status, location, inspection result and genealogy"
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              loadSerials(1, false);
              loadLots(1, false);
            }}
          >
            {__t("common.refresh") || "Refresh"}
          </Button>
        }
      />

      <form className="flex items-end gap-8 mb-14" onSubmit={runLookup}>
        <Field
          label={__t("traceability.lookup") || "Look up a unit by serial number"}
          htmlFor="trace-lookup"
        >
          <Input
            id="trace-lookup"
            name="traceLookup"
            mono
            value={lookupValue}
            onChange={(e) => setLookupValue(e.target.value)}
            placeholder="SN-000123"
          />
        </Field>
        <Button type="submit" variant="primary" size="sm" loading={lookupBusy}>
          {__t("traceability.lookupGo") || "Look up"}
        </Button>
        {unit && (
          <Button variant="ghost" size="sm" onClick={() => setUnit(null)}>
            {__t("common.clear") || "Clear"}
          </Button>
        )}
      </form>

      {lookupError && (
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
          {lookupError}
        </div>
      )}

      {unit && (
        <Card
          className="mb-14"
          title={
            <span className="font-mono">
              {unit.serialNumber}
            </span>
          }
          subtitle={__t("traceability.unitPanel") || "Unit genealogy"}
          actions={<StatusPill status={unit.status} tone={toneFor(unit.status)} />}
        >
          <dl className="trace__facts">
            <div>
              <dt>{__t("traceability.colPart") || "Part"}</dt>
              <dd className="font-mono">
                {unit.partId != null ? `part #${unit.partId}` : "—"}
              </dd>
            </div>
            <div>
              <dt>{__t("traceability.colLot") || "Lot / batch"}</dt>
              <dd className="font-mono">{unit.lotBatchNumber || "—"}</dd>
            </div>
            <div>
              <dt>{__t("traceability.colLocation") || "Location"}</dt>
              <dd>{unit.currentLocation || "—"}</dd>
            </div>
          </dl>

          <h4 className="fs-12 fw-600 mt-14 mb-8">
            {__t("traceability.history") || "Status history"}
          </h4>
          <DataTable
            dense
            zebra
            ariaLabel={__t("traceability.history") || "Status history"}
            columns={historyColumns}
            rows={Array.isArray(unit.statusHistory) ? unit.statusHistory : []}
            getRowKey={(h, i) => `${h.date || "e"}-${i}`}
            empty={
              <EmptyState
                title={
                  __t("traceability.noHistory") ||
                  "No status history recorded for this unit"
                }
                message={
                  __t("traceability.noHistoryMsg") ||
                  "History is appended each time the unit's status is updated."
                }
              />
            }
          />
        </Card>
      )}

      <Tabs
        id={tabsId}
        ariaLabel={__t("traceability.title") || "Serial & Lot Traceability"}
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "serials",
            label: __t("traceability.tabSerials") || "Serial numbers",
            count: serials.length,
          },
          {
            value: "lots",
            label: __t("traceability.tabLots") || "Lots & batches",
            count: lots.length,
          },
        ]}
      />

      <TabPanel id={tabsId} value="serials" active={tab === "serials"}>
        <div
          className="d-grid gap-10 mb-14 mt-14"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          <Field
            label={__t("traceability.filterStatus") || "Status"}
            htmlFor="trace-serial-status"
          >
            <Select
              id="trace-serial-status"
              value={serialStatus}
              onChange={(e) => setSerialStatus(e.target.value)}
            >
              <option value="">{__t("common.all") || "All"}</option>
              {SERIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={__t("traceability.filterPart") || "Part ID"}
            htmlFor="trace-serial-part"
          >
            <Input
              id="trace-serial-part"
              type="number"
              value={serialPartId}
              onChange={(e) => setSerialPartId(e.target.value)}
              placeholder="e.g. 42"
            />
          </Field>
          <Field
            label={__t("traceability.filterLot") || "Lot / batch number"}
            htmlFor="trace-serial-lot"
          >
            <Input
              id="trace-serial-lot"
              value={serialLotFilter}
              onChange={(e) => setSerialLotFilter(e.target.value)}
              placeholder="LOT-2026-001"
            />
          </Field>
        </div>

        {serialsError && (
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
            {serialsError}
          </div>
        )}

        <DataTable
          dense
          zebra
          ariaLabel={__t("traceability.tabSerials") || "Serial numbers"}
          columns={serialColumns}
          rows={serials}
          getRowKey={(r) => r.id}
          onRowClick={(r) => {
            setLookupError(null);
            setUnit(r);
          }}
          empty={
            serialsLoading ? (
              loadingBlock
            ) : (
              <EmptyState
                title={
                  __t("traceability.noSerials") ||
                  "No serialised units match these filters"
                }
                message={
                  __t("traceability.noSerialsMsg") ||
                  "Units appear here once they are serialised at receiving or build."
                }
              />
            )
          }
        />

        {serialsHasNext && !serialsLoading && (
          <div className="flex justify-center mt-14">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadSerials(serialsPage + 1, true)}
            >
              {__t("common.loadMore") || "Load more"}
            </Button>
          </div>
        )}
      </TabPanel>

      <TabPanel id={tabsId} value="lots" active={tab === "lots"}>
        <div
          className="d-grid gap-10 mb-14 mt-14"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          <Field
            label={__t("traceability.filterStatus") || "Status"}
            htmlFor="trace-lot-status"
          >
            <Select
              id="trace-lot-status"
              value={lotStatus}
              onChange={(e) => setLotStatus(e.target.value)}
            >
              <option value="">{__t("common.all") || "All"}</option>
              {LOT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={__t("traceability.filterPart") || "Part ID"}
            htmlFor="trace-lot-part"
          >
            <Input
              id="trace-lot-part"
              type="number"
              value={lotPartId}
              onChange={(e) => setLotPartId(e.target.value)}
              placeholder="e.g. 42"
            />
          </Field>
        </div>

        {lotsError && (
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
            {lotsError}
          </div>
        )}

        <DataTable
          dense
          zebra
          ariaLabel={__t("traceability.tabLots") || "Lots and batches"}
          columns={lotColumns}
          rows={lots}
          getRowKey={(r) => r.id}
          empty={
            lotsLoading ? (
              loadingBlock
            ) : (
              <EmptyState
                title={
                  __t("traceability.noLots") ||
                  "No lots or batches match these filters"
                }
                message={
                  __t("traceability.noLotsMsg") ||
                  "Lots appear here once material is received against a purchase order."
                }
              />
            )
          }
        />

        {lotsHasNext && !lotsLoading && (
          <div className="flex justify-center mt-14">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadLots(lotsPage + 1, true)}
            >
              {__t("common.loadMore") || "Load more"}
            </Button>
          </div>
        )}
      </TabPanel>

      <style>{`
        .trace__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--sp-3, 12px);
          margin: 0;
        }
        .trace__facts dt {
          font-size: var(--fs-075, 11px);
          color: var(--text-muted, var(--fg-3));
          margin-bottom: 2px;
        }
        .trace__facts dd {
          margin: 0;
          font-size: var(--fs-100, 13px);
          color: var(--text-primary, var(--fg));
        }
      `}</style>
    </div>
  );
}

TraceabilityScreen.displayName = "TraceabilityScreen";
// Self-register on window so LazyScreens can resolve it after dynamic import.
window.TraceabilityScreen = TraceabilityScreen;
