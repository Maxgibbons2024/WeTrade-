export const CLOSERS = [
  { id: 'lloyd', name: 'Lloyd', initials: 'LL', color: '#27CCE7' },
  { id: 'dave', name: 'Dave', initials: 'DV', color: '#F59E0B' },
  { id: 'zak', name: 'Zak', initials: 'ZK', color: '#10B981' },
  { id: 'joe', name: 'Joe', initials: 'JO', color: '#8B5CF6' },
  { id: 'shea', name: 'Shea', initials: 'SH', color: '#EC4899' },
  { id: 'chris', name: 'Chris', initials: 'CH', color: '#F97316' },
];

export const PROGRAMMES = ['Kickstarter', 'Mechanical Mastery', 'Pro', 'Elite', 'Mastermind'];

export const DEAL_STATUSES = ['onboarding', 'active', 'follow_up', 'lost', 'cancelled'];

export const PAYMENT_METHODS = ['stripe', 'paypal', 'bank_transfer', 'mamo'];

export const SOURCES = ['slack', 'stripe', 'manual'];

export const MENTORS = [
  { id: 'henry', name: 'Henry Steeds', initials: 'HS', color: '#27CCE7' },
  { id: 'geo', name: 'Geo Cook', initials: 'GC', color: '#10B981' },
  { id: 'sam', name: 'Sam Ducker', initials: 'SD', color: '#F59E0B' },
];

export const SETTERS = [
  { id: 'kai', name: 'Kai Reeve', initials: 'KR', color: '#8B5CF6' },
];

export const PACKAGES = [
  { id: '10_sessions', label: '10 Sessions', sessionsTotal: 10 },
  { id: 'pro_group', label: 'Pro Group', sessionsTotal: null },
];

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
  cancelled: '#EF4444',
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

export function getMentor(id) {
  return MENTORS.find((m) => m.id === id) || { id, name: id, initials: '??', color: '#6B7280' };
}

export function getSetter(id) {
  return SETTERS.find((s) => s.id === id) || { id, name: id, initials: '??', color: '#6B7280' };
}

export function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function getMonthLabel() {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function isInDateRange(dateStr, start, end) {
  if (!start) return true;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function formatDuration(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end - start;
  if (diffMs < 0) return null;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Same day';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week';
  if (days < 30) return `${weeks} weeks`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month';
  return `${months} months`;
}

export function isCommunityOnly(deal) {
  return !!deal.mentor_name && Number(deal.front_end || 0) === 0 && Number(deal.monthly_amount || 0) === 0;
}

export function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: pct, direction: pct >= 0 ? 'up' : 'down' };
}
