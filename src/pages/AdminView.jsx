// src/pages/AdminView.jsx
// Admin dashboard: stats, tournament CRUD, registered players.
// Lazy-loaded from App.jsx so admin code is not in every player's bundle.
//
// Security notes (server-side admin phase):
//   - create, update and the registered-players read go through ONE server
//     route, /api/admin (src/lib/apiClient.js → api/admin.js). The browser no
//     longer writes tournaments or reads other users' registrations with the
//     anon key (docs/AUDIT.md P1-2).
//   - the server re-checks the caller's role from the database on every
//     action; `isAdmin` below is only used to decide what to render.
//   - tournaments are CANCELLED, not deleted: the server sets the status to
//     'cancelled' when nothing is owed, and otherwise only cancels through the
//     atomic refund RPC (flag ENABLE_TOURNAMENT_CANCELLATION) — refusing with
//     the exact reason when it cannot. The old hard delete
//     (api/deleteTournament.js) is still on the server but no longer used here.
//   - wallet requests (deposit/withdraw) are approved/rejected on the server;
//     approving calls the DB RPC that moves balance + ledger atomically.

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Plus, Edit, XCircle, Search, ArrowLeft,
  Users, Calendar, Trophy, Loader, AlertCircle, CheckCircle2,
  Check, X, Wallet
} from 'lucide-react';
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
  const [confirmCancel, setConfirmCancel] = useState(null); // tournament row
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // --- wallet request queue (admin review) ---------------------------------
  const [walletRequests, setWalletRequests] = useState([]);
  const [walletState, setWalletState] = useState(features.walletRequests ? 'loading' : 'off');
  const [walletMessage, setWalletMessage] = useState('');
  const [reviewTarget, setReviewTarget] = useState(null); // { request, decision }
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    setRegistrationsLoading(true);
    setRegistrationsError('');
    // Server-side admin check + read; the browser never queries
    // match_registrations directly any more.
    api.adminListRegistrations()
      .then((result) => {
        if (!alive) return;
        const grouped = ((result && result.registrations) || []).reduce((acc, row) => {
          if (!acc[row.tournament_id]) acc[row.tournament_id] = [];
          acc[row.tournament_id].push(row);
          return acc;
        }, {});
        setRegistrationsByTournament(grouped);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('registrations query failed:', err?.message);
        setRegistrationsError('Could not load registered players.');
      })
      .finally(() => {
        if (alive) setRegistrationsLoading(false);
      });
    return () => { alive = false; };
  }, [isAdmin]);

  // Pending wallet requests. Gated on the client flag so we never fire a
  // request the server would reject; anything else (server flag off, missing
  // table) surfaces the server's own message instead of a fake empty list.
  const loadWalletRequests = () => {
    if (!features.walletRequests) {
      setWalletState('off');
      return;
    }
    setWalletState('loading');
    setWalletMessage('');
    api.adminListWalletRequests()
      .then((result) => {
        setWalletRequests((result && result.requests) || []);
        setWalletState('ready');
      })
      .catch((err) => {
        if (err && err.status === 503) {
          setWalletMessage(err.message);
          setWalletState('unavailable');
          return;
        }
        setWalletMessage((err && err.message) || 'Could not load wallet requests.');
        setWalletState('error');
      });
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadWalletRequests();
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

  // The exact payload sent to the server. It is validated AGAIN server-side
  // (name, mode allow-list, prize/entry_fee >= 0, max_players > 0 and not
  // below the players already registered, match_time, status transitions).
  const formToPayload = (form) => {
    const date = new Date(form.match_time);
    return {
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
    };
  };

  const handleCreate = async (form) => {
    if (!form.name || !form.prize) return showFeedback('error', 'Name and prize are required.');
    if (!form.match_time) return showFeedback('error', 'Match time is required.');

    const date = new Date(form.match_time);
    if (isNaN(date.getTime())) return showFeedback('error', 'Invalid match time.');

    setSaving(true);
    try {
      const result = await api.adminCreateTournament(formToPayload(form));
      const created = result && result.tournament;
      if (created) setTournaments([created, ...tournaments]);
      setView('dashboard');
      showFeedback('success', `"${form.name}" created.`);
      refreshList();
    } catch (err) {
      // Safe message from the API — never a raw database error.
      showFeedback('error', err?.message || 'Could not create the tournament.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (form) => {
    if (!form.name || !form.prize) return showFeedback('error', 'Name and prize are required.');
    if (!form.match_time) return showFeedback('error', 'Match time is required.');

    const date = new Date(form.match_time);
    if (isNaN(date.getTime())) return showFeedback('error', 'Invalid match time.');

    setSaving(true);
    try {
      const result = await api.adminUpdateTournament({ id: editData.id, ...formToPayload(form) });
      const updated = result && result.tournament;
      setTournaments(tournaments.map(t => t.id === editData.id ? (updated || { ...t, ...formToPayload(form) }) : t));
      setView('list');
      setEditData(null);
      showFeedback('success', `"${form.name}" updated.`);
      refreshList();
    } catch (err) {
      showFeedback('error', err?.message || 'Could not update the tournament.');
    } finally {
      setSaving(false);
    }
  };

  // Cancel, not delete. The server decides: a plain status change when nothing
  // is owed, the atomic refund RPC when paid players exist (flag-gated), or a
  // 409/503 whose message we show verbatim — never a silent success.
  const handleCancel = async () => {
    if (!confirmCancel) return;
    setCancelling(true);
    try {
      const result = await api.adminCancelTournament({
        tournamentId: confirmCancel.id,
        reason: cancelReason
      });
      const refunded = Number(result && result.refunded) || 0;
      const auditNote = result && result.auditLogged === false ? ' (audit note could not be stored)' : '';
      setTournaments(tournaments.map(t => (t.id === confirmCancel.id ? { ...t, status: 'cancelled' } : t)));
      showFeedback(
        'success',
        refunded > 0
          ? `"${confirmCancel.name}" cancelled and ${refunded} player(s) refunded.${auditNote}`
          : `"${confirmCancel.name}" cancelled. No refunds were needed.${auditNote}`
      );
      refreshList();
    } catch (err) {
      // The exact reason the server refused (409 flag off, 503 DB not set up).
      showFeedback('error', err?.message || 'Could not cancel the tournament.');
    } finally {
      setCancelling(false);
      setConfirmCancel(null);
      setCancelReason('');
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    const { request, decision } = reviewTarget;
    setReviewing(true);
    try {
      if (decision === 'approve') {
        await api.adminApproveWalletRequest({ requestId: request.id, note: reviewNote });
      } else {
        await api.adminRejectWalletRequest({ requestId: request.id, note: reviewNote });
      }
      showFeedback(
        'success',
        decision === 'approve'
          ? `Request approved. ${formatINR(Number(request.amount) || 0)} ${request.type === 'deposit' ? 'credited to' : 'debited from'} the user's wallet.`
          : 'Request rejected. No balance was changed.'
      );
      loadWalletRequests();
    } catch (err) {
      showFeedback('error', err?.message || 'Could not review the request.');
    } finally {
      setReviewing(false);
      setReviewTarget(null);
      setReviewNote('');
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
                        onClick={() => { setCancelReason(''); setConfirmCancel(t); }}
                        disabled={t.status === 'cancelled'}
                        aria-label={`Cancel ${t.name}`}
                      >
                        <XCircle size={16} aria-hidden="true" />
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

      <section className="section" aria-label="Wallet requests">
        <div className="section-header">
          <h3>Wallet requests</h3>
          {walletState === 'ready' && walletRequests.length > 0 && (
            <span className="badge badge--upcoming">{walletRequests.length} pending</span>
          )}
        </div>

        {walletState === 'off' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>
            Wallet requests are disabled on this deployment (VITE_FEATURE_WALLET_REQUESTS).
          </p>
        )}
        {walletState === 'unavailable' && (
          <div className="feedback feedback--error" role="alert">
            <AlertCircle size={16} aria-hidden="true" /> {walletMessage}
          </div>
        )}
        {walletState === 'error' && (
          <ErrorRetry message={walletMessage || 'Could not load wallet requests.'} onRetry={loadWalletRequests} />
        )}
        {walletState === 'loading' && (
          <div role="status" aria-label="Loading wallet requests">
            <span className="skeleton" style={{ display: 'block', height: 60, borderRadius: 'var(--radius-md)' }} />
          </div>
        )}
        {walletState === 'ready' && walletRequests.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', fontStyle: 'italic' }}>
            No pending deposit or withdraw requests.
          </p>
        )}
        {walletState === 'ready' && walletRequests.length > 0 && (
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {walletRequests.map(req => (
              <li
                key={req.id}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}
              >
                <div style={{ minWidth: 180 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>
                    {req.username || 'Unknown user'} · <span style={{ textTransform: 'capitalize' }}>{req.type}</span> {formatINR(Number(req.amount) || 0)}
                  </div>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {formatDateTime(req.created_at)}
                    {req.reference ? ` · Ref: ${req.reference}` : ''}
                    {req.note ? ` · Note: ${req.note}` : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn--sm"
                    onClick={() => { setReviewNote(''); setReviewTarget({ request: req, decision: 'approve' }); }}
                    aria-label={`Approve ${req.type} request`}
                  >
                    <Check size={16} aria-hidden="true" /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn--sm"
                    onClick={() => { setReviewNote(''); setReviewTarget({ request: req, decision: 'reject' }); }}
                    aria-label={`Reject ${req.type} request`}
                  >
                    <X size={16} aria-hidden="true" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
        open={!!confirmCancel}
        onClose={() => !cancelling && setConfirmCancel(null)}
        title="Cancel tournament?"
        labelledBy="cancel-confirm-title"
      >
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
          {confirmCancel?.name ? `“${confirmCancel.name}” will be cancelled.` : ''}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          {Number(confirmCancel?.entry_fee) > 0
            ? 'Players who paid an entry fee are refunded — but only when this server has the cancellation-with-refunds flag AND the refund function installed. Otherwise the server refuses and tells you exactly why; nothing is changed.'
            : 'No entry fee was charged for this match, so cancelling changes only its status.'}
        </p>
        <div className="field">
          <label className="field-label" htmlFor="cancel-reason">Reason (optional, kept in the audit log)</label>
          <input
            id="cancel-reason"
            className="input"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            maxLength={300}
            autoComplete="off"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <Loader size={16} className="spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            {cancelling ? 'Cancelling…' : 'Cancel tournament'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(null)} disabled={cancelling}>
            Keep it
          </button>
        </div>
      </Modal>

      <Modal
        open={!!reviewTarget}
        onClose={() => !reviewing && setReviewTarget(null)}
        title={reviewTarget?.decision === 'approve' ? 'Approve wallet request?' : 'Reject wallet request?'}
        labelledBy="wallet-review-title"
      >
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
          {reviewTarget
            ? `${reviewTarget.request.username || 'This user'} · ${reviewTarget.request.type} ${formatINR(Number(reviewTarget.request.amount) || 0)}`
            : ''}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          {reviewTarget?.decision === 'approve'
            ? 'Approving runs the database function that updates the request, the balance and the ledger row in one transaction. If that function is not installed, nothing happens and you will see the reason.'
            : 'Rejecting only marks the request. No balance is changed.'}
        </p>
        <div className="field">
          <label className="field-label" htmlFor="review-note">Note to the user (optional)</label>
          <input
            id="review-note"
            className="input"
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            maxLength={300}
            autoComplete="off"
          />
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className={`btn ${reviewTarget?.decision === 'approve' ? 'btn-primary' : 'btn-danger'}`}
            onClick={handleReview}
            disabled={reviewing}
          >
            {reviewing ? <Loader size={16} className="spin" aria-hidden="true" /> : <Wallet size={16} aria-hidden="true" />}
            {reviewing ? 'Working…' : reviewTarget?.decision === 'approve' ? 'Approve' : 'Reject'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setReviewTarget(null)} disabled={reviewing}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
