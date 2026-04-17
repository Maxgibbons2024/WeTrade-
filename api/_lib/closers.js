// ---- Single source of truth for closer/setter identity ----
// Every backend file that needs to resolve a name to a closer or setter
// should import from here. Do NOT duplicate these maps elsewhere.

export const CLOSER_MAP = {
  lloyd:  { id: 'lloyd',  name: 'Lloyd',  role: 'closer' },
  dave:   { id: 'dave',   name: 'Dave',   role: 'closer' },
  zak:    { id: 'zak',    name: 'Zak',    role: 'closer' },
  joe:    { id: 'joe',    name: 'Joe',    role: 'closer' },
  shea:   { id: 'shea',   name: 'Shea',   role: 'closer' },
  chris:  { id: 'chris',  name: 'Chris',  role: 'closer' },
  connor: { id: 'connor', name: 'Connor', role: 'setter' },
  // Kai left the team — kept in the map for historical call/deal matching.
  kai:    { id: 'kai',    name: 'Kai',    role: 'setter' },
};

// Regex-based matching for iClosed display names (handles name variants).
// Put `connor` before `chris` so "Connor" doesn't accidentally match "chris".
// (Not an issue here since neither substring overlaps, but keeping for clarity.)
export const NAME_TO_INTERNAL = [
  { match: /lloyd/i,             internal_id: 'lloyd',  role: 'closer' },
  { match: /dave|david/i,        internal_id: 'dave',   role: 'closer' },
  { match: /zak|zach/i,          internal_id: 'zak',    role: 'closer' },
  { match: /joe|joseph/i,        internal_id: 'joe',    role: 'closer' },
  { match: /shea/i,              internal_id: 'shea',   role: 'closer' },
  { match: /chris|christopher/i, internal_id: 'chris',  role: 'closer' },
  { match: /connor/i,            internal_id: 'connor', role: 'setter' },
  { match: /kai/i,               internal_id: 'kai',    role: 'setter' },
];

// Resolve an iClosed display name to an internal id + role using regex.
export function resolveInternal(displayName) {
  if (!displayName) return null;
  for (const rule of NAME_TO_INTERNAL) {
    if (rule.match.test(displayName)) return rule;
  }
  return null;
}

// Simple substring match against the CLOSER_MAP keys.
// Returns { id, name, role } or defaults to lloyd.
export function matchCloserByName(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, val] of Object.entries(CLOSER_MAP)) {
    if (lower.includes(key)) {
      return val;
    }
  }
  return { id: 'lloyd', name: name || 'Unknown', role: 'closer' };
}

// Match against combined name + email string.
export function matchCloserByNameAndEmail(name, email) {
  const combined = `${name || ''} ${email || ''}`.toLowerCase();
  for (const [key, val] of Object.entries(CLOSER_MAP)) {
    if (combined.includes(key)) {
      return val;
    }
  }
  return { id: 'lloyd', name: name || 'Unknown', role: 'closer' };
}

// Safe month arithmetic — clamps to last day of target month.
// new Date(2026, 1, 31) → Jan 31; addMonths(date, 1) → Feb 28, not Mar 3.
export function addMonths(date, n) {
  const d = new Date(date);
  const targetMonth = d.getMonth() + n;
  const dayOfMonth = d.getDate();
  // Set to 1st to avoid overflow, then set target month
  d.setDate(1);
  d.setMonth(targetMonth);
  // Clamp to last day of the target month
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, lastDay));
  return d;
}
