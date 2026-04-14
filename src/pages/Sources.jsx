import { useState, useMemo } from 'react';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import SlideOver from '../components/SlideOver';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import useDateRange from '../hooks/useDateRange';
import useIclosedStats, { isShowed, isClosedCall } from '../hooks/useIclosedStats';
import { formatCurrency, formatDate } from '../lib/constants';

const MEDIUM_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'paid', label: 'Paid' },
  { id: 'organic', label: 'Organic' },
  { id: 'referral', label: 'Referral' },
  { id: 'direct', label: 'Direct' },
];

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r) || '(none)';
    let entry = map.get(k);
    if (!entry) {
      entry = { key: k, bookings: 0, shows: 0, closes: 0, revenue: 0 };
      map.set(k, entry);
    }
    entry.bookings += 1;
    if (isShowed(r)) entry.shows += 1;
    if (isClosedCall(r)) {
      entry.closes += 1;
      entry.revenue += Number(r.deal_value || 0);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.closes - a.closes);
}

export default function Sources() {
  const [filterMedium, setFilterMedium] = useState('all');
  const [viewingCall, setViewingCall] = useState(null);
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { calls: allCalls, loading, error } = useIclosedStats(dateRange);

  const calls = useMemo(() => {
    if (filterMedium === 'all') return allCalls;
    return allCalls.filter((c) => (c.utm_medium || '').toLowerCase() === filterMedium);
  }, [allCalls, filterMedium]);

  // Top-line metrics
  const bookings = calls.length;
  const shows = useMemo(() => calls.filter(isShowed).length, [calls]);
  const showRate = bookings > 0 ? Math.round((shows / bookings) * 100) : 0;
  const closes = useMemo(() => calls.filter(isClosedCall).length, [calls]);
  const revenue = useMemo(() => calls.filter(isClosedCall).reduce((s, c) => s + Number(c.deal_value || 0), 0), [calls]);

  // Leaderboards
  const bySource = useMemo(() => groupBy(calls, (c) => c.utm_source), [calls]);
  const byCampaign = useMemo(() => groupBy(calls, (c) => c.utm_campaign), [calls]);
  const emailCalls = useMemo(() => allCalls.filter((c) => (c.utm_medium || '').toLowerCase() === 'email'), [allCalls]);
  const emailFunnel = useMemo(() => {
    const total = emailCalls.length;
    const showedN = emailCalls.filter(isShowed).length;
    const closedN = emailCalls.filter(isClosedCall).length;
    const rev = emailCalls.filter(isClosedCall).reduce((s, c) => s + Number(c.deal_value || 0), 0);
    return { total, showedN, closedN, rev };
  }, [emailCalls]);

  const tableRows = useMemo(
    () => calls.map((c) => ({ ...c, _date: c.scheduled_at, _closed: isClosedCall(c) })),
    [calls]
  );

  const columns = [
    { key: '_date', label: 'Date', render: (val) => <span className="text-xs">{formatDate(val)}</span> },
    {
      key: 'contact_name',
      label: 'Contact',
      render: (val, row) => <span className="font-medium">{val || row.contact_email || '—'}</span>,
    },
    { key: 'utm_source',   label: 'Source',   render: (v) => v || <span className="text-gray-600">—</span> },
    { key: 'utm_medium',   label: 'Medium',   render: (v) => v || <span className="text-gray-600">—</span> },
    { key: 'utm_campaign', label: 'Campaign', render: (v) => v || <span className="text-gray-600">—</span> },
    { key: 'closer_id',    label: 'Closer',   render: (v) => v || <span className="text-gray-600">—</span> },
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
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Sources</h2>

      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {/* Medium filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {MEDIUM_FILTERS.map((m) => (
          <button
            key={m.id}
            onClick={() => setFilterMedium(m.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterMedium === m.id
                ? 'bg-brand-cyan text-white'
                : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-auto">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
      </div>

      {allCalls.length === 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 text-center text-sm text-gray-500">
          No iClosed calls synced yet. Once <code className="text-brand-cyan">api/iclosed/sync</code> runs, UTM stats will appear here.
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard title="Bookings" value={bookings} accent />
        <MetricCard title="Shows" value={shows} subtitle={`${showRate}% show rate`} />
        <MetricCard title="Show Rate" value={`${showRate}%`} />
        <MetricCard title="Closes" value={closes} subtitle={bookings > 0 ? `${Math.round((closes / bookings) * 100)}% of bookings` : ''} />
        <MetricCard title="Revenue" value={formatCurrency(revenue)} accent />
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Leaderboard title="Top Sources" rows={bySource} />
        <Leaderboard title="Top Campaigns" rows={byCampaign} />

        {/* Email funnel */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Email Funnel</h3>
          {emailFunnel.total === 0 ? (
            <p className="text-xs text-gray-600">No email-sourced calls in this period</p>
          ) : (
            <div className="space-y-3">
              <FunnelRow label="Booked" value={emailFunnel.total} pct={100} colour="bg-blue-500" />
              <FunnelRow label="Showed" value={emailFunnel.showedN} pct={Math.round((emailFunnel.showedN / emailFunnel.total) * 100)} colour="bg-green-500" />
              <FunnelRow label="Closed" value={emailFunnel.closedN} pct={Math.round((emailFunnel.closedN / emailFunnel.total) * 100)} colour="bg-brand-cyan" />
              <div className="pt-2 border-t border-gray-800 mt-2">
                <p className="text-xs text-gray-500">Revenue from email</p>
                <p className="text-lg font-bold text-brand-cyan">{formatCurrency(emailFunnel.rev)}</p>
              </div>
            </div>
          )}
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
          <div className="space-y-3">
            <Field label="Scheduled" value={formatDate(viewingCall.scheduled_at)} />
            <Field label="Closer" value={viewingCall.closer_id || '—'} />
            <Field label="Setter" value={viewingCall.setter_id || '—'} />
            <Field label="Status" value={viewingCall.status || '—'} />
            <Field label="UTM Source" value={viewingCall.utm_source || '—'} />
            <Field label="UTM Medium" value={viewingCall.utm_medium || '—'} />
            <Field label="UTM Campaign" value={viewingCall.utm_campaign || '—'} />
            <Field label="UTM Content" value={viewingCall.utm_content || '—'} />
            <Field label="Referrer" value={viewingCall.referrer || '—'} />
            {viewingCall.deal_value > 0 && (
              <Field label="Linked Deal Revenue" value={formatCurrency(viewingCall.deal_value)} accent />
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}

function Leaderboard({ title, rows }) {
  return (
    <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-600">No data in this period</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {rows.slice(0, 8).map((r, i) => (
            <div key={r.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]">
              <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-gray-600'}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.key}</p>
                <p className="text-[10px] text-gray-500">{r.bookings} booked · {r.shows} shows · {r.closes} closes</p>
              </div>
              <p className="text-sm font-bold text-brand-cyan">{formatCurrency(r.revenue)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelRow({ label, value, pct, colour }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-medium text-white">{value} <span className="text-gray-500">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
      </div>
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
