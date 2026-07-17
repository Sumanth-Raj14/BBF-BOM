import PropTypes from "prop-types";

/**
 * DataTable — dense-capable data grid on tokens.
 * - sticky header (default), optional zebra
 * - `dense` sets data-density="dense" on the wrapper so row height / padding
 *   / grid font-size resolve from the density tokens (default dense on data grids)
 * - sortable column headers expose aria-sort + a visible indicator
 *
 * columns: [{ key, header, align?: 'left'|'right'|'num', sortable?, width?, render?(row) }]
 */
export function DataTable({
  columns = [],
  rows = [],
  getRowKey,
  dense = false,
  zebra = false,
  stickyHeader = true,
  sort = null,
  onSortChange,
  onRowClick,
  isRowSelected,
  ariaLabel,
  empty = null,
  className = "",
}) {
  const rowKey = getRowKey || ((row, i) => row.id ?? row.key ?? i);

  const handleSort = (col) => {
    if (!col.sortable || !onSortChange) return;
    const dir =
      sort && sort.key === col.key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: col.key, dir });
  };

  const wrapCls = ["ui-table-wrap", className].filter(Boolean).join(" ");
  const tableCls = [
    "ui-table",
    zebra ? "ui-table--zebra" : "",
    stickyHeader ? "" : "ui-table--no-sticky",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapCls} data-density={dense ? "dense" : undefined}>
      <table className={tableCls} aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((col) => {
              const isNum = col.align === "num" || col.align === "right";
              const active = sort && sort.key === col.key;
              const ariaSort = col.sortable
                ? active
                  ? sort.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
                : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={isNum ? "ui-num" : undefined}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="ui-table__sort"
                      onClick={() => handleSort(col)}
                    >
                      {col.header}
                      <span className="ui-table__sort-ind" aria-hidden="true">
                        {active && sort.dir === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const selected = isRowSelected ? isRowSelected(row) : undefined;
              const clickable = !!onRowClick;
              return (
                <tr
                  key={rowKey(row, i)}
                  aria-selected={selected}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={clickable ? "ui-table__row--clickable" : undefined}
                  style={clickable ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((col) => {
                    const isNum =
                      col.align === "num" || col.align === "right";
                    return (
                      <td key={col.key} className={isNum ? "ui-num" : undefined}>
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
DataTable.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.node,
      align: PropTypes.oneOf(["left", "right", "num"]),
      sortable: PropTypes.bool,
      width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      render: PropTypes.func,
    }),
  ),
  rows: PropTypes.array,
  getRowKey: PropTypes.func,
  dense: PropTypes.bool,
  zebra: PropTypes.bool,
  stickyHeader: PropTypes.bool,
  sort: PropTypes.shape({ key: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
  onRowClick: PropTypes.func,
  isRowSelected: PropTypes.func,
  ariaLabel: PropTypes.string,
  empty: PropTypes.node,
  className: PropTypes.string,
};

export default DataTable;
