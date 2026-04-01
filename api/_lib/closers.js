const CLOSER_MAP = {
  lloyd: { id: 'lloyd', name: 'Lloyd' },
  dave: { id: 'dave', name: 'Dave' },
  zak: { id: 'zak', name: 'Zak' },
  joe: { id: 'joe', name: 'Joe' },
};

export function matchCloserByName(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, val] of Object.entries(CLOSER_MAP)) {
    if (lower.includes(key)) {
      return val;
    }
  }
  return { id: 'lloyd', name: name || 'Unknown' };
}

export function matchCloserByNameAndEmail(name, email) {
  const combined = `${name || ''} ${email || ''}`.toLowerCase();
  for (const [key, val] of Object.entries(CLOSER_MAP)) {
    if (combined.includes(key)) {
      return val;
    }
  }
  return { id: 'lloyd', name: name || 'Unknown' };
}
