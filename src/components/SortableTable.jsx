import { useState, useMemo } from 'react';

/**
 * SortableTable — data table with click/keyboard-to-sort column headers and
 * optional per-row click handler.
 *
 * Accessibility:
 * - Column headers use `scope="col"` and `aria-sort` ('ascending'|'descending'|'none')
 *   so screen readers announce sort state.
 * - Sortable headers are real buttons (Tab-focusable, Enter/Space toggles sort).
 * - Rows become keyboard-focusable when `onRowClick` is provided; Enter/Space
 *   invokes the handler.
 *
 * @param {Array<{key, label, sortable?, render?}>} columns
 * @param {Array<object>} data
 * @param {(row) => void} [onRowClick]
 * @param {{column, ascending}} [defaultSort]
 */
export default function SortableTable({ columns, data, onRowClick, defaultSort }) {
  const [sortCol, setSortCol] = useState(defaultSort?.column || null);
  const [sortAsc, setSortAsc] = useState(defaultSort?.ascending ?? true);

  const sorted = useMemo(() => {
    if (!sortCol) return data;
    return [...data].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [data, sortCol, sortAsc]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  function handleRowKeyDown(e, row) {
    if (!onRowClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-darker border-b border-gray-800">
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const isSorted = sortCol === col.key;
              const ariaSort = !sortable ? undefined : isSorted ? (sortAsc ? 'ascending' : 'descending') : 'none';
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-brand-cyan select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan rounded"
                      aria-label={`Sort by ${col.label}${isSorted ? (sortAsc ? ' (currently ascending)' : ' (currently descending)') : ''}`}
                    >
                      {col.label}
                      {isSorted && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path d={sortAsc ? 'M5 10l5-5 5 5H5z' : 'M5 10l5 5 5-5H5z'} />
                        </svg>
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                No data available
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => {
              const clickable = Boolean(onRowClick);
              return (
                <tr
                  key={row.id || i}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={clickable ? (e) => handleRowKeyDown(e, row) : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  role={clickable ? 'button' : undefined}
                  className={`transition-colors ${clickable ? 'cursor-pointer hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-cyan' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
