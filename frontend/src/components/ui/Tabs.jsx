import PropTypes from "prop-types";
import { useId, useRef } from "react";

/**
 * Tabs — ARIA tablist with roving focus (Left/Right/Home/End),
 * aria-selected + aria-controls wiring. Controlled via `value`/`onChange`.
 *
 * items: [{ value, label, count? }]
 */
export function Tabs({ items = [], value, onChange, ariaLabel, className = "" }) {
  const baseId = useId();
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
  className: PropTypes.string,
};

/** TabPanel — pairs with a Tabs item; provide the same `id` base and `value`. */
export function TabPanel({ id, value, active, children }) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
TabPanel.propTypes = {
  id: PropTypes.string,
  value: PropTypes.string,
  active: PropTypes.bool,
  children: PropTypes.node,
};
