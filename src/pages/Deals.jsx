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
  total_paid: '',
  total_deal_size: '',
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
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('all');
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [viewingDeal, setViewingDeal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: deals, loading, error, refetch } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });
  const { data: paymentPlans } = useQuery('payment_plans');
  const { data: fathomCalls } = useQuery('fathom_calls');
  const { data: receipts } = useQuery('payment_receipts', {
    order: { column: 'received_at', ascending: false },
  });

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('deals', handleRealtime);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return deals.filter((d) => {
      if (filterCloser !== 'all' && d.closer_id !== filterCloser) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (q && !d.client_name?.toLowerCase().includes(q) && !d.closer_name?.toLowerCase().includes(q)) return false;
      if (!q && dateRange.start) {
        // Show deal if it was created in range OR had a payment in range
        const createdInRange = isInDateRange(d.created_at, dateRange.start, dateRange.end);
        if (!createdInRange) {
          // Check for payment activity in range - match plan by deal_id or client name
          const dealName = (d.client_name || '').toLowerCase();
          const plan = paymentPlans.find((p) =>
            p.deal_id === d.id ||
            (p.client_name && dealName && p.client_name.toLowerCase() === dealName) ||
            (p.client_name && dealName && (p.client_name.toLowerCase().includes(dealName) || dealName.includes(p.client_name.toLowerCase())))
          );
          // Check receipts linked to plan OR matching client name directly
          const hasPaymentInRange = (receipts || []).some((r) =>
            r.success &&
            isInDateRange(r.received_at, dateRange.start, dateRange.end) &&
            (
              (plan && r.payment_plan_id === plan.id) ||
              (r.client_name && dealName && r.client_name.toLowerCase() === dealName)
            )
          );
          if (!hasPaymentInRange) return false;
        }
      }
      return true;
    });
  }, [deals, filterCloser, filterStatus, dateRange, search, paymentPlans, receipts]);

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
    { key: 'payment_type', label: 'Type', render: (_, row) => Number(row.monthly_amount) > 0 ? <span className="text-xs font-medium text-amber-400">PP</span> : <span className="text-xs font-medium text-green-400">PIF</span> },
    { key: 'front_end', label: 'FE', render: (val) => <span className="text-brand-cyan font-semibold">{formatCurrency(val)}</span> },
    { key: 'monthly_amount', label: 'Monthly', render: (val) => Number(val) > 0 ? `${formatCurrency(val)}/mo` : '—' },
    {
      key: 'pp_status',
      label: 'PP Status',
      render: (_, row) => {
        if (!Number(row.monthly_amount)) return <span className="text-xs text-gray-600">—</span>;
        const plan = paymentPlans.find((p) => p.deal_id === row.id || (p.client_name && row.client_name && p.client_name.toLowerCase() === row.client_name.toLowerCase()));
        if (!plan) return <span className="text-xs text-gray-600">No plan</span>;
        return (
          <div>
            <StatusBadge status={plan.status} />
            <p className="text-[10px] text-gray-500 mt-0.5">{formatCurrency(plan.total_collected)} / {formatCurrency(plan.total_value)}</p>
          </div>
        );
      },
    },
    {
      key: 'last_payment',
      label: 'Last Payment',
      render: (_, row) => {
        const plan = paymentPlans.find((p) => p.deal_id === row.id || (p.client_name && row.client_name && p.client_name.toLowerCase() === row.client_name.toLowerCase()));
        if (!plan) return <span className="text-xs text-gray-600">—</span>;
        const lastReceipt = (receipts || []).find((r) => r.payment_plan_id === plan.id && r.success);
        if (lastReceipt) return <span className="text-xs text-green-400">{formatDate(lastReceipt.received_at)}</span>;
        if (plan.last_payment_date) return <span className="text-xs text-gray-400">{formatDate(plan.last_payment_date)}</span>;
        return <span className="text-xs text-gray-600">None</span>;
      },
    },
    { key: 'programme', label: 'Programme' },
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
    const plan = paymentPlans.find((p) => p.deal_id === deal.id);
    setForm({
      client_name: deal.client_name || '',
      closer_id: deal.closer_id || 'lloyd',
      closer_name: deal.closer_name || 'Lloyd',
      front_end: deal.front_end ?? '',
      monthly_amount: deal.monthly_amount ?? '',
      total_paid: plan ? plan.total_collected : '',
      total_deal_size: plan ? plan.total_value : '',
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

      if (form.created_at) {
        payload.created_at = new Date(form.created_at).toISOString();
      }

      if (editingDeal) {
        await updateRow('deals', editingDeal.id, payload);

        // Update or create payment plan if monthly amount changed
        const monthly = Number(form.monthly_amount) || 0;
        const existingPlan = paymentPlans.find((p) => p.deal_id === editingDeal.id);
        if (monthly > 0) {
          const dealDate = form.created_at ? new Date(form.created_at) : new Date(editingDeal.created_at);
          const totalValue = Number(form.total_deal_size) || (Number(form.front_end) + (monthly * 12));
          const totalCollected = Number(form.total_paid) || Number(form.front_end);
          const totalLeft = Math.max(0, totalValue - totalCollected);
          const monthsRemaining = monthly > 0 ? Math.ceil(totalLeft / monthly) : 0;

          // Calculate next due date based on deal date + number of payments made
          const paymentsMade = monthly > 0 ? Math.round((totalCollected - Number(form.front_end)) / monthly) : 0;
          const nextDue = new Date(dealDate);
          nextDue.setMonth(nextDue.getMonth() + paymentsMade + 1);

          const planData = {
            deal_id: editingDeal.id,
            client_name: form.client_name,
            closer_id: form.closer_id,
            monthly_amount: monthly,
            total_value: totalValue,
            total_collected: totalCollected,
            months_remaining: monthsRemaining,
            next_due_date: nextDue.toISOString().split('T')[0],
            status: totalLeft === 0 ? 'completed' : nextDue < new Date() ? 'overdue' : 'active',
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
          const totalValue = Number(form.total_deal_size) || (Number(form.front_end) + (monthly * 12));
          const totalCollected = Number(form.total_paid) || Number(form.front_end);
          const totalLeft = Math.max(0, totalValue - totalCollected);
          const monthsRemaining = monthly > 0 ? Math.ceil(totalLeft / monthly) : 0;

          // Calculate next due date based on deal date + number of payments made
          const paymentsMade = monthly > 0 ? Math.round((totalCollected - Number(form.front_end)) / monthly) : 0;
          const nextDue = new Date(dealDate);
          nextDue.setMonth(nextDue.getMonth() + paymentsMade + 1);

          await insertRow('payment_plans', {
            deal_id: deal.id,
            client_name: form.client_name,
            closer_id: form.closer_id,
            monthly_amount: monthly,
            total_value: totalValue,
            total_collected: totalCollected,
            months_remaining: monthsRemaining,
            next_due_date: nextDue.toISOString().split('T')[0],
            status: totalLeft === 0 ? 'completed' : nextDue < new Date() ? 'overdue' : 'active',
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
        onRowClick={(row) => setViewingDeal(row)}
      />


      {/* Client detail slide-over */}
      <SlideOver open={!!viewingDeal} onClose={() => setViewingDeal(null)} title={viewingDeal ? viewingDeal.client_name : ''}>
        {viewingDeal && (() => {
          const deal = viewingDeal;
          const plan = paymentPlans.find((p) => p.deal_id === deal.id || (p.client_name && deal.client_name && p.client_name.toLowerCase() === deal.client_name.toLowerCase()));
          const dealReceipts = (receipts || []).filter((r) => {
            if (plan && r.payment_plan_id === plan.id) return true;
            if (r.client_name && deal.client_name && r.client_name.toLowerCase() === deal.client_name.toLowerCase()) return true;
            return false;
          }).sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
          const successfulPayments = dealReceipts.filter((r) => r.success);
          const failedPayments = dealReceipts.filter((r) => !r.success);
          const isPP = Number(deal.monthly_amount) > 0;

          return (
            <div className="space-y-5">
              {/* Header info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CloserAvatar closerId={deal.closer_id} size="lg" />
                  <div>
                    <p className="text-sm text-gray-400">{deal.closer_name}</p>
                    <p className="text-xs text-gray-600">{deal.programme}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setViewingDeal(null); handleEditDeal(deal); }}
                  className="bg-white/5 text-gray-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:text-white transition-colors border border-gray-800"
                >
                  Edit Deal
                </button>
              </div>

              {/* Deal summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Deal Date</p>
                  <p className="text-sm font-semibold">{formatDate(deal.created_at)}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-sm font-semibold">{isPP ? <span className="text-amber-400">Payment Plan</span> : <span className="text-green-400">Paid in Full</span>}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Front End</p>
                  <p className="text-sm font-semibold text-brand-cyan">{formatCurrency(deal.front_end)}</p>
                </div>
                {isPP && (
                  <div className="bg-brand-dark rounded-lg p-3">
                    <p className="text-xs text-gray-500">Monthly</p>
                    <p className="text-sm font-semibold">{formatCurrency(deal.monthly_amount)}/mo</p>
                  </div>
                )}
              </div>

              {/* Payment plan details */}
              {plan && (
                <div className="bg-brand-dark rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs text-gray-500 font-medium">Payment Plan</h4>
                    <StatusBadge status={plan.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Collected</p>
                      <p className="text-sm font-semibold text-green-400">{formatCurrency(plan.total_collected)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Value</p>
                      <p className="text-sm font-semibold">{formatCurrency(plan.total_value)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Remaining</p>
                      <p className="text-sm font-semibold text-amber-400">{formatCurrency(Number(plan.total_value) - Number(plan.total_collected))}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${Math.min(100, (Number(plan.total_collected) / Number(plan.total_value)) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">{Math.round((Number(plan.total_collected) / Number(plan.total_value)) * 100)}% collected</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Next Due</p>
                      <p className="text-sm font-medium">{formatDate(plan.next_due_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Months Left</p>
                      <p className="text-sm font-medium">{plan.months_remaining}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment history */}
              <div>
                <h4 className="text-xs text-gray-500 font-medium mb-2">Payment History ({successfulPayments.length} payment{successfulPayments.length !== 1 ? 's' : ''})</h4>
                {dealReceipts.length === 0 ? (
                  <p className="text-xs text-gray-600 py-2">No payments recorded</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {dealReceipts.map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-brand-dark rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-400">{formatDate(r.received_at)}</span>
                        <span className={`text-sm font-semibold ${r.success ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(r.amount)}</span>
                        <span className={`text-xs font-medium ${r.success ? 'text-green-400' : 'text-red-400'}`}>{r.success ? 'Paid' : 'Failed'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {failedPayments.length > 0 && (
                  <p className="text-xs text-red-400 mt-2">{failedPayments.length} failed payment{failedPayments.length !== 1 ? 's' : ''}</p>
                )}
              </div>

              {/* Additional info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Source</p>
                  <p className="text-sm font-medium capitalize">{deal.source}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Payment Method</p>
                  <p className="text-sm font-medium capitalize">{deal.payment_method?.replace('_', ' ')}</p>
                </div>
              </div>
              {deal.onboarding_date && (
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Onboarding</p>
                  <p className="text-sm font-medium">{formatDate(deal.onboarding_date)}{deal.onboarding_assigned_to ? ` — ${deal.onboarding_assigned_to}` : ''}</p>
                </div>
              )}
              {deal.notes && (
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Notes</p>
                  <p className="text-sm text-gray-300">{deal.notes}</p>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>

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
          {Number(form.monthly_amount) > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Total Deal Size (£)</label>
                <input name="total_deal_size" type="number" min="0" step="1" value={form.total_deal_size} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Total Paid (£)</label>
                <input name="total_paid" type="number" min="0" step="1" value={form.total_paid} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
              </div>
            </div>
          )}
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
