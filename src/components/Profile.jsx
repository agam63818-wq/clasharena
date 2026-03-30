import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, LogOut } from 'lucide-react';
import supabase from '../lib/supabaseClient';
import AdminView from './AdminView';

export default function Profile({
  user,
  profileData,
  onProfileUpdate,
  onLogout,
  tournaments,
  refreshTournaments
}) {
  const [editing, setEditing] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ff_uid: profileData?.ff_uid || '',
    ign: profileData?.ign || '',
    username: profileData?.username || ''
  });

  const save = async () => {
    if (!profileData?.id) return;
    setSaving(true);
    await supabase.from('profiles').update(form).eq('id', profileData.id);
    setSaving(false);
    setEditing(false);
    onProfileUpdate();
  };

  return (
    <div className="view">
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <motion.img src={user.avatar} alt="profile" className="profile-avatar-large" />
        <h2>{profileData?.username || user.name}</h2>
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '15px' }}>
          <input className="form-input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="form-input" placeholder="FF UID" value={form.ff_uid} onChange={(e) => setForm({ ...form, ff_uid: e.target.value })} />
          <input className="form-input" placeholder="IGN" value={form.ign} onChange={(e) => setForm({ ...form, ign: e.target.value })} />
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Loader size={14} className="spin" /> : 'Save Profile'}</button>
          <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit Profile</button>
      )}

      {profileData?.is_admin ? (
        <div style={{ marginTop: '16px' }}>
          <button className="btn btn-primary" onClick={() => setShowAdmin((prev) => !prev)}>
            {showAdmin ? 'Hide Admin Dashboard' : 'Admin Dashboard'}
          </button>
          {showAdmin && (
            <AdminView
              userId={profileData.id}
              tournaments={tournaments}
              refreshTournaments={refreshTournaments}
            />
          )}
        </div>
      ) : null}

      <button className="btn btn-outline" onClick={onLogout} style={{ marginTop: '16px', color: '#ef4444' }}>
        <LogOut size={16} /> Logout
      </button>
    </div>
  );
}
