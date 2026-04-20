import { ArrowUp, ArrowDown } from 'lucide-react';

/**
 * MetricCard — the hero stat block. Uppercase label, large tabular value,
 * optional delta pill, optional subtitle. Premium dashboard feel: numbers
 * are the hero, typography recedes.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string|number} props.value
 * @param {string} [props.subtitle]
 * @param {{direction:'up'|'down', value:number}} [props.delta]
 * @param {boolean} [props.accent]  — cyan top-bar treatment
 * @param {boolean} [props.danger]  — red value + subtle red glow
 * @param {boolean} [props.warning] — amber value + subtle amber glow
 */
export default function MetricCard({ title, value, subtitle, delta, accent = false, danger = false, warning = false }) {
  // Subtle accent border-top strip instead of heavy full border — feels more premium
  const topBar =
    danger  ? 'before:bg-semantic-danger' :
    warning ? 'before:bg-semantic-warning' :
    accent  ? 'before:bg-brand-cyan' :
              'before:bg-transparent';

  const valueColor =
    danger  ? 'text-semantic-danger' :
    warning ? 'text-semantic-warning' :
              'text-white';

  return (
    <div
      className={`
        relative overflow-hidden
        bg-brand-darker rounded-xl p-5
        ring-1 ring-white/[0.04] shadow-elev-1
        transition-all duration-200
        before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] ${topBar}
      `}
    >
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em]">{title}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <p className={`text-[28px] leading-none font-semibold tabular ${valueColor}`}>
          {value}
        </p>
        {delta && (
          <span
            className={`
              inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded tabular
              ${delta.direction === 'up'
                ? 'bg-semantic-success/10 text-semantic-success'
                : 'bg-semantic-danger/10 text-semantic-danger'}
            `}
          >
            {delta.direction === 'up'
              ? <ArrowUp className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
              : <ArrowDown className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />}
            {Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {subtitle && <p className="text-[11px] text-gray-500 mt-1.5">{subtitle}</p>}
    </div>
  );
}
