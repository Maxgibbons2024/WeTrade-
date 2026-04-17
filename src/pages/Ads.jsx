import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import DateRangeFilter from '../components/DateRangeFilter';
import SlideOver from '../components/SlideOver';
import CloserAvatar from '../components/CloserAvatar';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { useQuery } from '../hooks/useSupabase';
import { formatCurrency, formatDate, isInDateRange } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-GB');
}

function formatPct(n) {
  return `${(Number(n || 0) * 100).toFixed(1)}%`;
}

function roasColor(roas) {
  if (roas >= 3) return 'text-green-400';
  if (roas >= 2) return 'text-amber-400';
  return 'text-red-400';
}

function roasBg(roas) {
  if (roas >= 3) return 'bg-green-400';
  if (roas >= 2) return 'bg-amber-400';
  return 'bg-red-400';
}

// Tiny inline SVG sparkline — no chart library overhead for small visuals
function Sparkline({ values, color = '#27CCE7', width = 120, height = 32 }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 0.01);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {/* Fill under the line */}
      <polyline
        fill={`${color}22`}
        stroke="none"
        points={`0,${height} ${points} ${width},${height}`}
      />
    </svg>
  );
}

export default function Ads() {
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('this_month');
  const [timeView, setTimeView] = useState('daily');
  const [drillLevel, setDrillLevel] = useState('campaigns'); // campaigns | adsets | ads
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedAdSet, setSelectedAdSet] = useState(null);
  const [selectedAd, setSelectedAd] = useState(null);

  const { data: adData, loading: adLoading, error: adError } = useQuery('segmetrics_ads', {
    order: { column: 'date', ascending: false },
  });
  const { data: dailyTotals, loading: dailyLoading } = useQuery('segmetrics_daily', {
    order: { column: 'date', ascending: false },
  });
  const { data: deals, loading: dealsLoading } = useQuery('deals');
  const { data: receipts, loading: receiptsLoading } = useQuery('payment_receipts');
  const { data: plans, loading: plansLoading } = useQuery('payment_plans');

  const loading = adLoading || dailyLoading || dealsLoading || receiptsLoading || plansLoading;
  const error = adError;

  // Filter ad data by date range
  const rangeAds = useMemo(
    () => adData.filter((a) => isInDateRange(a.date, dateRange.start, dateRange.end)),
    [adData, dateRange]
  );

  // Filter daily totals by date range — used for impressions (not available per-campaign)
  const rangeDaily = useMemo(
    () => (dailyTotals || []).filter((d) => isInDateRange(d.date, dateRange.start, dateRange.end)),
    [dailyTotals, dateRange]
  );

  // Filter deals by date range
  const rangeDeals = useMemo(
    () => deals.filter((d) => isInDateRange(d.created_at, dateRange.start, dateRange.end)),
    [deals, dateRange]
  );

  // Build cash attribution: deals grouped by utm_campaign
  const cashByCampaign = useMemo(() => {
    const map = {};
    for (const deal of rangeDeals) {
      const campaign = (deal.utm_campaign || '').toLowerCase().trim();
      if (!campaign) continue;
      if (!map[campaign]) map[campaign] = { fe: 0, deals: [], count: 0 };
      map[campaign].fe += Number(deal.front_end || 0);
      map[campaign].count += 1;
      map[campaign].deals.push(deal);
    }
    // Add PP collected from receipts linked to deals in range
    for (const r of receipts || []) {
      if (!r.success || !r.deal_id) continue;
      const deal = deals.find((d) => d.id === r.deal_id);
      if (!deal) continue;
      const campaign = (deal.utm_campaign || '').toLowerCase().trim();
      if (!campaign || !map[campaign]) continue;
      if (isInDateRange(r.received_at, dateRange.start, dateRange.end)) {
        if (!map[campaign].pp) map[campaign].pp = 0;
        map[campaign].pp += Number(r.amount || 0);
      }
    }
    return map;
  }, [rangeDeals, receipts, deals, dateRange]);

  function getCashForCampaign(campaignName) {
    const key = (campaignName || '').toLowerCase().trim();
    const entry = cashByCampaign[key];
    return entry ? (entry.fe + (entry.pp || 0)) : 0;
  }

  function getDealsForCampaign(campaignName) {
    const key = (campaignName || '').toLowerCase().trim();
    return cashByCampaign[key]?.deals || [];
  }

  function getDealCountForCampaign(campaignName) {
    const key = (campaignName || '').toLowerCase().trim();
    return cashByCampaign[key]?.count || 0;
  }

  // ---- KPI Totals ----
  const totals = useMemo(() => {
    let spend = 0, clicks = 0, leads = 0, revenue = 0;
    for (const a of rangeAds) {
      spend += Number(a.spend || 0);
      clicks += Number(a.clicks || 0);
      leads += Number(a.leads || 0);
      revenue += Number(a.revenue || 0);
    }
    // Impressions come from account-wide daily KPI totals,
    // not per-campaign (SegMetrics doesn't break impressions down per campaign)
    let impressions = 0;
    for (const d of rangeDaily) {
      impressions += Number(d.impressions || 0);
    }
    let realCash = 0;
    for (const entry of Object.values(cashByCampaign)) {
      realCash += entry.fe + (entry.pp || 0);
    }
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const realRoas = spend > 0 ? realCash / spend : 0;
    const segRoas = spend > 0 ? revenue / spend : 0;
    return { spend, clicks, impressions, leads, revenue, realCash, cpc, cpl, realRoas, segRoas };
  }, [rangeAds, rangeDaily, cashByCampaign]);

  // ---- Campaign-level aggregation ----
  const campaignStats = useMemo(() => {
    const map = {};
    for (const a of rangeAds) {
      const key = a.campaign_id || a.campaign_name || 'Unknown';
      if (!map[key]) map[key] = { campaign_id: a.campaign_id, campaign_name: a.campaign_name || 'Unknown', spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0 };
      map[key].spend += Number(a.spend || 0);
      map[key].clicks += Number(a.clicks || 0);
      map[key].impressions += Number(a.impressions || 0);
      map[key].leads += Number(a.leads || 0);
      map[key].revenue += Number(a.revenue || 0);
    }
    return Object.values(map).map((c) => {
      const realCash = getCashForCampaign(c.campaign_name);
      return {
        ...c,
        cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
        cpl: c.leads > 0 ? c.spend / c.leads : 0,
        ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
        realCash,
        realRoas: c.spend > 0 ? realCash / c.spend : 0,
        dealCount: getDealCountForCampaign(c.campaign_name),
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [rangeAds, cashByCampaign]);

  // ---- Ad Set-level aggregation (within selected campaign) ----
  const adSetStats = useMemo(() => {
    if (!selectedCampaign) return [];
    const filtered = rangeAds.filter((a) => (a.campaign_id || a.campaign_name) === (selectedCampaign.campaign_id || selectedCampaign.campaign_name));
    const map = {};
    for (const a of filtered) {
      const key = a.ad_set_id || a.ad_set_name || 'Unknown';
      if (!map[key]) map[key] = { ad_set_id: a.ad_set_id, ad_set_name: a.ad_set_name || 'Unknown', campaign_name: a.campaign_name, spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0 };
      map[key].spend += Number(a.spend || 0);
      map[key].clicks += Number(a.clicks || 0);
      map[key].impressions += Number(a.impressions || 0);
      map[key].leads += Number(a.leads || 0);
      map[key].revenue += Number(a.revenue || 0);
    }
    return Object.values(map).map((s) => ({
      ...s,
      cpc: s.clicks > 0 ? s.spend / s.clicks : 0,
      cpl: s.leads > 0 ? s.spend / s.leads : 0,
      ctr: s.impressions > 0 ? s.clicks / s.impressions : 0,
      realCash: getCashForCampaign(s.campaign_name),
      realRoas: s.spend > 0 ? getCashForCampaign(s.campaign_name) / s.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [rangeAds, selectedCampaign, cashByCampaign]);

  // ---- Ad-level aggregation (within selected ad set) ----
  const adStats = useMemo(() => {
    if (!selectedAdSet) return [];
    const filtered = rangeAds.filter((a) =>
      (a.ad_set_id || a.ad_set_name) === (selectedAdSet.ad_set_id || selectedAdSet.ad_set_name) &&
      (a.campaign_id || a.campaign_name) === (selectedCampaign?.campaign_id || selectedCampaign?.campaign_name)
    );
    const map = {};
    for (const a of filtered) {
      const key = a.ad_id || a.ad_name || 'Unknown';
      if (!map[key]) map[key] = { ad_id: a.ad_id, ad_name: a.ad_name || 'Unknown', campaign_name: a.campaign_name, spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0 };
      map[key].spend += Number(a.spend || 0);
      map[key].clicks += Number(a.clicks || 0);
      map[key].impressions += Number(a.impressions || 0);
      map[key].leads += Number(a.leads || 0);
      map[key].revenue += Number(a.revenue || 0);
    }
    return Object.values(map).map((ad) => ({
      ...ad,
      cpc: ad.clicks > 0 ? ad.spend / ad.clicks : 0,
      cpl: ad.leads > 0 ? ad.spend / ad.leads : 0,
      ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
      realCash: getCashForCampaign(ad.campaign_name),
      realRoas: ad.spend > 0 ? getCashForCampaign(ad.campaign_name) / ad.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [rangeAds, selectedAdSet, selectedCampaign, cashByCampaign]);

  // ---- Time-series aggregation ----
  // Bucket a date string into daily / weekly (Mon-start) / monthly key
  const bucketKey = (dateStr) => {
    if (timeView === 'daily') return dateStr;
    if (timeView === 'weekly') {
      const d = new Date(dateStr);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      return monday.toISOString().split('T')[0];
    }
    return dateStr?.substring(0, 7); // YYYY-MM
  };

  const timeSeriesData = useMemo(() => {
    const groups = {};
    // Aggregate per-campaign spend/clicks/leads/revenue (impressions not available here)
    for (const a of rangeAds) {
      const key = bucketKey(a.date);
      if (!groups[key]) groups[key] = { spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0, realCash: 0 };
      groups[key].spend += Number(a.spend || 0);
      groups[key].clicks += Number(a.clicks || 0);
      groups[key].leads += Number(a.leads || 0);
      groups[key].revenue += Number(a.revenue || 0);
    }
    // Impressions live in segmetrics_daily (account-wide KPI). Merge them in.
    for (const d of rangeDaily) {
      const key = bucketKey(d.date);
      if (!groups[key]) groups[key] = { spend: 0, clicks: 0, impressions: 0, leads: 0, revenue: 0, realCash: 0 };
      groups[key].impressions += Number(d.impressions || 0);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([label, data]) => ({ label, ...data, roas: data.spend > 0 ? data.revenue / data.spend : 0 }));
  }, [rangeAds, rangeDaily, timeView]);

  // ---- Chart data ----
  const chartData = useMemo(() => {
    const labels = timeSeriesData.map((d) => {
      if (timeView === 'monthly') return d.label;
      return new Date(d.label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    });
    return {
      labels,
      datasets: [
        {
          label: 'Ad Spend',
          data: timeSeriesData.map((d) => d.spend),
          backgroundColor: '#3B82F6',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Revenue',
          data: timeSeriesData.map((d) => d.revenue),
          backgroundColor: '#10B981',
          borderRadius: 4,
          yAxisID: 'y',
        },
      ],
    };
  }, [timeSeriesData, timeView]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', font: { family: 'Montserrat', size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: £${ctx.raw.toLocaleString()}` } },
    },
    scales: {
      x: { ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 } }, grid: { display: false } },
      y: {
        ticks: { color: '#6B7280', font: { family: 'Montserrat', size: 10 }, callback: (v) => `£${v.toLocaleString()}` },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  // ---- Drill-down table columns ----
  const performanceColumns = (nameKey, nameLabel) => [
    { key: nameKey, label: nameLabel, render: (val) => <span className="font-medium truncate max-w-[200px] block">{val || '—'}</span> },
    { key: 'spend', label: 'Spend', render: (val) => formatCurrency(val) },
    { key: 'clicks', label: 'Clicks', render: (val) => formatNum(val) },
    { key: 'impressions', label: 'Impr.', render: (val) => formatNum(val) },
    { key: 'ctr', label: 'CTR', render: (val) => formatPct(val) },
    { key: 'leads', label: 'Leads', render: (val) => formatNum(val) },
    { key: 'cpc', label: 'CPC', render: (val) => formatCurrency(val) },
    { key: 'cpl', label: 'CPL', render: (val) => formatCurrency(val) },
    { key: 'realCash', label: 'Real Cash', render: (val) => <span className="text-green-400 font-semibold">{formatCurrency(val)}</span> },
    {
      key: 'realRoas',
      label: 'ROAS',
      render: (val) => (
        <div className="flex items-center gap-2">
          <span className={`font-bold ${roasColor(val)}`}>{val.toFixed(1)}x</span>
          <div className="w-12 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${roasBg(val)}`} style={{ width: `${Math.min(100, (val / 5) * 100)}%` }} />
          </div>
        </div>
      ),
    },
  ];

  // ---- Best/Worst performers ----
  const bestWorst = useMemo(() => {
    const withSpend = campaignStats.filter((c) => c.spend > 0);
    const sorted = [...withSpend].sort((a, b) => b.realRoas - a.realRoas);
    return { best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() };
  }, [campaignStats]);

  // ---- Top Performing Ads widget: best campaigns with attributed cash ----
  // Filters out campaigns with no spend or no deals closed — only shows ones
  // that actually earned money so the widget surfaces real winners.
  const topPerformers = useMemo(() => {
    return campaignStats
      .filter((c) => c.spend > 0 && c.dealCount > 0)
      .sort((a, b) => b.realRoas - a.realRoas)
      .slice(0, 6);
  }, [campaignStats]);

  // ---- Needs Attention: high spend, low/no cash ----
  // Spend in top 50% of campaigns, but zero deals and zero real cash —
  // i.e. burning budget without converting.
  const needsAttention = useMemo(() => {
    if (campaignStats.length === 0) return [];
    const sortedBySpend = [...campaignStats].filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend);
    if (sortedBySpend.length === 0) return [];
    const medianSpend = sortedBySpend[Math.floor(sortedBySpend.length / 2)]?.spend || 0;
    return sortedBySpend
      .filter((c) => c.spend >= medianSpend && c.dealCount === 0 && c.realCash === 0)
      .slice(0, 5);
  }, [campaignStats]);

  // ---- Daily spend per campaign (for sparklines) ----
  const dailySpendByCampaign = useMemo(() => {
    const map = {};
    for (const a of rangeAds) {
      const key = a.campaign_id || a.campaign_name || 'Unknown';
      if (!map[key]) map[key] = {};
      map[key][a.date] = (map[key][a.date] || 0) + Number(a.spend || 0);
    }
    // Build sorted date arrays per campaign
    const result = {};
    const dateSet = new Set();
    for (const a of rangeAds) dateSet.add(a.date);
    const allDates = Array.from(dateSet).sort();
    for (const [key, byDate] of Object.entries(map)) {
      result[key] = allDates.map((d) => byDate[d] || 0);
    }
    return result;
  }, [rangeAds]);

  // ---- Unattributed deals ----
  const unattributedDeals = useMemo(
    () => rangeDeals.filter((d) => !d.utm_campaign || !(d.utm_campaign.toLowerCase().trim())),
    [rangeDeals]
  );

  // Navigation helpers
  function handleCampaignClick(row) {
    setSelectedCampaign(row);
    setDrillLevel('adsets');
  }
  function handleAdSetClick(row) {
    setSelectedAdSet(row);
    setDrillLevel('ads');
  }
  function handleAdClick(row) {
    setSelectedAd(row);
  }
  function goBack() {
    if (drillLevel === 'ads') {
      setDrillLevel('adsets');
      setSelectedAdSet(null);
    } else if (drillLevel === 'adsets') {
      setDrillLevel('campaigns');
      setSelectedCampaign(null);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Ad Performance</h2>

      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <MetricCard title="Total Spend" value={formatCurrency(totals.spend)} />
        <MetricCard title="Clicks" value={formatNum(totals.clicks)} />
        <MetricCard title="Impressions" value={formatNum(totals.impressions)} />
        <MetricCard title="Leads" value={formatNum(totals.leads)} />
        <MetricCard title="Seg Revenue" value={formatCurrency(totals.revenue)} />
        <MetricCard title="Real Cash" value={formatCurrency(totals.realCash)} accent />
        <MetricCard title="CPC" value={formatCurrency(totals.cpc)} />
        <MetricCard title="CPL" value={formatCurrency(totals.cpl)} />
        <MetricCard
          title="Real ROAS"
          value={`${totals.realRoas.toFixed(1)}x`}
          accent={totals.realRoas >= 3}
          warning={totals.realRoas >= 2 && totals.realRoas < 3}
          danger={totals.realRoas < 2 && totals.spend > 0}
        />
      </div>

      {/* Top Performing Ads widget */}
      {topPerformers.length > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Top Performing Ads</h3>
            <span className="text-xs text-gray-500">Ranked by Real ROAS</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topPerformers.map((campaign, i) => {
              const key = campaign.campaign_id || campaign.campaign_name;
              const sparkline = dailySpendByCampaign[key] || [];
              return (
                <button
                  key={key || i}
                  onClick={() => handleCampaignClick(campaign)}
                  className="text-left bg-brand-dark hover:bg-brand-dark/80 border border-gray-800 hover:border-brand-cyan/40 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-700' : 'text-gray-500'}`}>#{i + 1}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${roasColor(campaign.realRoas)} bg-white/5`}>
                          {campaign.realRoas.toFixed(1)}x
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate" title={campaign.campaign_name}>{campaign.campaign_name}</p>
                    </div>
                  </div>
                  <div className="h-8 mb-2">
                    <Sparkline values={sparkline} color={campaign.realRoas >= 3 ? '#10B981' : campaign.realRoas >= 2 ? '#F59E0B' : '#EF4444'} width={220} height={32} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <p className="text-gray-500">Spend</p>
                      <p className="text-white font-semibold">{formatCurrency(campaign.spend)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cash</p>
                      <p className="text-green-400 font-semibold">{formatCurrency(campaign.realCash)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Deals</p>
                      <p className="text-white font-semibold">{campaign.dealCount}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Needs Attention widget — high spend, no attributed cash */}
      {needsAttention.length > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-red-500/20 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-red-400">Needs Attention</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">High spend, zero attributed cash — consider pausing or reviewing attribution</p>
            </div>
            <span className="text-xs text-red-400 font-semibold">
              {formatCurrency(needsAttention.reduce((s, c) => s + c.spend, 0))} burning
            </span>
          </div>
          <div className="space-y-2">
            {needsAttention.map((campaign) => (
              <button
                key={campaign.campaign_id || campaign.campaign_name}
                onClick={() => handleCampaignClick(campaign)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-red-500/10 hover:border-red-500/30 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{campaign.campaign_name}</p>
                  <p className="text-[10px] text-gray-500">{formatNum(campaign.clicks)} clicks · {formatNum(campaign.leads)} leads · 0 deals</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-400">{formatCurrency(campaign.spend)}</p>
                  <p className="text-[10px] text-gray-600">no cash</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time Period Tabs + Chart */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Spend vs Revenue</h3>
          <div className="flex gap-1">
            {['daily', 'weekly', 'monthly'].map((v) => (
              <button
                key={v}
                onClick={() => setTimeView(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  timeView === v ? 'bg-brand-cyan text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Time-series table */}
      {timeSeriesData.length > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            {timeView === 'daily' ? 'Daily' : timeView === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3 font-medium">Period</th>
                  <th className="text-right py-2 px-2 font-medium">Spend</th>
                  <th className="text-right py-2 px-2 font-medium">Clicks</th>
                  <th className="text-right py-2 px-2 font-medium">Impressions</th>
                  <th className="text-right py-2 px-2 font-medium">Leads</th>
                  <th className="text-right py-2 px-2 font-medium">Revenue</th>
                  <th className="text-right py-2 pl-2 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {timeSeriesData.map((row) => (
                  <tr key={row.label} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 text-gray-300 font-medium">
                      {timeView === 'monthly' ? row.label : new Date(row.label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="text-right py-2 px-2 text-white">{formatCurrency(row.spend)}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.clicks)}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.impressions)}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{formatNum(row.leads)}</td>
                    <td className="text-right py-2 px-2 text-green-400">{formatCurrency(row.revenue)}</td>
                    <td className={`text-right py-2 pl-2 font-bold ${roasColor(row.roas)}`}>{row.roas.toFixed(1)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Three-Level Drill-Down */}
      <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setDrillLevel('campaigns'); setSelectedCampaign(null); setSelectedAdSet(null); }}
            className={`text-sm font-medium transition-colors ${drillLevel === 'campaigns' ? 'text-brand-cyan' : 'text-gray-500 hover:text-white'}`}
          >
            Campaigns
          </button>
          {drillLevel !== 'campaigns' && (
            <>
              <span className="text-gray-600">/</span>
              <button
                onClick={() => { setDrillLevel('adsets'); setSelectedAdSet(null); }}
                className={`text-sm font-medium transition-colors truncate max-w-[200px] ${drillLevel === 'adsets' ? 'text-brand-cyan' : 'text-gray-500 hover:text-white'}`}
              >
                {selectedCampaign?.campaign_name}
              </button>
            </>
          )}
          {drillLevel === 'ads' && (
            <>
              <span className="text-gray-600">/</span>
              <span className="text-sm font-medium text-brand-cyan truncate max-w-[200px]">
                {selectedAdSet?.ad_set_name}
              </span>
            </>
          )}
          {drillLevel !== 'campaigns' && (
            <button onClick={goBack} className="ml-auto text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
          )}
        </div>

        {/* Campaign Level */}
        {drillLevel === 'campaigns' && (
          <SortableTable
            columns={performanceColumns('campaign_name', 'Campaign')}
            data={campaignStats}
            defaultSort={{ column: 'spend', ascending: false }}
            onRowClick={handleCampaignClick}
          />
        )}

        {/* Ad Set Level */}
        {drillLevel === 'adsets' && (
          <SortableTable
            columns={performanceColumns('ad_set_name', 'Ad Set')}
            data={adSetStats}
            defaultSort={{ column: 'spend', ascending: false }}
            onRowClick={handleAdSetClick}
          />
        )}

        {/* Ad Level */}
        {drillLevel === 'ads' && (
          <SortableTable
            columns={performanceColumns('ad_name', 'Ad')}
            data={adStats}
            defaultSort={{ column: 'spend', ascending: false }}
            onRowClick={handleAdClick}
          />
        )}

        {rangeAds.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">No ad data for this period.</p>
            <p className="text-xs mt-1">Sync SegMetrics data first: /api/segmetrics/sync?key=YOUR_CRON_SECRET</p>
          </div>
        )}
      </div>

      {/* Spend Efficiency Panel */}
      {campaignStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best Performers */}
          <div className="bg-[#1a1d20] rounded-xl border border-green-500/20 p-5">
            <h3 className="text-sm font-medium text-green-400 mb-4">Best Performers</h3>
            <div className="space-y-3">
              {bestWorst.best.map((c, i) => (
                <div key={c.campaign_id || i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                  <span className="text-lg font-bold text-green-400 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.campaign_name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(c.spend)} spent · {c.dealCount} deals</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${roasColor(c.realRoas)}`}>{c.realRoas.toFixed(1)}x ROAS</p>
                    <p className="text-xs text-green-400">{formatCurrency(c.realCash)} cash</p>
                  </div>
                </div>
              ))}
              {bestWorst.best.length === 0 && <p className="text-xs text-gray-500">No data yet</p>}
            </div>
          </div>

          {/* Worst Performers */}
          <div className="bg-[#1a1d20] rounded-xl border border-red-500/20 p-5">
            <h3 className="text-sm font-medium text-red-400 mb-4">Worst Performers</h3>
            <div className="space-y-3">
              {bestWorst.worst.map((c, i) => (
                <div key={c.campaign_id || i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                  <span className="text-lg font-bold text-red-400 w-6">{bestWorst.worst.length - i}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.campaign_name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(c.spend)} spent · {c.dealCount} deals</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${roasColor(c.realRoas)}`}>{c.realRoas.toFixed(1)}x ROAS</p>
                    <p className="text-xs text-red-400">{formatCurrency(c.realCash)} cash</p>
                  </div>
                </div>
              ))}
              {bestWorst.worst.length === 0 && <p className="text-xs text-gray-500">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Cash Attribution Detail */}
      {Object.keys(cashByCampaign).length > 0 && (
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Cash Attribution — Ad Spend to Deals</h3>
          <div className="space-y-4">
            {campaignStats.filter((c) => getDealCountForCampaign(c.campaign_name) > 0).map((campaign) => {
              const campaignDeals = getDealsForCampaign(campaign.campaign_name);
              return (
                <div key={campaign.campaign_id} className="border border-gray-800 rounded-lg overflow-hidden">
                  <div className="bg-brand-dark/60 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{campaign.campaign_name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(campaign.spend)} spent · {campaignDeals.length} deals · {formatCurrency(campaign.realCash)} cash</p>
                    </div>
                    <span className={`text-sm font-bold ${roasColor(campaign.realRoas)}`}>{campaign.realRoas.toFixed(1)}x</span>
                  </div>
                  <div className="divide-y divide-gray-800/50">
                    {campaignDeals.slice(0, 10).map((deal) => (
                      <div key={deal.id} className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-white/[0.02]">
                        <CloserAvatar closerId={deal.closer_id} size="sm" />
                        <span className="font-medium flex-1">{deal.client_name}</span>
                        <span className="text-gray-500">{deal.programme}</span>
                        <span className="text-brand-cyan font-semibold">{formatCurrency(deal.front_end)}</span>
                        {Number(deal.monthly_amount) > 0 && <span className="text-gray-500">{formatCurrency(deal.monthly_amount)}/mo</span>}
                        <span className="text-gray-600">{formatDate(deal.created_at)}</span>
                      </div>
                    ))}
                    {campaignDeals.length > 10 && (
                      <div className="px-4 py-2 text-xs text-gray-500">+ {campaignDeals.length - 10} more deals</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unattributed deals */}
          {unattributedDeals.length > 0 && (
            <div className="mt-4 border border-gray-800 rounded-lg overflow-hidden">
              <div className="bg-brand-dark/60 px-4 py-3">
                <p className="text-sm font-medium text-amber-400">Unattributed Deals</p>
                <p className="text-xs text-gray-500">{unattributedDeals.length} deals with no utm_campaign — {formatCurrency(unattributedDeals.reduce((s, d) => s + Number(d.front_end || 0), 0))} cash</p>
              </div>
              <div className="divide-y divide-gray-800/50 max-h-60 overflow-y-auto">
                {unattributedDeals.map((deal) => (
                  <div key={deal.id} className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-white/[0.02]">
                    <CloserAvatar closerId={deal.closer_id} size="sm" />
                    <span className="font-medium flex-1">{deal.client_name}</span>
                    <span className="text-brand-cyan font-semibold">{formatCurrency(deal.front_end)}</span>
                    <span className="text-gray-600">{formatDate(deal.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ad Detail SlideOver */}
      <SlideOver open={!!selectedAd} onClose={() => setSelectedAd(null)} title={selectedAd ? `Ad: ${selectedAd.ad_name}` : ''}>
        {selectedAd && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">Spend</p>
                <p className="text-sm font-semibold">{formatCurrency(selectedAd.spend)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">Clicks</p>
                <p className="text-sm font-semibold">{formatNum(selectedAd.clicks)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">Impressions</p>
                <p className="text-sm font-semibold">{formatNum(selectedAd.impressions)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">CTR</p>
                <p className="text-sm font-semibold">{formatPct(selectedAd.ctr)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">CPC</p>
                <p className="text-sm font-semibold">{formatCurrency(selectedAd.cpc)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">CPL</p>
                <p className="text-sm font-semibold">{formatCurrency(selectedAd.cpl)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">Real Cash</p>
                <p className="text-sm font-semibold text-green-400">{formatCurrency(selectedAd.realCash)}</p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3">
                <p className="text-xs text-gray-500">Real ROAS</p>
                <p className={`text-sm font-bold ${roasColor(selectedAd.realRoas)}`}>{selectedAd.realRoas.toFixed(1)}x</p>
              </div>
            </div>

            {/* Deals attributed to this campaign */}
            <div>
              <h4 className="text-xs text-gray-500 font-medium mb-2">Attributed Deals</h4>
              {getDealsForCampaign(selectedAd.campaign_name).length === 0 ? (
                <p className="text-xs text-gray-600 italic">No deals attributed to this campaign</p>
              ) : (
                <div className="space-y-1.5">
                  {getDealsForCampaign(selectedAd.campaign_name).map((deal) => (
                    <div key={deal.id} className="flex items-center justify-between bg-brand-dark rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CloserAvatar closerId={deal.closer_id} size="sm" />
                        <span className="text-sm font-medium">{deal.client_name}</span>
                      </div>
                      <span className="text-sm text-brand-cyan font-semibold">{formatCurrency(deal.front_end)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
