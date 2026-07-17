import PropTypes from "prop-types";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal / Dialog — accessible dialog.
 * - role="dialog" + aria-modal + aria-labelledby/-describedby
 * - focus trap (Tab / Shift+Tab), Escape to close, focus restored on close
 * - background scroll locked while open
 * size: sm | md | lg | xl
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  footer,
  size = "md",
  closeLabel = "Close dialog",
  children,
}) {
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);
  const baseId = useId();
  const titleId = title ? `${baseId}-title` : undefined;
  const descId = subtitle ? `${baseId}-desc` : undefined;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const el = dialogRef.current;

    // initial focus
    const focusables = el ? el.querySelectorAll(FOCUSABLE) : [];
    if (focusables.length) focusables[0].focus();
    else if (el) el.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose && onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = el.querySelectorAll(FOCUSABLE);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      const r = restoreRef.current;
      if (r && typeof r.focus === "function") r.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-modal__backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={`ui-modal ui-modal--${size}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || icon) && (
          <header className="ui-modal__header">
            {icon && (
              <span className="ui-modal__icon" aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="ui-modal__titles">
              {title && (
                <h2 className="ui-modal__title" id={titleId}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="ui-modal__subtitle" id={descId}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              className="ui-modal__close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
Modal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  title: PropTypes.node,
  subtitle: PropTypes.node,
  icon: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.oneOf(["sm", "md", "lg", "xl"]),
  closeLabel: PropTypes.string,
  children: PropTypes.node,
};

export default Modal;
