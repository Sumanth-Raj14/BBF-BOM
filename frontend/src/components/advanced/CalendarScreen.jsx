import { storage } from "../../utils/storage.js";

import { toast } from "../../utils/toast";
import { Icon } from "../../globals";
import {
  Button,
  Card,
  Field,
  Input,
  ScreenHeader,
  Select,
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

function CalendarScreen() {
  const [showForm, setShowForm] = React.useState(false);
  const [events, setEvents] = React.useState(() => {
    try {
      const saved = storage.calendarEvents.get();
      if (saved && saved.length) return saved;
    } catch {
      console.warn("Failed to parse calendar events");
    }
    return [
      {
        date: "2026-05-26",
        type: "po-eta",
        label: "Crucial DDR4 SODIMM",
        value: 50,
      },
      {
        date: "2026-05-27",
        type: "po-eta",
        label: "McMaster M3 screws",
        value: 1000,
      },
      { date: "2026-05-29", type: "rfq", label: "RFQ response: JLCPCB" },
      {
        date: "2026-06-02",
        type: "po-eta",
        label: "Edmund 25mm lens",
        value: 25,
      },
      {
        date: "2026-06-08",
        type: "compliance",
        label: "BMS REACH cert expires",
      },
      {
        date: "2026-06-12",
        type: "milestone",
        label: "BOM v3.3 release target",
      },
      {
        date: "2026-06-18",
        type: "po-eta",
        label: "STM32H743 MCUs",
        value: 50,
      },
      { date: "2026-06-25", type: "approval", label: "Q3 budget review due" },
      { date: "2026-07-15", type: "milestone", label: "ATLAS Demo Day" },
    ];
  });
  const [newEvent, setNewEvent] = React.useState({
    date: "",
    type: "milestone",
    label: "",
    value: "",
  });
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
    const next = [...events, entry];
    setEvents(next);
    storage.calendarEvents.set(next);
    setNewEvent({ date: "", type: "milestone", label: "", value: "" });
    setShowForm(false);
  };

  return (
    <div className="screen-wrap">
      <ScreenHeader
        title="Calendar & Timeline"
        description={`${events.length} upcoming events · Next 8 weeks`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            aria-expanded={showForm}
          >
            <Icon.Plus size={12} /> Add event
          </Button>
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
                      background: TYPE_COLOR[e.type],
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
