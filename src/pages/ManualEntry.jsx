import { useState } from 'react';
import toast from 'react-hot-toast';
import { insertRow } from '../hooks/useSupabase';
import { CLOSERS, PROGRAMMES, DEAL_STATUSES, PAYMENT_METHODS, SOURCES } from '../lib/constants';

const TABS = [
  { id: 'deal', label: 'New Deal' },
  { id: 'payment_plan', label: 'Payment Plan Payment' },
  { id: 'manual_payment', label: 'Manual Payment' },
];

const EMPTY_DEAL = {
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

const EMPTY_PLAN_PAYMENT = {
  client_name: '',
  closer_id: 'lloyd',
  monthly_amount: '',
  total_value: '',
  total_collected: '0',
  months_remaining: '',
  next_due_date: '',
  notes: '',
};

const EMPTY_MANUAL = {
  client_name: '',
  amount: '',
  payment_method: 'paypal',
  payment_date: new Date().toISOString().split('T')[0],
  notes: '',
  added_by: '',
};

export default function ManualEntry() {
  const [tab, setTab] = useState('deal');
  const [dealForm, setDealForm] = useState(EMPTY_DEAL);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_PAYMENT);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(setter) {
    return (e) => {
      const { name, value } = e.target;
      setter((prev) => {
        const next = { ...prev, [name]: value };
        if (name === 'closer_id') {
          const c = CLOSERS.find((cl) => cl.id === value);
          if (c) next.closer_name = c.name;
        }
        return next;
      });
    };
  }

  async function submitDeal(e) {
    e.preventDefault();
    if (!dealForm.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!dealForm.front_end || Number(dealForm.front_end) < 0) { toast.error('Front end amount is required'); return; }
    setSubmitting(true);
    try {
      await insertRow('deals', {
        ...dealForm,
        front_end: Number(dealForm.front_end),
        monthly_amount: Number(dealForm.monthly_amount) || 0,
        onboarding_date: dealForm.onboarding_date || null,
        onboarding_assigned_to: dealForm.onboarding_assigned_to || null,
        notes: dealForm.notes || null,
      });
      toast.success('Deal added successfully');
      setDealForm(EMPTY_DEAL);
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPlanPayment(e) {
    e.preventDefault();
    if (!planForm.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!planForm.monthly_amount || Number(planForm.monthly_amount) <= 0) { toast.error('Monthly amount is required'); return; }
    if (!planForm.total_value || Number(planForm.total_value) <= 0) { toast.error('Total value is required'); return; }
    if (!planForm.next_due_date) { toast.error('Next due date is required'); return; }
    if (!planForm.months_remaining || Number(planForm.months_remaining) <= 0) { toast.error('Months remaining is required'); return; }
    setSubmitting(true);
    try {
      await insertRow('payment_plans', {
        client_name: planForm.client_name,
        closer_id: planForm.closer_id,
        monthly_amount: Number(planForm.monthly_amount),
        total_value: Number(planForm.total_value),
        total_collected: Number(planForm.total_collected) || 0,
        months_remaining: Number(planForm.months_remaining),
        next_due_date: planForm.next_due_date,
        status: 'active',
        notes: planForm.notes || null,
      });
      toast.success('Payment plan created');
      setPlanForm(EMPTY_PLAN_PAYMENT);
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitManualPayment(e) {
    e.preventDefault();
    if (!manualForm.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!manualForm.amount || Number(manualForm.amount) <= 0) { toast.error('Amount is required'); return; }
    if (!manualForm.added_by.trim()) { toast.error('Added by is required'); return; }
    setSubmitting(true);
    try {
      await insertRow('manual_payments', {
        client_name: manualForm.client_name,
        amount: Number(manualForm.amount),
        payment_method: manualForm.payment_method,
        payment_date: manualForm.payment_date,
        notes: manualForm.notes || null,
        added_by: manualForm.added_by,
      });
      toast.success('Manual payment recorded');
      setManualForm(EMPTY_MANUAL);
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan text-white';
  const labelClass = 'block text-xs text-gray-500 mb-1';

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold">Add Entry</h2>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-brand-cyan text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Deal form */}
      {tab === 'deal' && (
        <form onSubmit={submitDeal} className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-400">New Deal</h3>
          <div>
            <label className={labelClass}>Client Name *</label>
            <input name="client_name" value={dealForm.client_name} onChange={handleChange(setDealForm)} required className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Closer *</label>
              <select name="closer_id" value={dealForm.closer_id} onChange={handleChange(setDealForm)} className={inputClass}>
                {CLOSERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Programme *</label>
              <select name="programme" value={dealForm.programme} onChange={handleChange(setDealForm)} className={inputClass}>
                {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Front End (£) *</label>
              <input name="front_end" type="number" min="0" step="1" value={dealForm.front_end} onChange={handleChange(setDealForm)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Monthly (£)</label>
              <input name="monthly_amount" type="number" min="0" step="1" value={dealForm.monthly_amount} onChange={handleChange(setDealForm)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Source</label>
              <select name="source" value={dealForm.source} onChange={handleChange(setDealForm)} className={inputClass}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Payment Method</label>
              <select name="payment_method" value={dealForm.payment_method} onChange={handleChange(setDealForm)} className={inputClass}>
                {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select name="status" value={dealForm.status} onChange={handleChange(setDealForm)} className={inputClass}>
              {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Onboarding Date</label>
            <input name="onboarding_date" type="datetime-local" value={dealForm.onboarding_date} onChange={handleChange(setDealForm)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Onboarding Assigned To</label>
            <input name="onboarding_assigned_to" value={dealForm.onboarding_assigned_to} onChange={handleChange(setDealForm)} placeholder="e.g. Sam Ducker" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" value={dealForm.notes} onChange={handleChange(setDealForm)} rows={3} className={`${inputClass} resize-none`} />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Deal'}
          </button>
        </form>
      )}

      {/* Payment Plan form */}
      {tab === 'payment_plan' && (
        <form onSubmit={submitPlanPayment} className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-400">New Payment Plan</h3>
          <div>
            <label className={labelClass}>Client Name *</label>
            <input name="client_name" value={planForm.client_name} onChange={handleChange(setPlanForm)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Closer *</label>
            <select name="closer_id" value={planForm.closer_id} onChange={handleChange(setPlanForm)} className={inputClass}>
              {CLOSERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Monthly Amount (£) *</label>
              <input name="monthly_amount" type="number" min="0" step="1" value={planForm.monthly_amount} onChange={handleChange(setPlanForm)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Total Value (£) *</label>
              <input name="total_value" type="number" min="0" step="1" value={planForm.total_value} onChange={handleChange(setPlanForm)} required className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Already Collected (£)</label>
              <input name="total_collected" type="number" min="0" step="1" value={planForm.total_collected} onChange={handleChange(setPlanForm)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Months Remaining *</label>
              <input name="months_remaining" type="number" min="1" step="1" value={planForm.months_remaining} onChange={handleChange(setPlanForm)} required className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Next Due Date *</label>
            <input name="next_due_date" type="date" value={planForm.next_due_date} onChange={handleChange(setPlanForm)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" value={planForm.notes} onChange={handleChange(setPlanForm)} rows={3} className={`${inputClass} resize-none`} />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Create Payment Plan'}
          </button>
        </form>
      )}

      {/* Manual Payment form */}
      {tab === 'manual_payment' && (
        <form onSubmit={submitManualPayment} className="bg-[#1a1d20] rounded-xl border border-gray-800 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-400">Record Manual Payment</h3>
          <div>
            <label className={labelClass}>Client Name *</label>
            <input name="client_name" value={manualForm.client_name} onChange={handleChange(setManualForm)} required className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Amount (£) *</label>
              <input name="amount" type="number" min="0" step="0.01" value={manualForm.amount} onChange={handleChange(setManualForm)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Payment Method *</label>
              <select name="payment_method" value={manualForm.payment_method} onChange={handleChange(setManualForm)} className={inputClass}>
                <option value="paypal">PayPal</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="mamo">Mamo</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Payment Date *</label>
            <input name="payment_date" type="date" value={manualForm.payment_date} onChange={handleChange(setManualForm)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Added By *</label>
            <input name="added_by" value={manualForm.added_by} onChange={handleChange(setManualForm)} required placeholder="Your name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" value={manualForm.notes} onChange={handleChange(setManualForm)} rows={3} className={`${inputClass} resize-none`} />
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-mid transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Record Payment'}
          </button>
        </form>
      )}
    </div>
  );
}
