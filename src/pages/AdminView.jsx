// src/pages/AdminView.jsx
// Admin dashboard: stats, tournament CRUD, registered players.
// Lazy-loaded from App.jsx so admin code is not in every player's bundle.
//
// Security notes preserved from the API phase:
//   - create/update go through Supabase with the user's session (RLS must
//     enforce admin writes; enforced server-side in the DB phase)
//   - delete goes through /api/deleteTournament (server-side admin check);
//     tournaments with registrations are refused by the API (409)

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Plus, Edit, Trash2, Search, ArrowLeft,
  Users, Calendar, Trophy, Loader, AlertCircle, CheckCircle2
} from 'lucide-react';
import supabase from '../lib/supabaseClient';
import { api } from '../lib/apiClient';
import { formatINR, formatDateTime } from '../lib/format';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import ErrorRetry from '../components/ErrorRetry';

const EMPTY_FORM = {
  name: '', prize: '', entry_fee: '', mode: 'Solo', status: 'registration',
  max_players: 100, match_time: '', room_id: '', room_password: '', image_url: '', rules: ''
};

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
          <input id="tf-prize" className="input" type="number" min="0" step="1" value={form.prize} onChange={e => set('prize', e.target.value)} required />
        )}
        {field('Entry fee (INR) *', 'tf-fee',
          <input id="tf-fee" className="input" type="number" min="0" step="1" value={form.entry_fee} onChange={e => set('entry_fee', e.target.value)} required />
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
            <option value="registration">Registration</option><option value="upcoming">Upcoming</option><option value="live">Live</option>
          </select>
        )}
      </div>
      {field('Max players', 'tf-max',
        <input id="tf-max" className="input" type="number" min="2" step="1" value={form.max_players} onChange={e => set('max_players', e.target.value)} disabled={form.mode === '1v1'} />
      )}
      {field('Match time', 'tf-time',
        <input id="tf-time" className="input" type="datetime-local" value={form.match_time} onChange={e => set('match_time', e.target.value)} required />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Room ID', 'tf-room-id',
          <input id="tf-room-id" className="input" value={form.room_id} onChange={e => set('room_id', e.target.value)} autoComplete="off" />
        )}
        {field('Room password', 'tf-room-pw',
          <input id="tf-room-pw" className="input" value={form.room_password} onChange={e => set('room_password', e.target.value)} autoComplete="new-password" />
        )}
      </div>
      {field('Banner image URL', 'tf-image',
        <input id="tf-image" className="input" type="url" value={form.image_url} onChange={e => set('image_url', e.target.value)} />
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

export default function AdminView({ isAdmin, tournaments, setTournaments, refreshList }) {
  const [view, setView] = useState('dashboard');
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [registrationsByTournament, setRegistrationsByTournament] = useState({});
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [registrationsError, setRegistrationsError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [deleting, setDeleting] = useState(false);

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

  if (!isAdmin) {
    return (
      <div className="empty" style={{ minHeight: '50vh' }}>
        <span className="empty-icon"><Shield size={28} aria-hidden="true" /></span>
        <p className="empty-title">Access denied</p>
        <p className="empty-hint">You do not have admin privileges.</p>
      </div>
    );
  }

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    if (type === 'success') setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  const handleCreate = async (form) => {
    if (!form.name || !form.prize) return showFeedback('error', 'Name and prize are required.');
    if (!form.match_time) return showFeedback('error', 'Match time is required.');

    const date = new Date(form.match_time);
    if (isNaN(date.getTime())) return showFeedback('error', 'Invalid match time.');

    setSaving(true);
    const { data, error } = await supabase
      .from('tournaments')
      .insert([{
        name: form.name,
        mode: form.mode,
        status: form.status,
        prize: Number(form.prize),
        entry_fee: Number(form.entry_fee),
        max_players: Number(form.max_players),
        match_time: date.toISOString(),
        room_id: form.room_id || null,
        room_password: form.room_password || null,
        image_url: form.image_url || null,
        rules: form.rules || null
      }])
      .select();

    setSaving(false);

    if (error) return showFeedback('error', 'Could not create the tournament. ' + (error.message || ''));

    setTournaments([data[0], ...tournaments]);
    setView('dashboard');
    showFeedback('success', `"${form.name}" created.`);
    refreshList();
  };

  const handleUpdate = async (form) => {
    if (!form.name || !form.prize) return showFeedback('error', 'Name and prize are required.');
    if (!form.match_time) return showFeedback('error', 'Match time is required.');

    const date = new Date(form.match_time);
    if (isNaN(date.getTime())) return showFeedback('error', 'Invalid match time.');

    setSaving(true);
    const { error } = await supabase.from('tournaments').update({
      name: form.name,
      mode: form.mode,
      status: form.status,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: date.toISOString(),
      room_id: form.room_id || null,
      room_password: form.room_password || null,
      image_url: form.image_url || null,
      rules: form.rules || null
    }).eq('id', editData.id);
    setSaving(false);
    if (error) return showFeedback('error', 'Could not update the tournament. ' + (error.message || ''));

    setTournaments(tournaments.map(t => t.id === editData.id ? { ...t, name: form.name, mode: form.mode, status: form.status, prize: Number(form.prize), entry_fee: Number(form.entry_fee), max_players: Number(form.max_players), match_time: date.toISOString() } : t));
    setView('list');
    setEditData(null);
    showFeedback('success', `"${form.name}" updated.`);
    refreshList();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      // Server checks admin role from the token; refuses tournaments that
      // still have registered players (409) — refunds flow comes later.
      await api.deleteTournament({ tournamentId: confirmDelete.id });
      setTournaments(tournaments.filter(t => t.id !== confirmDelete.id));
      showFeedback('success', `"${confirmDelete.name}" deleted.`);
      refreshList();
    } catch (err) {
      showFeedback('error', err?.message || 'Delete failed.');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const openEdit = (t) => {
    const parsed = t.match_time ? new Date(t.match_time) : null;
    const local = parsed && !isNaN(parsed.getTime())
      ? new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '';
    setEditData({ ...t, match_time: local });
    setView('edit');
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
          <TournamentForm
            initial={editData}
            onSave={view === 'create' ? handleCreate : handleUpdate}
            onCancel={() => { setView(view === 'create' ? 'dashboard' : 'list'); setEditData(null); }}
            saving={saving}
          />
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
                        className="btn btn-danger btn--sm"
                        onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
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
        onClose={() => !deleting && setConfirmDelete(null)}
        title="Delete tournament?"
        labelledBy="delete-confirm-title"
      >
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
          {confirmDelete?.name ? `“${confirmDelete.name}” will be permanently deleted.` : ''}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          Tournaments with registered players cannot be deleted until the cancellation-with-refunds flow is available.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
