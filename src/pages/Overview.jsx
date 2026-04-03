import { useCallback, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import MetricCard from '../components/MetricCard';
import DateRangeFilter from '../components/DateRangeFilter';
import CloserAvatar from '../components/CloserAvatar';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery, useRealtime } from '../hooks/useSupabase';
import { formatCurrency, formatDate, isInDateRange, calcDelta, CLOSERS, OUTCOME_COLOURS } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function Overview() {
  const { preset, setPreset, presets, dateRange, compareEnabled, setCompareEnabled, compareRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { data: deals, loading: dealsLoading, error: dealsError, refetch: refetchDeals } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });

  const { data: paymentPlans, loading: plansLoading, error: plansError, refetch: refetchPlans } = useQuery('payment_plans');

  const { data: eodCalls, loading: eodLoading, error: eodError } = useQuery('eod_calls', {
    order: { column: 'report_date', ascending: false },
  });

  const handleRealtimeDeals = useCallback(() => { refetchDeals(); }, [refetchDeals]);
  const handleRealtimePlans = useCallback(() => { refetchPlans(); }, [refetchPlans]);
  useRealtime('deals', handleRealtimeDeals);
  useRealtime('payment_plans', handleRealtimePlans);

  const loading = dealsLoading || plansLoading || eodLoading;
  const error = dealsError || plansError || eodError;

  // Filtered metrics
  const rangeDeals = useMemo(() => deals.filter((d) => isInDateRange(d.created_at, dateRange.start, dateRange.end)), [deals, dateRange]);
  const rangeCollected = useMemo(() => rangeDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0), [rangeDeals]);

  const rangeEod = useMemo(() => eodCalls.filter((c) => isInDateRange(c.report_date, dateRange.start, dateRange.end)), [eodCalls, dateRange]);
  const totalCalls = rangeEod.length;
  const noShows = rangeEod.filter((c) => c.outcome === 'no_show').length;
  const showRate = totalCalls > 0 ? Math.round(((totalCalls - noShows) / totalCalls) * 100) : 0;

  // Compare metrics
  const compareDeals = useMemo(() => compareRange ? deals.filter((d) => isInDateRange(d.created_at, compareRange.start, compareRange.end)) : [], [deals, compareRange]);
  const compareCollected = compareDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
  const compareEod = useMemo(() => compareRange ? eodCalls.filter((c) => isInDateRange(c.report_date, compareRange.start, compareRange.end)) : [], [eodCalls, compareRange]);
  const compareCalls = compareEod.length;
  const compareNoShows = compareEod.filter((c) => c.outcome === 'no_show').length;
  const compareShowRate = compareCalls > 0 ? Math.round(((compareCalls - compareNoShows) / compareCalls) * 100) : 0;

  // Overdue payments (always current, not filtered by date)
  const overduePayments = useMemo(() => paymentPlans.filter((p) => p.status === 'overdue'), [paymentPlans]);

  // Revenue at risk - aging buckets
  const agingBuckets = useMemo(() => {
    const now = new Date();
    const buckets = [
      { label: '1-7 days', min: 1, max: 7, plans: [], total: 0 },
      { label: '8-14 days', min: 8, max: 14, plans: [], total: 0 },
      { label: '15-30 days', min: 15, max: 30, plans: [], total: 0 },
      { label: '30+ days', min: 31, max: Infinity, plans: [], total: 0 },
    ];
    overduePayments.forEach((p) => {
      const daysOverdue = Math.floor((now - new Date(p.next_due_date)) / (1000 * 60 * 60 * 24));
      const bucket = buckets.find((b) => daysOverdue >= b.min && daysOverdue <= b.max);
      if (bucket) {
        bucket.plans.push(p);
        bucket.total += Number(p.monthly_amount);
      }
    });
    return buckets;
  }, [overduePayments]);
  const totalAtRisk = overduePayments.reduce((sum, p) => sum + Number(p.monthly_amount), 0);

  // Recent failed payments
  const recentFailed = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return (receipts || []).filter((r) => !r.success && new Date(r.received_at) >= thirtyDaysAgo);
  }, [receipts]);

  // Closer leaderboard
  const leaderboard = useMemo(() => {
    if (!sheetData) return [];
    return ['lloyd', 'dave', 'zak'].map((closerId) => {
      const closer = CLOSERS.find((c) => c.id === closerId);
      const closerDeals = rangeDeals.filter((d) => d.closer_id === closerId);
      const revenue = closerDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
      const pifCount = closerDeals.filter((d) => !Number(d.monthly_amount)).length;
      const pifRatio = closerDeals.length > 0 ? pifCount / closerDeals.length : 0;

      const stats = sheetData[closerId];
      const scheduled = stats && !stats.error ? (stats.metrics['SCHEDULED Consults']?.total ?? 0) : 0;
      const live = stats && !stats.error ? (stats.metrics['LIVE Consults']?.total ?? 0) : 0;
      const closes = stats && !stats.error ? (stats.metrics['Closes']?.total ?? 0) : 0;
      const showRate = scheduled > 0 ? live / scheduled : 0;
      const closeRate = live > 0 ? closes / live : 0;

      // Normalized scoring (each 0-1)
      const score = (revenue / Math.max(revenue, 1)) * 0.25 + showRate * 0.25 + closeRate * 0.25 + pifRatio * 0.25;

      return { ...closer, revenue, closesCount: closerDeals.length, showRate, closeRate, pifRatio, score, scheduled, live, closes };
    }).sort((a, b) => b.score - a.score);
  }, [sheetData, rangeDeals]);

  // Weekly revenue chart data
  const chartData = useMemo(() => {
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

    const collected = weeks.map((w) =>
      deals
        .filter((d) => {
          const dt = new Date(d.created_at);
          return dt >= w.start && dt < w.end;
        })
        .reduce((sum, d) => sum + Number(d.front_end || 0), 0)
    );

    const outstanding = weeks.map((w) =>
      paymentPlans
        .filter((p) => p.status !== 'completed')
        .reduce((sum, p) => {
          const due = new Date(p.next_due_date);
          return due >= w.start && due < w.end ? sum + Number(p.monthly_amount || 0) : sum;
        }, 0)
    );

    const labels = weeks.map((w) =>
      w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    );

    return {
      labels,
      datasets: [
        {
          label: 'Collected',
          data: collected,
          backgroundColor: '#27CCE7',
          borderRadius: 4,
        },
        {
          label: 'Outstanding',
          data: outstanding,
          backgroundColor: '#F59E0B',
          borderRadius: 4,
        },
      ],
    };
  }, [deals, paymentPlans]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#9CA3AF', font: { family: 'Montserrat', size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: £${ctx.raw.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 } }, grid: { display: false } },
      y: {
        ticks: {
          color: '#6B7280',
          font: { family: 'Montserrat', size: 10 },
          callback: (v) => `£${v.toLocaleString()}`,
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  // Today's EOD grouped by closer
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEod = useMemo(() => {
    const grouped = {};
    eodCalls
      .filter((c) => c.report_date === todayStr)
      .forEach((c) => {
        if (!grouped[c.closer_id]) grouped[c.closer_id] = { closer_name: c.closer_name, closer_id: c.closer_id, calls: [] };
        grouped[c.closer_id].calls.push(c);
      });
    return Object.values(grouped);
  }, [eodCalls, todayStr]);

  // Recent deals (last 10)
  const recentDeals = useMemo(() => deals.slice(0, 10), [deals]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Overview</h2>
      </div>

      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        compareEnabled={compareEnabled}
        setCompareEnabled={setCompareEnabled}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {/* Overdue alert banner */}
      {overduePayments.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-red-400 text-sm font-medium">
            {overduePayments.length} overdue payment plan{overduePayments.length > 1 ? 's' : ''} —{' '}
            {overduePayments.map((p) => p.client_name).join(', ')}
          </p>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Collected"
          value={formatCurrency(rangeCollected)}
          delta={compareEnabled ? calcDelta(rangeCollected, compareCollected) : null}
          accent
        />
        <MetricCard
          title="Show Rate"
          value={`${showRate}%`}
          warning={showRate < 65 && showRate >= 55}
          danger={showRate < 55}
          subtitle={`${totalCalls - noShows}/${totalCalls} calls`}
          delta={compareEnabled ? calcDelta(showRate, compareShowRate) : null}
        />
        <MetricCard
          title="Deals Closed"
          value={rangeDeals.length}
          delta={compareEnabled ? calcDelta(rangeDeals.length, compareDeals.length) : null}
        />
        <MetricCard
          title="Overdue Payments"
          value={overduePayments.length}
          danger={overduePayments.length > 0}
          subtitle={overduePayments.length > 0 ? `${formatCurrency(overduePayments.reduce((s, p) => s + Number(p.monthly_amount), 0))} outstanding` : 'All clear'}
        />
      </div>

      {/* Weekly revenue chart */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Weekly Revenue</h3>
        <div className="h-64">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Revenue at Risk & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue at Risk */}
        {overduePayments.length > 0 && (
          <div className="bg-[#1a1d20] rounded-xl border border-red-500/20 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-red-400">Revenue at Risk</h3>
              <span className="text-lg font-bold text-red-400">{formatCurrency(totalAtRisk)}</span>
            </div>
            <div className="space-y-2 mb-4">
              {agingBuckets.map((bucket) => bucket.plans.length > 0 && (
                <div key={bucket.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-gray-500 w-20">{bucket.label}</span>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400/60 rounded-full" style={{ width: `${totalAtRisk > 0 ? (bucket.total / totalAtRisk) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-red-400 ml-2 w-16 text-right">{formatCurrency(bucket.total)}</span>
                  <span className="text-[10px] text-gray-600 ml-1 w-12 text-right">{bucket.plans.length} plan{bucket.plans.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            {recentFailed.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Failed Payments (30d)</p>
                <div className="space-y-1">
                  {recentFailed.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{r.client_name}</span>
                      <span className="text-red-400 font-semibold">{formatCurrency(r.amount)}</span>
                      <span className="text-gray-600">{formatDate(r.received_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Closer Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-4">Closer Leaderboard ({sheetMonth})</h3>
            <div className="space-y-3">
              {leaderboard.map((closer, i) => (
                <div key={closer.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                  <span className={`text-lg font-bold w-6 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>{i + 1}</span>
                  <CloserAvatar closerId={closer.id} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{closer.name}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] text-gray-500">{formatCurrency(closer.revenue)} rev</span>
                      <span className="text-[10px] text-gray-500">{Math.round(closer.showRate * 100)}% show</span>
                      <span className="text-[10px] text-gray-500">{Math.round(closer.closeRate * 100)}% close</span>
                      <span className="text-[10px] text-gray-500">{Math.round(closer.pifRatio * 100)}% PIF</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-cyan">{closer.closesCount}</p>
                    <p className="text-[10px] text-gray-500">closes</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent deals */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Recent Deals</h3>
          <div className="space-y-3">
            {recentDeals.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No deals yet</p>
            ) : (
              recentDeals.map((deal) => (
                <div key={deal.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                  <CloserAvatar closerId={deal.closer_id} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{deal.client_name}</p>
                    <p className="text-xs text-gray-500">{deal.closer_name} · {deal.programme}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-brand-cyan">{formatCurrency(deal.front_end)}</p>
                    {Number(deal.monthly_amount) > 0 && (
                      <p className="text-xs text-gray-500">{formatCurrency(deal.monthly_amount)}/mo</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 hidden sm:block">{formatDate(deal.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's EOD reports */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Today&apos;s EOD Reports</h3>
          {todayEod.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No EOD reports today</p>
          ) : (
            <div className="space-y-4">
              {todayEod.map((group) => (
                <div key={group.closer_id}>
                  <div className="flex items-center gap-2 mb-2">
                    <CloserAvatar closerId={group.closer_id} size="sm" />
                    <span className="text-sm font-medium">{group.closer_name}</span>
                    <span className="text-xs text-gray-500">{group.calls.length} calls</span>
                  </div>
                  <div className="space-y-1.5 pl-8">
                    {group.calls.map((call) => (
                      <div key={call.id} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: OUTCOME_COLOURS[call.outcome] || '#6B7280' }}
                        />
                        <span className="text-sm text-gray-300">{call.client_name}</span>
                        <StatusBadge status={call.outcome} type="outcome" />
                        {call.deal_value && (
                          <span className="text-xs text-brand-cyan font-medium ml-auto">
                            {formatCurrency(call.deal_value)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
