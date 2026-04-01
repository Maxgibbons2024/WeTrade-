import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useQuery(table, { select = '*', order, filters, enabled = true } = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filterKey = JSON.stringify(filters);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(table).select(select);
      if (filters) {
        for (const [method, ...args] of filters) {
          query = query[method](...args);
        }
      }
      if (order) {
        query = query.order(order.column, { ascending: order.ascending ?? false });
      }
      const { data: result, error: err } = await query;
      if (err) throw err;
      setData(result || []);
    } catch (err) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [table, select, order?.column, order?.ascending, filterKey, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useRealtime(table, callback) {
  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        callback(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, callback]);
}

export async function insertRow(table, data) {
  const { data: result, error } = await supabase.from(table).insert(data).select();
  if (error) throw error;
  return result;
}

export async function updateRow(table, id, data) {
  const { data: result, error } = await supabase.from(table).update(data).eq('id', id).select();
  if (error) throw error;
  return result;
}
