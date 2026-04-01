import { STATUS_COLOURS, OUTCOME_COLOURS } from '../lib/constants';

export default function StatusBadge({ status, type = 'status' }) {
  const colors = type === 'outcome' ? OUTCOME_COLOURS : STATUS_COLOURS;
  const color = colors[status] || '#6B7280';
  const label = status ? status.replace(/_/g, ' ') : 'unknown';

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
