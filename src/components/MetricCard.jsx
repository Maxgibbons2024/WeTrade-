export default function MetricCard({ title, value, subtitle, accent = false, danger = false, warning = false }) {
  let borderColor = 'border-gray-800';
  if (danger) borderColor = 'border-red-500/50';
  else if (warning) borderColor = 'border-amber-500/50';
  else if (accent) borderColor = 'border-brand-cyan/30';

  return (
    <div className={`bg-[#1a1d20] rounded-xl p-5 border ${borderColor}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{title}</p>
      <p className={`text-2xl font-bold mt-2 ${danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
