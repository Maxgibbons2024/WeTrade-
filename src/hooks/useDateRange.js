import { useState, useMemo, useCallback } from 'react';

const PRESETS = {
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  last_30: 'Last 30 Days',
  last_90: 'Last 90 Days',
  all: 'All Time',
  custom: 'Custom',
};

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calcRange(preset) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  switch (preset) {
    case 'this_week': {
      return { start: getMonday(now), end: endOfDay };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfDay };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'last_30': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { start, end: endOfDay };
    }
    case 'last_90': {
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      return { start, end: endOfDay };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}

function calcCompareRange(dateRange) {
  if (!dateRange.start || !dateRange.end) return null;
  const duration = dateRange.end.getTime() - dateRange.start.getTime();
  const compareEnd = new Date(dateRange.start.getTime() - 1);
  compareEnd.setHours(23, 59, 59, 999);
  const compareStart = new Date(compareEnd.getTime() - duration);
  compareStart.setHours(0, 0, 0, 0);
  return { start: compareStart, end: compareEnd };
}

export default function useDateRange(defaultPreset = 'this_month') {
  const [preset, setPreset] = useState(defaultPreset);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(customStart);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return calcRange(preset);
  }, [preset, customStart, customEnd]);

  const compareRange = useMemo(() => {
    if (!compareEnabled) return null;
    return calcCompareRange(dateRange);
  }, [dateRange, compareEnabled]);

  const setCustomRange = useCallback((start, end) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPreset('custom');
  }, []);

  return {
    preset,
    setPreset,
    dateRange,
    compareEnabled,
    setCompareEnabled,
    compareRange,
    presets: PRESETS,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    setCustomRange,
  };
}
