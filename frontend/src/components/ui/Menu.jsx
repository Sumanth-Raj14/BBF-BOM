import PropTypes from "prop-types";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Menu — accessible menu-button (WAI-ARIA menu pattern).
 * Trigger: aria-haspopup="menu" + aria-expanded. Menu: role="menu";
 * items role="menuitem". Keyboard: Arrow Up/Down, Home/End, Enter/Space,
 * Escape (closes + restores focus), outside-click closes.
 *
 * items: [{ label, icon?, kbd?, danger?, disabled?, onSelect } | "divider"]
 */
export function Menu({ trigger, items = [], align = "left", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  const actionable = items
    .map((it, i) => (it !== "divider" && !it.disabled ? i : -1))
    .filter((i) => i >= 0);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && activeIdx >= 0) itemRefs.current[activeIdx]?.focus();
  }, [open, activeIdx]);

  const openMenu = (toEnd = false) => {
    setOpen(true);
    setActiveIdx(toEnd ? actionable[actionable.length - 1] : actionable[0]);
  };
  const close = (restore = true) => {
    setOpen(false);
    setActiveIdx(-1);
    if (restore) triggerRef.current?.focus();
  };

  const onTriggerKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(false);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(true);
    }
  };

  const move = (dir) => {
    const pos = actionable.indexOf(activeIdx);
    const nextPos = (pos + dir + actionable.length) % actionable.length;
    setActiveIdx(actionable[nextPos]);
  };

  const onMenuKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(actionable[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(actionable[actionable.length - 1]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const select = (item) => {
    if (item.disabled) return;
    close(true);
    item.onSelect && item.onSelect();
  };

  return (
    <span className="ui-menu-root" ref={rootRef} style={{ position: "relative" }}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu(false))}
        onKeyDown={onTriggerKey}
        style={{ display: "inline-flex" }}
      >
        {trigger}
      </span>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className="ui-menu"
          onKeyDown={onMenuKey}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            [align === "right" ? "right" : "left"]: 0,
            zIndex: "var(--z-dropdown)",
          }}
        >
          {items.map((item, i) =>
            item === "divider" ? (
              <div key={`d-${i}`} className="ui-menu__divider" role="separator" />
            ) : (
              <button
                key={item.label}
                ref={(el) => (itemRefs.current[i] = el)}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                className={[
                  "ui-menu__item",
                  item.danger ? "ui-menu__item--danger" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => select(item)}
              >
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                <span className="ui-menu__label">{item.label}</span>
                {item.kbd && <span className="ui-menu__kbd">{item.kbd}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}
Menu.propTypes = {
  trigger: PropTypes.node,
  items: PropTypes.array,
  align: PropTypes.oneOf(["left", "right"]),
  ariaLabel: PropTypes.string,
};

export default Menu;
