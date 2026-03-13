import React, { useState, useEffect } from 'react';
import { 
  Flame, Mail, Lock, Loader, LogIn, UserPlus, LogOut,
  Trophy, Home, Wallet, User, Shield, Clock, Users, Plus, ChevronRight, Star, 
  Settings, Edit, Trash2, MessageCircle, Youtube, Instagram, Search, X
} from 'lucide-react';
import supabase from './lib/supabaseClient';
import './App.css';

// ================== LOGIN SCREEN ==================
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (type) => {
    setLoading(true);
    try {
      if (type === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.reload();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const defaultUsername = email.split('@')[0];
          await supabase.from('profiles').insert([{ 
            id: data.user.id, 
            username: defaultUsername, 
            level: 1, 
            wins: 0, 
            role: 'user', 
            balance: 0,
            ff_id: '',
            nickname: ''
          }]);
        }
        alert("✅ Account Created! Please login.");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <div className="login-page">
          <div className="login-brand">
            <Flame className="brand-icon" size={60} />
            <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
            <p style={{color: 'var(--text-dim)'}}>Compete & Win Real Cash</p>
          </div>
          <div className="login-card">
            <div className="input-group">
              <Mail size={20} className="input-icon" />
              <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" />
            </div>
            <div className="input-group">
              <Lock size={20} className="input-icon" />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-input" />
            </div>
            <button onClick={() => handleAuth('login')} disabled={loading} className="btn btn-primary">
              {loading ? <Loader size={20} className="spin" /> : <LogIn size={20} />} Login
            </button>
            <button onClick={() => handleAuth('signup')} disabled={loading} className="btn btn-outline">
              <UserPlus size={20} /> Create Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================== MAIN APP ==================
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { 
      setSession(data.session); 
      setAuthLoading(false); 
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { 
      setSession(session); 
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if(!session) return;
    const fetchProfile = async () => {
      const {data} = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setUserProfile(data);
    };
    fetchProfile();
  }, [session]);

  const fetchTournaments = async () => {
    const {data} = await supabase.from('tournaments').select('*').order('created_at', {ascending: false});
    setTournaments(data || []);
  };

  useEffect(() => {
    if(session) fetchTournaments();
  }, [session]);

  if (authLoading) return (
    <div className="app-container">
      <div className="mobile-frame" style={{display:'flex', justifyContent:'center', alignItems:'center'}}>
        <Flame size={50} className="spin" />
      </div>
    </div>
  );

  if (!session) return <LoginScreen />;

  const isAdmin = userProfile?.role === 'admin';
  const user = {
    name: userProfile?.username || session.user.email.split('@')[0],
    level: userProfile?.level || 1,
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`,
    ff_id: userProfile?.ff_id || '',
    nickname: userProfile?.nickname || ''
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={userProfile?.balance || 0} user={user} />
        <main className="main-content">
          {currentView === 'home' && <HomeView tournaments={tournaments} onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} />}
          {currentView === 'tournament' && <TournamentDetailView tournament={selectedTournament} userProfile={userProfile} setView={setCurrentView} onJoinSuccess={fetchTournaments} />}
          {currentView === 'wallet' && <WalletView balance={userProfile?.balance || 0} />}
          {currentView === 'profile' && <ProfileView user={user} profileData={userProfile} />}
          {currentView === 'admin' && <AdminView isAdmin={isAdmin} tournaments={tournaments} setTournaments={setTournaments} refreshList={fetchTournaments} />}
        </main>
        <BottomNav currentView={currentView} setView={setCurrentView} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <Flame size={24} color="#ff4d00" />
          <h1 style={{marginLeft: '8px'}}>CLASH<span className="brand-highlight">ARENA</span></h1>
        </div>
        <div className="header-actions">
          <div className="balance-pill"><Wallet size={16} /> ₹{balance}</div>
          <img src={user.avatar} alt="Avatar" className="header-avatar" />
        </div>
      </div>
    </header>
  );
}

function HomeView({ tournaments, onTournamentSelect }) {
  return (
    <div className="view home-view">
      <section className="hero-section">
        <span className="badge live-badge"><span className="pulse"></span> LIVE NOW</span>
        <h2>Compete & Win<br/><span className="gradient-text">Real Cash</span></h2>
      </section>

      <section className="stats-row">
        <div className="stat-card"><Trophy size={28} className="stat-icon" /><div><span className="stat-value">₹5L+</span><span className="stat-label">Prize Pool</span></div></div>
        <div className="stat-card"><Users size={28} className="stat-icon" /><div><span className="stat-value">{tournaments.length}+</span><span className="stat-label">Matches</span></div></div>
      </section>

      <section className="section">
        <div className="section-header"><h3>Live Matches</h3></div>
        {tournaments.length === 0 ? (
          <p style={{textAlign:'center', color:'#666', padding: '40px'}}>No matches available.</p>
        ) : tournaments.map(t => (
          <div key={t.id} className="tournament-card" onClick={() => onTournamentSelect(t)}>
            <div className="tournament-image" style={{backgroundImage: `url(${t.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'})`}}>
              <div className="tournament-overlay">
                <span className={`status-badge ${t.status}`}>{t.status}</span>
              </div>
            </div>
            <div className="tournament-info">
              <div className="tournament-header"><h4>{t.name}</h4><span className="prize-tag">₹{t.prize}</span></div>
              <div className="tournament-meta">
                <span className="meta-item"><Users size={16} /> {t.current_players || 0}/{t.max_players}</span>
                <span className="meta-item"><Clock size={16} /> {t.match_time ? new Date(t.match_time).toLocaleDateString() : 'TBA'}</span>
              </div>
              <div className="tournament-footer">
                <span className="mode-badge">{t.mode}</span>
                <span className="entry-fee">₹{t.entry_fee}</span>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, userProfile, setView, onJoinSuccess }) {
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [joinData, setJoinData] = useState({ff_uid: '', ign: ''});

  useEffect(() => {
    if(!tournament || !userProfile) return;
    const checkJoin = async () => {
      const {data} = await supabase.from('match_registrations').select('*')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userProfile.id)
        .single();
      if(data) setAlreadyJoined(true);
    };
    checkJoin();
  }, [tournament, userProfile]);

  const handleJoin = async () => {
    if(!joinData.ff_uid || !joinData.ign) {
      alert("Please enter both FF UID and In-game Name!");
      return;
    }

    if(userProfile.balance < tournament.entry_fee) {
      alert("Insufficient Balance!");
      return;
    }

    setJoining(true);
    try {
      // Deduct balance
      const newBal = userProfile.balance - tournament.entry_fee;
      await supabase.from('profiles').update({balance: newBal}).eq('id', userProfile.id);

      // Register with FF details
      const {error} = await supabase.from('match_registrations').insert({
        tournament_id: tournament.id,
        user_id: userProfile.id,
        ff_uid: joinData.ff_uid,
        ign: joinData.ign,
        status: 'joined'
      });

      if(error) throw error;

      // Update count
      await supabase.from('tournaments').update({
        current_players: (tournament.current_players || 0) + 1
      }).eq('id', tournament.id);

      setAlreadyJoined(true);
      setShowJoinModal(false);
      alert("✅ Successfully Joined!");
      onJoinSuccess();
    } catch(err) {
      alert("Error: " + err.message);
    }
    setJoining(false);
  };

  if (!tournament) return null;

  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>← Back</button>
      <div className="detail-hero" style={{backgroundImage: `url(${tournament.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'})`}}>
        <div className="detail-hero-overlay">
          <span className={`status-badge ${tournament.status}`}>{tournament.status}</span>
          <h2>{tournament.name}</h2>
          <div className="detail-prize">Prize: ₹{tournament.prize}</div>
        </div>
      </div>

      <div className="detail-content">
        <div className="info-grid">
          <div className="info-item"><span className="label">Entry Fee</span><span className="value">₹{tournament.entry_fee}</span></div>
          <div className="info-item"><span className="label">Mode</span><span className="value">{tournament.mode}</span></div>
          <div className="info-item"><span className="label">Players</span><span className="value">{tournament.current_players || 0}/{tournament.max_players}</span></div>
          <div className="info-item"><span className="label">Time</span><span className="value">{tournament.match_time ? new Date(tournament.match_time).toLocaleString() : 'TBA'}</span></div>
        </div>

        <div style={{background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', marginBottom: '20px'}}>
          <h4 style={{color: 'var(--primary)', marginBottom: '10px'}}>📜 Rules</h4>
          <p style={{whiteSpace: 'pre-line', fontSize: '14px', color: '#ccc'}}>{tournament.rules || 'No rules specified.'}</p>
        </div>

        {!alreadyJoined ? (
          <button className="btn btn-primary" onClick={() => setShowJoinModal(true)}>
            <Trophy size={20} /> Join Tournament (₹{tournament.entry_fee})
          </button>
        ) : (
          <div style={{background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', padding: '20px', borderRadius: '16px'}}>
            <h3 style={{color: '#22c55e', marginBottom: '15px', textAlign: 'center'}}>✅ Registered!</h3>
            <div className="info-grid" style={{marginBottom: '15px'}}>
              <div className="info-item"><span className="label">Room ID</span><span className="value">{tournament.room_id || 'Wait...'}</span></div>
              <div className="info-item"><span className="label">Password</span><span className="value">{tournament.room_password || 'Wait...'}</span></div>
            </div>
            <p style={{textAlign: 'center', fontSize: '12px', color: '#888'}}>Room details active 15 mins before match</p>
          </div>
        )}
      </div>

      {showJoinModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
          <div style={{background: 'var(--bg-card)', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '350px'}}>
            <h3 style={{marginBottom: '20px', textAlign: 'center'}}>Enter Game Details</h3>
            <input className="form-input" placeholder="Free Fire UID" value={joinData.ff_uid} onChange={(e) => setJoinData({...joinData, ff_uid: e.target.value})} style={{marginBottom: '15px'}} />
            <input className="form-input" placeholder="In-Game Name" value={joinData.ign} onChange={(e) => setJoinData({...joinData, ign: e.target.value})} style={{marginBottom: '20px'}} />
            <button className="btn btn-primary" onClick={handleJoin} disabled={joining} style={{marginBottom: '10px'}}>
              {joining ? <Loader className="spin" size={20}/> : 'Confirm Join'}
            </button>
            <button className="btn btn-outline" onClick={() => setShowJoinModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletView({ balance }) {
  return (
    <div className="view">
      <h2 style={{fontSize: '24px', fontWeight: 800, marginBottom: '20px'}}>My Wallet</h2>
      <div style={{background: 'linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,215,0,0.1))', border: '1px solid var(--primary)', borderRadius: '24px', padding: '30px', textAlign: 'center'}}>
        <p style={{color: 'var(--text-dim)'}}>Total Balance</p>
        <h1 style={{color: 'var(--gold)', fontSize: '48px', margin: '10px 0'}}>₹{balance}</h1>
        <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
          <button className="btn btn-primary" onClick={() => alert("UPI: yourupi@paytm\nSend screenshot on WhatsApp")}>Add Money</button>
          <button className="btn btn-outline" onClick={() => alert("Min ₹100\nWhatsApp: 9999999999")}>Withdraw</button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user, profileData }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ff_id: user.ff_id, nickname: user.nickname});

  const save = async () => {
    await supabase.from('profiles').update(form).eq('id', profileData.id);
    alert("Updated!");
    window.location.reload();
  };

  return (
    <div className="view">
      <div style={{textAlign: 'center', marginBottom: '30px'}}>
        <img src={user.avatar} alt="Profile" className="profile-avatar-large" />
        <h2 style={{fontSize: '24px', fontWeight: 800}}>{user.nickname || user.name}</h2>
        <span className="status-badge upcoming">Level {user.level}</span>

        {editing ? (
          <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '20px auto'}}>
            <input className="form-input" placeholder="FF UID" value={form.ff_id} onChange={(e) => setForm({...form, ff_id: e.target.value})} />
            <input className="form-input" placeholder="Nickname" value={form.nickname} onChange={(e) => setForm({...form, nickname: e.target.value})} />
            <button className="btn btn-primary" onClick={save}>Save</button>
            <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-outline" style={{marginTop: '20px', width: 'auto'}} onClick={() => setEditing(true)}>Edit Profile</button>
        )}
      </div>

      <div className="menu-list">
        <a href="https://wa.me/919999999999" target="_blank" rel="noreferrer" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="menu-item"><MessageCircle size={20} color="#25D366"/> WhatsApp Support <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        </a>
        <a href="https://youtube.com/@yourchannel" target="_blank" rel="noreferrer" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="menu-item"><Youtube size={20} color="#FF0000"/> YouTube <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        </a>
        <a href="https://instagram.com/yourhandle" target="_blank" rel="noreferrer" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="menu-item"><Instagram size={20} color="#E1306C"/> Instagram <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        </a>
        <div className="menu-item" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{color: '#ef4444'}}>
          <LogOut size={20}/> Logout
        </div>
      </div>
    </div>
  );
}

// ================== PROFESSIONAL ADMIN ==================
const EMPTY_FORM = {
  name: '', mode: 'Solo', prize: '', entry_fee: '', max_players: 100,
  status: 'registration', match_time: '', image_url: '', rules: '',
  room_id: '', room_password: ''
};

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <input className="form-input" placeholder="Tournament Name *" value={form.name} onChange={e => set('name', e.target.value)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <input className="form-input" type="number" placeholder="Prize ₹ *" value={form.prize} onChange={e => set('prize', e.target.value)} />
        <input className="form-input" type="number" placeholder="Entry Fee ₹ *" value={form.entry_fee} onChange={e => set('entry_fee', e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <select className="form-input" value={form.mode} onChange={e => { 
          const mode = e.target.value; 
          set('mode', mode); 
          if(mode === '1v1') set('max_players', 2);
        }}>
          <option>Solo</option>
          <option>Duo</option>
          <option>Squad</option>
          <option value="1v1">1v1 (2 Players)</option>
        </select>
        <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="registration">Registration</option>
          <option value="upcoming">Upcoming</option>
          <option value="live">Live</option>
        </select>
      </div>

      <input className="form-input" type="number" placeholder="Max Players" value={form.max_players} onChange={e => set('max_players', e.target.value)} disabled={form.mode === '1v1'} />
      <input className="form-input" type="datetime-local" value={form.match_time} onChange={e => set('match_time', e.target.value)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <input className="form-input" placeholder="Room ID" value={form.room_id} onChange={e => set('room_id', e.target.value)} />
        <input className="form-input" placeholder="Room Password" value={form.room_password} onChange={e => set('room_password', e.target.value)} />
      </div>

      <input className="form-input" placeholder="Banner Image URL" value={form.image_url} onChange={e => set('image_url', e.target.value)} />
      <textarea className="form-input" placeholder="Rules (e.g. No emulator, Level 50+ required...)" rows="4" value={form.rules} onChange={e => set('rules', e.target.value)} style={{resize: 'vertical'}} />

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Loader size={16} className="spin" /> : <Plus size={16} />} {saving ? 'Saving...' : 'Save Tournament'}
        </button>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AdminView({ isAdmin, tournaments, setTournaments, refreshList }) {
  const [view, setView] = useState('dashboard'); // dashboard, create, list, edit
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  if (!isAdmin) return <div className="view" style={{textAlign: 'center', paddingTop: '60px'}}><Shield size={56} color="#ef4444" /><h3>Access Denied</h3></div>;

  const handleCreate = async (form) => {
    if (!form.name || !form.prize) return alert('Name and Prize required');
    setSaving(true);
    const { data, error } = await supabase.from('tournaments').insert([{
      ...form,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: form.match_time || null,
      image_url: form.image_url || null
    }]).select();
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setTournaments([data[0], ...tournaments]);
    alert('✅ Created!');
    setView('dashboard');
    refreshList();
  };

  const handleUpdate = async (form) => {
    if (!form.name || !form.prize) return alert('Name and Prize required');
    setSaving(true);
    const { error } = await supabase.from('tournaments').update({
      ...form,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
    }).eq('id', editData.id);
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setTournaments(tournaments.map(t => t.id === editData.id ? { ...t, ...form } : t));
    alert('✅ Updated!');
    setView('list');
    setEditData(null);
    refreshList();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    setTournaments(tournaments.filter(t => t.id !== id));
    refreshList();
  };

  const openEdit = (t) => {
    setEditData({...t, match_time: t.match_time ? new Date(t.match_time).toISOString().slice(0, 16) : ''});
    setView('edit');
  };

  const stats = {
    total: tournaments.length,
    live: tournaments.filter(t => t.status === 'live').length,
    upcoming: tournaments.filter(t => t.status === 'upcoming').length,
    registration: tournaments.filter(t => t.status === 'registration').length
  };

  const filtered = tournaments.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const statusColor = { live: '#ef4444', upcoming: '#3b82f6', registration: '#22c55e', completed: '#888' };

  if (view === 'create') return (
    <div className="view">
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
        <button onClick={() => setView('dashboard')} style={{background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '20px'}}>←</button>
        <h2 style={{fontSize: '20px', fontWeight: 800}}>Create Tournament</h2>
      </div>
      <TournamentForm onSave={handleCreate} onCancel={() => setView('dashboard')} saving={saving} />
    </div>
  );

  if (view === 'edit') return (
    <div className="view">
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
        <button onClick={() => setView('list')} style={{background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '20px'}}>←</button>
        <h2 style={{fontSize: '20px', fontWeight: 800}}>Edit Tournament</h2>
      </div>
      <TournamentForm initial={editData} onSave={handleUpdate} onCancel={() => { setView('list'); setEditData(null); }} saving={saving} />
    </div>
  );

  if (view === 'list') return (
    <div className="view">
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px'}}>
        <button onClick={() => setView('dashboard')} style={{background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '20px'}}>←</button>
        <h2 style={{fontSize: '20px', fontWeight: 800}}>Manage Tournaments</h2>
      </div>

      <input style={{background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', color: 'white', width: '100%', marginBottom: '16px'}} 
        placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />

      <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
        {filtered.length === 0 && <p style={{color: '#666', textAlign: 'center'}}>No tournaments found.</p>}
        {filtered.map(t => (
          <div key={t.id} style={{background: '#16161f', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', borderLeft: `3px solid ${statusColor[t.status] || '#888'}`}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
              <div>
                <h4 style={{fontSize: '15px', fontWeight: 700}}>{t.name}</h4>
                <span style={{fontSize: '12px', color: statusColor[t.status], fontWeight: 600, textTransform: 'uppercase'}}>{t.status}</span>
                <span style={{fontSize: '12px', color: 'var(--text-dim)', marginLeft: '10px'}}>{t.current_players || 0}/{t.max_players} joined</span>
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <button onClick={() => openEdit(t)} style={{background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '8px', padding: '6px 10px'}}><Edit size={14} /></button>
                <button onClick={() => handleDelete(t.id, t.name)} style={{background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', padding: '6px 10px'}}><Trash2 size={14} /></button>
              </div>
            </div>
            <div style={{fontSize: '13px', color: 'var(--text-dim)'}}>₹{t.prize} Prize • Entry ₹{t.entry_fee}</div>
            {t.room_id && <div style={{fontSize: '12px', color: '#facc15', marginTop: '4px'}}>Room: {t.room_id}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="view">
      <h2 style={{fontSize: '24px', fontWeight: 800, marginBottom: '20px'}}>Admin Dashboard</h2>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px'}}>
        <div style={{background: 'linear-gradient(135deg, rgba(255,77,0,0.2), #16161f)', border: '1px solid rgba(255,77,0,0.3)', borderRadius: '16px', padding: '18px'}}>
          <div style={{fontSize: '28px', fontWeight: 800, color: 'var(--primary)'}}>{stats.total}</div>
          <div style={{fontSize: '12px', color: 'var(--text-dim)'}}>Total Tournaments</div>
        </div>
        <div style={{background: 'linear-gradient(135deg, rgba(34,197,94,0.2), #16161f)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '16px', padding: '18px'}}>
          <div style={{fontSize: '28px', fontWeight: 800, color: '#22c55e'}}>{stats.live}</div>
          <div style={{fontSize: '12px', color: 'var(--text-dim)'}}>Live Now</div>
        </div>
        <div style={{background: 'linear-gradient(135deg, rgba(59,130,246,0.2), #16161f)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '16px', padding: '18px'}}>
          <div style={{fontSize: '28px', fontWeight: 800, color: '#3b82f6'}}>{stats.upcoming}</div>
          <div style={{fontSize: '12px', color: 'var(--text-dim)'}}>Upcoming</div>
        </div>
        <div style={{background: 'linear-gradient(135deg, rgba(245,158,11,0.2), #16161f)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '16px', padding: '18px'}}>
          <div style={{fontSize: '28px', fontWeight: 800, color: '#f59e0b'}}>{stats.registration}</div>
          <div style={{fontSize: '12px', color: 'var(--text-dim)'}}>Open Reg</div>
        </div>
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
        <button className="btn btn-primary" onClick={() => setView('create')}><Plus size={18} /> Create New Tournament</button>
        <button className="btn btn-outline" onClick={() => setView('list')}><Settings size={18} /> Manage All ({tournaments.length})</button>
      </div>

      <h3 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', color: 'var(--text-dim)'}}>Recent</h3>
      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
        {tournaments.slice(0, 3).map(t => (
          <div key={t.id} style={{background: '#16161f', padding: '12px 16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontWeight: 600}}>{t.name}</span>
            <span style={{fontSize: '12px', color: statusColor[t.status]}}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ currentView, setView, isAdmin }) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin' }] : []),
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.id} className={`nav-item ${currentView === t.id ? 'active' : ''}`} onClick={() => setView(t.id)}>
          <t.icon size={22} /><span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}