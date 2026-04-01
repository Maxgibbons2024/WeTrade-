import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import StatusBadge from '../components/StatusBadge';
import CloserAvatar from '../components/CloserAvatar';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery, useRealtime, updateRow } from '../hooks/useSupabase';
import { formatCurrency, formatDate } from '../lib/constants';

export default function PaymentPlans() {
  const { data: plans, loading, error, refetch } = useQuery('payment_plans', {
    order: { column: 'next_due_date', ascending: true },
  });

  const [markingPaid, setMarkingPaid] = useState(null);

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('payment_plans', handleRealtime);

  const activePlans = useMemo(() => plans.filter((p) => p.status !== 'completed'), [plans]);
  const dueThisMonth = useMemo(() => {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return plans.filter((p) => {
      const due = new Date(p.next_due_date);
      return due <= monthEnd && due >= now && p.status !== 'completed';
    });
  }, [plans]);
  const overduePlans = useMemo(() => plans.filter((p) => p.status === 'overdue'), [plans]);
  const pipelineValue = useMemo(() => plans.reduce((sum, p) => sum + (Number(p.total_value) - Number(p.total_collected)), 0), [plans]);
  const overdueTotal = useMemo(() => overduePlans.reduce((sum, p) => sum + Number(p.monthly_amount), 0), [overduePlans]);

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

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Payment Plans</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Active Plans" value={activePlans.length} accent />
        <MetricCard title="Due This Month" value={dueThisMonth.length} subtitle={`${formatCurrency(dueThisMonth.reduce((s, p) => s + Number(p.monthly_amount), 0))} total`} />
        <MetricCard title="Overdue Total" value={formatCurrency(overdueTotal)} danger={overduePlans.length > 0} subtitle={`${overduePlans.length} plan${overduePlans.length !== 1 ? 's' : ''}`} />
        <MetricCard title="Pipeline Value" value={formatCurrency(pipelineValue)} subtitle="Remaining to collect" />
      </div>

      <SortableTable
        columns={columns}
        data={plans}
        defaultSort={{ column: 'next_due_date', ascending: true }}
      />
    </div>
  );
}
