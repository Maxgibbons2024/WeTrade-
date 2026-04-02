import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import SortableTable from '../components/SortableTable';
import StatusBadge from '../components/StatusBadge';
import CloserAvatar from '../components/CloserAvatar';
import SlideOver from '../components/SlideOver';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery, useRealtime, insertRow, updateRow } from '../hooks/useSupabase';
import {
  formatCurrency,
  formatDate,
  isInDateRange,
  CLOSERS,
  PROGRAMMES,
  DEAL_STATUSES,
  PAYMENT_METHODS,
  SOURCES,
} from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

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
  const [search, setSearch] = useState('');
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: deals, loading, error, refetch } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });
  const { data: paymentPlans } = useQuery('payment_plans');
  const { data: fathomCalls } = useQuery('fathom_calls');

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('deals', handleRealtime);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return deals.filter((d) => {
      if (filterCloser !== 'all' && d.closer_id !== filterCloser) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (q && !d.client_name?.toLowerCase().includes(q) && !d.closer_name?.toLowerCase().includes(q)) return false;
      if (!q && !isInDateRange(d.created_at, dateRange.start, dateRange.end)) return false;
      return true;
    });
  }, [deals, filterCloser, filterStatus, dateRange, search]);

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

  function handleEditDeal(deal) {
    setEditingDeal(deal);
    setForm({
      client_name: deal.client_name || '',
      closer_id: deal.closer_id || 'lloyd',
      closer_name: deal.closer_name || 'Lloyd',
      front_end: deal.front_end ?? '',
      monthly_amount: deal.monthly_amount ?? '',
      programme: deal.programme || 'Kickstarter',
      source: deal.source || 'manual',
      payment_method: deal.payment_method || 'stripe',
      onboarding_date: deal.onboarding_date ? deal.onboarding_date.slice(0, 16) : '',
      onboarding_assigned_to: deal.onboarding_assigned_to || '',
      notes: deal.notes || '',
      status: deal.status || 'active',
      created_at: deal.created_at ? deal.created_at.slice(0, 10) : '',
    });
    setShowForm(true);
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
      const payload = {
        client_name: form.client_name,
        closer_id: form.closer_id,
        closer_name: form.closer_name,
        front_end: Number(form.front_end),
        monthly_amount: Number(form.monthly_amount) || 0,
        programme: form.programme,
        source: form.source,
        payment_method: form.payment_method,
        onboarding_date: form.onboarding_date || null,
        onboarding_assigned_to: form.onboarding_assigned_to || null,
        notes: form.notes || null,
        status: form.status,
      };

      if (editingDeal) {
        if (form.created_at) {
          payload.created_at = new Date(form.created_at).toISOString();
        }
        await updateRow('deals', editingDeal.id, payload);

        // Update or create payment plan if monthly amount changed
        const monthly = Number(form.monthly_amount) || 0;
        const existingPlan = paymentPlans.find((p) => p.deal_id === editingDeal.id);
        if (monthly > 0) {
          const dealDate = form.created_at ? new Date(form.created_at) : new Date(editingDeal.created_at);
          const totalValue = Number(form.front_end) + (monthly * 12);
          const nextDue = new Date(dealDate);
          nextDue.setMonth(nextDue.getMonth() + 1);

          const planData = {
            deal_id: editingDeal.id,
            client_name: form.client_name,
            closer_id: form.closer_id,
            monthly_amount: monthly,
            total_value: totalValue,
            total_collected: Number(form.front_end),
            months_remaining: 12,
            next_due_date: nextDue.toISOString().split('T')[0],
            status: nextDue < new Date() ? 'overdue' : 'active',
          };

          if (existingPlan) {
            await updateRow('payment_plans', existingPlan.id, planData);
          } else {
            await insertRow('payment_plans', planData);
          }
        }

        toast.success('Deal updated successfully');
      } else {
        const result = await insertRow('deals', payload);

        // Auto-create payment plan if monthly amount > 0
        const monthly = Number(form.monthly_amount) || 0;
        if (monthly > 0 && result && result[0]) {
          const deal = result[0];
          const dealDate = new Date(deal.created_at);
          const totalValue = Number(form.front_end) + (monthly * 12);
          const nextDue = new Date(dealDate);
          nextDue.setMonth(nextDue.getMonth() + 1);

          await insertRow('payment_plans', {
            deal_id: deal.id,
            client_name: form.client_name,
            closer_id: form.closer_id,
            monthly_amount: monthly,
            total_value: totalValue,
            total_collected: Number(form.front_end),
            months_remaining: 12,
            next_due_date: nextDue.toISOString().split('T')[0],
            status: nextDue < new Date() ? 'overdue' : 'active',
          });
        }

        toast.success('Deal added successfully');
      }
      setForm(EMPTY_FORM);
      setEditingDeal(null);
      setShowForm(false);
      refetch();
    } catch (err) {
      toast.error(`Failed to ${editingDeal ? 'update' : 'add'} deal: ${err.message}`);
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
          onClick={() => { setEditingDeal(null); setForm(EMPTY_FORM); setShowForm(true); }}
          className="bg-brand-cyan text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-mid transition-colors"
        >
          + Add Deal
        </button>
      </div>

      <DateRangeFilter preset={preset} setPreset={setPreset} presets={presets} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client or closer..."
          className="bg-[#1a1d20] border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand-cyan w-56"
        />
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
      </div>

      <SortableTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => handleEditDeal(row)}
      />


      {/* Add deal slide-over form */}
      <SlideOver open={showForm} onClose={() => { setShowForm(false); setEditingDeal(null); setForm(EMPTY_FORM); }} title={editingDeal ? `Edit: ${editingDeal.client_name}` : 'Add New Deal'}>
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
          {editingDeal && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Deal Date</label>
              <input
                name="created_at"
                type="date"
                value={form.created_at || ''}
                onChange={handleFormChange}
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
          )}
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
            {submitting ? 'Saving...' : editingDeal ? 'Update Deal' : 'Save Deal'}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}
