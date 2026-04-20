import { useState, useMemo } from 'react';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import SlideOver from '../components/SlideOver';
import DateRangeFilter from '../components/DateRangeFilter';
import CloserAvatar from '../components/CloserAvatar';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import useDateRange from '../hooks/useDateRange';
import useIclosedStats, { isShowed, isClosedCall } from '../hooks/useIclosedStats';
import { formatCurrency, formatDate } from '../lib/constants';

// Simplified email-monitoring page — shows only calls booked via email,
// the funnel (booked → showed → closed), and a breakdown by campaign so
// we can see which email campaigns are actually producing deals.

function groupByCampaign(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.utm_campaign || '(no campaign)';
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
  return Array.from(map.values()).sort(
    (a, b) => b.revenue - a.revenue || b.closes - a.closes || b.bookings - a.bookings
  );
}

export default function Sources() {
  const [viewingCall, setViewingCall] = useState(null);
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');

  const { calls: allCalls, loading, error } = useIclosedStats(dateRange);

  // Only email-sourced calls.
  // iClosed stores the channel in utm_source (e.g. "email", "fk" for Klaviyo
  // followups, etc.), not utm_medium (which holds the specific sequence).
  // Accept either utm_source === 'email' OR utm_medium === 'email' so we
  // don't miss any email-tagged bookings.
  const emailCalls = useMemo(
    () => allCalls.filter((c) => {
      const src = (c.utm_source || '').toLowerCase();
      const med = (c.utm_medium || '').toLowerCase();
      return src === 'email' || med === 'email';
    }),
    [allCalls]
  );

  // Top-line metrics
  const bookings = emailCalls.length;
  const shows = useMemo(() => emailCalls.filter(isShowed).length, [emailCalls]);
  const showRate = bookings > 0 ? Math.round((shows / bookings) * 100) : 0;
  const closes = useMemo(() => emailCalls.filter(isClosedCall).length, [emailCalls]);
  const closeRate = bookings > 0 ? Math.round((closes / bookings) * 100) : 0;
  const revenue = useMemo(
    () => emailCalls.filter(isClosedCall).reduce((s, c) => s + Number(c.deal_value || 0), 0),
    [emailCalls]
  );

  // Campaign breakdown
  const byCampaign = useMemo(() => groupByCampaign(emailCalls), [emailCalls]);

  const tableRows = useMemo(
    () => emailCalls.map((c) => ({ ...c, _date: c.scheduled_at, _closed: isClosedCall(c), _showed: isShowed(c) })),
    [emailCalls]
  );

  const columns = [
    { key: '_date', label: 'Date', render: (val) => <span className="text-xs">{formatDate(val)}</span> },
    {
      key: 'contact_name',
      label: 'Contact',
      render: (val, row) => (
        <div>
          <p className="text-sm font-medium">{val || row.contact_email || '—'}</p>
          {val && row.contact_email && <p className="text-[10px] text-gray-500">{row.contact_email}</p>}
        </div>
      ),
    },
    {
      key: 'utm_campaign',
      label: 'Campaign',
      render: (v) => v ? <span className="text-xs text-gray-300">{v}</span> : <span className="text-gray-600">—</span>,
    },
    {
      key: 'closer_id',
      label: 'Closer',
      render: (v) => v ? <CloserAvatar closerId={v} size="sm" /> : <span className="text-gray-600">—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => {
        if (row._closed) return <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/30">Closed</span>;
        if (row._showed) return <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">Showed</span>;
        if (val === 'NO_SHOW') return <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30">No Show</span>;
        return <span className="text-[10px] text-gray-500">{val || 'Booked'}</span>;
      },
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
      <div>
        <h2 className="text-xl font-bold">Email Calls</h2>
        <p className="text-xs text-gray-500 mt-1">Calls booked via email — tracking bookings, shows, and conversions to deals.</p>
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
        <div className="bg-brand-darker rounded-xl border border-gray-800 p-6 text-center text-sm text-gray-500">
          No iClosed calls synced yet.
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Emails Booked" value={bookings} accent />
        <MetricCard title="Showed" value={shows} />
        <MetricCard title="Show Rate" value={`${showRate}%`} />
        <MetricCard title="Closed" value={closes} />
        <MetricCard title="Close Rate" value={`${closeRate}%`} subtitle="of bookings" />
        <MetricCard title="Revenue" value={formatCurrency(revenue)} accent />
      </div>

      {/* Funnel */}
      {bookings > 0 && (
        <div className="bg-brand-darker rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Email Funnel</h3>
          <div className="space-y-3">
            <FunnelRow label="Booked" value={bookings} pct={100} colour="bg-blue-500" />
            <FunnelRow
              label="Showed"
              value={shows}
              pct={bookings > 0 ? Math.round((shows / bookings) * 100) : 0}
              colour="bg-green-500"
            />
            <FunnelRow
              label="Closed"
              value={closes}
              pct={bookings > 0 ? Math.round((closes / bookings) * 100) : 0}
              colour="bg-brand-cyan"
            />
          </div>
        </div>
      )}

      {/* Campaign breakdown */}
      {byCampaign.length > 0 && (
        <div className="bg-brand-darker rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">By Email Campaign</h3>
            <span className="text-[10px] text-gray-500">Ranked by revenue</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {byCampaign.map((r, i) => (
              <div key={r.key} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-gray-600'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={r.key}>{r.key}</p>
                  <p className="text-[10px] text-gray-500">
                    {r.bookings} booked · {r.shows} showed · {r.closes} closed
                  </p>
                </div>
                <p className="text-sm font-bold text-brand-cyan">{formatCurrency(r.revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call table */}
      {tableRows.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">All Email Calls ({tableRows.length})</h3>
          <SortableTable
            columns={columns}
            data={tableRows}
            onRowClick={setViewingCall}
            defaultSort={{ column: '_date', ascending: false }}
          />
        </div>
      )}

      {/* Call detail SlideOver */}
      <SlideOver
        open={!!viewingCall}
        onClose={() => setViewingCall(null)}
        title={viewingCall?.contact_name || viewingCall?.contact_email || 'Call'}
      >
        {viewingCall && (
          <div className="space-y-3">
            <Field label="Scheduled" value={formatDate(viewingCall.scheduled_at)} />
            <Field label="Contact" value={viewingCall.contact_name || '—'} />
            <Field label="Email" value={viewingCall.contact_email || '—'} />
            <Field label="Closer" value={viewingCall.closer_id || '—'} />
            <Field label="Status" value={viewingCall.status || '—'} />
            <Field label="Campaign" value={viewingCall.utm_campaign || '—'} />
            <Field label="UTM Source" value={viewingCall.utm_source || '—'} />
            <Field label="UTM Content" value={viewingCall.utm_content || '—'} />
            {viewingCall.deal_value > 0 && (
              <Field label="Deal Revenue" value={formatCurrency(viewingCall.deal_value)} accent />
            )}
          </div>
        )}
      </SlideOver>
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
