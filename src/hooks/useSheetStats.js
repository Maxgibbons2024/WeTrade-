import { useState, useEffect } from 'react';

export default function useSheetStats(month) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const params = month ? `?month=${encodeURIComponent(month)}` : '';
        const res = await fetch(`/api/sheets/stats${params}`);
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
          setError(null);
        } else {
          setError(json.error || 'Failed to fetch');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [month]);

  return { data, loading, error };
}
