import { useState, useMemo } from 'react';

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

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1a1d20] border-b border-gray-800">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && handleSort(col.key)}
                className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  col.sortable !== false ? 'cursor-pointer hover:text-brand-cyan select-none' : ''
                }`}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {sortCol === col.key && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d={sortAsc ? 'M5 10l5-5 5 5H5z' : 'M5 10l5 5 5-5H5z'} />
                    </svg>
                  )}
                </span>
              </th>
            ))}
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
            sorted.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick?.(row)}
                className={`table-row-hover transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
