export const CLOSERS = [
  { id: 'lloyd', name: 'Lloyd', initials: 'LL', color: '#27CCE7' },
  { id: 'dave', name: 'Dave', initials: 'DV', color: '#F59E0B' },
  { id: 'zak', name: 'Zak', initials: 'ZK', color: '#10B981' },
  { id: 'joe', name: 'Joe', initials: 'JO', color: '#8B5CF6' },
];

export const PROGRAMMES = ['Kickstarter', 'Mechanical Mastery', 'Pro', 'Elite'];

export const DEAL_STATUSES = ['onboarding', 'active', 'follow_up', 'lost'];

export const PAYMENT_METHODS = ['stripe', 'paypal', 'bank_transfer', 'mamo'];

export const SOURCES = ['slack', 'stripe', 'manual'];

export const OUTCOME_COLOURS = {
  closed: '#10B981',
  no_show: '#EF4444',
  follow_up: '#27CCE7',
  not_interested: '#6B7280',
  rescheduled: '#F59E0B',
};

export const STATUS_COLOURS = {
  active: '#10B981',
  overdue: '#EF4444',
  due_soon: '#F59E0B',
  completed: '#6B7280',
  onboarding: '#27CCE7',
  follow_up: '#F59E0B',
  lost: '#EF4444',
};

export function formatCurrency(value) {
  return `£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getCloser(id) {
  return CLOSERS.find((c) => c.id === id) || { id, name: id, initials: '??', color: '#6B7280' };
}

export function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function getMonthLabel() {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
