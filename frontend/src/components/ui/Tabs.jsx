import PropTypes from "prop-types";
import { useId, useRef } from "react";

/**
 * Tabs — ARIA tablist with roving focus (Left/Right/Home/End),
 * aria-selected + aria-controls wiring. Controlled via `value`/`onChange`.
 *
 * items: [{ value, label, count? }]
 *
 * Pass `id` to get a stable, caller-known base id so a matching `<TabPanel
 * id={id} .../>` rendered elsewhere in the tree can wire its own
 * aria-labelledby / id back to these tabs (aria-controls). When `id` is
 * omitted, Tabs generates one internally — behavior for existing callers
 * that render tabs without a separate TabPanel is unchanged.
 */
export function Tabs({ items = [], value, onChange, ariaLabel, id, className = "" }) {
  const autoId = useId();
  const baseId = id || autoId;
  const refs = useRef([]);

  const focusTab = (idx) => {
    const el = refs.current[idx];
    if (el) el.focus();
  };

  const onKeyDown = (e, idx) => {
    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      onChange && onChange(items[next].value);
      focusTab(next);
    }
  };

  return (
    <div className={["ui-tabs", className].filter(Boolean).join(" ")}>
      <div className="ui-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, idx) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => (refs.current[idx] = el)}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              className="ui-tab"
              onClick={() => onChange && onChange(item.value)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              {item.label}
              {item.count != null && (
                <span className="ui-tab__count">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
Tabs.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.node,
      count: PropTypes.number,
    }),
  ),
  value: PropTypes.string,
  onChange: PropTypes.func,
  ariaLabel: PropTypes.string,
  id: PropTypes.string,
  className: PropTypes.string,
};

/**
 * TabPanel — pairs with a Tabs item; pass the same `id` you gave the
 * corresponding `<Tabs id=.../>` plus the panel's `value`, and the
 * aria-controls/aria-labelledby pair resolves for real (no dangling refs).
 */
export function TabPanel({ id, value, active, className = "", children }) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
      className={className || undefined}
    >
      {children}
    </div>
  );
}
TabPanel.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string,
  active: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
