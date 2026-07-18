import { storage } from "../../utils/storage.js";
import { Icon, useAppStore } from "../../globals";
import { Button, Checkbox } from "../ui";

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
      <Button
        variant="primary"
        size="sm"
        onClick={() => setCollapsed(false)}
        aria-expanded="false"
        className="pos-fixed z-100 inline-flex items-center gap-8 font-mono fw-600"
        style={{
          bottom: 18,
          left: 78,
          borderRadius: 99,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <Icon.Sparkles size={12} aria-hidden="true" /> {completed}/{total}{" "}
        setup tasks
      </Button>
    );
  return (
    <section
      className="pos-fixed w-280 bg-elev border-line rounded-r3 z-100 overflow-h"
      style={{ bottom: 18, left: 78, boxShadow: "var(--shadow-md)" }}
      aria-label="Onboarding checklist"
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
        <button
          className="icon-btn w-22 h-22"
          onClick={dismiss}
          aria-label="Dismiss onboarding checklist"
        >
          <Icon.X size={11} aria-hidden="true" />
        </button>
      </div>
      <div
        className="bg-sunk"
        style={{ height: 4 }}
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Setup tasks completed"
      >
        <div
          className="h-100p"
          style={{
            width: (completed / total) * 100 + "%",
            background: allDone ? "var(--ok)" : "var(--accent)",
            transition: "width 0.3s",
          }}
        />
      </div>
      <ul
        className="oy-auto m-0 p-0"
        style={{ padding: 10, maxHeight: 280, listStyle: "none" }}
      >
        {tasks.map((t) => {
          const isDone = done.includes(t.id);
          const inputId = `onboard-task-${t.id}`;
          return (
            <li
              key={t.id}
              className="flex items-center gap-8"
              style={{ padding: "2px 4px" }}
            >
              <Checkbox
                id={inputId}
                checked={isDone}
                onChange={() => toggle(t.id)}
                className="flex-1"
                label={
                  <span
                    className="fs-11"
                    style={{
                      textDecoration: isDone ? "line-through" : "none",
                      color: isDone ? "var(--fg-3)" : "var(--fg)",
                    }}
                  >
                    {t.label}
                  </span>
                }
              />
              {!isDone && (
                <button
                  onClick={() => t.action()}
                  className="bg-transparent b-0 fg-accent font-mono fs-10 c-pointer"
                  aria-label={`Go to: ${t.label}`}
                >
                  →
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export { OnboardingChecklist };
export default OnboardingChecklist;
