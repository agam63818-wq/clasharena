// src/pages/AdminView.jsx
// Admin dashboard: stats, tournament CRUD, registered players.
// Lazy-loaded from App.jsx so admin code is not in every player's bundle.
//
// Security notes preserved from the API phase:
//   - create/update go through Supabase with the user's session (RLS must
//     enforce admin writes; enforced server-side in the DB phase)
//   - delete/cancel/getTournament go through /api/* serverless routes
//     (server-side admin check from the Bearer token)
//
// Room-credential guard (P0-3): when VITE_FEATURE_ROOM_RPC is on, list
// queries never fetch room_id/room_password. The edit form therefore loads
// the FULL row via api.getTournament (/api/admin) before rendering — saving
// from a list row would write null over the stored credentials. Room fields
// are only sent as null when the admin actually cleared the input.

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Plus, Edit, Trash2, Search, ArrowLeft,
  Users, Calendar, Trophy, Loader, AlertCircle, CheckCircle2, Ban
} from 'lucide-react';
import supabase from '../lib/supabaseClient';
import { api } from '../lib/apiClient';
import { features } from '../config/features';
import { formatINR, formatDateTime } from '../lib/format';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import ErrorRetry from '../components/ErrorRetry';

const EMPTY_FORM = {
  name: '', prize: '', entry_fee: '', mode: 'Solo', status: 'registration',
  max_players: 100, match_time: '', room_id: '', room_password: '', image_url: '', rules: ''
};

// Editable statuses mirror STATUS_TRANSITIONS in api/_lib/validate.js: any
// change among these four is allowed (admins must be able to fix mistakes).
// 'cancelled' is only reachable through the Cancel action, never by saving.
const EDITABLE_STATUSES = ['registration', 'upcoming', 'live', 'completed'];

// Defensive numeric parsing (prize used to be `money` and could come back
// formatted like "$10.00"; it is numeric now, but old copies of a row may
// still carry formatting). Strips everything except digits and the dot.
function parseAmount(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const pad2 = (n) => String(n).padStart(2, '0');

// ISO timestamp -> local "YYYY-MM-DDTHH:mm" (the value the payload builder
// feeds to `new Date(...)` before .toISOString(), same contract as the old
// datetime-local input).
function toLocalInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function timezoneLabel() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin < 0 ? '-' : '+';
    const abs = Math.abs(offsetMin);
    return `${tz} (UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)})`;
  } catch {
    return 'Local time';
  }
}
const TIMEZONE_LABEL = timezoneLabel();

// Splits a saved time into AM/PM picker parts. Accepts a local
// "YYYY-MM-DDTHH:mm" string or a full ISO timestamp.
function splitTimeParts(value) {
  const empty = { date: '', hour: '', minute: '', ampm: '' };
  if (!value) return empty;
  let d;
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (local) {
    d = new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]));
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return empty;
  const h24 = d.getHours();
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    hour: String(h24 % 12 === 0 ? 12 : h24 % 12),
    minute: pad2(d.getMinutes()),
    ampm: h24 < 12 ? 'AM' : 'PM'
  };
}

// Date + 12-hour time picker. Emits the same local "YYYY-MM-DDTHH:mm" value
// the old datetime-local input produced (empty until all four parts are set).
function DateTimeAmPm({ value, onChange }) {
  const [parts, setParts] = useState(() => splitTimeParts(value));
  const lastEmitted = useRef(value);

  // Re-sync only when the value changed OUTSIDE this component (e.g. a fresh
  // tournament was loaded into the form) — otherwise clearing one part would
  // wipe the parts the admin has already picked.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setParts(splitTimeParts(value));
    }
  }, [value]);

  const emit = (next) => {
    const { date, hour, minute, ampm } = next;
    let nextValue = '';
    if (date && hour && minute && ampm) {
      const h24 = (Number(hour) % 12) + (ampm === 'PM' ? 12 : 0);
      nextValue = `${date}T${pad2(h24)}:${minute}`;
    }
    lastEmitted.current = nextValue;
    setParts(next);
    onChange(nextValue);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) => pad2(i));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 'var(--space-2)' }}>
        <input
          id="tf-time-date"
          className="input"
          type="date"
          aria-label="Match date"
          value={parts.date}
          onChange={e => emit({ ...parts, date: e.target.value })}
        />
        <select
          id="tf-time-hour"
          className="input"
          aria-label="Hour (12-hour clock)"
          value={parts.hour}
          onChange={e => emit({ ...parts, hour: e.target.value })}
        >
          <option value="">Hour</option>
          {hours.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select
          id="tf-time-minute"
          className="input"
          aria-label="Minute"
          value={parts.minute}
          onChange={e => emit({ ...parts, minute: e.target.value })}
        >
          <option value="">Min</option>
          {minutes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          id="tf-time-ampm"
          className="input"
          aria-label="AM or PM"
          value={parts.ampm}
          onChange={e => emit({ ...parts, ampm: e.target.value })}
        >
          <option value="">AM/PM</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <p className="field-hint">Timezone: {TIMEZONE_LABEL}</p>
    </div>
  );
}

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const field = (label, id, input) => (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {input}
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} noValidate>
      {field('Tournament name *', 'tf-name',
        <input id="tf-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Prize (INR) *', 'tf-prize',
          <input id="tf-prize" className="input" type="text" inputMode="decimal" value={form.prize} onChange={e => set('prize', e.target.value)} required />
        )}
        {field('Entry fee (INR) *', 'tf-fee',
          <input id="tf-fee" className="input" type="text" inputMode="decimal" value={form.entry_fee} onChange={e => set('entry_fee', e.target.value)} required />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Mode', 'tf-mode',
          <select id="tf-mode" className="input" value={form.mode} onChange={e => { set('mode', e.target.value); if (e.target.value === '1v1') set('max_players', 2); }}>
            <option>Solo</option><option>Duo</option><option>Squad</option><option value="1v1">1v1</option>
          </select>
        )}
        {field('Status', 'tf-status',
          <select id="tf-status" className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            {EDITABLE_STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
            {/* Already-cancelled tournaments display their status but it is
                not re-selectable: 'cancelled' is only set by the Cancel action. */}
            {form.status === 'cancelled' && <option value="cancelled">Cancelled</option>}
          </select>
        )}
      </div>
      {field('Max players', 'tf-max',
        <input id="tf-max" className="input" type="number" min="2" step="1" value={form.max_players} onChange={e => set('max_players', e.target.value)} disabled={form.mode === '1v1'} />
      )}
      {field('Match time *', 'tf-time',
        <DateTimeAmPm value={form.match_time} onChange={v => set('match_time', v)} />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Room ID', 'tf-room-id',
          <input id="tf-room-id" className="input" value={form.room_id} onChange={e => set('room_id', e.target.value)} autoComplete="off" placeholder="Leave empty to clear" />
        )}
        {field('Room password', 'tf-room-pw',
          <input id="tf-room-pw" className="input" value={form.room_password} onChange={e => set('room_password', e.target.value)} autoComplete="new-password" placeholder="Leave empty to clear" />
        )}
      </div>
      {field('Banner image URL', 'tf-image',
        <input id="tf-image" className="input" type="url" value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="Leave empty to clear" />
      )}
      {field('Rules', 'tf-rules',
        <textarea id="tf-rules" className="input" rows="4" value={form.rules} onChange={e => set('rules', e.target.value)} />
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
          {saving ? <Loader size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save Tournament'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
      </div>
    </form>
  );
}

// Saved tournament row -> form values. Every field the form edits is
// populated here; prize/entry fee go through the defensive parser.
function buildFormFromTournament(t) {
  return {
    id: t.id,
    name: t.name || '',
    prize: String(t.prize ?? '').replace(/[^0-9.]/g, ''),
    entry_fee: String(t.entry_fee ?? '').replace(/[^0-9.]/g, ''),
    mode: t.mode || 'Solo',
    status: EDITABLE_STATUSES.includes(t.status) || t.status === 'cancelled' ? t.status : 'registration',
    max_players: t.max_players ?? 100,
    match_time: toLocalInputValue(t.match_time),
    room_id: t.room_id || '',
    room_password: t.room_password || '',
    image_url: t.image_url || '',
    rules: t.rules || ''
  };
}

export default function AdminView({ isAdmin, tournaments, setTournaments, refreshList }) {
  const [view, setView] = useState('dashboard');
  const [editData, setEditData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [registrationsByTournament, setRegistrationsByTournament] = useState({});
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [registrationsError, setRegistrationsError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // { id, name, reason? }
  const [cancelling, setCancelling] = useState(false);
  const formFeedbackRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    setRegistrationsLoading(true);
    setRegistrationsError('');
    supabase
      .from('match_registrations')
      .select('id, tournament_id, ff_uid, ign, profiles(username)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('registrations query failed:', error.message);
          setRegistrationsError('Could not load registered players.');
          setRegistrationsLoading(false);
          return;
        }
        const grouped = (data || []).reduce((acc, row) => {
          if (!acc[row.tournament_id]) acc[row.tournament_id] = [];
          acc[row.tournament_id].push(row);
          return acc;
        }, {});
        setRegistrationsByTournament(grouped);
        setRegistrationsLoading(false);
      });
  }, [isAdmin]);

  // Success/error messages on the create/edit form render at the TOP of the
  // form and are scrolled into view so they are never missed.
  useEffect(() => {
    if ((view === 'create' || view === 'edit') && feedback.message && formFeedbackRef.current) {
      formFeedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [feedback, view]);

  if (!isAdmin) {
    return (
      <div className="empty" style={{ minHeight: '50vh' }}>
        <span className="empty-icon"><Shield size={28} aria-hidden="true" /></span>
        <p className="empty-title">Access denied</p>
        <p className="empty-hint">You do not have admin privileges.</p>
      </div>
    );
  }

  const showFeedback = (type, message, { sticky = false } = {}) => {
    setFeedback({ type, message });
    if (type === 'success' && !sticky) setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  const feedbackBlock = (
    <div ref={formFeedbackRef}>
      {feedback.message && (
        <div className={`feedback ${feedback.type === 'success' ? 'feedback--success' : 'feedback--error'}`} role={feedback.type === 'success' ? 'status' : 'alert'}>
          {feedback.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
          {feedback.message}
        </div>
      )}
    </div>
  );

  const validateForm = (form) => {
    if (!form.name.trim()) return 'Tournament name is required.';
    if (!(parseAmount(form.prize) > 0)) return 'Prize must be a positive number.';
    if (parseAmount(form.entry_fee) < 0) return 'Entry fee cannot be negative.';
    if (!(parseInt(form.max_players, 10) >= 2)) return 'Max players must be at least 2.';
    if (!form.match_time) return 'Match time is required (date, hour, minute and AM/PM).';
    if (Number.isNaN(new Date(form.match_time).getTime())) return 'Invalid match time.';
    return '';
  };

  const buildPayload = (form) => ({
    name: form.name.trim(),
    mode: form.mode,
    status: form.status,
    prize: parseAmount(form.prize),
    entry_fee: parseAmount(form.entry_fee),
    max_players: parseInt(form.max_players, 10) || 0,
    match_time: new Date(form.match_time).toISOString(),
    // Empty input clears the stored value (null); a loaded row keeps its
    // credentials unless the admin actually cleared the field.
    room_id: form.room_id.trim() || null,
    room_password: form.room_password.trim() || null,
    image_url: form.image_url.trim() || null,
    rules: form.rules.trim() || null
  });

  const handleCreate = async (form) => {
    const validationError = validateForm(form);
    if (validationError) return showFeedback('error', validationError);

    setSaving(true);
    const { data, error } = await supabase
      .from('tournaments')
      .insert([buildPayload(form)])
      .select();

    setSaving(false);

    if (error) return showFeedback('error', 'Could not create the tournament. ' + (error.message || ''));

    setTournaments([data[0], ...tournaments]);
    setView('dashboard');
    showFeedback('success', `"${form.name.trim()}" created.`);
    refreshList();
  };

  const handleUpdate = async (form) => {
    const validationError = validateForm(form);
    if (validationError) return showFeedback('error', validationError);

    setSaving(true);
    const payload = buildPayload(form);
    const { error } = await supabase.from('tournaments').update(payload).eq('id', editData.id);
    setSaving(false);

    if (error) return showFeedback('error', 'Could not update the tournament. ' + (error.message || ''));

    // Merge into the local list. Room columns are only merged when the list
    // query actually fetches them — with the room RPC flag on, the list row
    // has no room fields and must not gain null ones.
    setTournaments(tournaments.map(t => t.id === editData.id ? {
      ...t,
      name: payload.name,
      mode: payload.mode,
      status: payload.status,
      prize: payload.prize,
      entry_fee: payload.entry_fee,
      max_players: payload.max_players,
      match_time: payload.match_time,
      image_url: payload.image_url,
      rules: payload.rules,
      ...(features.roomDetailsRpc ? {} : { room_id: payload.room_id, room_password: payload.room_password })
    } : t));
    showFeedback('success', `"${payload.name}" updated.`, { sticky: true });
    refreshList();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      // Server checks admin role from the token; refuses tournaments that
      // still have registered players (409) — refunds flow comes later.
      await api.deleteTournament({ tournamentId: confirmDelete.id });
      setTournaments(tournaments.filter(t => t.id !== confirmDelete.id));
      showFeedback('success', `"${confirmDelete.name}" deleted.`);
      refreshList();
      setConfirmDelete(null);
    } catch (err) {
      // Show the exact server reason in the dialog and offer the Cancel
      // action instead (hard delete is impossible with players registered).
      setDeleteError(err?.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelTournament = async () => {
    if (!confirmCancel) return;
    setCancelling(true);
    try {
      // Server sets status='cancelled' after an admin role check; this is
      // the only path to 'cancelled' (never a plain edit-save).
      await api.cancelTournament({ tournamentId: confirmCancel.id });
      setTournaments(tournaments.map(t => t.id === confirmCancel.id ? { ...t, status: 'cancelled' } : t));
      showFeedback('success', `"${confirmCancel.name}" cancelled.`);
      refreshList();
      setConfirmCancel(null);
    } catch (err) {
      showFeedback('error', err?.message || 'Cancel failed.');
      setConfirmCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  const openEdit = async (t) => {
    setEditData(null);
    setEditLoading(true);
    setView('edit');
    try {
      // Load the FULL row (including room credentials) from the admin API —
      // list rows omit room columns when the room RPC flag is on, and saving
      // from such a row would wipe the stored credentials with nulls.
      const { tournament } = await api.getTournament({ tournamentId: t.id });
      setEditData(buildFormFromTournament(tournament));
    } catch (err) {
      showFeedback('error', 'Could not load the tournament for editing. ' + (err?.message || ''));
      setView('list');
    } finally {
      setEditLoading(false);
    }
  };

  const stats = {
    total: tournaments.length,
    live: tournaments.filter(t => t.status === 'live').length,
    upcoming: tournaments.filter(t => t.status === 'upcoming').length,
    registration: tournaments.filter(t => t.status === 'registration').length
  };

  const filtered = tournaments.filter(t => (t.name || '').toLowerCase().includes(search.toLowerCase()));

  // -------------------------
  // CREATE / EDIT VIEWS
  // -------------------------
  if (view === 'create' || view === 'edit') {
    return (
      <div className="view">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <button type="button" className="btn btn-ghost btn--sm" onClick={() => setView(view === 'create' ? 'dashboard' : 'list')}>
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)' }}>
            {view === 'create' ? 'Create Tournament' : 'Edit Tournament'}
          </h2>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)' }}>
          {feedbackBlock}
          {view === 'edit' && editLoading ? (
            <div role="status" aria-label="Loading tournament" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader size={20} className="spin" aria-hidden="true" style={{ marginRight: 8 }} />
              Loading saved tournament…
            </div>
          ) : (
            <TournamentForm
              key={view === 'edit' ? (editData?.id || 'edit') : 'create'}
              initial={view === 'edit' ? editData : EMPTY_FORM}
              onSave={view === 'create' ? handleCreate : handleUpdate}
              onCancel={() => { setView(view === 'create' ? 'dashboard' : 'list'); setEditData(null); }}
              saving={saving}
            />
          )}
        </div>
      </div>
    );
  }

  // -------------------------
  // MANAGE LIST VIEW
  // -------------------------
  if (view === 'list') {
    return (
      <div className="view">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <button type="button" className="btn btn-ghost btn--sm" onClick={() => setView('dashboard')}>
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)' }}>Manage Tournaments</h2>
        </div>

        <div aria-live="polite">
          {feedback.message && (
            <div className={`feedback ${feedback.type === 'success' ? 'feedback--success' : 'feedback--error'}`} role={feedback.type === 'success' ? 'status' : 'alert'}>
              {feedback.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
              {feedback.message}
            </div>
          )}
        </div>

        <div className="field" style={{ marginBottom: 'var(--space-5)' }}>
          <label className="field-label" htmlFor="admin-search">Search tournaments</label>
          <input
            id="admin-search"
            className="input"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-5)', color: 'var(--text-muted)' }}>
            No tournaments found{search ? ` for “${search}”` : ''}.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {filtered.map(t => {
              const registrations = registrationsByTournament[t.id] || [];
              const count = registrations.length;

              return (
                <motion.article
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-extrabold)', marginBottom: 'var(--space-2)' }}>{t.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <StatusBadge tournament={t} />
                        <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={14} aria-hidden="true" /> {count}/{t.max_players}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => openEdit(t)}
                        aria-label={`Edit ${t.name}`}
                      >
                        <Edit size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => setConfirmCancel({ id: t.id, name: t.name })}
                        aria-label={`Cancel ${t.name}`}
                        disabled={t.status === 'cancelled'}
                        title={t.status === 'cancelled' ? 'Already cancelled' : 'Cancel this tournament'}
                      >
                        <Ban size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn--sm"
                        onClick={() => { setDeleteError(''); setConfirmDelete({ id: t.id, name: t.name }); }}
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-inset)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                      <Trophy size={14} color="var(--gold)" aria-hidden="true" /> Prize: <strong style={{ color: 'var(--text-primary)' }}>{formatINR(t.prize)}</strong>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-inset)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                      Entry: <strong style={{ color: 'var(--text-primary)' }}>{formatINR(t.entry_fee)}</strong>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-inset)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', width: '100%' }}>
                      <Calendar size={14} color="var(--info-text)" aria-hidden="true" /> {formatDateTime(t.match_time)}
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', border: '1px solid var(--border-subtle)' }}>
                    <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Registered players ({count})
                    </h4>
                    {registrationsError ? (
                      <ErrorRetry message={registrationsError} onRetry={() => window.location.reload()} />
                    ) : registrationsLoading ? (
                      <div role="status" aria-label="Loading players">
                        <span className="skeleton" style={{ display: 'block', height: 44, borderRadius: 'var(--radius-sm)' }} />
                      </div>
                    ) : count === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', fontStyle: 'italic' }}>No players have joined this match yet.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 200, overflowY: 'auto' }}>
                        {registrations.map(player => (
                          <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)' }}>
                                {player.profiles?.username || 'Unknown'}
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>IGN: {player.ign || 'N/A'}</div>
                            </div>
                            <code style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)', background: 'var(--bg-inset)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                              UID: {player.ff_uid || 'N/A'}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // -------------------------
  // MAIN DASHBOARD VIEW
  // -------------------------
  return (
    <div className="view">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Shield size={26} color="var(--accent-text)" aria-hidden="true" />
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-black)' }}>Admin Control</h2>
      </motion.div>

      <div aria-live="polite">
        {feedback.message && (
          <div className={`feedback ${feedback.type === 'success' ? 'feedback--success' : 'feedback--error'}`} role={feedback.type === 'success' ? 'status' : 'alert'}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
            {feedback.message}
          </div>
        )}
      </div>

      <section aria-label="Tournament stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-7)' }}>
        {[
          { value: stats.total, label: 'Total matches', color: 'var(--text-primary)' },
          { value: stats.live, label: 'Live now', color: 'var(--success-text)' },
          { value: stats.upcoming, label: 'Upcoming', color: 'var(--info-text)' },
          { value: stats.registration, label: 'Open for entry', color: 'var(--warning-text)' }
        ].map(item => (
          <div key={item.label} className="stat-card">
            <div>
              <span className="stat-value" style={{ color: item.color }}>{item.value}</span>
              <span className="stat-label">{item.label}</span>
            </div>
          </div>
        ))}
      </section>

      <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <button type="button" className="btn btn-primary" onClick={() => setView('create')} style={{ padding: 'var(--space-4)', fontSize: 'var(--text-xl)' }}>
          <Plus size={20} aria-hidden="true" /> Create New Tournament
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setView('list')} style={{ padding: 'var(--space-4)', fontSize: 'var(--text-xl)' }}>
          <Edit size={18} aria-hidden="true" /> Manage Existing List
        </button>
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => { if (!deleting) { setConfirmDelete(null); setDeleteError(''); } }}
        title="Delete tournament?"
        labelledBy="delete-confirm-title"
      >
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
          {confirmDelete?.name ? `“${confirmDelete.name}” will be permanently deleted.` : ''}
        </p>
        {deleteError ? (
          <div className="feedback feedback--error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <AlertCircle size={16} aria-hidden="true" />
            {deleteError}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-5)' }}>
            Tournaments with registered players cannot be deleted until the cancellation-with-refunds flow is available.
          </p>
        )}
        <div className="modal-actions">
          {deleteError ? (
            <>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const d = confirmDelete;
                  setConfirmDelete(null);
                  setConfirmCancel({ id: d.id, name: d.name, reason: deleteError });
                  setDeleteError('');
                }}
              >
                <Ban size={16} aria-hidden="true" /> Cancel tournament instead
              </button>
              <button type="button" className="btn btn-outline" onClick={() => { setConfirmDelete(null); setDeleteError(''); }}>
                Close
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => { setConfirmDelete(null); setDeleteError(''); }} disabled={deleting}>
                Cancel
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!confirmCancel}
        onClose={() => !cancelling && setConfirmCancel(null)}
        title="Cancel tournament?"
        labelledBy="cancel-confirm-title"
      >
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
          {confirmCancel?.name ? `“${confirmCancel.name}” will be marked as cancelled.` : ''}
        </p>
        {confirmCancel?.reason && (
          <p style={{ color: 'var(--warning-text)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
            Deletion was refused: {confirmCancel.reason}
          </p>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          Registered players keep their entries — refunds are not available yet.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={handleCancelTournament} disabled={cancelling}>
            {cancelling ? <Loader size={16} className="spin" aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}
            {cancelling ? 'Cancelling…' : 'Cancel tournament'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(null)} disabled={cancelling}>
            Keep tournament
          </button>
        </div>
      </Modal>
    </div>
  );
}
