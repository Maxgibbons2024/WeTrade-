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
import { CLOSERS, formatCurrency, isInDateRange } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function Closers() {
  const [filter, setFilter] = useState('all');
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { data: deals, loading: dl, error: de } = useQuery('deals');
  const { data: eodCalls, loading: el, error: ee } = useQuery('eod_calls');
  const { data: paymentPlans, loading: pl, error: pe } = useQuery('payment_plans');
  const { data: fathomCalls, loading: fl, error: fe } = useQuery('fathom_calls');

  const loading = dl || el || pl || fl;
  const error = de || ee || pe || fe;

  const closerStats = useMemo(() => {
    return CLOSERS.map((closer) => {
      const closerDeals = deals.filter((d) => d.closer_id === closer.id);
      const rangeDeals = closerDeals.filter((d) => isInDateRange(d.created_at, dateRange.start, dateRange.end));
      const rangeEod = eodCalls.filter((c) => c.closer_id === closer.id && isInDateRange(c.report_date, dateRange.start, dateRange.end));
      const closerPlans = paymentPlans.filter((p) => p.closer_id === closer.id);
      const rangeFathom = fathomCalls.filter((f) => f.closer_id === closer.id && isInDateRange(f.call_date, dateRange.start, dateRange.end));

      const totalCalls = rangeEod.length;
      const noShows = rangeEod.filter((c) => c.outcome === 'no_show').length;
      const showRate = totalCalls > 0 ? Math.round(((totalCalls - noShows) / totalCalls) * 100) : 0;

      const rangeRevenue = rangeDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
      const totalCollected = rangeRevenue + closerPlans.reduce((sum, p) => sum + Number(p.total_collected || 0), 0);
      const closesCount = rangeDeals.length;
      const avgDealSize = closesCount > 0 ? Math.round(rangeRevenue / closesCount) : 0;

      const fathomTotalCalls = rangeFathom.length;
      const fathomTotalTalkTime = rangeFathom.reduce((sum, f) => sum + (f.talk_time_seconds || 0), 0);
      const fathomAvgDuration = fathomTotalCalls > 0
        ? Math.round(rangeFathom.reduce((sum, f) => sum + (f.duration_seconds || 0), 0) / fathomTotalCalls)
        : 0;

      return {
        ...closer,
        showRate,
        mtdRevenue: rangeRevenue,
        totalCollected,
        closesCount,
        avgDealSize,
        noShowCount: noShows,
        totalCalls,
        fathomTotalCalls,
        fathomTotalTalkTime,
        fathomAvgDuration,
      };
    });
  }, [deals, eodCalls, paymentPlans, fathomCalls, dateRange]);

  const displayed = filter === 'all' ? closerStats : closerStats.filter((c) => c.id === filter);

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
          {CLOSERS.map((c) => (
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

          return (
            <div key={stat.id} className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <CloserAvatar closerId={stat.id} size="lg" />
                <div>
                  <h3 className="font-semibold">{stat.name}</h3>
                  <p className="text-xs text-gray-500">{stat.totalCalls} calls</p>
                </div>
              </div>

              {/* Show rate progress bar */}
              <div className="mb-4">
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
                {showDanger && <p className="text-xs text-red-400 mt-1">Below 55% — critical</p>}
                {showWarning && <p className="text-xs text-amber-400 mt-1">Below 65% — needs improvement</p>}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Revenue (FE)</p>
                  <p className="text-sm font-semibold">{formatCurrency(stat.mtdRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Collected</p>
                  <p className="text-sm font-semibold">{formatCurrency(stat.totalCollected)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Deal Size</p>
                  <p className="text-sm font-semibold">{formatCurrency(stat.avgDealSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Closes</p>
                  <p className="text-sm font-semibold">{stat.closesCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">No-shows</p>
                  <p className="text-sm font-semibold text-red-400">{stat.noShowCount}</p>
                </div>
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
            </div>
          );
        })}
      </div>

      {/* Monthly trend chart */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Show Rate Trend (Last 8 Weeks)</h3>
        <div className="h-72">
          <Line data={trendData} options={trendOptions} />
        </div>
      </div>
    </div>
  );
}
