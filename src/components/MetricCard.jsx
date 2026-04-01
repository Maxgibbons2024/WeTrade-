export default function MetricCard({ title, value, subtitle, delta, accent = false, danger = false, warning = false }) {
  let borderColor = 'border-gray-800';
  if (danger) borderColor = 'border-red-500/50';
  else if (warning) borderColor = 'border-amber-500/50';
  else if (accent) borderColor = 'border-brand-cyan/30';

  return (
    <div className={`bg-[#1a1d20] rounded-xl p-5 border ${borderColor}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{title}</p>
      <div className="flex items-end gap-2 mt-2">
        <p className={`text-2xl font-bold ${danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-white'}`}>
          {value}
        </p>
        {delta && (
          <span className={`text-xs font-medium pb-0.5 ${delta.direction === 'up' ? 'text-green-400' : 'text-red-400'}`}>
            {delta.direction === 'up' ? '▲' : '▼'} {Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
