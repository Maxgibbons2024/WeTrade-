import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import StatusBadge from '../components/StatusBadge';
import CloserAvatar from '../components/CloserAvatar';
import DateRangeFilter from '../components/DateRangeFilter';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import SlideOver from '../components/SlideOver';
import { useQuery, useRealtime, updateRow, insertRow, deleteRow } from '../hooks/useSupabase';
import { formatCurrency, formatDate, isInDateRange, addMonths, CLOSERS } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

export default function PaymentPlans() {
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const [tab, setTab] = useState('plans');

  const { data: plans, loading, error, refetch } = useQuery('payment_plans', {
    order: { column: 'next_due_date', ascending: true },
  });

  const { data: receipts, loading: receiptsLoading, refetch: refetchReceipts } = useQuery('payment_receipts', {
    order: { column: 'received_at', ascending: false },
  });

  const { data: deals } = useQuery('deals');

  const [markingPaid, setMarkingPaid] = useState(null);
  const [paymentDatePrompt, setPaymentDatePrompt] = useState(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({});
  const [savingPlan, setSavingPlan] = useState(false);

  // Receipt merge state
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [receiptForm, setReceiptForm] = useState({ client_name: '' });
  const [mergeSaving, setMergeSaving] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [newDealForm, setNewDealForm] = useState({ closer_id: '' });
  const [receiptFilter, setReceiptFilter] = useState('all'); // 'all' | 'unmatched'

  function handleEditPlan(plan) {
    const linkedDeal = deals.find((d) => d.id === plan.deal_id)
      || deals.find((d) => d.client_name && plan.client_name && d.client_name.toLowerCase() === plan.client_name.toLowerCase());
    const dealDate = linkedDeal ? linkedDeal.created_at.split('T')[0] : '';
    setEditingPlan({ ...plan, _linkedDealId: linkedDeal?.id || null });
    setPlanForm({
      client_name: plan.client_name || '',
      closer_id: plan.closer_id || '',
      monthly_amount: plan.monthly_amount ?? '',
      total_value: plan.total_value ?? '',
      total_collected: plan.total_collected ?? '',
      months_remaining: plan.months_remaining ?? '',
      next_due_date: plan.next_due_date || '',
      status: plan.status || 'active',
      notes: plan.notes || '',
      deal_date: dealDate,
    });
  }

  async function handleSavePlan(e) {
    e.preventDefault();
    setSavingPlan(true);
    try {
      await updateRow('payment_plans', editingPlan.id, {
        client_name: planForm.client_name,
        closer_id: planForm.closer_id,
        monthly_amount: Number(planForm.monthly_amount) || 0,
        total_value: Number(planForm.total_value) || 0,
        total_collected: Number(planForm.total_collected) || 0,
        months_remaining: Number(planForm.months_remaining) || 0,
        next_due_date: planForm.next_due_date,
        status: planForm.status,
        notes: planForm.notes || null,
      });
      // Update the linked deal's date if changed
      if (editingPlan._linkedDealId && planForm.deal_date) {
        await updateRow('deals', editingPlan._linkedDealId, {
          created_at: new Date(planForm.deal_date).toISOString(),
        });
      }
      toast.success(`Payment plan updated for ${planForm.client_name}`);
      setEditingPlan(null);
      refetch();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSavingPlan(false);
    }
  }

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  const handleReceiptsRealtime = useCallback(() => { refetchReceipts(); }, [refetchReceipts]);
  useRealtime('payment_plans', handleRealtime);
  useRealtime('payment_receipts', handleReceiptsRealtime);

  // ---- Receipt merge handlers ----
  function openReceiptDetail(receipt) {
    setEditingReceipt(receipt);
    setReceiptForm({ client_name: receipt.client_name || '' });
    setCreatingDeal(false);
    setNewDealForm({ closer_id: '' });
  }

  function closeReceiptDetail() {
    setEditingReceipt(null);
    setCreatingDeal(false);
    setNewDealForm({ closer_id: '' });
  }

  // Fuzzy match deals for the current receipt form client_name.
  // Mirrors the bidirectional case-insensitive includes pattern already used
  // at src/pages/Deals.jsx and earlier in this file. Returns up to 5 candidates.
  const suggestedDeals = useMemo(() => {
    if (!editingReceipt) return [];
    const query = (receiptForm.client_name || '').trim().toLowerCase();
    if (!query || query.length < 2) return [];
    // Tokens make "Matthew Stott" match "matthew" and vice-versa.
    const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
    const scored = [];
    for (const d of deals || []) {
      if (!d.client_name) continue;
      const name = d.client_name.toLowerCase();
      let score = 0;
      if (name === query) score += 100;
      if (name.includes(query) || query.includes(name)) score += 50;
      for (const t of tokens) if (name.includes(t)) score += 10;
      if (score > 0) scored.push({ deal: d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((s) => s.deal);
  }, [editingReceipt, receiptForm.client_name, deals]);

  async function handleLinkReceiptToDeal(deal) {
    if (!editingReceipt) return;
    setMergeSaving(true);
    try {
      // Find a payment_plan for this deal (by deal_id first, then by client_name)
      const plan = plans.find((p) => p.deal_id === deal.id)
        || plans.find((p) => p.client_name && deal.client_name && p.client_name.toLowerCase() === deal.client_name.toLowerCase());

      // Persist the (possibly-edited) client_name alongside the link
      const updates = {
        client_name: receiptForm.client_name.trim() || editingReceipt.client_name,
        deal_id: deal.id,
        payment_plan_id: plan?.id || null,
        matched: true,
      };
      await updateRow('payment_receipts', editingReceipt.id, updates);

      // If this is a successful payment and we found a plan, bump its totals
      // (mirrors the auto-match logic in api/slack/events.js).
      if (editingReceipt.success && plan && !editingReceipt.payment_plan_id) {
        const amount = Number(editingReceipt.amount || 0);
        const newCollected = Number(plan.total_collected) + amount;
        const newMonthsRemaining = Math.max(0, Number(plan.months_remaining) - 1);
        const nextDue = addMonths(new Date(plan.next_due_date), 1);
        const today = new Date().toISOString().split('T')[0];
        let newStatus = plan.status || 'active';
        if (newMonthsRemaining === 0 || newCollected >= Number(plan.total_value)) {
          newStatus = 'completed';
        }
        await updateRow('payment_plans', plan.id, {
          total_collected: newCollected,
          months_remaining: newMonthsRemaining,
          next_due_date: nextDue.toISOString().split('T')[0],
          last_payment_date: today,
          last_payment_confirmed: true,
          status: newStatus,
        });
      }

      toast.success(`Receipt linked to ${deal.client_name}`);
      closeReceiptDetail();
      refetchReceipts();
      refetch();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setMergeSaving(false);
    }
  }

  async function handleRenameReceiptOnly() {
    if (!editingReceipt) return;
    const newName = (receiptForm.client_name || '').trim();
    if (!newName) {
      toast.error('Client name cannot be empty');
      return;
    }
    setMergeSaving(true);
    try {
      await updateRow('payment_receipts', editingReceipt.id, { client_name: newName });
      toast.success(`Renamed to ${newName}`);
      closeReceiptDetail();
      refetchReceipts();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setMergeSaving(false);
    }
  }

  async function handleCreateDealFromReceipt() {
    if (!editingReceipt) return;
    const clientName = (receiptForm.client_name || '').trim();
    if (!clientName) {
      toast.error('Client name is required');
      return;
    }
    if (!newDealForm.closer_id) {
      toast.error('Pick a closer before creating the deal');
      return;
    }
    setMergeSaving(true);
    try {
      const closer = CLOSERS.find((c) => c.id === newDealForm.closer_id);
      const inserted = await insertRow('deals', {
        client_name: clientName,
        front_end: Number(editingReceipt.amount || 0),
        monthly_amount: 0,
        programme: 'Kickstarter',
        status: 'active',
        closer_id: newDealForm.closer_id,
        closer_name: closer?.name || newDealForm.closer_id,
        source: 'receipt_merge',
        payment_method: 'stripe',
        notes: `Created from payment receipt ${editingReceipt.id}`,
      });
      const newDeal = Array.isArray(inserted) ? inserted[0] : inserted;
      await updateRow('payment_receipts', editingReceipt.id, {
        client_name: clientName,
        deal_id: newDeal.id,
        matched: true,
      });
      toast.success(`Created deal for ${clientName}`);
      closeReceiptDetail();
      refetchReceipts();
      refetch();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setMergeSaving(false);
    }
  }

  async function handleIgnoreReceipt() {
    if (!editingReceipt) return;
    setMergeSaving(true);
    try {
      await updateRow('payment_receipts', editingReceipt.id, {
        client_name: (receiptForm.client_name || '').trim() || editingReceipt.client_name,
        matched: true,
      });
      toast.success('Receipt marked as handled');
      closeReceiptDetail();
      refetchReceipts();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setMergeSaving(false);
    }
  }

  const filteredPlans = useMemo(() => {
    const base = plans.filter((p) => p.status !== 'cancelled');
    if (!dateRange.start) return base;
    return base.filter((p) => {
      // Always show overdue plans regardless of date filter
      if (p.status === 'overdue') return true;
      return isInDateRange(p.next_due_date, dateRange.start, dateRange.end);
    });
  }, [plans, dateRange]);

  const activePlans = useMemo(() => plans.filter((p) => p.status !== 'completed' && p.status !== 'cancelled'), [plans]);
  const filteredActive = useMemo(() => filteredPlans.filter((p) => p.status !== 'completed' && p.status !== 'cancelled'), [filteredPlans]);
  const filteredOverdue = useMemo(() => filteredPlans.filter((p) => p.status === 'overdue'), [filteredPlans]);
  const filteredDueTotal = useMemo(() => filteredActive.reduce((sum, p) => sum + Number(p.monthly_amount), 0), [filteredActive]);
  const filteredOverdueTotal = useMemo(() => filteredOverdue.reduce((sum, p) => sum + Number(p.monthly_amount), 0), [filteredOverdue]);
  const pipelineValue = useMemo(() => filteredActive.reduce((sum, p) => sum + (Number(p.total_value) - Number(p.total_collected)), 0), [filteredActive]);

  // Cancelled plans — from plan status OR linked deal status
  const cancelledPlans = useMemo(() => {
    return plans.filter((p) => {
      if (p.status === 'cancelled') return true;
      // Also include plans whose linked deal is cancelled
      const linkedDeal = (deals || []).find((d) => d.id === p.deal_id || (d.client_name && p.client_name && d.client_name.toLowerCase() === p.client_name.toLowerCase()));
      if (linkedDeal && linkedDeal.status === 'cancelled') return true;
      return false;
    });
  }, [plans, deals]);

  const cancelledStats = useMemo(() => {
    let lostMonthly = 0;
    let lostRemaining = 0;
    const details = cancelledPlans.map((p) => {
      const monthly = Number(p.monthly_amount || 0);
      const remaining = Math.max(0, Number(p.total_value || 0) - Number(p.total_collected || 0));
      lostMonthly += monthly;
      lostRemaining += remaining;
      const linkedDeal = (deals || []).find((d) => d.id === p.deal_id || (d.client_name && p.client_name && d.client_name.toLowerCase() === p.client_name.toLowerCase()));
      return { plan: p, deal: linkedDeal, monthly, remaining };
    });
    return { count: cancelledPlans.length, lostMonthly, lostRemaining, details };
  }, [cancelledPlans, deals]);

  const unmatchedReceipts = useMemo(() => (receipts || []).filter((r) => !r.matched), [receipts]);

  // Receipts in the current date range
  const filteredReceipts = useMemo(() => {
    if (!dateRange.start || !receipts) return receipts || [];
    return (receipts || []).filter((r) => isInDateRange(r.received_at, dateRange.start, dateRange.end));
  }, [receipts, dateRange]);
  const collectedInRange = useMemo(() => filteredReceipts.filter((r) => r.success).reduce((sum, r) => sum + Number(r.amount), 0), [filteredReceipts]);
  const failedInRange = useMemo(() => filteredReceipts.filter((r) => !r.success).length, [filteredReceipts]);

  function promptMarkPaid(plan) {
    setPaymentDatePrompt(plan);
    setPaymentDate(new Date().toISOString().split('T')[0]);
  }

  async function handleMarkPaid(plan, dateStr) {
    setPaymentDatePrompt(null);
    setMarkingPaid(plan.id);
    try {
      const newCollected = Number(plan.total_collected) + Number(plan.monthly_amount);
      const newMonthsRemaining = Math.max(0, plan.months_remaining - 1);
      const nextDue = addMonths(new Date(plan.next_due_date), 1);
      const paidDate = dateStr || new Date().toISOString().split('T')[0];

      let newStatus = 'active';
      if (newMonthsRemaining === 0 || newCollected >= Number(plan.total_value)) {
        newStatus = 'completed';
      }

      // Record payment receipt with specified date
      await insertRow('payment_receipts', {
        client_name: plan.client_name,
        amount: Number(plan.monthly_amount),
        success: true,
        payment_plan_id: plan.id,
        deal_id: plan.deal_id || null,
        matched: true,
        received_at: new Date(paidDate).toISOString(),
      });

      await updateRow('payment_plans', plan.id, {
        total_collected: newCollected,
        months_remaining: newMonthsRemaining,
        next_due_date: nextDue.toISOString().split('T')[0],
        last_payment_date: paidDate,
        last_payment_confirmed: true,
        status: newStatus,
      });

      toast.success(`Payment recorded for ${plan.client_name} on ${paidDate}`);
      refetch();
      refetchReceipts();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setMarkingPaid(null);
    }
  }

  async function handleMarkFailed(plan) {
    setMarkingPaid(plan.id);
    try {
      // Record failed payment receipt
      await insertRow('payment_receipts', {
        client_name: plan.client_name,
        amount: Number(plan.monthly_amount),
        success: false,
        payment_plan_id: plan.id,
        deal_id: plan.deal_id || null,
        matched: true,
      });

      await updateRow('payment_plans', plan.id, {
        status: 'overdue',
        last_payment_confirmed: false,
      });

      toast.error(`Failed payment logged for ${plan.client_name}`);
      refetch();
      refetchReceipts();
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setMarkingPaid(null);
    }
  }

  function dueDateColor(dateStr, status) {
    if (status === 'overdue') return 'text-red-400';
    if (status === 'due_soon') return 'text-amber-400';
    return 'text-gray-300';
  }

  const columns = [
    { key: 'client_name', label: 'Client', render: (val) => <span className="font-medium">{val}</span> },
    {
      key: 'closer_id',
      label: 'Closer',
      render: (val) => <CloserAvatar closerId={val} size="sm" />,
    },
    { key: 'monthly_amount', label: 'Monthly', render: (val) => formatCurrency(val) },
    {
      key: 'next_due_date',
      label: 'Next Due',
      render: (val, row) => (
        <span className={`font-medium ${dueDateColor(val, row.status)}`}>
          {formatDate(val)}
        </span>
      ),
    },
    {
      key: 'total_collected',
      label: 'Collected / Total',
      render: (val, row) => (
        <span>
          {formatCurrency(val)} <span className="text-gray-500">/ {formatCurrency(row.total_value)}</span>
        </span>
      ),
    },
    { key: 'months_remaining', label: 'Months Left' },
    {
      key: 'last_payment_confirmed',
      label: 'Confirmed',
      render: (val) => (
        <span className={`text-xs font-medium ${val ? 'text-green-400' : 'text-gray-600'}`}>
          {val ? '● Yes' : '○ No'}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'id',
      label: '',
      sortable: false,
      render: (val, row) =>
        row.status !== 'completed' ? (
          <div className="flex gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                promptMarkPaid(row);
              }}
              disabled={markingPaid === val}
              className="bg-brand-cyan/10 text-brand-cyan px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-cyan/20 transition-colors disabled:opacity-50"
            >
              {markingPaid === val ? '...' : 'Paid'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMarkFailed(row);
              }}
              disabled={markingPaid === val}
              className="bg-red-500/10 text-red-400 px-3 py-1 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Failed
            </button>
          </div>
        ) : null,
    },
  ];

  const receiptColumns = [
    { key: 'received_at', label: 'Date', render: (val) => formatDate(val) },
    { key: 'client_name', label: 'Client', render: (val) => <span className="font-medium">{val}</span> },
    { key: 'amount', label: 'Amount', render: (val) => <span className="text-brand-cyan font-semibold">{formatCurrency(val)}</span> },
    {
      key: 'success',
      label: 'Status',
      render: (val) => (
        <span className={`text-xs font-medium ${val ? 'text-green-400' : 'text-red-400'}`}>
          {val ? 'Success' : 'Failed'}
        </span>
      ),
    },
    {
      key: 'matched',
      label: 'Matched',
      render: (val) => (
        <span className={`text-xs font-medium ${val ? 'text-green-400' : 'text-amber-400'}`}>
          {val ? '● Linked' : '○ Unmatched'}
        </span>
      ),
    },
  ];

  if (loading || receiptsLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Payment Plans</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <MetricCard title="To Collect" value={formatCurrency(filteredDueTotal)} accent subtitle={`${filteredActive.length} plan${filteredActive.length !== 1 ? 's' : ''} due`} />
        <MetricCard title="Collected" value={formatCurrency(collectedInRange)} subtitle={`${filteredReceipts.filter((r) => r.success).length} payment${filteredReceipts.filter((r) => r.success).length !== 1 ? 's' : ''}`} />
        <MetricCard title="Plans Due" value={filteredActive.length} />
        <MetricCard title="Overdue" value={formatCurrency(filteredOverdueTotal)} danger={filteredOverdue.length > 0} subtitle={`${filteredOverdue.length} plan${filteredOverdue.length !== 1 ? 's' : ''}`} />
        {failedInRange > 0 && <MetricCard title="Failed Payments" value={failedInRange} danger subtitle="Needs attention" />}
        <MetricCard title="Pipeline Value" value={formatCurrency(pipelineValue)} subtitle="Remaining to collect" />
        <MetricCard title="Total Active Plans" value={activePlans.length} subtitle="Across all time" />
        {cancelledStats.count > 0 && (
          <MetricCard
            title="Cancelled"
            value={cancelledStats.count}
            danger
            subtitle={`${formatCurrency(cancelledStats.lostRemaining)} lost`}
          />
        )}
      </div>

      {/* Cancellations / Lost Revenue */}
      {cancelledStats.count > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-red-500/20 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-red-400">Cancelled Plans — Lost Revenue</h3>
            <span className="text-lg font-bold text-red-400">{formatCurrency(cancelledStats.lostRemaining)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-brand-dark rounded-lg p-3">
              <p className="text-xs text-gray-500">Monthly Lost</p>
              <p className="text-sm font-semibold text-red-400">{formatCurrency(cancelledStats.lostMonthly)}/mo</p>
            </div>
            <div className="bg-brand-dark rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Remaining Lost</p>
              <p className="text-sm font-semibold text-red-400">{formatCurrency(cancelledStats.lostRemaining)}</p>
            </div>
          </div>
          <div className="space-y-2">
            {cancelledStats.details.map(({ plan, deal, monthly, remaining }) => (
              <div key={plan.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                {plan.closer_id ? <CloserAvatar closerId={plan.closer_id} size="sm" /> : <div className="w-7 h-7 rounded-full bg-gray-800" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{plan.client_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(plan.total_collected)} collected of {formatCurrency(plan.total_value)}
                    {deal ? ` · ${deal.programme || ''}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-400">{formatCurrency(remaining)}</p>
                  {monthly > 0 && <p className="text-[10px] text-gray-500">{formatCurrency(monthly)}/mo lost</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('plans')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'plans' ? 'bg-brand-cyan text-white' : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          Payment Plans
        </button>
        <button
          onClick={() => setTab('receipts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'receipts' ? 'bg-brand-cyan text-white' : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          Payment Activity
          {unmatchedReceipts.length > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unmatchedReceipts.length}</span>
          )}
        </button>
      </div>

      {tab === 'plans' && (
        <>
          <DateRangeFilter preset={preset} setPreset={setPreset} presets={presets} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} />
          <SortableTable
            columns={columns}
            data={filteredPlans}
            defaultSort={{ column: 'next_due_date', ascending: true }}
            onRowClick={(row) => handleEditPlan(row)}
          />
        </>
      )}

      {tab === 'receipts' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReceiptFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                receiptFilter === 'all' ? 'bg-brand-cyan text-white' : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              All ({(receipts || []).length})
            </button>
            <button
              onClick={() => setReceiptFilter('unmatched')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                receiptFilter === 'unmatched' ? 'bg-amber-500 text-white' : 'bg-[#1a1d20] text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              Unmatched ({unmatchedReceipts.length})
            </button>
            <span className="text-xs text-gray-500 ml-2">Click a row to rename, link to a deal, or create a new deal</span>
          </div>
          <SortableTable
            columns={receiptColumns}
            data={receiptFilter === 'unmatched' ? unmatchedReceipts : (receipts || [])}
            defaultSort={{ column: 'received_at', ascending: false }}
            onRowClick={(row) => openReceiptDetail(row)}
          />
        </div>
      )}
      <SlideOver open={!!editingPlan} onClose={() => setEditingPlan(null)} title={editingPlan ? `Edit: ${editingPlan.client_name}` : ''}>
        <form onSubmit={handleSavePlan} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deal Date</label>
            <input type="date" value={planForm.deal_date || ''} onChange={(e) => setPlanForm({ ...planForm, deal_date: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            {!editingPlan?._linkedDealId && <p className="text-xs text-amber-400 mt-1">No linked deal found — date won't be saved to a deal</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client Name</label>
            <input name="client_name" value={planForm.client_name || ''} onChange={(e) => setPlanForm({ ...planForm, client_name: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Closer</label>
            <select value={planForm.closer_id || ''} onChange={(e) => setPlanForm({ ...planForm, closer_id: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
              {CLOSERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monthly (£)</label>
              <input type="number" min="0" step="1" value={planForm.monthly_amount || ''} onChange={(e) => setPlanForm({ ...planForm, monthly_amount: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Months Left</label>
              <input type="number" min="0" step="1" value={planForm.months_remaining || ''} onChange={(e) => setPlanForm({ ...planForm, months_remaining: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Deal Size (£)</label>
              <input type="number" min="0" step="1" value={planForm.total_value || ''} onChange={(e) => setPlanForm({ ...planForm, total_value: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Collected (£)</label>
              <input type="number" min="0" step="1" value={planForm.total_collected || ''} onChange={(e) => setPlanForm({ ...planForm, total_collected: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Next Due Date</label>
            <input type="date" value={planForm.next_due_date || ''} onChange={(e) => setPlanForm({ ...planForm, next_due_date: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select value={planForm.status || 'active'} onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
              <option value="active">Active</option>
              <option value="due_soon">Due Soon</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea value={planForm.notes || ''} onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })} rows={3} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan resize-none" />
          </div>
          <button type="submit" disabled={savingPlan} className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50">
            {savingPlan ? 'Saving...' : 'Update Plan'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(`Delete payment plan for ${editingPlan.client_name}? This cannot be undone.`)) return;
              setSavingPlan(true);
              try {
                await deleteRow('payment_plans', editingPlan.id);
                toast.success('Payment plan deleted');
                setEditingPlan(null);
                refetch();
              } catch (err) {
                toast.error(`Failed: ${err.message}`);
              } finally {
                setSavingPlan(false);
              }
            }}
            disabled={savingPlan}
            className="w-full bg-red-500/10 text-red-400 py-2.5 rounded-lg font-medium text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50 border border-red-500/30"
          >
            Delete Plan
          </button>
        </form>
      </SlideOver>

      {/* Receipt merge SlideOver */}
      <SlideOver open={!!editingReceipt} onClose={closeReceiptDetail} title={editingReceipt ? `Receipt: ${formatCurrency(editingReceipt.amount)}` : ''}>
        {editingReceipt && (
          <div className="space-y-5">
            {/* Receipt summary */}
            <div className="bg-brand-dark/60 border border-gray-800 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Received</span>
                <span>{formatDate(editingReceipt.received_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="text-brand-cyan font-semibold">{formatCurrency(editingReceipt.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={editingReceipt.success ? 'text-green-400' : 'text-red-400'}>
                  {editingReceipt.success ? 'Success' : 'Failed'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Linked</span>
                <span className={editingReceipt.matched ? 'text-green-400' : 'text-amber-400'}>
                  {editingReceipt.matched ? 'Yes' : 'Unmatched'}
                </span>
              </div>
              {editingReceipt.raw_text && (
                <div className="pt-2 mt-2 border-t border-gray-800">
                  <div className="text-gray-500 text-xs mb-1">Source message</div>
                  <div className="text-xs text-gray-400 break-all">{editingReceipt.raw_text}</div>
                </div>
              )}
            </div>

            {/* Editable client name */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client name</label>
              <input
                type="text"
                value={receiptForm.client_name}
                onChange={(e) => setReceiptForm({ client_name: e.target.value })}
                placeholder="e.g. Matthew Stott"
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
              <p className="text-xs text-gray-500 mt-1">Edit to fix typos like "car" → "Matthew Stott" before linking.</p>
            </div>

            {/* Suggested deal matches */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-gray-500">Suggested deals</label>
                {suggestedDeals.length > 0 && <span className="text-xs text-gray-600">{suggestedDeals.length} match{suggestedDeals.length !== 1 ? 'es' : ''}</span>}
              </div>
              {suggestedDeals.length === 0 ? (
                <div className="text-xs text-gray-500 italic bg-brand-dark/40 border border-gray-800 rounded-lg p-3">
                  No matching deals found. Edit the client name or create a new deal below.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {suggestedDeals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleLinkReceiptToDeal(d)}
                      disabled={mergeSaving}
                      className="w-full text-left bg-brand-dark/60 hover:bg-brand-dark border border-gray-800 hover:border-brand-cyan rounded-lg p-3 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{d.client_name}</div>
                          <div className="text-xs text-gray-500">
                            {d.closer_name || d.closer_id || '—'} · {formatDate(d.created_at)}
                          </div>
                        </div>
                        <div className="text-xs text-brand-cyan">Link →</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Create new deal */}
            <div className="border-t border-gray-800 pt-5">
              {!creatingDeal ? (
                <button
                  onClick={() => setCreatingDeal(true)}
                  disabled={mergeSaving}
                  className="w-full bg-brand-dark/60 border border-dashed border-gray-700 hover:border-brand-cyan text-sm text-gray-300 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  + Create new deal from this receipt
                </button>
              ) : (
                <div className="space-y-3 bg-brand-dark/40 border border-gray-800 rounded-lg p-3">
                  <div className="text-xs font-medium text-gray-300">New deal</div>
                  <div className="text-xs text-gray-500">
                    Client: <span className="text-gray-300">{receiptForm.client_name || '(set above)'}</span>
                    {' · '}Front end: <span className="text-brand-cyan">{formatCurrency(editingReceipt.amount)}</span>
                    {' · '}Programme: Kickstarter
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Closer *</label>
                    <select
                      value={newDealForm.closer_id}
                      onChange={(e) => setNewDealForm({ closer_id: e.target.value })}
                      className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                    >
                      <option value="">Select closer…</option>
                      {CLOSERS.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateDealFromReceipt}
                      disabled={mergeSaving}
                      className="flex-1 bg-brand-cyan text-white py-2 rounded-lg text-sm font-medium hover:bg-brand-mid transition-colors disabled:opacity-50"
                    >
                      {mergeSaving ? 'Creating…' : 'Create & Link'}
                    </button>
                    <button
                      onClick={() => { setCreatingDeal(false); setNewDealForm({ closer_id: '' }); }}
                      disabled={mergeSaving}
                      className="flex-1 bg-white/5 text-gray-400 py-2 rounded-lg text-sm font-medium hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-gray-800 pt-5 grid grid-cols-2 gap-2">
              <button
                onClick={handleRenameReceiptOnly}
                disabled={mergeSaving}
                className="bg-white/5 hover:bg-white/10 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Save rename only
              </button>
              <button
                onClick={handleIgnoreReceipt}
                disabled={mergeSaving}
                className="bg-white/5 hover:bg-white/10 text-gray-400 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Mark handled
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Payment date prompt */}
      {paymentDatePrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPaymentDatePrompt(null)}>
          <div className="bg-[#1a1d20] border border-gray-700 rounded-xl p-6 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Record Payment</h3>
            <p className="text-xs text-gray-400">{paymentDatePrompt.client_name} — {formatCurrency(paymentDatePrompt.monthly_amount)}</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleMarkPaid(paymentDatePrompt, paymentDate)}
                className="flex-1 bg-brand-cyan text-white py-2 rounded-lg text-sm font-medium hover:bg-brand-mid transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setPaymentDatePrompt(null)}
                className="flex-1 bg-white/5 text-gray-400 py-2 rounded-lg text-sm font-medium hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
