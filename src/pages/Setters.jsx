import { useState, useMemo } from 'react';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import CloserAvatar from '../components/CloserAvatar';
import SlideOver from '../components/SlideOver';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import useDateRange from '../hooks/useDateRange';
import useIclosedStats, { isShowed, isNoShow, isClosedCall } from '../hooks/useIclosedStats';
import { SETTERS, ACTIVE_SETTERS, formatCurrency, formatDate } from '../lib/constants';

export default function Setters() {
  // Default to 'all' — Kai was the original sole setter but has left; Connor
  // just joined so pinning to any single setter risked showing an empty page.
  const [filterSetter, setFilterSetter] = useState('all');
  const [viewingCall, setViewingCall] = useState(null);
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { calls: allCalls, loading, error } = useIclosedStats(dateRange);

  // Filter to selected setter
  const calls = useMemo(
    () => allCalls.filter((c) => filterSetter === 'all' ? !!c.setter_id : c.setter_id === filterSetter),
    [allCalls, filterSetter]
  );

  // Metrics
  const booked = calls.length;
  const showed = useMemo(() => calls.filter(isShowed).length, [calls]);
  const noShows = useMemo(() => calls.filter(isNoShow).length, [calls]);
  const decided = showed + noShows;
  const showRate = decided > 0 ? Math.round((showed / decided) * 100) : 0;
  const closes = useMemo(() => calls.filter(isClosedCall).length, [calls]);
  const revenue = useMemo(() => calls.filter(isClosedCall).reduce((s, c) => s + Number(c.deal_value || 0), 0), [calls]);

  // Table rows — use scheduled_at as the primary date
  const tableRows = useMemo(
    () => calls.map((c) => ({
      ...c,
      _date: c.scheduled_at,
      _closed: isClosedCall(c),
      _showed: isShowed(c),
    })),
    [calls]
  );

  const columns = [
    {
      key: '_date',
      label: 'Date',
      render: (val) => <span className="text-xs">{formatDate(val)}</span>,
    },
    {
      key: 'contact_name',
      label: 'Contact',
      render: (val, row) => (
        <div>
          <p className="font-medium">{val || row.contact_email || '—'}</p>
          {row.contact_email && val && <p className="text-[10px] text-gray-500">{row.contact_email}</p>}
        </div>
      ),
    },
    {
      key: 'closer_id',
      label: 'Closer',
      render: (val) => val ? (
        <div className="flex items-center gap-2">
          <CloserAvatar closerId={val} size="sm" />
          <span className="text-sm capitalize">{val}</span>
        </div>
      ) : <span className="text-gray-600">—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => {
        if (!val) return <span className="text-gray-600">—</span>;
        const colour = isShowed({ status: val }) ? 'text-green-400' : isNoShow({ status: val }) ? 'text-red-400' : 'text-gray-400';
        return <span className={`text-xs font-medium ${colour}`}>{val.replace(/_/g, ' ')}</span>;
      },
    },
    {
      key: '_closed',
      label: 'Closed',
      render: (val) => val ? <span className="text-brand-cyan font-semibold">✓</span> : <span className="text-gray-600">—</span>,
    },
    {
      key: 'deal_value',
      label: 'Revenue',
      render: (val) => val ? <span className="text-brand-cyan font-semibold">{formatCurrency(val)}</span> : <span className="text-gray-600">—</span>,
    },
    {
      key: 'utm_source',
      label: 'UTM Source',
      render: (val) => val || <span className="text-gray-600">—</span>,
    },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Setters</h2>
        <select
          value={filterSetter}
          onChange={(e) => setFilterSetter(e.target.value)}
          className="bg-[#1a1d20] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Setters</option>
          {ACTIVE_SETTERS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          {/* Former setters still appear for historical data lookup */}
          {SETTERS.filter((s) => !s.active).map((s) => (
            <option key={s.id} value={s.id}>{s.name} (former)</option>
          ))}
        </select>
      </div>

      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {allCalls.length === 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 text-center text-sm text-gray-500">
          No iClosed calls synced yet. Once <code className="text-brand-cyan">api/iclosed/sync</code> runs, setter stats will appear here.
        </div>
      )}
      {allCalls.length > 0 && calls.length === 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 text-center text-sm text-gray-500">
          No calls attributed to {filterSetter === 'all' ? 'any setter' : SETTERS.find((s) => s.id === filterSetter)?.name || filterSetter} in this period.
          {filterSetter !== 'all' && <span className="block mt-1 text-[10px] text-gray-600">Try "All Setters" or another date range.</span>}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard title="Calls Booked" value={booked} accent />
        <MetricCard title="Showed" value={showed} subtitle={`${showRate}% show rate`} />
        <MetricCard title="No Shows" value={noShows} danger={noShows > 0} />
        <MetricCard title="Closes Attributed" value={closes} subtitle={booked > 0 ? `${Math.round((closes / booked) * 100)}% of bookings` : ''} />
        <MetricCard title="Revenue Attributed" value={formatCurrency(revenue)} accent />
      </div>

      {/* Funnel */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Booked → Showed → Closed</h3>
        <div className="space-y-3">
          {[
            { label: 'Booked', value: booked, pct: 100, colour: 'bg-blue-500' },
            { label: 'Showed', value: showed, pct: booked > 0 ? Math.round((showed / booked) * 100) : 0, colour: 'bg-green-500' },
            { label: 'Closed', value: closes, pct: booked > 0 ? Math.round((closes / booked) * 100) : 0, colour: 'bg-brand-cyan' },
          ].map((stage) => (
            <div key={stage.label}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="text-gray-400">{stage.label}</span>
                <span className="font-medium text-white">{stage.value} <span className="text-gray-500">({stage.pct}%)</span></span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${stage.colour} transition-all`} style={{ width: `${stage.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <SortableTable
        columns={columns}
        data={tableRows}
        onRowClick={setViewingCall}
        defaultSort={{ column: '_date', ascending: false }}
      />

      <SlideOver
        open={!!viewingCall}
        onClose={() => setViewingCall(null)}
        title={viewingCall?.contact_name || viewingCall?.contact_email || 'Call'}
      >
        {viewingCall && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Scheduled" value={formatDate(viewingCall.scheduled_at)} />
              <Field label="Status" value={viewingCall.status?.replace(/_/g, ' ') || '—'} />
              <Field label="Closer" value={viewingCall.closer_id || '—'} />
              <Field label="Setter" value={viewingCall.setter_id || '—'} />
              <Field label="Outcome" value={viewingCall.outcome || '—'} />
              <Field label="Closed" value={viewingCall._closed ? 'Yes' : 'No'} accent={viewingCall._closed} />
            </div>

            {(viewingCall.utm_source || viewingCall.utm_medium || viewingCall.utm_campaign) && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">UTM</p>
                <div className="flex flex-wrap gap-2">
                  {viewingCall.utm_source && <Tag label="source" value={viewingCall.utm_source} />}
                  {viewingCall.utm_medium && <Tag label="medium" value={viewingCall.utm_medium} />}
                  {viewingCall.utm_campaign && <Tag label="campaign" value={viewingCall.utm_campaign} />}
                  {viewingCall.utm_content && <Tag label="content" value={viewingCall.utm_content} />}
                  {viewingCall.utm_term && <Tag label="term" value={viewingCall.utm_term} />}
                </div>
              </div>
            )}

            {viewingCall.deal_value > 0 && (
              <Field label="Linked Deal Revenue" value={formatCurrency(viewingCall.deal_value)} accent />
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}

function Field({ label, value, accent }) {
  return (
    <div className="bg-brand-dark rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold ${accent ? 'text-brand-cyan' : ''}`}>{value}</p>
    </div>
  );
}

function Tag({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 bg-brand-dark border border-gray-800 rounded-full px-2.5 py-1 text-[11px]">
      <span className="text-gray-500">{label}:</span>
      <span className="text-brand-cyan font-medium">{value}</span>
    </span>
  );
}
