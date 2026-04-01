import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import SortableTable from '../components/SortableTable';
import StatusBadge from '../components/StatusBadge';
import CloserAvatar from '../components/CloserAvatar';
import SlideOver from '../components/SlideOver';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery, useRealtime, insertRow } from '../hooks/useSupabase';
import {
  formatCurrency,
  formatDate,
  CLOSERS,
  PROGRAMMES,
  DEAL_STATUSES,
  PAYMENT_METHODS,
  SOURCES,
} from '../lib/constants';

const EMPTY_FORM = {
  client_name: '',
  closer_id: 'lloyd',
  closer_name: 'Lloyd',
  front_end: '',
  monthly_amount: '',
  programme: 'Kickstarter',
  source: 'manual',
  payment_method: 'stripe',
  onboarding_date: '',
  onboarding_assigned_to: '',
  notes: '',
  status: 'active',
};

export default function Deals() {
  const [filterCloser, setFilterCloser] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: deals, loading, error, refetch } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });
  const { data: paymentPlans } = useQuery('payment_plans');
  const { data: fathomCalls } = useQuery('fathom_calls');

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('deals', handleRealtime);

  // Available months for filter
  const months = useMemo(() => {
    const set = new Set();
    deals.forEach((d) => {
      const dt = new Date(d.created_at);
      set.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [deals]);

  // Apply filters
  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (filterCloser !== 'all' && d.closer_id !== filterCloser) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (filterMonth !== 'all') {
        const dt = new Date(d.created_at);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        if (key !== filterMonth) return false;
      }
      return true;
    });
  }, [deals, filterCloser, filterStatus, filterMonth]);

  const columns = [
    {
      key: 'client_name',
      label: 'Client',
      render: (val) => <span className="font-medium">{val}</span>,
    },
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
    { key: 'front_end', label: 'FE', render: (val) => <span className="text-brand-cyan font-semibold">{formatCurrency(val)}</span> },
    { key: 'monthly_amount', label: 'Monthly', render: (val) => Number(val) > 0 ? `${formatCurrency(val)}/mo` : '—' },
    { key: 'programme', label: 'Programme' },
    { key: 'source', label: 'Source', render: (val) => <span className="capitalize text-xs">{val}</span> },
    { key: 'payment_method', label: 'Payment', render: (val) => <span className="capitalize text-xs">{val?.replace('_', ' ')}</span> },
    { key: 'onboarding_date', label: 'Onboarding', render: (val) => formatDate(val) },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  ];

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'closer_id') {
        const c = CLOSERS.find((cl) => cl.id === value);
        next.closer_name = c ? c.name : value;
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_name.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (!form.front_end || Number(form.front_end) < 0) {
      toast.error('Front end amount is required');
      return;
    }
    setSubmitting(true);
    try {
      await insertRow('deals', {
        ...form,
        front_end: Number(form.front_end),
        monthly_amount: Number(form.monthly_amount) || 0,
        onboarding_date: form.onboarding_date || null,
        onboarding_assigned_to: form.onboarding_assigned_to || null,
        notes: form.notes || null,
      });
      toast.success('Deal added successfully');
      setForm(EMPTY_FORM);
      setShowForm(false);
      refetch();
    } catch (err) {
      toast.error(`Failed to add deal: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Expanded deal details
  const dealPlan = expandedDeal ? paymentPlans.find((p) => p.deal_id === expandedDeal.id) : null;
  const dealFathom = expandedDeal
    ? fathomCalls.filter((f) => f.closer_id === expandedDeal.closer_id && f.call_date === new Date(expandedDeal.created_at).toISOString().split('T')[0])
    : [];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Deals</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-brand-cyan text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-mid transition-colors"
        >
          + Add Deal
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterCloser}
          onChange={(e) => setFilterCloser(e.target.value)}
          className="bg-[#1a1d20] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Closers</option>
          {CLOSERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#1a1d20] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Statuses</option>
          {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="bg-[#1a1d20] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Months</option>
          {months.map((m) => {
            const [y, mo] = m.split('-');
            const label = new Date(y, Number(mo) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
      </div>

      <SortableTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => setExpandedDeal(expandedDeal?.id === row.id ? null : row)}
      />

      {/* Expanded deal detail */}
      {expandedDeal && (
        <div className="bg-[#1a1d20] rounded-xl border border-brand-cyan/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-brand-cyan">{expandedDeal.client_name} — Details</h3>
            <button onClick={() => setExpandedDeal(null)} className="text-gray-500 hover:text-white text-sm">Close</button>
          </div>
          {expandedDeal.notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-300">{expandedDeal.notes}</p>
            </div>
          )}
          {dealPlan && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Payment Plan</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Monthly: {formatCurrency(dealPlan.monthly_amount)}</span>
                <span>Collected: {formatCurrency(dealPlan.total_collected)} / {formatCurrency(dealPlan.total_value)}</span>
                <span>Remaining: {dealPlan.months_remaining} months</span>
                <StatusBadge status={dealPlan.status} />
              </div>
            </div>
          )}
          {dealFathom.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Fathom Calls</p>
              {dealFathom.map((f) => (
                <div key={f.id} className="text-sm text-gray-300">
                  Duration: {Math.round(f.duration_seconds / 60)}m · Talk: {Math.round(f.talk_time_seconds / 60)}m
                  {f.outcome && ` · ${f.outcome}`}
                  {f.transcript_url && (
                    <a href={f.transcript_url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan ml-2 hover:underline">
                      View transcript
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add deal slide-over form */}
      <SlideOver open={showForm} onClose={() => setShowForm(false)} title="Add New Deal">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client Name *</label>
            <input
              name="client_name"
              value={form.client_name}
              onChange={handleFormChange}
              required
              className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Closer *</label>
              <select name="closer_id" value={form.closer_id} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                {CLOSERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Programme *</label>
              <select name="programme" value={form.programme} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Front End (£) *</label>
              <input name="front_end" type="number" min="0" step="1" value={form.front_end} onChange={handleFormChange} required className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monthly (£)</label>
              <input name="monthly_amount" type="number" min="0" step="1" value={form.monthly_amount} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Source</label>
              <select name="source" value={form.source} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
              <select name="payment_method" value={form.payment_method} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select name="status" value={form.status} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
              {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Onboarding Date</label>
            <input name="onboarding_date" type="datetime-local" value={form.onboarding_date} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Onboarding Assigned To</label>
            <input name="onboarding_assigned_to" value={form.onboarding_assigned_to} onChange={handleFormChange} placeholder="e.g. Sam Ducker" className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleFormChange} rows={3} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan resize-none" />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Deal'}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}
