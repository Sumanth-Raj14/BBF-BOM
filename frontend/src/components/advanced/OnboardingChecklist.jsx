import { storage } from "../../utils/storage.js";
import { useAppStore } from "../../globals";

function OnboardingChecklist() {
  const ctx = useAppStore();
  const [collapsed, setCollapsed] = React.useState(false);
  const [done, setDone] = React.useState(() => storage.checklist.get());
  const tasks = [
    {
      id: "invite",
      label: "Invite a teammate",
      action: () => ctx?.openModal("settings"),
    },
    {
      id: "vendor",
      label: "Add your first vendor",
      action: () => ctx?.openModal("new-vendor"),
    },
    {
      id: "import",
      label: "Import an existing BOM",
      action: () => ctx?.openModal("bulk-import"),
    },
    {
      id: "po",
      label: "Create your first PO",
      action: () => ctx?.openModal("new-po"),
    },
  ];
  const completed = done.length;
  const total = tasks.length;
  const allDone = completed === total;
  const dismissed = storage.checklist.isDismissed();
  const toggle = (id) => {
    const next = done.includes(id)
      ? done.filter((x) => x !== id)
      : [...done, id];
    setDone(next);
    storage.checklist.set(next);
  };
  const dismiss = () => {
    storage.checklist.dismiss();
    setCollapsed(true);
  };
  if (dismissed) return null;
  if (collapsed)
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="pos-fixed bg-accent b-0 font-mono fs-11 fw-600 c-pointer z-100 inline-flex items-center gap-8"
        style={{
          bottom: 18,
          left: 78,
          padding: "8px 14px",
          color: "white",
          borderRadius: 99,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <Icon.Sparkles size={12} /> {completed}/{total} setup tasks
      </button>
    );
  return (
    <div
      className="pos-fixed w-280 bg-elev border-line rounded-r3 z-100 overflow-h"
      style={{ bottom: 18, left: 78, boxShadow: "var(--shadow-md)" }}
    >
      <div
        className="border-bottom flex justify-between items-center"
        style={{ padding: "12px 14px" }}
      >
        <div>
          <div className="fw-700 fs-12">Get started</div>
          <div className="font-mono fs-10 fg-3">
            {completed} of {total} complete
          </div>
        </div>
        <button className="icon-btn w-22 h-22" onClick={dismiss}>
          <Icon.X size={11} />
        </button>
      </div>
      <div className="h-4 bg-sunk">
        <div
          className="h-100p"
          style={{
            width: (completed / total) * 100 + "%",
            background: allDone ? "var(--ok)" : "var(--accent)",
            transition: "width 0.3s",
          }}
        />
      </div>
      <div className="oy-auto" style={{ padding: 10, maxHeight: 280 }}>
        {tasks.map((t) => {
          const isDone = done.includes(t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-8 c-pointer rounded-r2"
              style={{ padding: "6px 4px" }}
              onClick={() => toggle(t.id)}
            >
              <span
                className="w-16 h-16 inline-flex items-center justify-center flex-shrink-0"
                style={{
                  borderRadius: 99,
                  background: isDone ? "var(--ok)" : "transparent",
                  border:
                    "1.5px solid " + (isDone ? "var(--ok)" : "var(--fg-3)"),
                  color: "white",
                }}
              >
                {isDone && <Icon.Check size={9} />}
              </span>
              <span
                className="flex-1 fs-11"
                style={{
                  textDecoration: isDone ? "line-through" : "none",
                  color: isDone ? "var(--fg-3)" : "var(--fg)",
                }}
              >
                {t.label}
              </span>
              {!isDone && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    t.action();
                  }}
                  className="bg-transparent b-0 fg-accent font-mono fs-10 c-pointer"
                >
                  →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { OnboardingChecklist };
export default OnboardingChecklist;
