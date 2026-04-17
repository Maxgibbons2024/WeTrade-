import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import MetricCard from '../components/MetricCard';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { formatCurrency, isInDateRange, isCommunityOnly } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-GB');
}

function roasColor(roas) {
  if (roas >= 3) return 'text-green-400';
  if (roas >= 2) return 'text-amber-400';
  if (roas > 0) return 'text-red-400';
  return 'text-gray-500';
}

export default function Ads() {
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const [timeView, setTimeView] = useState('daily');

  const { data: daily, loading, error } = useQuery('segmetrics_daily', {
    order: { column: 'date', ascending: false },
  });
  // Cash sources — used to compute real ROAS vs ad spend
  const { data: deals, loading: dealsLoading } = useQuery('deals');
  const { data: receipts, loading: receiptsLoading } = useQuery('payment_receipts');
  const { data: manualPayments, loading: manualLoading } = useQuery('manual_payments');

  const allLoading = loading || dealsLoading || receiptsLoading || manualLoading;

  // ---- Filter ad data by date range ----
  const rangeDaily = useMemo(
    () => (daily || []).filter((d) => isInDateRange(d.date, dateRange.start, dateRange.end)),
    [daily, dateRange]
  );

  // ---- Cash collected in range — classified as "new cash" vs "payment plan cash" ----
  // Follows the same rules as the Deals → Transactions ledger:
  //   - Deal FE → new cash
  //   - Receipt without payment_plan_id → new cash (first payment on an unmatched deal)
  //   - Receipt with payment_plan_id → payment plan cash
  //   - Manual payment linked to a plan → payment plan cash, otherwise new cash
  //   - Failed receipts are excluded.
  const cashByDate = useMemo(() => {
    const map = {}; // date → { new_cash, pp_cash }
    const add = (date, key, amount) => {
      if (!date) return;
      const d = String(date).split('T')[0];
      if (!map[d]) map[d] = { new_cash: 0, pp_cash: 0 };
      map[d][key] += Number(amount || 0);
    };

    // Deals — FE counts as new cash on the deal's created_at
    for (const deal of (deals || [])) {
      if (isCommunityOnly(deal)) continue;
      const fe = Number(deal.front_end || 0);
      if (!fe) continue;
      add(deal.created_at, 'new_cash', fe);
    }

    // Payment receipts (Stripe) — successful only
    for (const r of (receipts || [])) {
      if (!r.success) continue;
      const amount = Number(r.amount || 0);
      if (!amount) continue;
      if (r.payment_plan_id) {
        add(r.received_at, 'pp_cash', amount);
      } else {
        add(r.received_at, 'new_cash', amount);
      }
    }

    // Manual payments — classify by linked deal's plan
    for (const m of (manualPayments || [])) {
      const amount = Number(m.amount || 0);
      if (!amount) continue;
      const linkedDeal = m.deal_id ? (deals || []).find((d) => d.id === m.deal_id) : null;
      // If deal has monthly_amount > 0 it's on a plan → count as PP; otherwise new cash
      const isPlan = linkedDeal && Number(linkedDeal.monthly_amount || 0) > 0;
      add(m.payment_date, isPlan ? 'pp_cash' : 'new_cash', amount);
    }

    return map;
  }, [deals, receipts, manualPayments]);

  // Sum cash over selected date range
  const cashTotals = useMemo(() => {
    let newCash = 0, ppCash = 0;
    for (const [date, vals] of Object.entries(cashByDate)) {
      if (!isInDateRange(date, dateRange.start, dateRange.end)) continue;
      newCash += vals.new_cash;
      ppCash += vals.pp_cash;
    }
    return { newCash, ppCash, total: newCash + ppCash };
  }, [cashByDate, dateRange]);

  // ---- KPI Totals over the selected range ----
  const totals = useMemo(() => {
    let spend = 0, clicks = 0, impressions = 0, leads = 0;
    for (const d of rangeDaily) {
      spend += Number(d.spend || 0);
      clicks += Number(d.clicks || 0);
      impressions += Number(d.impressions || 0);
      leads += Number(d.leads || 0);
    }
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const newRoas = spend > 0 ? cashTotals.newCash / spend : 0;
    const totalRoas = spend > 0 ? cashTotals.total / spend : 0;
    return { spend, clicks, impressions, leads, cpc, cpl, newRoas, totalRoas };
  }, [rangeDaily, cashTotals]);

  // ---- Bucket date into daily / weekly (Mon-start) / monthly key ----
  const bucketKey = (dateStr) => {
    if (timeView === 'daily') return dateStr;
    if (timeView === 'weekly') {
      const d = new Date(dateStr);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      return monday.toISOString().split('T')[0];
    }
    return dateStr?.substring(0, 7); // YYYY-MM
  };

  const timeSeriesData = useMemo(() => {
    const groups = {};
    const ensure = (key) => {
      if (!groups[key]) groups[key] = { spend: 0, clicks: 0, impressions: 0, leads: 0, newCash: 0, ppCash: 0 };
      return groups[key];
    };
    for (const d of rangeDaily) {
      const key = bucketKey(d.date);
      const g = ensure(key);
      g.spend += Number(d.spend || 0);
      g.clicks += Number(d.clicks || 0);
      g.impressions += Number(d.impressions || 0);
      g.leads += Number(d.leads || 0);
    }
    // Merge in cash for the same buckets
    for (const [date, vals] of Object.entries(cashByDate)) {
      if (!isInDateRange(date, dateRange.start, dateRange.end)) continue;
      const key = bucketKey(date);
      const g = ensure(key);
      g.newCash += vals.new_cash;
      g.ppCash += vals.pp_cash;
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([label, data]) => ({
      label,
      ...data,
      totalCash: data.newCash + data.ppCash,
      newRoas: data.spend > 0 ? data.newCash / data.spend : 0,
      totalRoas: data.spend > 0 ? (data.newCash + data.ppCash) / data.spend : 0,
    }));
  }, [rangeDaily, cashByDate, dateRange, timeView]);

  // ---- Spend vs Cash chart ----
  const chartData = useMemo(() => {
    const labels = timeSeriesData.map((d) => {
      if (timeView === 'monthly') return d.label;
      return new Date(d.label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    });
    return {
      labels,
      datasets: [
        {
          label: 'Spend',
          data: timeSeriesData.map((d) => d.spend),
          backgroundColor: '#3B82F6',
          borderRadius: 4,
        },
        {
          label: 'New Cash',
          data: timeSeriesData.map((d) => d.newCash),
          backgroundColor: '#10B981',
          borderRadius: 4,
        },
        {
          label: 'Payment Plan Cash',
          data: timeSeriesData.map((d) => d.ppCash),
          backgroundColor: '#F59E0B',
          borderRadius: 4,
        },
      ],
    };
  }, [timeSeriesData, timeView]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', font: { family: 'Montserrat', size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: £${ctx.raw.toLocaleString()}` } },
    },
    scales: {
      x: { ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 }, callback: (v) => `£${v.toLocaleString()}` },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  if (allLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Ads</h2>

      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Total Spend" value={formatCurrency(totals.spend)} accent />
        <MetricCard title="Impressions" value={formatNum(totals.impressions)} />
        <MetricCard title="Clicks" value={formatNum(totals.clicks)} />
        <MetricCard title="Leads" value={formatNum(totals.leads)} />
        <MetricCard title="CPC" value={formatCurrency(totals.cpc)} />
        <MetricCard title="CPL" value={formatCurrency(totals.cpl)} />
      </div>

      {/* ---- ROAS Section ---- */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-400">Return on Ad Spend</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Cash collected in range ÷ ad spend in range</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Ad Spend reference */}
          <div className="bg-brand-dark rounded-lg p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">Ad Spend</p>
            <p className="text-2xl font-bold text-blue-400">{formatCurrency(totals.spend)}</p>
            <p className="text-[10px] text-gray-600 mt-1">Total paid to Meta in this range</p>
          </div>
          {/* New Cash ROAS */}
          <div className="bg-brand-dark rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">New Cash ROAS</p>
              <span className={`text-[10px] font-semibold ${roasColor(totals.newRoas)}`}>
                {formatCurrency(cashTotals.newCash)}
              </span>
            </div>
            <p className={`text-2xl font-bold ${roasColor(totals.newRoas)}`}>
              {totals.newRoas.toFixed(2)}x
            </p>
            <p className="text-[10px] text-gray-600 mt-1">FE on new deals + first payments</p>
          </div>
          {/* Total ROAS (inc PP) */}
          <div className="bg-brand-dark rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Total ROAS (inc. PP)</p>
              <span className={`text-[10px] font-semibold ${roasColor(totals.totalRoas)}`}>
                {formatCurrency(cashTotals.total)}
              </span>
            </div>
            <p className={`text-2xl font-bold ${roasColor(totals.totalRoas)}`}>
              {totals.totalRoas.toFixed(2)}x
            </p>
            <p className="text-[10px] text-gray-600 mt-1">Includes payment plan collections</p>
          </div>
        </div>
        <div className="mt-3 text-[10px] text-gray-600">
          Legend: <span className="text-green-400 font-medium">3x+</span> strong · <span className="text-amber-400 font-medium">2–3x</span> ok · <span className="text-red-400 font-medium">&lt;2x</span> underperforming
        </div>
      </div>

      {/* Chart — Spend vs Cash */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Spend vs Cash Collected</h3>
          <div className="flex gap-1">
            {['daily', 'weekly', 'monthly'].map((v) => (
              <button
                key={v}
                onClick={() => setTimeView(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  timeView === v ? 'bg-brand-cyan text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Breakdown table with ROAS columns */}
      {timeSeriesData.length > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            {timeView === 'daily' ? 'Daily' : timeView === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3 font-medium">Period</th>
                  <th className="text-right py-2 px-2 font-medium">Spend</th>
                  <th className="text-right py-2 px-2 font-medium">Impr.</th>
                  <th className="text-right py-2 px-2 font-medium">Clicks</th>
                  <th className="text-right py-2 px-2 font-medium">Leads</th>
                  <th className="text-right py-2 px-2 font-medium text-green-500">New Cash</th>
                  <th className="text-right py-2 px-2 font-medium text-amber-500">PP Cash</th>
                  <th className="text-right py-2 px-2 font-medium">New ROAS</th>
                  <th className="text-right py-2 pl-2 font-medium">Total ROAS</th>
                </tr>
              </thead>
              <tbody>
                {timeSeriesData.map((row) => (
                  <tr key={row.label} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 text-gray-300 font-medium">
                      {timeView === 'monthly' ? row.label : new Date(row.label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="text-right py-2 px-2 text-white">{formatCurrency(row.spend)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatNum(row.impressions)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatNum(row.clicks)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatNum(row.leads)}</td>
                    <td className="text-right py-2 px-2 text-green-400">{formatCurrency(row.newCash)}</td>
                    <td className="text-right py-2 px-2 text-amber-400">{formatCurrency(row.ppCash)}</td>
                    <td className={`text-right py-2 px-2 font-semibold ${roasColor(row.newRoas)}`}>
                      {row.spend > 0 ? `${row.newRoas.toFixed(2)}x` : '—'}
                    </td>
                    <td className={`text-right py-2 pl-2 font-semibold ${roasColor(row.totalRoas)}`}>
                      {row.spend > 0 ? `${row.totalRoas.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rangeDaily.length === 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-8 text-center text-gray-500 text-sm">
          No ad data for this period.
        </div>
      )}
    </div>
  );
}
