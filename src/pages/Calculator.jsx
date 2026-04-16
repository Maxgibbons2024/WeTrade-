import { useState, useMemo } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { formatCurrency, isInDateRange, isCommunityOnly, ACTIVE_CLOSERS, CLOSERS } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';
import useIclosedStats from '../hooks/useIclosedStats';

export default function Calculator() {
  const { dateRange } = useDateRange('this_month');
  const { byCloser: iclosedByCloser } = useIclosedStats(dateRange);

  const { data: deals, loading: dealsLoading, error: dealsError } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });
  const { data: paymentPlans, loading: plansLoading } = useQuery('payment_plans');
  const { data: receipts, loading: receiptsLoading } = useQuery('payment_receipts');
  const { data: manualPayments, loading: manualLoading } = useQuery('manual_payments');

  const loading = dealsLoading || plansLoading || receiptsLoading || manualLoading;
  const error = dealsError;

  // Current month actuals for defaults
  const actuals = useMemo(() => {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const totalDays = monthEnd.getDate();
    const daysPassed = now.getDate();

    const salesDeals = (deals || []).filter((d) => !isCommunityOnly(d));
    const rangeDeals = salesDeals.filter((d) => isInDateRange(d.created_at, dateRange.start, dateRange.end));
    const frontEnd = rangeDeals.reduce((sum, d) => sum + Number(d.front_end || 0), 0);
    const rangeReceipts = (receipts || []).filter((r) => r.success && isInDateRange(r.received_at, dateRange.start, dateRange.end));
    const rangeManual = (manualPayments || []).filter((p) => isInDateRange(p.payment_date, dateRange.start, dateRange.end));
    const ppCollected = rangeReceipts.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      + rangeManual.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalCash = frontEnd + ppCollected;

    let aggScheduled = 0;
    let aggLive = 0;
    for (const closer of ACTIVE_CLOSERS) {
      const stats = iclosedByCloser?.[closer.id];
      if (!stats) continue;
      aggScheduled += stats.scheduled || 0;
      aggLive += stats.live || 0;
    }

    const showRate = aggScheduled > 0 ? aggLive / aggScheduled : 0;
    const dealsCount = rangeDeals.length;
    const avgDealSize = dealsCount > 0 ? frontEnd / dealsCount : 0;
    const callsTaken = aggLive;
    const revenuePerCall = callsTaken > 0 ? totalCash / callsTaken : 0;
    const callsBookedPerDay = daysPassed > 0 ? aggScheduled / daysPassed : 0;

    const ppExpected = (paymentPlans || [])
      .filter((p) => p.status === 'active' || p.status === 'due_soon' || p.status === 'overdue')
      .filter((p) => {
        if (!p.next_due_date) return false;
        const due = new Date(p.next_due_date);
        return due >= now && due <= monthEnd;
      })
      .reduce((sum, p) => sum + Number(p.monthly_amount || 0), 0);

    return {
      totalDays, daysPassed, totalCash, dealsCount, avgDealSize,
      showRate: Math.round(showRate * 100),
      callsTaken, revenuePerCall, callsBookedPerDay,
      ppExpected, callsBooked: aggScheduled,
    };
  }, [deals, receipts, manualPayments, paymentPlans, iclosedByCloser, dateRange]);

  // Editable inputs — seeded from actuals
  const [target, setTarget] = useState(() => {
    try { return Number(localStorage.getItem('wetrade_monthly_target')) || 100000; } catch { return 100000; }
  });
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [avgDealSize, setAvgDealSize] = useState(null);
  const [showRate, setShowRate] = useState(null);
  const [callsPerDay, setCallsPerDay] = useState(null);
  const [ppExpected, setPpExpected] = useState(null);
  const [revenuePerCall, setRevenuePerCall] = useState(null);

  // Resolve: use override if set, otherwise actual
  const eff = useMemo(() => ({
    target,
    daysInMonth: daysInMonth || actuals.totalDays || 30,
    avgDealSize: avgDealSize !== null ? avgDealSize : Math.round(actuals.avgDealSize),
    showRate: showRate !== null ? showRate : actuals.showRate,
    callsPerDay: callsPerDay !== null ? callsPerDay : Math.round(actuals.callsBookedPerDay * 10) / 10,
    ppExpected: ppExpected !== null ? ppExpected : actuals.ppExpected,
    revenuePerCall: revenuePerCall !== null ? revenuePerCall : Math.round(actuals.revenuePerCall),
  }), [target, daysInMonth, avgDealSize, showRate, callsPerDay, ppExpected, revenuePerCall, actuals]);

  // Calculated outputs
  const outputs = useMemo(() => {
    const showDecimal = eff.showRate / 100;
    const gapToTarget = Math.max(0, eff.target - eff.ppExpected);

    // Forward: at current pace, what will we do?
    const totalCallsBooked = eff.callsPerDay * eff.daysInMonth;
    const totalCallsTaken = totalCallsBooked * showDecimal;
    const projectedRevenue = totalCallsTaken * eff.revenuePerCall + eff.ppExpected;

    // Reverse: to hit target, what do we need?
    const callsTakenNeeded = eff.revenuePerCall > 0 ? gapToTarget / eff.revenuePerCall : 0;
    const callsBookedNeeded = showDecimal > 0 ? callsTakenNeeded / showDecimal : 0;
    const requiredCallsPerDay = eff.daysInMonth > 0 ? callsBookedNeeded / eff.daysInMonth : 0;

    // Deal count projection
    const dealsProjected = eff.avgDealSize > 0 ? Math.round(projectedRevenue / eff.avgDealSize) : 0;

    const gap = projectedRevenue - eff.target;

    return {
      totalCallsBooked: Math.round(totalCallsBooked),
      totalCallsTaken: Math.round(totalCallsTaken),
      projectedRevenue,
      callsTakenNeeded: Math.round(callsTakenNeeded),
      callsBookedNeeded: Math.round(callsBookedNeeded),
      requiredCallsPerDay: Math.round(requiredCallsPerDay * 10) / 10,
      dealsProjected,
      gap,
      onTrack: gap >= 0,
    };
  }, [eff]);

  const resetToActuals = () => {
    setAvgDealSize(null);
    setShowRate(null);
    setCallsPerDay(null);
    setPpExpected(null);
    setRevenuePerCall(null);
    setDaysInMonth(actuals.totalDays || 30);
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Calculator</h2>
          <p className="text-sm text-gray-500 mt-1">Adjust inputs to model different scenarios</p>
        </div>
        <button
          onClick={resetToActuals}
          className="text-xs text-brand-cyan hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          Reset to actuals
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5 space-y-5">
          <h3 className="text-sm font-medium text-gray-400">Inputs</h3>

          {/* Target */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Monthly Target</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">£</span>
              <input
                type="number" min="0" step="5000" value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
                className="flex-1 bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-brand-cyan font-semibold focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          {/* Days in month */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Days in Month</label>
            <input
              type="number" min="1" max="31" value={eff.daysInMonth}
              onChange={(e) => setDaysInMonth(Number(e.target.value) || 30)}
              className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
            />
          </div>

          {/* Avg deal size */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Avg Deal Size</label>
              <span className="text-xs text-gray-600">Actual: {formatCurrency(actuals.avgDealSize)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">£</span>
              <input
                type="number" min="0" step="100" value={eff.avgDealSize}
                onChange={(e) => setAvgDealSize(Number(e.target.value) || 0)}
                className="flex-1 bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          {/* Show Rate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Show Rate %</label>
              <span className="text-xs text-gray-600">Actual: {actuals.showRate}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100" value={eff.showRate}
                onChange={(e) => setShowRate(Number(e.target.value))}
                className="flex-1 accent-brand-cyan"
              />
              <span className="text-sm text-white font-semibold w-12 text-right">{eff.showRate}%</span>
            </div>
          </div>

          {/* Calls booked per day */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Calls Booked / Day</label>
              <span className="text-xs text-gray-600">Actual: {actuals.callsBookedPerDay.toFixed(1)}</span>
            </div>
            <input
              type="number" min="0" step="0.5" value={eff.callsPerDay}
              onChange={(e) => setCallsPerDay(Number(e.target.value) || 0)}
              className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
            />
          </div>

          {/* Revenue per call */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Revenue per Call Taken</label>
              <span className="text-xs text-gray-600">Actual: {formatCurrency(actuals.revenuePerCall)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">£</span>
              <input
                type="number" min="0" step="50" value={eff.revenuePerCall}
                onChange={(e) => setRevenuePerCall(Number(e.target.value) || 0)}
                className="flex-1 bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          {/* PP Expected */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">PP Expected</label>
              <span className="text-xs text-gray-600">Actual: {formatCurrency(actuals.ppExpected)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">£</span>
              <input
                type="number" min="0" step="500" value={eff.ppExpected}
                onChange={(e) => setPpExpected(Number(e.target.value) || 0)}
                className="flex-1 bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>
        </div>

        {/* Outputs */}
        <div className="space-y-4">
          {/* At current pace */}
          <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-4">At Current Pace</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Calls Booked</p>
                  <p className="text-sm font-semibold text-white">{outputs.totalCallsBooked}</p>
                  <p className="text-[10px] text-gray-600">{eff.callsPerDay}/day x {eff.daysInMonth} days</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Calls Taken ({eff.showRate}% show)</p>
                  <p className="text-sm font-semibold text-white">{outputs.totalCallsTaken}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Projected Revenue</p>
                  <p className={`text-lg font-bold ${outputs.onTrack ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(outputs.projectedRevenue)}
                  </p>
                  <p className="text-[10px] text-gray-600">{outputs.totalCallsTaken} calls x {formatCurrency(eff.revenuePerCall)} + {formatCurrency(eff.ppExpected)} PP</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Deals Projected</p>
                  <p className="text-sm font-semibold text-brand-cyan">{outputs.dealsProjected}</p>
                  <p className="text-[10px] text-gray-600">at {formatCurrency(eff.avgDealSize)} avg</p>
                </div>
              </div>
              <div className={`rounded-lg p-3 ${outputs.onTrack ? 'bg-green-400/10 border border-green-400/20' : 'bg-red-400/10 border border-red-400/20'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-300">vs Target ({formatCurrency(eff.target)})</span>
                  <span className={`text-sm font-bold ${outputs.onTrack ? 'text-green-400' : 'text-red-400'}`}>
                    {outputs.onTrack ? '+' : ''}{formatCurrency(outputs.gap)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* To hit target */}
          <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-4">To Hit {formatCurrency(eff.target)}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Calls Needed</p>
                  <p className="text-sm font-semibold text-white">{outputs.callsTakenNeeded}</p>
                  <p className="text-[10px] text-gray-600">calls taken</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Need to Book</p>
                  <p className="text-sm font-semibold text-white">{outputs.callsBookedNeeded}</p>
                  <p className="text-[10px] text-gray-600">at {eff.showRate}% show</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Book / Day</p>
                  <p className={`text-sm font-semibold ${outputs.requiredCallsPerDay <= eff.callsPerDay ? 'text-green-400' : 'text-amber-400'}`}>
                    {outputs.requiredCallsPerDay}
                  </p>
                  <p className="text-[10px] text-gray-600">
                    {outputs.requiredCallsPerDay <= eff.callsPerDay ? 'achievable' : `need +${(outputs.requiredCallsPerDay - eff.callsPerDay).toFixed(1)} more`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick scenarios */}
          <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Scenarios</h3>
            <div className="space-y-2">
              {[150000, 200000, 250000, 300000].map((t) => {
                const gap = Math.max(0, t - eff.ppExpected);
                const callsTaken = eff.revenuePerCall > 0 ? gap / eff.revenuePerCall : 0;
                const showDecimal = eff.showRate / 100;
                const callsBooked = showDecimal > 0 ? callsTaken / showDecimal : 0;
                const perDay = eff.daysInMonth > 0 ? callsBooked / eff.daysInMonth : 0;
                return (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
                  >
                    <span className="text-sm text-gray-400">{formatCurrency(t)}/month</span>
                    <div className="text-right">
                      <span className="text-sm text-brand-cyan font-semibold">{Math.round(perDay * 10) / 10} calls/day</span>
                      <span className="text-[10px] text-gray-600 ml-2">({Math.round(callsBooked)} total)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
