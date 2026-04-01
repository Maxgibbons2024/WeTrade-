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
