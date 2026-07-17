import PropTypes from "prop-types";
import { cloneElement, useId, useState } from "react";

/**
 * Tooltip — wraps a single interactive child. Shows on hover AND focus
 * (keyboard-reachable), hides on blur / mouse-leave / Escape. The child is
 * linked to the tip via aria-describedby.
 */
export function Tooltip({ label, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const child = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: (e) => {
      setOpen(true);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      setOpen(false);
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e) => {
      setOpen(true);
      children.props.onFocus?.(e);
    },
    onBlur: (e) => {
      setOpen(false);
      children.props.onBlur?.(e);
    },
    onKeyDown: (e) => {
      if (e.key === "Escape") setOpen(false);
      children.props.onKeyDown?.(e);
    },
  });

  return (
    <span className="ui-tooltip-wrap">
      {child}
      {open && (
        <span className="ui-tooltip" role="tooltip" id={id}>
          {label}
        </span>
      )}
    </span>
  );
}
Tooltip.propTypes = {
  label: PropTypes.node.isRequired,
  children: PropTypes.element.isRequired,
};

export default Tooltip;
