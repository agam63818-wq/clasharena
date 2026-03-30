import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, Plus, Edit, Trash2, User } from 'lucide-react';
import supabase from '../lib/supabaseClient';

const EMPTY_FORM = {
  name: '', mode: 'Solo', prize: '', entry_fee: '', max_players: 100,
  status: 'registration', match_time: '', image_url: '', rules: '',
  room_id: '', room_password: ''
};

const toDatetimeLocalInput = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 16);
};

function formatMatchDateTime(value, fallback = 'TBA') {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString();
}

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <input className="form-input" placeholder="Tournament Name *" value={form.name} onChange={(e) => set('name', e.target.value)} />
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
        <input className="form-input" type="number" placeholder="Prize" value={form.prize} onChange={(e) => set('prize', e.target.value)} />
        <input className="form-input" type="number" placeholder="Entry Fee" value={form.entry_fee} onChange={(e) => set('entry_fee', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
        <select className="form-input" value={form.mode} onChange={(e) => set('mode', e.target.value)}>
          <option>Solo</option><option>Duo</option><option>Squad</option>
        </select>
        <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="registration">Registration</option>
          <option value="upcoming">Upcoming</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <input className="form-input" type="number" placeholder="Max Players" value={form.max_players} onChange={(e) => set('max_players', e.target.value)} />
      <input className="form-input" type="datetime-local" value={form.match_time} onChange={(e) => set('match_time', e.target.value)} />
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
        <input className="form-input" placeholder="Room ID" value={form.room_id} onChange={(e) => set('room_id', e.target.value)} />
        <input className="form-input" placeholder="Room Password" value={form.room_password} onChange={(e) => set('room_password', e.target.value)} />
      </div>
      <input className="form-input" placeholder="Image URL" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />
      <textarea className="form-input" rows="3" placeholder="Rules" value={form.rules} onChange={(e) => set('rules', e.target.value)} />
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving}>{saving ? <Loader size={16} className="spin" /> : 'Save'}</button>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function AdminView({ userId, tournaments, refreshTournaments }) {
  const [mode, setMode] = useState('dashboard');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [registrationsByTournament, setRegistrationsByTournament] = useState({});

  useEffect(() => {
    const loadRegistrations = async () => {
      const { data } = await supabase
        .from('match_registrations')
        .select('id, tournament_id, ff_uid, ign, profiles:user_id(username, phone, ff_uid, ign)')
        .order('created_at', { ascending: false });

      const grouped = (data || []).reduce((acc, row) => {
        if (!acc[row.tournament_id]) acc[row.tournament_id] = [];
        acc[row.tournament_id].push(row);
        return acc;
      }, {});
      setRegistrationsByTournament(grouped);
    };

    loadRegistrations();
  }, [tournaments]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    const response = await fetch('/api/deleteTournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: id, userId })
    });
    if (!response.ok) {
      alert('Unable to delete this tournament.');
      return;
    }
    await refreshTournaments();
  };

  const saveCreate = async (form) => {
    setSaving(true);
    const { error } = await supabase.from('tournaments').insert([{
      ...form,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: form.match_time ? new Date(form.match_time).toISOString() : null
    }]);
    setSaving(false);
    if (error) return alert(error.message);
    setMode('dashboard');
    await refreshTournaments();
  };

  const saveUpdate = async (form) => {
    setSaving(true);
    const { error } = await supabase.from('tournaments').update({
      ...form,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: form.match_time ? new Date(form.match_time).toISOString() : null
    }).eq('id', editing.id);
    setSaving(false);
    if (error) return alert(error.message);
    setEditing(null);
    setMode('dashboard');
    await refreshTournaments();
  };

  const cards = useMemo(() => (tournaments || []).map((tournament) => ({
    ...tournament,
    players: registrationsByTournament[tournament.id] || []
  })), [tournaments, registrationsByTournament]);

  if (mode === 'create') return <TournamentForm onSave={saveCreate} onCancel={() => setMode('dashboard')} saving={saving} />;
  if (mode === 'edit') return <TournamentForm initial={editing} onSave={saveUpdate} onCancel={() => { setMode('dashboard'); setEditing(null); }} saving={saving} />;

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3>Admin Dashboard</h3>
        <motion.button className="btn btn-primary" onClick={() => setMode('create')} whileTap={{ scale: 0.95 }}>
          <Plus size={16} /> Create
        </motion.button>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        {cards.map((tournament) => (
          <div key={tournament.id} className="tournament-card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <h4 style={{ marginBottom: '4px' }}>{tournament.name}</h4>
                <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{formatMatchDateTime(tournament.match_time)}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => { setEditing({ ...tournament, match_time: toDatetimeLocalInput(tournament.match_time) }); setMode('edit'); }}><Edit size={14} /></button>
                <button className="btn btn-outline" onClick={() => handleDelete(tournament.id, tournament.name)}><Trash2 size={14} /></button>
              </div>
            </div>

            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
              <strong style={{ fontSize: '13px' }}>Players ({tournament.players.length})</strong>
              {tournament.players.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '6px' }}>No players joined yet.</p>
              ) : (
                <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                  {tournament.players.map((player) => (
                    <div key={player.id} style={{ background: '#11111a', borderRadius: '10px', padding: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}><User size={13} /> {player.profiles?.username || 'player'}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Phone: {player.profiles?.phone || '-'}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>FF UID: {player.ff_uid || player.profiles?.ff_uid || '-'}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>IGN: {player.ign || player.profiles?.ign || '-'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
