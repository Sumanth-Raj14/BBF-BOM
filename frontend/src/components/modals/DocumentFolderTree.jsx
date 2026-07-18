import PropTypes from "prop-types";

import { __t } from "../../i18n";

/**
 * DocumentFolderTree — recursive folder navigation tree used inside the
 * Documents screen. Not a dialog: rendered inline (no open/onClose), so it
 * intentionally does not use the Modal primitive. Implements the standard
 * WAI-ARIA "tree view" pattern (role=tree/treeitem/group, roving tabindex,
 * arrow-key navigation) on top of design tokens.
 */

function FolderNode({
  folder,
  depth,
  expanded,
  onToggle,
  onSelect,
  selected,
  activePath,
  onFocusItem,
}) {
  const hasChildren = !!(folder.children && folder.children.length);
  const isExpanded = expanded.has(folder.path);
  const isSelected = !!selected && selected.path === folder.path;
  const isActive = activePath === folder.path;

  const activate = () => {
    if (hasChildren) onToggle(folder.path);
    onSelect?.(folder);
  };

  return (
    <div className="doc-tree__node">
      <div
        role="treeitem"
        data-path={folder.path}
        aria-level={depth + 1}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        tabIndex={isActive ? 0 : -1}
        className={
          "doc-tree__item" +
          (isSelected ? " doc-tree__item--selected" : "")
        }
        style={{ paddingLeft: `calc(var(--sp-3) + ${depth} * var(--sp-5))` }}
        onClick={activate}
        onFocus={() => onFocusItem(folder.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
      >
        <span className="doc-tree__twisty" aria-hidden="true">
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span className="doc-tree__icon" aria-hidden="true">
          {folder.icon || "📁"}
        </span>
        <span className="doc-tree__label">{folder.label}</span>
        {folder.count != null && (
          <span className="doc-tree__count">{folder.count}</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div role="group" className="doc-tree__group">
          {folder.children.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selected={selected}
              activePath={activePath}
              onFocusItem={onFocusItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
FolderNode.propTypes = {
  folder: PropTypes.object.isRequired,
  depth: PropTypes.number.isRequired,
  expanded: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onSelect: PropTypes.func,
  selected: PropTypes.any,
  activePath: PropTypes.string,
  onFocusItem: PropTypes.func.isRequired,
};

function DocumentFolderTree({ folders = [], onSelect, selected }) {
  const [expanded, setExpanded] = React.useState(() => new Set(["/"]));
  const [activePath, setActivePath] = React.useState(
    () => (selected && selected.path) || folders[0]?.path || null,
  );
  const rootRef = React.useRef(null);

  const onToggle = React.useCallback((path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const items = () =>
    rootRef.current
      ? Array.from(rootRef.current.querySelectorAll('[role="treeitem"]'))
      : [];

  const focusAt = (list, index) => {
    const clamped = Math.max(0, Math.min(list.length - 1, index));
    const el = list[clamped];
    if (el) {
      el.focus();
      setActivePath(el.dataset.path);
    }
  };

  const handleKeyDown = (e) => {
    const list = items();
    if (!list.length) return;
    const currentIndex = list.indexOf(document.activeElement);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(list, currentIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(list, currentIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(list, 0);
        break;
      case "End":
        e.preventDefault();
        focusAt(list, list.length - 1);
        break;
      case "ArrowRight": {
        if (currentIndex < 0) break;
        const el = list[currentIndex];
        const canExpand = el.hasAttribute("aria-expanded");
        const isExpanded = el.getAttribute("aria-expanded") === "true";
        if (canExpand && !isExpanded) {
          e.preventDefault();
          onToggle(el.dataset.path);
        } else if (canExpand && isExpanded) {
          e.preventDefault();
          focusAt(list, currentIndex + 1);
        }
        break;
      }
      case "ArrowLeft": {
        if (currentIndex < 0) break;
        const el = list[currentIndex];
        const isExpanded = el.getAttribute("aria-expanded") === "true";
        if (isExpanded) {
          e.preventDefault();
          onToggle(el.dataset.path);
        } else {
          const depth = Number(el.getAttribute("aria-level") || 1);
          for (let i = currentIndex - 1; i >= 0; i--) {
            const parentDepth = Number(list[i].getAttribute("aria-level") || 1);
            if (parentDepth < depth) {
              e.preventDefault();
              focusAt(list, i);
              break;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  };

  const treeLabel = __t("documents.folderTree") || "Document folders";

  return (
    <div
      ref={rootRef}
      role="tree"
      aria-label={treeLabel}
      className="doc-tree"
      onKeyDown={handleKeyDown}
    >
      {(folders || []).map((f) => (
        <FolderNode
          key={f.path}
          folder={f}
          depth={0}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selected={selected}
          activePath={activePath}
          onFocusItem={setActivePath}
        />
      ))}
      <style>{`
        .doc-tree { font-size: var(--fs-100); }
        .doc-tree__node { display: flex; flex-direction: column; }
        .doc-tree__item {
          display: flex;
          align-items: center;
          gap: var(--sp-1);
          height: var(--control-h);
          padding-right: var(--sp-2);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          cursor: pointer;
          user-select: none;
          transition: background var(--dur-fast) var(--ease-standard);
        }
        .doc-tree__item:hover { background: var(--bg-hover); }
        .doc-tree__item:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: -2px;
        }
        .doc-tree__item--selected {
          background: color-mix(in srgb, var(--accent-interactive) 12%, var(--bg-surface));
          color: var(--accent-text);
          font-weight: var(--fw-medium);
        }
        .doc-tree__twisty {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          flex: none;
          font-size: 9px;
          color: var(--text-muted);
        }
        .doc-tree__icon { flex: none; line-height: 1; }
        .doc-tree__label {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .doc-tree__count {
          flex: none;
          font-family: var(--font-mono);
          font-size: var(--fs-50);
          color: var(--text-muted);
        }
        @media (prefers-reduced-motion: reduce) {
          .doc-tree__item { transition-duration: 0.001ms; }
        }
      `}</style>
    </div>
  );
}
DocumentFolderTree.propTypes = {
  folders: PropTypes.array,
  onSelect: PropTypes.func,
  selected: PropTypes.any,
};

export { DocumentFolderTree };
window.DocumentFolderTree = DocumentFolderTree;
