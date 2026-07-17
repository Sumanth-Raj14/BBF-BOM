import { storage } from "../../utils/storage.js";

import { toast } from "../../utils/toast";
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
  const typeColor = {
    "po-eta": "var(--accent)",
    rfq: "var(--info)",
    compliance: "var(--warn)",
    milestone: "var(--ok)",
    approval: "var(--danger)",
  };
  const typeLabel = {
    "po-eta": "PO Delivery",
    rfq: "RFQ",
    compliance: "Compliance",
    milestone: "Milestone",
    approval: "Approval",
  };
  return (
    <div className="screen-wrap">
      <div className="screen-header">
        <div>
          <h1>Calendar & Timeline</h1>
          <div className="sub">
            {events.length} upcoming events · Next 8 weeks
          </div>
        </div>
        <div className="flex gap-8">
          <button
            className="btn primary"
            onClick={() => setShowForm(!showForm)}
          >
            Add event
          </button>
        </div>
      </div>
      {showForm && (
        <div className="card mb-12" style={{ padding: 16 }}>
          <div className="fw-600 fs-13 mb-12">Add Calendar Event</div>
          <div
            className="d-grid gap-10"
            style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}
          >
            <div className="field">
              <label>Date *</label>
              <input
                className="input"
                type="date"
                value={newEvent.date}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, date: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Event Type</label>
              <select
                className="select"
                value={newEvent.type}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, type: e.target.value })
                }
              >
                {Object.entries(typeLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Description *</label>
              <input
                className="input"
                value={newEvent.label}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, label: e.target.value })
                }
                placeholder="Event description"
              />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input
                className="input"
                type="number"
                value={newEvent.value}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, value: e.target.value })
                }
                placeholder="Qty"
              />
            </div>
          </div>
          <div className="flex gap-8 mt-12 justify-end">
            <button className="btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => {
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
                setNewEvent({
                  date: "",
                  type: "milestone",
                  label: "",
                  value: "",
                });
                setShowForm(false);
              }}
            >
              Add Event
            </button>
          </div>
        </div>
      )}
      <div
        className="flex gap-10 mb-14 font-mono fs-11 items-center"
        style={{ flexWrap: "wrap" }}
      >
        {Object.entries(typeColor).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-6">
            <span
              className="br-2"
              style={{ width: 10, height: 10, background: c }}
            />{" "}
            {typeLabel[k]}
          </span>
        ))}
      </div>
      <div className="card overflow-h">
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
                    style={{
                      padding: "2px 4px",
                      background: typeColor[e.type],
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
      </div>
    </div>
  );
}

export { CalendarScreen };
export default CalendarScreen;
