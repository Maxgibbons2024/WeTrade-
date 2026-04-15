import { useCallback, useMemo } from 'react';
import { useQuery, useRealtime } from './useSupabase';
import { isInDateRange, CLOSERS } from '../lib/constants';

// Status taxonomy — adjust if iClosed uses different labels.
// Anything in SHOWED_STATUSES counts as a live call.
const SHOWED_STATUSES = new Set(['SHOWED', 'COMPLETED', 'COMPLETE', 'CLOSED', 'showed', 'completed']);
const NO_SHOW_STATUSES = new Set(['NO_SHOW', 'NOSHOW', 'no_show', 'noshow']);
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'cancelled', 'canceled']);

// Outcome strings that count as a closed deal in iClosed
const CLOSED_OUTCOMES = new Set(['closed', 'won', 'CLOSED', 'WON', 'sale']);

export function isShowed(call) { return SHOWED_STATUSES.has(call.status); }
export function isNoShow(call) { return NO_SHOW_STATUSES.has(call.status); }
export function isCancelled(call) { return CANCELLED_STATUSES.has(call.status); }

// A call counts as "closed" if it's linked to a deal OR its outcome string says so
export function isClosedCall(call) {
  if (call.deal_id) return true;
  if (call.outcome && CLOSED_OUTCOMES.has(call.outcome)) return true;
  return false;
}

/**
 * useIclosedStats — pulls the iclosed_calls table and aggregates by closer.
 * Drop-in replacement for the old useSheetStats hook.
 *
 * @param {object} dateRange - { start: Date, end: Date } from useDateRange
 * @returns {{
 *   calls: Array,
 *   byCloser: Record<string, { scheduled, live, noShows, showRate, closes, closeRate, revenue }>,
 *   daily:   Record<string, Array<{ date, scheduled, live, closes }>>,
 *   loading: boolean,
 *   error:   string | null,
 *   refetch: () => void,
 * }}
 */
export default function useIclosedStats(dateRange) {
  const { data: allCalls, loading, error, refetch } = useQuery('iclosed_calls', {
    order: { column: 'scheduled_at', ascending: false },
  });

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('iclosed_calls', handleRealtime);

  // Filter to range — exclude cancelled (don't count against show rate)
  // and exclude future calls so the dashboard shows "calls so far" rather
  // than "calls scheduled" (future BOOKED rows would otherwise inflate the
  // scheduled count and dilute the show rate).
  const calls = useMemo(() => {
    const now = Date.now();
    const base = (allCalls || []).filter((c) => {
      if (isCancelled(c)) return false;
      const t = c.scheduled_at ? new Date(c.scheduled_at).getTime() : 0;
      if (t > now) return false;
      return true;
    });
    if (!dateRange?.start) return base;
    return base.filter((c) => isInDateRange(c.scheduled_at, dateRange.start, dateRange.end));
  }, [allCalls, dateRange?.start, dateRange?.end]);

  // Aggregate by closer
  const byCloser = useMemo(() => {
    const map = {};
    for (const c of CLOSERS) {
      map[c.id] = { scheduled: 0, live: 0, noShows: 0, showRate: 0, closes: 0, closeRate: 0, revenue: 0 };
    }
    for (const call of calls) {
      const key = call.closer_id;
      if (!key || !map[key]) continue;
      map[key].scheduled += 1;
      if (isShowed(call)) map[key].live += 1;
      if (isNoShow(call)) map[key].noShows += 1;
      if (isClosedCall(call)) {
        map[key].closes += 1;
        map[key].revenue += Number(call.deal_value || 0);
      }
    }
    for (const id of Object.keys(map)) {
      const m = map[id];
      const decided = m.live + m.noShows;
      m.showRate = decided > 0 ? Math.round((m.live / decided) * 100) : 0;
      m.closeRate = m.live > 0 ? Math.round((m.closes / m.live) * 100) : 0;
    }
    return map;
  }, [calls]);

  // Daily aggregates per closer (last 14 days within range)
  const daily = useMemo(() => {
    const out = {};
    for (const c of CLOSERS) out[c.id] = new Map();
    for (const call of calls) {
      const key = call.closer_id;
      if (!key || !out[key]) continue;
      const day = (call.scheduled_at || '').slice(0, 10);
      if (!day) continue;
      let entry = out[key].get(day);
      if (!entry) {
        entry = { date: day, scheduled: 0, live: 0, closes: 0 };
        out[key].set(day, entry);
      }
      entry.scheduled += 1;
      if (isShowed(call)) entry.live += 1;
      if (isClosedCall(call)) entry.closes += 1;
    }
    // Convert to sorted arrays
    const result = {};
    for (const [id, m] of Object.entries(out)) {
      result[id] = Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
    return result;
  }, [calls]);

  return { calls, byCloser, daily, loading, error, refetch };
}
