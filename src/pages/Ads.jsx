import { useState, useMemo } from 'react';
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
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { formatCurrency, isInDateRange } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-GB');
}

export default function Ads() {
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const [timeView, setTimeView] = useState('daily');

  const { data: daily, loading, error } = useQuery('segmetrics_daily', {
    order: { column: 'date', ascending: false },
  });

  // Filter by date range
  const rangeDaily = useMemo(
    () => (daily || []).filter((d) => isInDateRange(d.date, dateRange.start, dateRange.end)),
    [daily, dateRange]
  );

  // ---- KPI Totals over the selected range ----
  const totals = useMemo(() => {
    let spend = 0, clicks = 0, impressions = 0, leads = 0, revenue = 0;
    for (const d of rangeDaily) {
      spend += Number(d.spend || 0);
      clicks += Number(d.clicks || 0);
      impressions += Number(d.impressions || 0);
      leads += Number(d.leads || 0);
      revenue += Number(d.revenue || 0);
    }
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    return { spend, clicks, impressions, leads, revenue, cpc, cpl, ctr };
  }, [rangeDaily]);

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
    for (const d of rangeDaily) {
      const key = bucketKey(d.date);
      if (!groups[key]) groups[key] = { spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0 };
      groups[key].spend += Number(d.spend || 0);
      groups[key].clicks += Number(d.clicks || 0);
      groups[key].impressions += Number(d.impressions || 0);
      groups[key].leads += Number(d.leads || 0);
      groups[key].revenue += Number(d.revenue || 0);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([label, data]) => ({ label, ...data }));
  }, [rangeDaily, timeView]);

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

  if (loading) return <LoadingSpinner />;
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

      {/* Chart */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Ad Spend</h3>
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

      {/* Breakdown table */}
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
                  <th className="text-right py-2 px-2 font-medium">Impressions</th>
                  <th className="text-right py-2 px-2 font-medium">Clicks</th>
                  <th className="text-right py-2 px-2 font-medium">Leads</th>
                  <th className="text-right py-2 px-2 font-medium">CPC</th>
                  <th className="text-right py-2 pl-2 font-medium">CPL</th>
                </tr>
              </thead>
              <tbody>
                {timeSeriesData.map((row) => {
                  const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
                  const cpl = row.leads > 0 ? row.spend / row.leads : 0;
                  return (
                    <tr key={row.label} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-gray-300 font-medium">
                        {timeView === 'monthly' ? row.label : new Date(row.label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="text-right py-2 px-2 text-white">{formatCurrency(row.spend)}</td>
                      <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.impressions)}</td>
                      <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.clicks)}</td>
                      <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.leads)}</td>
                      <td className="text-right py-2 px-2 text-gray-400">{formatCurrency(cpc)}</td>
                      <td className="text-right py-2 pl-2 text-gray-400">{formatCurrency(cpl)}</td>
                    </tr>
                  );
                })}
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
