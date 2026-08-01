import { storage } from "../../utils/storage.js";

import { toast } from "../../utils/toast";
import { Icon, poOrdersAPI, orderTrackingAPI } from "../../globals";
import { ecoAPI } from "../../../api.js";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  ScreenHeader,
  Select,
  Spinner,
} from "../ui";

const TYPE_COLOR = {
  "po-eta": "var(--accent)",
  rfq: "var(--status-info)",
  compliance: "var(--status-warning)",
  milestone: "var(--status-success)",
  approval: "var(--status-danger)",
};
const TYPE_LABEL = {
  "po-eta": "PO Delivery",
  rfq: "RFQ",
  compliance: "Compliance",
  milestone: "Milestone",
  approval: "Approval",
};

// Backend date fields are free-form strings; normalize to YYYY-MM-DD so they
// line up with the grid's ISO day keys. Returns null (never throws) on junk.
function toISODate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function CalendarScreen() {
  const [showForm, setShowForm] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  // Real data pulled from the backend (PO deliveries + ECO dates) — never
  // fabricated, rebuilt fresh on every load().
  const [apiEvents, setApiEvents] = React.useState([]);
  // Manually-added events have no dedicated calendar backend endpoint, so
  // they remain local to this browser (persisted via localStorage), same as
  // before. Merged with apiEvents for display.
  const [manualEvents, setManualEvents] = React.useState(() => {
    try {
      const saved = storage.calendarEvents.get();
      if (Array.isArray(saved)) return saved;
    } catch {
      console.warn("Failed to parse saved calendar events");
    }
    return [];
  });
  const [newEvent, setNewEvent] = React.useState({
    date: "",
    type: "milestone",
    label: "",
    value: "",
  });

  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      orderTrackingAPI
        ?.list({ per_page: 200 })
        .catch(() => ({ items: [] })),
      poOrdersAPI?.list({ per_page: 200 }).catch(() => ({ items: [] })),
      ecoAPI?.list({ per_page: 200 }).catch(() => ({ items: [] })),
    ])
      .then(([trackingRes, poRes, ecoRes]) => {
        const built = [];

        (trackingRes?.items || []).forEach((t) => {
          const poLabel = t.po?.poNumber
            ? `PO ${t.po.poNumber}`
            : `PO #${t.poHeaderId}`;
          const vendor = t.po?.vendorName ? ` · ${t.po.vendorName}` : "";
          const deliveredDate = toISODate(t.actualDelivery);
          const etaDate = toISODate(t.estimatedDelivery);
          if (deliveredDate) {
            built.push({
              date: deliveredDate,
              type: "po-eta",
              label: `${poLabel}${vendor} — delivered`,
              value: null,
            });
          } else if (etaDate) {
            built.push({
              date: etaDate,
              type: "po-eta",
              label: `${poLabel}${vendor}${t.carrier ? ` (${t.carrier})` : ""} — ETA`,
              value: null,
            });
          }
        });

        (poRes?.items || []).forEach((h) => {
          const placedDate = toISODate(h.poDate);
          if (!placedDate) return;
          built.push({
            date: placedDate,
            type: "po-eta",
            label: `PO ${h.poNumber}${h.vendorName ? ` · ${h.vendorName}` : ""} — placed`,
            value: Array.isArray(h.items) && h.items.length ? h.items.length : null,
          });
        });

        (ecoRes?.items || []).forEach((e) => {
          const targetDate = toISODate(e.target_completion_date);
          const effectiveDate = toISODate(e.effective_date);
          if (targetDate) {
            built.push({
              date: targetDate,
              type: "approval",
              label: `ECO ${e.eco_number || e.id}: ${e.title || "Untitled"} — target completion`,
              value: null,
            });
          }
          if (effectiveDate) {
            built.push({
              date: effectiveDate,
              type: "milestone",
              label: `ECO ${e.eco_number || e.id}: ${e.title || "Untitled"} — effective`,
              value: null,
            });
          }
        });

        setApiEvents(built);
      })
      .catch(() => {
        setLoadError("Could not load PO / ECO dates from the server.");
        setApiEvents([]);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const events = React.useMemo(
    () => [...apiEvents, ...manualEvents],
    [apiEvents, manualEvents],
  );

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 56 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const addEvent = () => {
    if (!newEvent.date || !newEvent.label) {
      toast("Date and description required", { kind: "warn" });
      return;
    }
    const entry = {
      date: newEvent.date,
      type: newEvent.type,
      label: newEvent.label,
      value: newEvent.value ? Number(newEvent.value) : null,
    };
    const next = [...manualEvents, entry];
    setManualEvents(next);
    storage.calendarEvents.set(next);
    setNewEvent({ date: "", type: "milestone", label: "", value: "" });
    setShowForm(false);
    toast("Event added", { kind: "success" });
  };

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title="Calendar & Timeline"
        description={
          loading
            ? "Loading PO deliveries and ECO dates…"
            : `${events.length} upcoming events · Next 8 weeks${loadError ? " · " + loadError : ""}`
        }
        actions={
          <div className="flex gap-8 items-center">
            {loading && <Spinner size="sm" label="Loading calendar" />}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(!showForm)}
              aria-expanded={showForm}
            >
              <Icon.Plus size={12} /> Add event
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card
          className="mb-14"
          title="Add Calendar Event"
          footer={
            <div className="flex gap-8 justify-end">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={addEvent}>
                Add Event
              </Button>
            </div>
          }
        >
          <div
            className="d-grid gap-10"
            style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}
          >
            <Field label="Date" required htmlFor="cal-form-date">
              <Input
                id="cal-form-date"
                type="date"
                value={newEvent.date}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, date: e.target.value })
                }
              />
            </Field>
            <Field label="Event Type" htmlFor="cal-form-type">
              <Select
                id="cal-form-type"
                value={newEvent.type}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, type: e.target.value })
                }
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" required htmlFor="cal-form-label">
              <Input
                id="cal-form-label"
                value={newEvent.label}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, label: e.target.value })
                }
                placeholder="Event description"
              />
            </Field>
            <Field label="Quantity" htmlFor="cal-form-value">
              <Input
                id="cal-form-value"
                type="number"
                mono
                value={newEvent.value}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, value: e.target.value })
                }
                placeholder="Qty"
              />
            </Field>
          </div>
        </Card>
      )}

      <ul
        className="flex gap-10 mb-14 font-mono fs-11 items-center p-0 m-0"
        style={{ flexWrap: "wrap", listStyle: "none" }}
        aria-label="Event type legend"
      >
        {Object.entries(TYPE_COLOR).map(([k, c]) => (
          <li key={k} className="inline-flex items-center gap-6">
            <span
              className="br-2"
              aria-hidden="true"
              style={{ width: 10, height: 10, background: c }}
            />
            {TYPE_LABEL[k]}
          </li>
        ))}
      </ul>

      {!loading && events.length === 0 && (
        <EmptyState
          icon={<Icon.Calendar size={28} />}
          title="No scheduled events"
          message={
            loadError
              ? "PO/ECO data couldn't be loaded right now. You can still add a manual event below."
              : "No PO deliveries or ECO dates yet, and no manual events added. Use “Add event” to create one."
          }
          className="mb-14"
        />
      )}

      <Card flush bodyClassName="p-0" className="overflow-h">
        <div
          className="d-grid border-bottom bg-sunk"
          style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="font-mono fs-9 uppercase letter-sp-8 fg-3 text-center"
              style={{ padding: 8, borderRight: "1px solid var(--line-soft)" }}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          className="d-grid"
          style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
        >
          {days.map((d) => {
            const iso = d.toISOString().slice(0, 10);
            const dayEvents = events.filter((e) => e.date === iso);
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div
                key={iso}
                style={{
                  minHeight: 80,
                  padding: 6,
                  borderRight: "1px solid var(--line-soft)",
                  borderBottom: "1px solid var(--line-soft)",
                  background: isToday
                    ? "color-mix(in oklch, var(--accent) 6%, var(--bg))"
                    : "var(--bg)",
                }}
              >
                <div
                  className="font-mono fs-10 mb-4"
                  style={{
                    color: isToday ? "var(--accent-text)" : "var(--fg-3)",
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {d.getDate()}
                  {isToday && " · TODAY"}
                </div>
                {dayEvents.map((e, j) => (
                  <div
                    key={j}
                    className="mb-2 br-2 font-mono fs-9 c-pointer overflow-h ws-nowrap"
                    title={e.label + (e.value ? " ×" + e.value : "")}
                    style={{
                      padding: "2px 4px",
                      background: TYPE_COLOR[e.type] || TYPE_COLOR.milestone,
                      color: "white",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.label}
                    {e.value ? " ×" + e.value : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export { CalendarScreen };
export default CalendarScreen;
