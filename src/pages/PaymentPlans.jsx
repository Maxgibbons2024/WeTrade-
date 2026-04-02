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
import { useQuery, useRealtime, updateRow } from '../hooks/useSupabase';
import { formatCurrency, formatDate, isInDateRange, CLOSERS } from '../lib/constants';
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

  const [markingPaid, setMarkingPaid] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({});
  const [savingPlan, setSavingPlan] = useState(false);

  function handleEditPlan(plan) {
    setEditingPlan(plan);
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

  const filteredPlans = useMemo(() => {
    if (!dateRange.start) return plans;
    return plans.filter((p) => {
      // Always show overdue plans regardless of date filter
      if (p.status === 'overdue') return true;
      return isInDateRange(p.next_due_date, dateRange.start, dateRange.end);
    });
  }, [plans, dateRange]);

  const activePlans = useMemo(() => plans.filter((p) => p.status !== 'completed'), [plans]);
  const filteredActive = useMemo(() => filteredPlans.filter((p) => p.status !== 'completed'), [filteredPlans]);
  const filteredOverdue = useMemo(() => filteredPlans.filter((p) => p.status === 'overdue'), [filteredPlans]);
  const filteredDueTotal = useMemo(() => filteredActive.reduce((sum, p) => sum + Number(p.monthly_amount), 0), [filteredActive]);
  const filteredOverdueTotal = useMemo(() => filteredOverdue.reduce((sum, p) => sum + Number(p.monthly_amount), 0), [filteredOverdue]);
  const pipelineValue = useMemo(() => filteredActive.reduce((sum, p) => sum + (Number(p.total_value) - Number(p.total_collected)), 0), [filteredActive]);

  const unmatchedReceipts = useMemo(() => (receipts || []).filter((r) => !r.matched), [receipts]);

  async function handleMarkPaid(plan) {
    setMarkingPaid(plan.id);
    try {
      const newCollected = Number(plan.total_collected) + Number(plan.monthly_amount);
      const newMonthsRemaining = Math.max(0, plan.months_remaining - 1);
      const nextDue = new Date(plan.next_due_date);
      nextDue.setMonth(nextDue.getMonth() + 1);
      const today = new Date().toISOString().split('T')[0];

      let newStatus = 'active';
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

      toast.success(`Payment recorded for ${plan.client_name}`);
      refetch();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMarkPaid(row);
            }}
            disabled={markingPaid === val}
            className="bg-brand-cyan/10 text-brand-cyan px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-cyan/20 transition-colors disabled:opacity-50"
          >
            {markingPaid === val ? '...' : 'Mark Paid'}
          </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="To Collect" value={formatCurrency(filteredDueTotal)} accent subtitle={`${filteredActive.length} plan${filteredActive.length !== 1 ? 's' : ''} due`} />
        <MetricCard title="Plans Due" value={filteredActive.length} />
        <MetricCard title="Overdue" value={formatCurrency(filteredOverdueTotal)} danger={filteredOverdue.length > 0} subtitle={`${filteredOverdue.length} plan${filteredOverdue.length !== 1 ? 's' : ''}`} />
        <MetricCard title="Pipeline Value" value={formatCurrency(pipelineValue)} subtitle="Remaining to collect" />
        <MetricCard title="Total Active Plans" value={activePlans.length} subtitle="Across all time" />
      </div>

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
        <SortableTable
          columns={receiptColumns}
          data={receipts || []}
          defaultSort={{ column: 'received_at', ascending: false }}
        />
      )}
      <SlideOver open={!!editingPlan} onClose={() => setEditingPlan(null)} title={editingPlan ? `Edit: ${editingPlan.client_name}` : ''}>
        <form onSubmit={handleSavePlan} className="space-y-4">
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
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea value={planForm.notes || ''} onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })} rows={3} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan resize-none" />
          </div>
          <button type="submit" disabled={savingPlan} className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50">
            {savingPlan ? 'Saving...' : 'Update Plan'}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}
