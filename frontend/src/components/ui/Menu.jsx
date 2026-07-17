import PropTypes from "prop-types";
import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";

function assignRef(ref, value) {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") ref.current = value;
}

const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea"]);
// Whether a trigger element already establishes an interactive, focusable role
// on its own. Native interactive tags do; a custom component (the idiomatic
// trigger is <Button>) is assumed to render one. Only plain intrinsic elements
// (span/div/…) need role="button" + tabIndex added so they stay keyboard-usable.
function isInteractiveTrigger(el) {
  return typeof el.type === "string" ? INTERACTIVE_TAGS.has(el.type) : true;
}

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

  const handleTriggerClick = () => (open ? close(false) : openMenu(false));

  // If the consumer passes an already-interactive element (e.g. an icon-only
  // Button), clone it and inject the menu-button semantics/handlers directly,
  // composing with any existing handlers/ref. This avoids nesting a real
  // <button> inside a role="button" span (a nested-interactive ARIA
  // anti-pattern). Only non-element triggers fall back to a span wrapper.
  const triggerAria = {
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
  };
  let triggerNode;
  if (isValidElement(trigger)) {
    const prev = trigger.props || {};
    const prevRef = trigger.ref;
    // Add button role/focusability only if the element isn't already interactive,
    // so an interactive trigger (e.g. <Button>) is never a nested interactive.
    const roleProps = isInteractiveTrigger(trigger)
      ? {}
      : { role: "button", tabIndex: prev.tabIndex ?? 0 };
    triggerNode = cloneElement(trigger, {
      ...triggerAria,
      ...roleProps,
      ref: (node) => {
        triggerRef.current = node;
        assignRef(prevRef, node);
      },
      onClick: (e) => {
        prev.onClick && prev.onClick(e);
        if (!e.defaultPrevented) handleTriggerClick();
      },
      onKeyDown: (e) => {
        prev.onKeyDown && prev.onKeyDown(e);
        onTriggerKey(e);
      },
    });
  } else {
    triggerNode = (
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        {...triggerAria}
        onClick={handleTriggerClick}
        onKeyDown={onTriggerKey}
        style={{ display: "inline-flex" }}
      >
        {trigger}
      </span>
    );
  }

  return (
    <span className="ui-menu-root" ref={rootRef} style={{ position: "relative" }}>
      {triggerNode}
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
