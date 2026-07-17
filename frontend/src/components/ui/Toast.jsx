import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast, subscribe } from "../../utils/toast.js";

export { toast };

/**
 * Toaster — host for the shared toast bus (utils/toast).
 * Renders one polite live region so screen readers announce toasts;
 * error toasts use role="alert" (assertive). Mount once near the app root.
 */
export function Toaster({ label = "Notifications" }) {
  const [toasts, setToasts] = useState([]);
  useEffect(() => subscribe(setToasts), []);

  const body = (
    <div
      className="ui-toaster"
      role="region"
      aria-label={label}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`ui-toast ui-toast--${t.kind || "info"}`}
          role={t.kind === "error" ? "alert" : "status"}
        >
          <span className="ui-toast__msg">{t.msg}</span>
          {t.action && (
            <button
              type="button"
              className="ui-toast__action"
              onClick={() => {
                t.action.onClick && t.action.onClick();
                toast.dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="ui-toast__close"
            aria-label="Dismiss notification"
            onClick={() => toast.dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );

  if (typeof document === "undefined") return body;
  return createPortal(body, document.body);
}
Toaster.propTypes = { label: PropTypes.string };
