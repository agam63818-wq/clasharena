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
//   - tournaments can be hard-deleted only when they have no registrations;
//     otherwise the admin-only route refuses with the exact reason and the UI
//     offers the cancellation path. Cancellation sets status to 'cancelled'
//     when nothing is owed, or uses the atomic refund RPC
//     (ENABLE_TOURNAMENT_CANCELLATION) when players paid to enter.
//   - wallet requests (deposit/withdraw) are approved/rejected on the server;
//     approving calls the DB RPC that moves balance + ledger atomically.

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Plus, Edit, XCircle, Search, ArrowLeft,
  Users, Calendar, Trophy, Loader, AlertCircle, CheckCircle2,
  Check, X, Wallet, Trash2, Copy, Phone, MessageCircle
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

export function parsePrize(value) {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

const HOURS = Array.from({ length: 12 }, (_value, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_value, index) => String(index).padStart(2, '0'));

function emptyDateTimeParts() {
  return { date: '', hour: '12', minute: '00', period: 'AM' };
}

function getDateTimeParts(value) {
  if (!value) return emptyDateTimeParts();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return emptyDateTimeParts();

  const hour24 = parsed.getHours();
  return {
    date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
    hour: String((hour24 % 12) || 12),
    minute: String(parsed.getMinutes()).padStart(2, '0'),
    period: hour24 >= 12 ? 'PM' : 'AM'
  };
}

// A controlled local-time editor. It emits an ISO timestamp, just like the
// value formToPayload validates and sends to the API; the timezone note makes
// the local-to-UTC conversion explicit for admins.
function DateTimeAmPm({ value, onChange, idPrefix, labelledBy }) {
  const parts = getDateTimeParts(value);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local timezone';

  const update = (next) => {
    const nextParts = { ...parts, ...next };
    if (!nextParts.date) {
      onChange('');
      return;
    }

    const [year, month, day] = nextParts.date.split('-').map(Number);
    let hour24 = Number(nextParts.hour) % 12;
    if (nextParts.period === 'PM') hour24 += 12;
    const localDate = new Date(year, month - 1, day, hour24, Number(nextParts.minute), 0, 0);

    if (Number.isNaN(localDate.getTime())) {
      onChange('');
      return;
    }
    onChange(localDate.toISOString());
  };

  return (
    <div>
      <div
        role="group"
        aria-labelledby={labelledBy}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) repeat(3, minmax(0, 0.8fr))', gap: 'var(--space-2)' }}
      >
        <input
          id={`${idPrefix}-date`}
          className="input"
          type="date"
          aria-label="Match date"
          value={parts.date}
          onChange={event => update({ date: event.target.value })}
          required
        />
        <select
          id={`${idPrefix}-hour`}
          className="input"
          aria-label="Match hour"
          value={parts.hour}
          onChange={event => update({ hour: event.target.value })}
        >
          {HOURS.map(hour => <option key={hour} value={hour}>{hour}</option>)}
        </select>
        <select
          id={`${idPrefix}-minute`}
          className="input"
          aria-label="Match minute"
          value={parts.minute}
          onChange={event => update({ minute: event.target.value })}
        >
          {MINUTES.map(minute => <option key={minute} value={minute}>{minute}</option>)}
        </select>
        <select
          id={`${idPrefix}-period`}
          className="input"
          aria-label="AM or PM"
          value={parts.period}
          onChange={event => update({ period: event.target.value })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <p className="field-hint" style={{ marginTop: 6 }}>Timezone: {timeZone}</p>
    </div>
  );
}

function tournamentToForm(tournament) {
  return {
    ...EMPTY_FORM,
    id: tournament?.id || null,
    name: tournament?.name || '',
    prize: parsePrize(tournament?.prize),
    entry_fee: parsePrize(tournament?.entry_fee),
    mode: tournament?.mode || 'Solo',
    status: tournament?.status || 'registration',
    max_players: Number(tournament?.max_players) || EMPTY_FORM.max_players,
    match_time: tournament?.match_time || '',
    room_id: tournament?.room_id ?? '',
    room_password: tournament?.room_password ?? '',
    image_url: tournament?.image_url ?? '',
    rules: tournament?.rules ?? ''
  };
}

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);

  useEffect(() => {
    setForm(initial || EMPTY_FORM);
  }, [initial]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const field = (label, id, input) => (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {input}
    </div>
  );

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} noValidate>
      {field('Tournament name *', 'tf-name',
        <input id="tf-name" className="input" value={form.name} onChange={event => set('name', event.target.value)} required />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Prize (INR) *', 'tf-prize',
          <input id="tf-prize" className="input" type="number" min="0" step="0.01" value={form.prize} onChange={event => set('prize', event.target.value)} required />
        )}
        {field('Entry fee (INR) *', 'tf-fee',
          <input id="tf-fee" className="input" type="number" min="0" step="0.01" value={form.entry_fee} onChange={event => set('entry_fee', event.target.value)} required />
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Mode', 'tf-mode',
          <select id="tf-mode" className="input" value={form.mode} onChange={event => set('mode', event.target.value)}>
            <option>Solo</option><option>Duo</option><option>Squad</option><option value="1v1">1v1</option>
          </select>
        )}
        {field('Status', 'tf-status',
          <select
            id="tf-status"
            className="input"
            value={form.status}
            onChange={event => set('status', event.target.value)}
            disabled={form.status === 'cancelled'}
          >
            <option value="registration">Registration</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            {form.status === 'cancelled' && <option value="cancelled">Cancelled</option>}
          </select>
        )}
      </div>
      {form.status === 'cancelled' && (
        <p className="field-hint" style={{ marginTop: '-8px', marginBottom: 'var(--space-4)' }}>
          Cancelled matches cannot be returned to another status from the edit form.
        </p>
      )}
      {field('Max players', 'tf-max',
        <input id="tf-max" className="input" type="number" min="1" step="1" value={form.max_players} onChange={event => set('max_players', event.target.value)} />
      )}
      <div className="field">
        <span id="tf-time-label" className="field-label">Match time *</span>
        <DateTimeAmPm
          value={form.match_time}
          onChange={value => set('match_time', value)}
          idPrefix="tf-time"
          labelledBy="tf-time-label"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        {field('Room ID', 'tf-room-id',
          <input id="tf-room-id" className="input" value={form.room_id} onChange={event => set('room_id', event.target.value)} autoComplete="off" />
        )}
        {field('Room password', 'tf-room-pw',
          <input id="tf-room-pw" className="input" value={form.room_password} onChange={event => set('room_password', event.target.value)} autoComplete="new-password" />
        )}
      </div>
      <p className="field-hint" style={{ marginTop: '-8px', marginBottom: 'var(--space-4)' }}>
        Leave a room credential blank to clear it.
      </p>
      {field('Banner image URL', 'tf-image',
        <input id="tf-image" className="input" type="url" value={form.image_url} onChange={event => set('image_url', event.target.value)} />
      )}
      <p className="field-hint" style={{ marginTop: '-8px', marginBottom: 'var(--space-4)' }}>
        Leave the banner URL blank to clear it.
      </p>
      {field('Rules', 'tf-rules',
        <textarea id="tf-rules" className="input" rows="4" value={form.rules} onChange={event => set('rules', event.target.value)} />
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
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const feedbackTimer = useRef(null);
  const formFeedbackRef = useRef(null);
  const [registrationsByTournament, setRegistrationsByTournament] = useState({});
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [registrationsError, setRegistrationsError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(null); // tournament row
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // tournament row
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteCanCancel, setDeleteCanCancel] = useState(false);

  // --- tournament results ---------------------------------------------------
  // Drafts are keyed by the server-authorized registration user_id. Existing
  // results are loaded through the admin route so private admin notes never
  // depend on a browser-side table policy.
  const [resultsTournament, setResultsTournament] = useState(null);
  const [resultDrafts, setResultDrafts] = useState({});
  const [resultsLoadState, setResultsLoadState] = useState('idle');
  const [resultsMessage, setResultsMessage] = useState('');
  const [resultsMessageType, setResultsMessageType] = useState('');
  const [savingResults, setSavingResults] = useState(false);

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

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!feedback.message || (view !== 'create' && view !== 'edit')) return undefined;
    const frame = requestAnimationFrame(() => {
      formFeedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
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

  const showFeedback = (type, message) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, message });
    if (type === 'success') {
      feedbackTimer.current = setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    }
  };

  // The exact payload sent to the server. It is validated AGAIN server-side
  // (name, mode allow-list, prize/entry_fee >= 0, max_players > 0 and not
  // below the players already registered, match_time, status transitions).
  const formToPayload = (form) => {
    const date = new Date(form.match_time);
    const optionalText = (value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text === '' ? null : text;
    };
    const payload = {
      name: form.name,
      mode: form.mode,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: date.toISOString(),
      // These values come from adminGetTournament before editing. They are
      // null only when the administrator deliberately clears the field.
      room_id: optionalText(form.room_id),
      room_password: optionalText(form.room_password),
      image_url: optionalText(form.image_url),
      rules: optionalText(form.rules)
    };
    // `cancelled` can only come from the cancellation flow. Keep its current
    // status while still allowing other tournament fields to be corrected.
    if (form.status !== 'cancelled') payload.status = form.status;
    return payload;
  };

  const validateForm = (form) => {
    if (!String(form.name || '').trim()) return 'Tournament name is required.';
    if (form.prize === '' || !Number.isFinite(Number(form.prize))) return 'Prize must be a valid number.';
    if (form.entry_fee === '' || !Number.isFinite(Number(form.entry_fee))) return 'Entry fee must be a valid number.';
    if (!form.match_time) return 'Match time is required.';
    if (Number.isNaN(new Date(form.match_time).getTime())) return 'Invalid match time.';
    return '';
  };

  const handleCreate = async (form) => {
    const formError = validateForm(form);
    if (formError) return showFeedback('error', formError);

    setSaving(true);
    try {
      const payload = formToPayload(form);
      const result = await api.adminCreateTournament(payload);
      const created = result && result.tournament;
      if (created) setTournaments(current => [created, ...current]);
      showFeedback('success', `“${form.name}” created.`);
      refreshList();
    } catch (err) {
      // Safe message from the API — never a raw database error.
      showFeedback('error', err?.message || 'Could not create the tournament.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (form) => {
    const formError = validateForm(form);
    if (formError) return showFeedback('error', formError);
    if (!editData?.id) return showFeedback('error', 'Tournament details are not loaded yet.');

    setSaving(true);
    try {
      const payload = formToPayload(form);
      const result = await api.adminUpdateTournament({ id: editData.id, ...payload });
      const updated = result && result.tournament;
      const latest = updated || { ...editData, ...payload };
      setTournaments(current => current.map(t => t.id === editData.id ? latest : t));
      setEditData(tournamentToForm(latest));
      showFeedback('success', `“${form.name}” updated.`);
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
      setTournaments(current => current.map(t => (t.id === confirmCancel.id ? { ...t, status: 'cancelled' } : t)));
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

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError('');
    setDeleteCanCancel(false);
    try {
      const result = await api.adminDeleteTournament({ tournamentId: confirmDelete.id });
      const auditNote = result && result.auditLogged === false ? ' (audit note could not be stored)' : '';
      setTournaments(current => current.filter(t => t.id !== confirmDelete.id));
      showFeedback('success', `“${confirmDelete.name}” permanently deleted.${auditNote}`);
      setConfirmDelete(null);
      setDeleteCanCancel(false);
      refreshList();
    } catch (err) {
      // A 409 explains exactly why this match must be cancelled instead. Keep
      // the dialog open so the administrator can choose that safer action.
      setDeleteError(err?.message || 'Could not delete the tournament.');
      setDeleteCanCancel(err?.status === 409);
    } finally {
      setDeleting(false);
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

  const openEdit = async (tournament) => {
    setEditingId(tournament.id);
    setFeedback({ type: '', message: '' });
    try {
      // The list intentionally does not expose room credentials when the room
      // RPC flag is on. Load the complete row through the admin-only API first
      // so an unchanged room ID/password is never overwritten with null.
      const result = await api.adminGetTournament({ tournamentId: tournament.id });
      const fullTournament = result && result.tournament;
      if (!fullTournament) throw new Error('Tournament details could not be loaded.');
      setEditData(tournamentToForm(fullTournament));
      setView('edit');
    } catch (err) {
      showFeedback('error', err?.message || 'Could not load tournament details.');
    } finally {
      setEditingId(null);
    }
  };

  const openResults = async (tournament) => {
    setResultsTournament(tournament);
    setResultDrafts({});
    setResultsMessage('');
    setResultsMessageType('');
    setView('results');

    if (!features.tournamentResults) {
      setResultsLoadState('unavailable');
      setResultsMessageType('error');
      setResultsMessage('Tournament results are disabled on this deployment. No standings can be viewed or saved here.');
      return;
    }

    setResultsLoadState('loading');
    try {
      const result = await api.adminGetTournamentResults({ tournamentId: tournament.id });
      const drafts = ((result && result.results) || []).reduce((acc, row) => {
        if (!row?.user_id) return acc;
        acc[row.user_id] = {
          placement: row.placement ?? '',
          kills: row.kills ?? '',
          prize_amount: row.prize_amount ?? '',
          note: row.note ?? ''
        };
        return acc;
      }, {});
      setResultDrafts(drafts);
      setResultsLoadState('ready');
    } catch (err) {
      setResultsLoadState('error');
      setResultsMessageType('error');
      setResultsMessage(err?.message || 'Could not load saved tournament results. No changes can be saved until they load.');
    }
  };

  const updateResultDraft = (userId, field, value) => {
    setResultDrafts(current => ({
      ...current,
      [userId]: {
        placement: '',
        kills: '',
        prize_amount: '',
        note: '',
        ...(current[userId] || {}),
        [field]: value
      }
    }));
  };

  const buildResultPayload = (registrations) => {
    const results = [];
    for (const registration of registrations) {
      const draft = resultDrafts[registration.user_id] || {};
      const placement = Number(draft.placement);
      const kills = Number(draft.kills);
      const prizeAmount = Number(draft.prize_amount);
      const note = typeof draft.note === 'string' ? draft.note.trim() : '';

      if (!Number.isInteger(placement) || placement < 1) {
        throw new Error('Every player needs a whole-number placement of at least 1.');
      }
      if (!Number.isInteger(kills) || kills < 0) {
        throw new Error('Every player needs a whole-number kills value of 0 or more.');
      }
      if (!Number.isFinite(prizeAmount) || prizeAmount < 0) {
        throw new Error('Every player needs a recorded prize amount of 0 or more.');
      }
      if (note.length > 300) {
        throw new Error('Each result note must be at most 300 characters.');
      }

      results.push({
        user_id: registration.user_id,
        placement,
        kills,
        prize_amount: Math.round(prizeAmount * 100) / 100,
        note: note || null
      });
    }
    return results;
  };

  const handleSaveResults = async () => {
    if (!resultsTournament) return;
    if (resultsLoadState !== 'ready') {
      setResultsMessageType('error');
      setResultsMessage('Saved results are not ready to edit yet. Please wait or retry loading them first.');
      return;
    }

    const registrations = registrationsByTournament[resultsTournament.id] || [];
    if (registrationsLoading) {
      setResultsMessageType('error');
      setResultsMessage('Registered players are still loading. Please wait before saving results.');
      return;
    }
    if (registrations.length === 0) {
      setResultsMessageType('error');
      setResultsMessage('This tournament has no registered players to score.');
      return;
    }

    let results;
    try {
      results = buildResultPayload(registrations);
    } catch (err) {
      setResultsMessageType('error');
      setResultsMessage(err?.message || 'Check the result fields and try again.');
      return;
    }

    setSavingResults(true);
    setResultsMessage('');
    setResultsMessageType('');
    try {
      const result = await api.adminSetTournamentResults({
        tournamentId: resultsTournament.id,
        results
      });
      const savedTournament = result?.tournament || { id: resultsTournament.id, status: 'completed' };
      setTournaments(current => current.map(t => (
        t.id === resultsTournament.id ? { ...t, ...savedTournament, status: 'completed' } : t
      )));
      setResultsTournament(current => current ? { ...current, ...savedTournament, status: 'completed' } : current);
      const auditNote = result?.auditLogged === false ? ' The results were saved, but the audit note could not be stored.' : '';
      setResultsMessageType('success');
      setResultsMessage(`Results saved and this tournament is now Completed. Recorded prizes are not wallet payouts; payouts remain manual.${auditNote}`);
      showFeedback('success', `Results saved for “${resultsTournament.name}”.`);
      refreshList();
    } catch (err) {
      setResultsMessageType('error');
      setResultsMessage(err?.message || 'Could not save tournament results.');
    } finally {
      setSavingResults(false);
    }
  };

  const copyText = async (text, successMessage) => {
    if (!text) {
      showFeedback('error', 'There is no value to copy.');
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(fallback);
        if (!copied) throw new Error('Copy command was unavailable.');
      }
      showFeedback('success', successMessage);
    } catch {
      showFeedback('error', 'Could not copy to the clipboard.');
    }
  };

  const copyAllPlayers = (registrations) => {
    const lines = registrations.map((player) => {
      const profile = Array.isArray(player.profiles) ? player.profiles[0] : player.profiles;
      const username = profile?.username || 'Unknown';
      const phone = profile?.phone ? String(profile.phone) : 'Not provided';
      return `${username} | ${player.ign || 'N/A'} | ${player.ff_uid || 'N/A'} | ${phone}`;
    });
    copyText(lines.join('\n'), `${registrations.length} player record(s) copied.`);
  };

  const stats = {
    total: tournaments.length,
    live: tournaments.filter(t => t.status === 'live').length,
    upcoming: tournaments.filter(t => t.status === 'upcoming').length,
    registration: tournaments.filter(t => t.status === 'registration').length
  };

  const filtered = tournaments.filter(t => (t.name || '').toLowerCase().includes(search.toLowerCase()));
  const resultsRegistrations = resultsTournament ? (registrationsByTournament[resultsTournament.id] || []) : [];

  // -------------------------
  // RESULTS VIEW
  // -------------------------
  if (view === 'results') {
    if (!resultsTournament) {
      return (
        <div className="view">
          <ErrorRetry message="Tournament results could not be opened." onRetry={() => setView('list')} />
        </div>
      );
    }

    return (
      <div className="view">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <button type="button" className="btn btn-ghost btn--sm" onClick={() => setView('list')} disabled={savingResults}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)' }}>Tournament Results</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 2 }}>{resultsTournament.name}</p>
          </div>
        </div>

        <section aria-label="Result payout note" style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', color: 'var(--warning-text)', fontSize: 'var(--text-sm)' }}>
          <strong>Recorded standings, not a payout</strong>
          <p style={{ marginTop: 4, color: 'var(--text-secondary)' }}>Prize amounts saved here are recorded tournament results. Wallet payouts are manual until payments are built.</p>
        </section>

        {resultsMessage && (
          <div className={`feedback ${resultsMessageType === 'success' ? 'feedback--success' : 'feedback--error'}`} role={resultsMessageType === 'success' ? 'status' : 'alert'} style={{ marginBottom: 'var(--space-4)' }}>
            {resultsMessageType === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
            {resultsMessage}
          </div>
        )}

        {resultsLoadState === 'loading' || registrationsLoading ? (
          <div role="status" aria-label="Loading tournament results" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[0, 1, 2].map(index => <span key={index} className="skeleton" style={{ display: 'block', height: 88, borderRadius: 'var(--radius-md)' }} />)}
          </div>
        ) : resultsLoadState === 'error' || resultsLoadState === 'unavailable' ? (
          <ErrorRetry
            message={resultsMessage || 'Tournament results are unavailable.'}
            onRetry={resultsLoadState === 'error' ? () => openResults(resultsTournament) : () => setView('list')}
          />
        ) : registrationsError ? (
          <div className="feedback feedback--error" role="alert">
            <AlertCircle size={16} aria-hidden="true" /> Could not load registered players, so results cannot be edited safely. Return to the tournament list and retry.
          </div>
        ) : resultsRegistrations.length === 0 ? (
          <p style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', color: 'var(--text-muted)', textAlign: 'center' }}>
            No registered players are available to score for this tournament.
          </p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); handleSaveResults(); }} noValidate>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
              Saving replaces the previous result set and marks the tournament Completed. Enter a placement, kills and recorded prize for every registered player.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {resultsRegistrations.map((player) => {
                const profile = Array.isArray(player.profiles) ? player.profiles[0] : player.profiles;
                const playerName = profile?.username || player.ign || 'Unknown player';
                const draft = resultDrafts[player.user_id] || { placement: '', kills: '', prize_amount: '', note: '' };
                const fieldPrefix = `result-${player.id || player.user_id}`;

                return (
                  <section key={player.id || player.user_id} aria-label={`Result for ${playerName}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
                    <div style={{ marginBottom: 'var(--space-3)' }}>
                      <strong style={{ display: 'block', fontSize: 'var(--text-md)' }}>{playerName}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>FF UID: <code>{player.ff_uid || 'Not provided'}</code></span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label" htmlFor={`${fieldPrefix}-placement`}>Placement</label>
                        <input
                          id={`${fieldPrefix}-placement`}
                          className="input"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={draft.placement}
                          onChange={event => updateResultDraft(player.user_id, 'placement', event.target.value)}
                          disabled={savingResults}
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label" htmlFor={`${fieldPrefix}-kills`}>Kills</label>
                        <input
                          id={`${fieldPrefix}-kills`}
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={draft.kills}
                          onChange={event => updateResultDraft(player.user_id, 'kills', event.target.value)}
                          disabled={savingResults}
                          required
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label" htmlFor={`${fieldPrefix}-prize`}>Prize (INR)</label>
                        <input
                          id={`${fieldPrefix}-prize`}
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft.prize_amount}
                          onChange={event => updateResultDraft(player.user_id, 'prize_amount', event.target.value)}
                          disabled={savingResults}
                          required
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 'var(--space-3) 0 0' }}>
                      <label className="field-label" htmlFor={`${fieldPrefix}-note`}>Note (optional)</label>
                      <input
                        id={`${fieldPrefix}-note`}
                        className="input"
                        value={draft.note}
                        onChange={event => updateResultDraft(player.user_id, 'note', event.target.value)}
                        maxLength={300}
                        autoComplete="off"
                        disabled={savingResults}
                      />
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="modal-actions" style={{ marginTop: 'var(--space-5)' }}>
              <button type="submit" className="btn btn-primary" disabled={savingResults}>
                {savingResults ? <Loader size={17} className="spin" aria-hidden="true" /> : <Trophy size={17} aria-hidden="true" />}
                {savingResults ? 'Saving results…' : 'Save results & mark Completed'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setView('list')} disabled={savingResults}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    );
  }

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
          <div ref={formFeedbackRef} tabIndex={-1} aria-live="polite">
            {feedback.message && (
              <div className={`feedback ${feedback.type === 'success' ? 'feedback--success' : 'feedback--error'}`} role={feedback.type === 'success' ? 'status' : 'alert'}>
                {feedback.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
                {feedback.message}
              </div>
            )}
          </div>
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

                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => openEdit(t)}
                        disabled={!!editingId}
                        aria-label={`Edit ${t.name}`}
                      >
                        {editingId === t.id ? <Loader size={16} className="spin" aria-hidden="true" /> : <Edit size={16} aria-hidden="true" />}
                        <span className="visually-hidden">Edit</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn--sm"
                        onClick={() => openResults(t)}
                        aria-label={`Enter results for ${t.name}`}
                      >
                        <Trophy size={15} aria-hidden="true" /> Results
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn--sm"
                        onClick={() => { setCancelReason(''); setConfirmCancel(t); }}
                        disabled={t.status === 'cancelled'}
                        aria-label={`Cancel ${t.name}`}
                      >
                        <XCircle size={16} aria-hidden="true" />
                        <span className="visually-hidden">Cancel</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn--sm"
                        onClick={() => { setDeleteError(''); setDeleteCanCancel(false); setConfirmDelete(t); }}
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span className="visually-hidden">Delete</span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                      <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Registered players ({count})
                      </h4>
                      {!registrationsLoading && !registrationsError && count > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => copyAllPlayers(registrations)}
                        >
                          <Copy size={15} aria-hidden="true" /> Copy all players
                        </button>
                      )}
                    </div>
                    {registrationsError ? (
                      <ErrorRetry message={registrationsError} onRetry={() => window.location.reload()} />
                    ) : registrationsLoading ? (
                      <div role="status" aria-label="Loading players">
                        <span className="skeleton" style={{ display: 'block', height: 44, borderRadius: 'var(--radius-sm)' }} />
                      </div>
                    ) : count === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', fontStyle: 'italic' }}>No players have joined this match yet.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {registrations.map((player) => {
                          const profile = Array.isArray(player.profiles) ? player.profiles[0] : player.profiles;
                          const username = profile?.username || 'Unknown';
                          const phone = profile?.phone ? String(profile.phone).trim() : '';
                          const phoneDigits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
                          const uid = player.ff_uid ? String(player.ff_uid) : '';

                          return (
                            <li key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)' }}>
                                  {username}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>Game name (IGN): {player.ign || 'N/A'}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>
                                  FF UID: <code style={{ color: 'var(--text-secondary)' }}>{uid || 'N/A'}</code>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)' }}>Phone: {phone || 'Not provided'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => copyText(uid, 'Free Fire UID copied.')}
                                  disabled={!uid}
                                >
                                  <Copy size={14} aria-hidden="true" /> Copy UID
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => copyText(phone, 'Phone number copied.')}
                                  disabled={!phone}
                                >
                                  <Copy size={14} aria-hidden="true" /> Copy phone
                                </button>
                                {phoneDigits ? (
                                  <a className="btn btn-outline btn--sm" href={`tel:${phoneDigits}`} aria-label={`Call ${username}`}>
                                    <Phone size={14} aria-hidden="true" /> Call
                                  </a>
                                ) : (
                                  <button type="button" className="btn btn-outline btn--sm" disabled>
                                    <Phone size={14} aria-hidden="true" /> Call
                                  </button>
                                )}
                                {phoneDigits ? (
                                  <a
                                    className="btn btn-outline btn--sm"
                                    href={`https://wa.me/91${phoneDigits}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Message ${username} on WhatsApp`}
                                  >
                                    <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                                  </a>
                                ) : (
                                  <button type="button" className="btn btn-outline btn--sm" disabled>
                                    <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        <Modal
          open={!!confirmCancel}
          onClose={() => {
            if (!cancelling) {
              setConfirmCancel(null);
              setCancelReason('');
            }
          }}
          title="Cancel tournament?"
          labelledBy="cancel-confirm-title"
        >
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
            {confirmCancel?.name ? `“${confirmCancel.name}” will be cancelled.` : ''}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
            {Number(confirmCancel?.entry_fee) > 0
              ? 'Players who paid an entry fee are refunded only when this server has the cancellation-with-refunds flag and refund function installed. Otherwise the server refuses and tells you exactly why; nothing is changed.'
              : 'No entry fee was charged for this match, so cancelling changes only its status.'}
          </p>
          <div className="field">
            <label className="field-label" htmlFor="cancel-reason">Reason (optional, kept in the audit log)</label>
            <input
              id="cancel-reason"
              className="input"
              value={cancelReason}
              onChange={event => setCancelReason(event.target.value)}
              maxLength={300}
              autoComplete="off"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader size={16} className="spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
              {cancelling ? 'Cancelling…' : 'Cancel tournament'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => { setConfirmCancel(null); setCancelReason(''); }} disabled={cancelling}>
              Keep it
            </button>
          </div>
        </Modal>

        <Modal
          open={!!confirmDelete}
          onClose={() => {
            if (!deleting) {
              setConfirmDelete(null);
              setDeleteError('');
              setDeleteCanCancel(false);
            }
          }}
          title="Delete tournament?"
          labelledBy="delete-confirm-title"
        >
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-2)' }}>
            {confirmDelete?.name ? `“${confirmDelete.name}” will be permanently deleted.` : ''}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-4)' }}>
            A tournament can be deleted only when no players are registered. If players are registered, the server keeps it intact and you can cancel it instead.
          </p>
          {deleteError && (
            <div className="feedback feedback--error" role="alert">
              <AlertCircle size={16} aria-hidden="true" /> {deleteError}
            </div>
          )}
          {deleteCanCancel && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                const tournament = confirmDelete;
                setConfirmDelete(null);
                setDeleteError('');
                setDeleteCanCancel(false);
                setCancelReason('');
                setConfirmCancel(tournament);
              }}
              disabled={deleting}
              style={{ marginBottom: 'var(--space-3)' }}
            >
              <XCircle size={16} aria-hidden="true" /> Cancel tournament instead
            </button>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => { setConfirmDelete(null); setDeleteError(''); setDeleteCanCancel(false); }} disabled={deleting}>
              Keep it
            </button>
          </div>
        </Modal>
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
