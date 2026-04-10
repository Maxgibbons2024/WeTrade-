import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import MetricCard from '../components/MetricCard';
import SortableTable from '../components/SortableTable';
import CloserAvatar from '../components/CloserAvatar';
import SlideOver from '../components/SlideOver';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import DateRangeFilter from '../components/DateRangeFilter';
import { useQuery, useRealtime, insertRow, updateRow } from '../hooks/useSupabase';
import { formatCurrency, formatDate, isInDateRange, CLOSERS, MENTORS, PACKAGES } from '../lib/constants';
import useDateRange from '../hooks/useDateRange';

const EMPTY_FORM = {
  client_name: '',
  email: '',
  mentor_name: '',
  session_count: 0,
  sessions_total: 10,
  last_session_date: '',
  trustpilot_review: false,
  no_show_count: 0,
  prop_firm_name: '',
  prop_funded_amount: '',
  community_notes: '',
};

export default function Community() {
  const [viewingStudent, setViewingStudent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [filterMentor, setFilterMentor] = useState('all');
  const [filterPackage, setFilterPackage] = useState('all');
  const { preset, setPreset, presets, dateRange, customStart, customEnd, setCustomStart, setCustomEnd } = useDateRange('all');

  const { data: allDeals, loading, error, refetch } = useQuery('deals', {
    order: { column: 'created_at', ascending: false },
  });

  const handleRealtime = useCallback(() => { refetch(); }, [refetch]);
  useRealtime('deals', handleRealtime);

  // Filter to community students: those with any community field populated
  const allStudents = useMemo(() =>
    (allDeals || []).filter((d) =>
      d.mentor_name || d.session_count > 0 || d.trustpilot_review ||
      d.prop_firm_name || d.community_notes || d.email
    ), [allDeals]);

  // Apply mentor, package, and date filters
  const students = useMemo(() =>
    allStudents.filter((s) => {
      if (filterMentor !== 'all' && (s.mentor_name || '').toLowerCase() !== filterMentor.toLowerCase()) return false;
      if (filterPackage === '10_sessions' && s.sessions_total !== 10) return false;
      if (filterPackage === 'pro_group' && s.sessions_total !== null) return false;
      if (dateRange.start && !isInDateRange(s.created_at, dateRange.start, dateRange.end)) return false;
      return true;
    }), [allStudents, filterMentor, filterPackage, dateRange]);

  // ---- Metrics ----
  const totalStudents = students.length;
  const trustpilotCount = useMemo(() => students.filter((s) => s.trustpilot_review).length, [students]);
  const propFundedCount = useMemo(() => students.filter((s) => s.prop_firm_name).length, [students]);
  const totalFunding = useMemo(() => students.reduce((sum, s) => sum + Number(s.prop_funded_amount || 0), 0), [students]);
  const totalNoShows = useMemo(() => students.reduce((sum, s) => sum + Number(s.no_show_count || 0), 0), [students]);

  // ---- Leaderboards ----
  const trustpilotStudents = useMemo(() =>
    students.filter((s) => s.trustpilot_review), [students]);

  const fundedByCloser = useMemo(() => {
    const map = {};
    students.filter((s) => s.prop_firm_name).forEach((s) => {
      const key = s.closer_id || 'unknown';
      if (!map[key]) map[key] = { name: s.closer_name || 'Unknown', count: 0 };
      map[key].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [students]);

  const fundingByFirm = useMemo(() => {
    const map = {};
    students.filter((s) => s.prop_firm_name).forEach((s) => {
      map[s.prop_firm_name] = (map[s.prop_firm_name] || 0) + Number(s.prop_funded_amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [students]);

  // ---- Form handlers ----
  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function handleEditStudent(student) {
    setEditingStudent(student);
    setForm({
      client_name: student.client_name || '',
      email: student.email || '',
      mentor_name: student.mentor_name || '',
      session_count: student.session_count || 0,
      sessions_total: student.sessions_total ?? '',
      last_session_date: student.last_session_date || '',
      trustpilot_review: student.trustpilot_review || false,
      no_show_count: student.no_show_count || 0,
      prop_firm_name: student.prop_firm_name || '',
      prop_funded_amount: student.prop_funded_amount ?? '',
      community_notes: student.community_notes || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.client_name.trim()) {
      toast.error('Student name is required');
      return;
    }
    setSubmitting(true);
    try {
      const communityFields = {
        email: form.email || null,
        mentor_name: form.mentor_name || null,
        session_count: Number(form.session_count) || 0,
        sessions_total: form.sessions_total === '' || form.sessions_total === null ? null : Number(form.sessions_total),
        last_session_date: form.last_session_date || null,
        trustpilot_review: form.trustpilot_review || false,
        no_show_count: Number(form.no_show_count) || 0,
        prop_firm_name: form.prop_firm_name || null,
        prop_funded_amount: form.prop_funded_amount ? Number(form.prop_funded_amount) : null,
        community_notes: form.community_notes || null,
      };

      if (editingStudent) {
        await updateRow('deals', editingStudent.id, communityFields);
        toast.success(`Updated ${form.client_name}`);
      } else {
        await insertRow('deals', {
          ...communityFields,
          client_name: form.client_name,
          closer_id: 'lloyd',
          closer_name: 'Lloyd',
          front_end: 0,
          monthly_amount: 0,
          programme: 'Kickstarter',
          source: 'manual',
          status: 'active',
        });
        toast.success(`Added ${form.client_name}`);
      }
      setForm(EMPTY_FORM);
      setEditingStudent(null);
      setShowForm(false);
      refetch();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Table columns ----
  const columns = [
    {
      key: 'client_name',
      label: 'Student',
      render: (val) => <span className="font-medium">{val}</span>,
    },
    {
      key: 'sessions_total',
      label: 'Package',
      render: (val) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${val ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
          {val ? '10 Sessions' : 'Pro Group'}
        </span>
      ),
    },
    {
      key: 'session_count',
      label: 'Sessions',
      render: (val, row) => (
        <span className="text-sm">
          {val || 0} / {row.sessions_total ? row.sessions_total : <span className="text-purple-400">&infin;</span>}
        </span>
      ),
    },
    {
      key: 'last_session_date',
      label: 'Last Session',
      render: (val) => <span className="text-xs">{formatDate(val)}</span>,
    },
    {
      key: 'closer_id',
      label: 'Closer',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <CloserAvatar closerId={val} size="sm" />
          <span className="text-sm">{row.closer_name}</span>
        </div>
      ),
    },
    {
      key: 'mentor_name',
      label: 'Mentor',
      render: (val) => val || <span className="text-gray-600">&mdash;</span>,
    },
    {
      key: 'trustpilot_review',
      label: 'Trustpilot',
      render: (val) => val ? (
        <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : <span className="text-gray-600">&mdash;</span>,
    },
    {
      key: 'no_show_count',
      label: 'No Shows',
      render: (val) => val > 0 ? <span className="text-red-400 font-medium">{val}</span> : <span className="text-gray-600">0</span>,
    },
    {
      key: 'prop_firm_name',
      label: 'Prop Firm',
      render: (val) => val || <span className="text-gray-600">&mdash;</span>,
    },
    {
      key: 'prop_funded_amount',
      label: 'Funded',
      render: (val) => val ? <span className="text-brand-cyan font-semibold">{formatCurrency(val)}</span> : <span className="text-gray-600">&mdash;</span>,
    },
    {
      key: 'community_notes',
      label: 'Notes',
      render: (val) => val ? <span className="text-xs text-gray-400 truncate max-w-[120px] block">{val}</span> : <span className="text-gray-600">&mdash;</span>,
    },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Community</h2>
        <button
          onClick={() => { setEditingStudent(null); setForm(EMPTY_FORM); setShowForm(true); }}
          className="bg-brand-cyan text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-mid transition-colors"
        >
          + Add Student
        </button>
      </div>

      {/* Date range */}
      <DateRangeFilter
        preset={preset}
        setPreset={setPreset}
        presets={presets}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterMentor}
          onChange={(e) => setFilterMentor(e.target.value)}
          className="bg-[#1a1d20] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Mentors</option>
          {MENTORS.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <select
          value={filterPackage}
          onChange={(e) => setFilterPackage(e.target.value)}
          className="bg-[#1a1d20] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
        >
          <option value="all">All Packages</option>
          <option value="10_sessions">10 Sessions</option>
          <option value="pro_group">Pro Group</option>
        </select>
        {(filterMentor !== 'all' || filterPackage !== 'all') && (
          <button
            onClick={() => { setFilterMentor('all'); setFilterPackage('all'); }}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{students.length} student{students.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard title="Total Students" value={totalStudents} accent />
        <MetricCard title="Trustpilot Reviews" value={trustpilotCount} subtitle={totalStudents > 0 ? `${Math.round((trustpilotCount / totalStudents) * 100)}% of students` : ''} />
        <MetricCard title="Prop Funded" value={propFundedCount} subtitle={totalStudents > 0 ? `${Math.round((propFundedCount / totalStudents) * 100)}% of students` : ''} />
        <MetricCard title="Total Funding" value={formatCurrency(totalFunding)} accent />
        <MetricCard title="Total No Shows" value={totalNoShows} danger={totalNoShows > 0} />
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trustpilot Reviews */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Trustpilot Reviews</h3>
          {trustpilotStudents.length === 0 ? (
            <p className="text-xs text-gray-600">No reviews yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {trustpilotStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]">
                  <svg className="w-4 h-4 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.client_name}</p>
                    <p className="text-[10px] text-gray-500">{s.mentor_name || 'No mentor'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prop Funded by Closer */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Prop Funded by Closer</h3>
          {fundedByCloser.length === 0 ? (
            <p className="text-xs text-gray-600">No funded students yet</p>
          ) : (
            <div className="space-y-3">
              {fundedByCloser.map(([closerId, { name, count }], i) => (
                <div key={closerId} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                  <span className={`text-lg font-bold w-6 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>{i + 1}</span>
                  <CloserAvatar closerId={closerId} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-cyan">{count}</p>
                    <p className="text-[10px] text-gray-500">funded</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funding by Prop Firm */}
        <div className="bg-[#1a1d20] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Funding by Prop Firm</h3>
          {fundingByFirm.length === 0 ? (
            <p className="text-xs text-gray-600">No funding data yet</p>
          ) : (
            <div className="space-y-3">
              {fundingByFirm.map(([firm, amount], i) => (
                <div key={firm} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                  <span className={`text-lg font-bold w-6 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{firm}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-cyan">{formatCurrency(amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student table */}
      <SortableTable
        columns={columns}
        data={students}
        onRowClick={(row) => setViewingStudent(row)}
      />

      {/* Detail SlideOver */}
      <SlideOver open={!!viewingStudent} onClose={() => setViewingStudent(null)} title={viewingStudent ? viewingStudent.client_name : ''}>
        {viewingStudent && (() => {
          const s = viewingStudent;
          const isPP = Number(s.monthly_amount) > 0;
          return (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CloserAvatar closerId={s.closer_id} size="lg" />
                  <div>
                    <p className="text-sm text-gray-400">{s.closer_name}</p>
                    <p className="text-xs text-gray-600">{s.programme}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setViewingStudent(null); handleEditStudent(s); }}
                  className="bg-white/5 text-gray-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:text-white transition-colors border border-gray-800"
                >
                  Edit Community Info
                </button>
              </div>

              {/* Deal info (read-only) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Front End</p>
                  <p className="text-sm font-semibold text-brand-cyan">{formatCurrency(s.front_end)}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-sm font-semibold">{isPP ? <span className="text-amber-400">Payment Plan</span> : <span className="text-green-400">Paid in Full</span>}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Package</p>
                  <p className="text-sm font-semibold">{s.sessions_total ? <span className="text-blue-400">10 Sessions</span> : <span className="text-purple-400">Pro Group</span>}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <StatusBadge status={s.status} />
                </div>
              </div>

              {/* Community fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Mentor</p>
                  <p className="text-sm font-semibold">{s.mentor_name || <span className="text-gray-600">Not assigned</span>}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium truncate">{s.email || <span className="text-gray-600">Not set</span>}</p>
                </div>
              </div>

              {/* Session progress */}
              <div className="bg-brand-dark rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs text-gray-500 font-medium">Session Progress</h4>
                  <span className="text-sm font-bold">{s.session_count || 0} / {s.sessions_total ? s.sessions_total : <span className="text-purple-400">&infin;</span>}</span>
                </div>
                {s.sessions_total && (
                  <div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-cyan rounded-full transition-all" style={{ width: `${Math.min(100, ((s.session_count || 0) / s.sessions_total) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">{Math.round(((s.session_count || 0) / s.sessions_total) * 100)}% complete</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Last Session</p>
                    <p className="text-sm font-medium">{formatDate(s.last_session_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">No Shows</p>
                    <p className={`text-sm font-medium ${s.no_show_count > 0 ? 'text-red-400' : ''}`}>{s.no_show_count || 0}</p>
                  </div>
                </div>
              </div>

              {/* Trustpilot & Prop */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Trustpilot Review</p>
                  <p className="text-sm font-semibold">{s.trustpilot_review ? <span className="text-green-400">Yes</span> : <span className="text-gray-600">No</span>}</p>
                </div>
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Prop Funded</p>
                  <p className="text-sm font-semibold">{s.prop_firm_name ? <span className="text-brand-cyan">{s.prop_firm_name}</span> : <span className="text-gray-600">No</span>}</p>
                </div>
              </div>
              {s.prop_funded_amount && (
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Funded Amount</p>
                  <p className="text-sm font-bold text-brand-cyan">{formatCurrency(s.prop_funded_amount)}</p>
                </div>
              )}

              {/* Notes */}
              {s.community_notes && (
                <div className="bg-brand-dark rounded-lg p-3">
                  <p className="text-xs text-gray-500">Notes</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{s.community_notes}</p>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>

      {/* Add/Edit Form SlideOver */}
      <SlideOver open={showForm} onClose={() => { setShowForm(false); setEditingStudent(null); }} title={editingStudent ? `Edit: ${editingStudent.client_name}` : 'Add Student'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingStudent && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Student Name *</label>
              <input
                name="client_name"
                value={form.client_name}
                onChange={handleFormChange}
                required
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleFormChange}
              placeholder="student@email.com"
              className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mentor</label>
              <select name="mentor_name" value={form.mentor_name} onChange={handleFormChange} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                <option value="">Select mentor</option>
                {MENTORS.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Package</label>
              <select name="sessions_total" value={form.sessions_total === null || form.sessions_total === '' ? '' : form.sessions_total} onChange={(e) => setForm((prev) => ({ ...prev, sessions_total: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan">
                {PACKAGES.map((p) => <option key={p.id} value={p.sessionsTotal ?? ''}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sessions Completed</label>
              <input
                name="session_count"
                type="number"
                min="0"
                value={form.session_count}
                onChange={handleFormChange}
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last Session Date</label>
              <input
                name="last_session_date"
                type="date"
                value={form.last_session_date}
                onChange={handleFormChange}
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">No Shows</label>
              <input
                name="no_show_count"
                type="number"
                min="0"
                value={form.no_show_count}
                onChange={handleFormChange}
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                name="trustpilot_review"
                type="checkbox"
                checked={form.trustpilot_review}
                onChange={handleFormChange}
                className="w-4 h-4 rounded border-gray-700 bg-brand-dark text-brand-cyan focus:ring-brand-cyan"
              />
              <label className="text-sm text-gray-400">Trustpilot Review</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prop Firm</label>
              <input
                name="prop_firm_name"
                value={form.prop_firm_name}
                onChange={handleFormChange}
                placeholder="e.g. FTMO, MyForexFunds"
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Funded Amount (£)</label>
              <input
                name="prop_funded_amount"
                type="number"
                min="0"
                value={form.prop_funded_amount}
                onChange={handleFormChange}
                className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              name="community_notes"
              value={form.community_notes}
              onChange={handleFormChange}
              rows={3}
              className="w-full bg-brand-dark border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-cyan text-white py-2.5 rounded-lg font-medium hover:bg-brand-mid transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : editingStudent ? 'Update Student' : 'Add Student'}
          </button>
        </form>
      </SlideOver>
    </div>
  );
}
