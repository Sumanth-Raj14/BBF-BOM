import PropTypes from "prop-types";

function DocumentFolderTree({ folders = [], onSelect, selected }) {
  const [expanded, setExpanded] = React.useState(new Set(["/"]));
  const toggle = (path) => {
    const next = new Set(expanded);
    next.has(path) ? next.delete(path) : next.add(path);
    setExpanded(next);
  };
  return (
    <div className="fs-12">
      {(folders || []).map((f) => (
        <div key={f.path}>
          <button
            onClick={() => {
              toggle(f.path);
              onSelect?.(f);
            }}
            className="flex"
          >
            {f.children ? (
              expanded.has(f.path) ? (
                "▼"
              ) : (
                "▶"
              )
            ) : (
              <span style={{ width: 10 }} />
            )}
            <span>{f.icon || "📁"}</span>
            <span>{f.label}</span>
            {f.count != null && (
              <span
                className="font-mono fs-10 fg-3"
                style={{ marginLeft: "auto" }}
              >
                {f.count}
              </span>
            )}
          </button>
          {f.children && expanded.has(f.path) && (
            <DocumentFolderTree
              folders={f.children}
              onSelect={onSelect}
              selected={selected}
            />
          )}
        </div>
      ))}
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
