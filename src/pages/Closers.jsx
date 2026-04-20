import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import MetricCard from '../components/MetricCard';
import CloserAvatar from '../components/CloserAvatar';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { CLOSERS, ACTIVE_CLOSERS, formatCurrency, isInDateRange, isCommunityOnly } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';
import useIclosedStats from '../hooks/useIclosedStats';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function Closers() {
  const [filter, setFilter] = useState('all');
  const [expandedCloser, setExpandedCloser] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { byCloser: iclosedByCloser, daily: iclosedDaily } = useIclosedStats(dateRange);

  const { data: deals, loading: dl, error: de } = useQuery('deals');
  const { data: eodCalls, loading: el, error: ee } = useQuery('eod_calls');
  const { data: paymentPlans, loading: pl, error: pe } = useQuery('payment_plans');
  const { data: fathomCalls, loading: fl, error: fe } = useQuery('fathom_calls');
  const { data: receipts, loading: rl } = useQuery('payment_receipts');

  const loading = dl || el || pl || fl || rl;
  const error = de || ee || pe || fe;

  const closerStats = useMemo(() => {
    return CLOSERS.map((closer) => {
      const closerDeals = deals.filter((d) => d.closer_id === closer.id && !isCommunityOnly(d));
      const rangeDeals = closerDeals.filter((d) => isInDateRange(d.created_at, dateRange.start, dateRange.end));
      const rangeEod = eodCalls.filter((c) => c.closer_id === closer.id && isInDateRange(c.report_date, dateRange.start, dateRange.end));
      const closerPlans = paymentPlans.filter((p) => p.closer_id === closer.id);
      const rangeFathom = fathomCalls.filter((f) => f.closer_id === closer.id && isInDateRange(f.call_date, dateRange.start, dateRange.end));

      const iclosedStats = iclosedByCloser?.[closer.id] || { scheduled: 0, live: 0, noShows: 0, showRate: 0, closes: 0 };
      const totalCalls = iclosedStats.scheduled;
      const noShows = iclosedStats.noShows;
      const showRate = iclosedStats.showRate;

      const rangeRevenue = rangeDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
      // Get PP collections from receipts in date range
      const rangeReceipts = (receipts || []).filter((r) => r.success && r.payment_plan_id && closerPlans.some((p) => p.id === r.payment_plan_id) && isInDateRange(r.received_at, dateRange.start, dateRange.end));
      const ppCollected = rangeReceipts.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalCollected = rangeRevenue + ppCollected;
      const closesCount = rangeDeals.length;
      const avgDealSize = closesCount > 0 ? Math.round(rangeRevenue / closesCount) : 0;

      const fathomTotalCalls = rangeFathom.length;
      const fathomTotalTalkTime = rangeFathom.reduce((sum, f) => sum + (f.talk_time_seconds || 0), 0);
      const fathomAvgDuration = fathomTotalCalls > 0
        ? Math.round(rangeFathom.reduce((sum, f) => sum + (f.duration_seconds || 0), 0) / fathomTotalCalls)
        : 0;

      const pifDeals = rangeDeals.filter((d) => !Number(d.monthly_amount));
      const ppDeals = rangeDeals.filter((d) => Number(d.monthly_amount) > 0);
      const pifCount = pifDeals.length;
      const ppCount = ppDeals.length;
      const pifRevenue = pifDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
      const ppRevenue = ppDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);

      return {
        ...closer,
        showRate,
        mtdRevenue: rangeRevenue,
        totalCollected,
        closesCount,
        avgDealSize,
        noShowCount: noShows,
        totalCalls,
        liveCalls: iclosedStats.live,
        iclosedCloses: iclosedStats.closes,
        fathomTotalCalls,
        fathomTotalTalkTime,
        fathomAvgDuration,
        pifCount,
        ppCount,
        pifRevenue,
        ppRevenue,
        rangeDeals,
        closerPlans,
      };
    });
  }, [deals, eodCalls, paymentPlans, fathomCalls, receipts, dateRange, iclosedByCloser]);

  const activeStats = closerStats.filter((c) => c.active);
  const inactiveStats = closerStats.filter((c) => !c.active && c.id !== 'community');
  const displayed = filter === 'all' ? activeStats : closerStats.filter((c) => c.id === filter);

  // Show rate trend (last 8 weeks)
  const trendData = useMemo(() => {
    const weeks = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      weeks.push({ start: weekStart, end: weekEnd });
    }

    const labels = weeks.map((w) => w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    const datasets = CLOSERS.map((closer) => ({
      label: closer.name,
      data: weeks.map((w) => {
        const weekCalls = eodCalls.filter((c) => {
          const dt = new Date(c.report_date);
          return c.closer_id === closer.id && dt >= w.start && dt < w.end;
        });
        const total = weekCalls.length;
        const shows = weekCalls.filter((c) => c.outcome !== 'no_show').length;
        return total > 0 ? Math.round((shows / total) * 100) : null;
      }),
      borderColor: closer.color,
      backgroundColor: `${closer.color}30`,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: true,
    }));

    return { labels, datasets };
  }, [eodCalls]);

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', font: { family: 'Montserrat', size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%` } },
    },
    scales: {
      x: { ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 } }, grid: { display: false } },
      y: {
        min: 0,
        max: 100,
        ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 }, callback: (v) => `${v}%` },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Closers</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === 'all' ? 'bg-brand-cyan text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          {ACTIVE_CLOSERS.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === c.id ? 'text-white' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
              style={filter === c.id ? { backgroundColor: c.color } : {}}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <DateRangeFilter preset={preset} setPreset={setPreset} presets={presets} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} />

      {/* Closer cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayed.map((stat) => {
          const showWarning = stat.showRate < 65 && stat.showRate >= 55;
          const showDanger = stat.showRate < 55;
          const isExpanded = expandedCloser === stat.id;

          return (
            <div
              key={stat.id}
              className={`bg-brand-darker rounded-xl border p-5 cursor-pointer transition-colors ${isExpanded ? 'border-brand-cyan/50' : 'border-gray-800 hover:border-gray-700'}`}
              onClick={() => setExpandedCloser(isExpanded ? null : stat.id)}
            >
              <div className="flex items-center gap-3 mb-4">
                <CloserAvatar closerId={stat.id} size="lg" />
                <div className="flex-1">
                  <h3 className="font-semibold">{stat.name}</h3>
                  <p className="text-xs text-gray-500">{stat.closesCount} closes · {stat.totalCalls} calls</p>
                </div>
                <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <p className="text-xs text-gray-500">Revenue</p>
                  <p className="text-sm font-semibold text-brand-cyan">{formatCurrency(stat.mtdRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Deal</p>
                  <p className="text-sm font-semibold">{formatCurrency(stat.avgDealSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">PIF</p>
                  <p className="text-sm font-semibold text-green-400">{stat.pifCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">PP</p>
                  <p className="text-sm font-semibold text-amber-400">{stat.ppCount}</p>
                </div>
              </div>

              {/* PIF/PP ratio bar */}
              {stat.closesCount > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">PIF / PP Ratio</span>
                    <span className="text-gray-400">{stat.pifCount} PIF · {stat.ppCount} PP</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-400 transition-all" style={{ width: `${(stat.pifCount / stat.closesCount) * 100}%` }} />
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${(stat.ppCount / stat.closesCount) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Show rate progress bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Show Rate</span>
                  <span className={showDanger ? 'text-red-400 font-semibold' : showWarning ? 'text-amber-400 font-semibold' : 'text-brand-cyan font-semibold'}>
                    {stat.showRate}%
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${stat.showRate}%`,
                      backgroundColor: showDanger ? '#EF4444' : showWarning ? '#F59E0B' : '#27CCE7',
                    }}
                  />
                </div>
              </div>

              {/* Expanded section */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* Extended stats */}
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">PIF Revenue</p>
                      <p className="text-sm font-semibold text-green-400">{formatCurrency(stat.pifRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">PP Revenue</p>
                      <p className="text-sm font-semibold text-amber-400">{formatCurrency(stat.ppRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">No-shows</p>
                      <p className="text-sm font-semibold text-red-400">{stat.noShowCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Active Plans</p>
                      <p className="text-sm font-semibold">{stat.closerPlans.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length}</p>
                    </div>
                  </div>

                  {/* Conversion Funnel (iClosed) */}
                  {stat.totalCalls > 0 && (() => {
                    const stages = [
                      { label: 'Scheduled', value: stat.totalCalls, color: '#6B7280' },
                      { label: 'Showed', value: stat.liveCalls, color: '#27CCE7' },
                      { label: 'Closed', value: stat.iclosedCloses, color: '#10B981' },
                    ];
                    return (
                      <div>
                        <h4 className="text-xs text-gray-500 font-medium mb-2">Conversion Funnel</h4>
                        <div className="space-y-1.5">
                          {stages.map((stage, i) => {
                            const pct = stat.totalCalls > 0 ? (stage.value / stat.totalCalls) * 100 : 0;
                            const prevVal = i > 0 ? stages[i - 1].value : null;
                            const dropoff = prevVal && prevVal > 0 ? Math.round((stage.value / prevVal) * 100) : null;
                            return (
                              <div key={stage.label} className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500 w-16 text-right">{stage.label}</span>
                                <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }} />
                                </div>
                                <span className="text-xs font-semibold w-6 text-right">{stage.value}</span>
                                {dropoff !== null && (
                                  <span className={`text-[10px] w-8 text-right ${dropoff < 50 ? 'text-red-400' : 'text-gray-500'}`}>{dropoff}%</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Fathom stats */}
                  {stat.fathomTotalCalls > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Fathom Calls</p>
                        <p className="text-sm font-semibold">{stat.fathomTotalCalls}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total Talk Time</p>
                        <p className="text-sm font-semibold">{formatTime(stat.fathomTotalTalkTime)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Avg Call Duration</p>
                        <p className="text-sm font-semibold">{formatTime(stat.fathomAvgDuration)}</p>
                      </div>
                    </div>
                  )}

                  {/* Deals list */}
                  <div>
                    <h4 className="text-xs text-gray-500 font-medium mb-2">Deals ({stat.rangeDeals.length})</h4>
                    {stat.rangeDeals.length === 0 ? (
                      <p className="text-xs text-gray-600">No deals in this period</p>
                    ) : (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {stat.rangeDeals.map((deal) => (
                          <div key={deal.id} className="flex items-center justify-between bg-brand-dark rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${Number(deal.monthly_amount) > 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-green-400/20 text-green-400'}`}>
                                {Number(deal.monthly_amount) > 0 ? 'PP' : 'PIF'}
                              </span>
                              <span className="text-sm font-medium">{deal.client_name}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-brand-cyan font-semibold">{formatCurrency(deal.front_end)}</span>
                              {Number(deal.monthly_amount) > 0 && (
                                <span className="text-xs text-gray-500">{formatCurrency(deal.monthly_amount)}/mo</span>
                              )}
                              <span className="text-xs text-gray-500">{deal.programme}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Daily Call Activity (iClosed) — scoped to selected date range */}
                  {(iclosedDaily?.[stat.id]?.length || 0) > 0 && (() => {
                    const series = iclosedDaily[stat.id];
                    const totals = series.reduce(
                      (acc, d) => {
                        acc.scheduled += d.scheduled;
                        acc.live += d.live;
                        acc.closes += d.closes;
                        return acc;
                      },
                      { scheduled: 0, live: 0, closes: 0 }
                    );
                    const showPct = totals.scheduled > 0 ? Math.round((totals.live / totals.scheduled) * 100) : 0;
                    const rows = [
                      { label: 'Scheduled', key: 'scheduled', total: totals.scheduled },
                      { label: 'Live', key: 'live', total: totals.live },
                      { label: 'Closes', key: 'closes', total: totals.closes },
                      { label: 'Show %', key: 'pct', total: `${showPct}%` },
                    ];
                    return (
                      <div>
                        <h4 className="text-xs text-gray-500 font-medium mb-2">
                          Daily Call Activity ({series.length} {series.length === 1 ? 'day' : 'days'})
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1 pr-2 font-medium">Metric</th>
                                {series.map((d) => (
                                  <th key={d.date} className="text-center py-1 px-1 font-medium min-w-[40px]">{d.date.slice(5)}</th>
                                ))}
                                <th className="text-center py-1 pl-2 font-semibold text-gray-400">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={row.label} className="border-t border-gray-800/50">
                                  <td className="py-1.5 pr-2 text-gray-400 font-medium whitespace-nowrap">{row.label}</td>
                                  {series.map((d) => {
                                    let val;
                                    if (row.key === 'pct') {
                                      val = d.scheduled > 0 ? `${Math.round((d.live / d.scheduled) * 100)}%` : '-';
                                    } else {
                                      val = d[row.key] || 0;
                                    }
                                    return (
                                      <td key={d.date} className="text-center py-1.5 px-1">
                                        <span className={val && val !== '-' ? 'text-white' : 'text-gray-700'}>{val || '-'}</span>
                                      </td>
                                    );
                                  })}
                                  <td className="text-center py-1.5 pl-2 font-semibold text-brand-cyan">{row.total}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inactive closers — collapsed by default */}
      {filter === 'all' && inactiveStats.length > 0 && (
        <div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3"
          >
            <span>{showInactive ? '▼' : '▶'}</span>
            <span>Former closers ({inactiveStats.length})</span>
          </button>
          {showInactive && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
              {inactiveStats.map((stat) => (
                <div key={stat.id} className="bg-brand-darker rounded-xl border border-gray-800 p-4">
                  <div className="flex items-center gap-3">
                    <CloserAvatar closerId={stat.id} size="sm" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-400">{stat.name}</h3>
                      <p className="text-xs text-gray-600">{stat.closesCount} closes · {formatCurrency(stat.mtdRevenue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly trend chart */}
      <div className="bg-brand-darker rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Show Rate Trend (Last 8 Weeks)</h3>
        <div className="h-72">
          <Line data={trendData} options={trendOptions} />
        </div>
      </div>
    </div>
  );
}
