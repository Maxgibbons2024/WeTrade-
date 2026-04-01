import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import CloserAvatar from '../components/CloserAvatar';
import DateRangeFilter from '../components/DateRangeFilter';
import SortableTable from '../components/SortableTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { CLOSERS, formatDate, isInDateRange } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function Fathom() {
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const { data: fathomCalls, loading, error } = useQuery('fathom_calls', {
    order: { column: 'call_date', ascending: false },
  });

  const rangeCalls = useMemo(() => fathomCalls.filter((f) => isInDateRange(f.call_date, dateRange.start, dateRange.end)), [fathomCalls, dateRange]);

  // Per-closer stats
  const closerStats = useMemo(() => {
    return CLOSERS.map((closer) => {
      const calls = rangeCalls.filter((f) => f.closer_id === closer.id);
      const totalCalls = calls.length;
      const totalTalkTime = calls.reduce((sum, f) => sum + (f.talk_time_seconds || 0), 0);
      const avgDuration = totalCalls > 0
        ? Math.round(calls.reduce((sum, f) => sum + (f.duration_seconds || 0), 0) / totalCalls)
        : 0;
      const noShows = calls.filter((f) => f.no_show).length;
      const noShowRate = totalCalls > 0 ? Math.round((noShows / totalCalls) * 100) : 0;

      return { ...closer, totalCalls, totalTalkTime, avgDuration, noShows, noShowRate };
    });
  }, [rangeCalls]);

  // Weekly chart (last 8 weeks, stacked bar of calls per closer)
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

    const labels = weeks.map((w) => w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    const datasets = CLOSERS.map((closer) => ({
      label: closer.name,
      data: weeks.map((w) =>
        fathomCalls.filter((f) => {
          const dt = new Date(f.call_date);
          return f.closer_id === closer.id && dt >= w.start && dt < w.end;
        }).length
      ),
      backgroundColor: closer.color,
      borderRadius: 4,
    }));

    return { labels, datasets };
  }, [fathomCalls]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', font: { family: 'Montserrat', size: 11 } } },
    },
    scales: {
      x: { stacked: true, ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 } }, grid: { display: false } },
      y: { stacked: true, ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
    },
  };

  // Call log table
  const callColumns = [
    { key: 'call_date', label: 'Date', render: (val) => formatDate(val) },
    {
      key: 'closer_id',
      label: 'Closer',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <CloserAvatar closerId={val} size="sm" />
          <span className="text-sm">{row.closer_name}</span>
        </div>
      ),
    },
    { key: 'duration_seconds', label: 'Duration', render: (val) => formatTime(val) },
    { key: 'talk_time_seconds', label: 'Talk Time', render: (val) => formatTime(val) },
    {
      key: 'outcome',
      label: 'Outcome',
      render: (val, row) => row.no_show ? <span className="text-red-400 text-xs font-medium">No Show</span> : <span className="capitalize text-xs">{val || '—'}</span>,
    },
    {
      key: 'transcript_url',
      label: 'Transcript',
      sortable: false,
      render: (val) =>
        val ? (
          <a href={val} target="_blank" rel="noopener noreferrer" className="text-brand-cyan text-xs hover:underline">
            View
          </a>
        ) : (
          '—'
        ),
    },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Fathom</h2>

      <DateRangeFilter preset={preset} setPreset={setPreset} presets={presets} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} />

      {/* Per-closer stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {closerStats.map((stat) => (
          <div key={stat.id} className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <CloserAvatar closerId={stat.id} size="lg" />
              <h3 className="font-semibold">{stat.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Call Volume</p>
                <p className="text-sm font-semibold">{stat.totalCalls}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Talk</p>
                <p className="text-sm font-semibold">{formatTime(stat.totalTalkTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Duration</p>
                <p className="text-sm font-semibold">{formatTime(stat.avgDuration)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">No-show Rate</p>
                <p className={`text-sm font-semibold ${stat.noShowRate > 30 ? 'text-red-400' : ''}`}>
                  {stat.noShowRate}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly calls chart */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Weekly Calls per Closer</h3>
        <div className="h-64">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Call log table */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Call Log</h3>
        <SortableTable columns={callColumns} data={rangeCalls} defaultSort={{ column: 'call_date', ascending: false }} />
      </div>
    </div>
  );
}
