import React, { useState, useEffect } from 'react';
import { 
  Flame, Mail, Lock, Loader, LogIn, UserPlus, LogOut,
  Trophy, Home, Wallet, User, Shield, Clock, Users, Plus, ChevronRight, Star, Settings, Edit, Trash2, MessageCircle, Youtube, Instagram
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
          // Default username from email
          const defaultUsername = email.split('@')[0];
          await supabase.from('profiles').upsert([{ 
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
        <div className="login-page view">
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
              {loading ? <Loader size={20} className="spin" /> : <LogIn size={20} />} {loading ? "Processing..." : "Login"}
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

// ================== MAIN APP COMPONENT ==================
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tournaments, setTournaments] = useState([]);

  // Auth Check
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Fetch Profile
  useEffect(() => {
    if(!session) return;
    const fetchProfile = async () => {
      const {data} = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setUserProfile(data);
    };
    fetchProfile();
  }, [session]);

  // Fetch Tournaments (Real-time)
  useEffect(() => {
    const fetchTournaments = async () => {
      const {data} = await supabase.from('tournaments').select('*').order('created_at', {ascending: false});
      setTournaments(data || []);
    };
    fetchTournaments();

    // Realtime Subscription for Player Count updates
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_registrations' }, () => {
        fetchTournaments(); // Refresh list when someone joins
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  if (authLoading) return <div className="app-container"><div className="mobile-frame" style={{display:'flex', justifyContent:'center', alignItems:'center'}}><Flame size={50} className="spin" /></div></div>;
  if (!session) return <LoginScreen />;

  const isAdmin = userProfile?.role === 'admin';
  const user = {
    name: userProfile?.username || session.user.email.split('@')[0],
    level: userProfile?.level || 1,
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`,
    ff_id: userProfile?.ff_id || 'Not Set',
    nickname: userProfile?.nickname || userProfile?.username
  };

  const renderContent = () => {
    switch(currentView) {
      case 'home': return <HomeView tournaments={tournaments} onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} />;
      case 'tournament': return <TournamentDetailView tournament={selectedTournament} userProfile={userProfile} setView={setCurrentView} refreshList={() => {/* trigger refresh */}} />;
      case 'wallet': return <WalletView balance={userProfile?.balance || 0} />;
      case 'profile': return <ProfileView user={user} profileData={userProfile} />;
      case 'admin': return <AdminView isAdmin={isAdmin} tournaments={tournaments} setTournaments={setTournaments} session={session} />;
      default: return <HomeView tournaments={tournaments} onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} />;
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={userProfile?.balance || 0} user={user} />
        <main className="main-content">{renderContent()}</main>
        <BottomNav currentView={currentView} setView={setCurrentView} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

// ================== COMPONENTS ==================
function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <Flame className="brand-icon" style={{filter: 'none', margin:0}} size={24} color="#ff4d00" />
          <h1 style={{margin:0}}>CLASH<span className="brand-highlight">ARENA</span></h1>
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
        <div className="status-badge live" style={{marginBottom: '12px'}}><span className="live-dot"></span> LIVE NOW</div>
        <h2>Compete & Win<br/><span className="gradient-text">Real Cash</span></h2>
      </section>

      <section className="stats-row">
        <div className="stat-card"><Trophy size={28} className="stat-icon" /><div><span className="stat-value">₹5L+</span><span className="stat-label">Prize Pool</span></div></div>
        <div className="stat-card"><Users size={28} className="stat-icon" /><div><span className="stat-value">{tournaments.length}+</span><span className="stat-label">Matches</span></div></div>
      </section>

      <section className="section">
        <div className="section-header"><h3>Live Matches</h3></div>
        {tournaments.length === 0 ? <p style={{textAlign:'center', color:'#666'}}>No matches available yet.</p> : 
          tournaments.map(t => (
            <div key={t.id} className="tournament-card" onClick={() => onTournamentSelect(t)}>
              <div className="tournament-image" style={{backgroundImage: `url(https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800)`}}>
                <div className="tournament-overlay">
                  <span className={`status-badge ${t.status}`}>{t.status}</span>
                </div>
              </div>
              <div className="tournament-info">
                <div className="tournament-header"><h4>{t.name}</h4><span className="prize-tag">₹{t.prize}</span></div>
                <div className="tournament-meta">
                  <span className="meta-item"><Users size={16} /> {t.current_players || 0}/{t.max_players}</span>
                  <span className="meta-item"><Clock size={16} /> {t.match_time ? new Date(t.match_time).toLocaleTimeString() : 'Starting Soon'}</span>
                </div>
                <div className="tournament-footer">
                  <span className="mode-badge">{t.mode}</span>
                  <span className="entry-fee">Entry: ₹{t.entry_fee}</span>
                </div>
              </div>
            </div>
          ))
        }
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, userProfile, setView }) {
  const [joining, setJoining] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Check if already joined
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  useEffect(() => {
    if(!tournament || !userProfile) return;
    const checkJoin = async () => {
      const {data} = await supabase.from('match_registrations').select('*').eq('tournament_id', tournament.id).eq('user_id', userProfile.id).single();
      if(data) setAlreadyJoined(true);
    };
    checkJoin();
  }, [tournament, userProfile]);

  const handleJoin = async () => {
    if(!userProfile.ff_id || !userProfile.nickname) {
      alert("⚠️ Please set your FF ID and Nickname in Profile first!");
      setView('profile');
      return;
    }

    if(userProfile.balance < tournament.entry_fee) {
      alert("❌ Insufficient Balance!");
      return;
    }

    setJoining(true);
    // 1. Deduct Balance
    const newBal = userProfile.balance - tournament.entry_fee;
    await supabase.from('profiles').update({balance: newBal}).eq('id', userProfile.id);

    // 2. Register User
    const {error} = await supabase.from('match_registrations').insert({
      tournament_id: tournament.id,
      user_id: userProfile.id,
      status: 'joined'
    });

    // 3. Update Player Count
    if(!error) {
      await supabase.rpc('increment_player_count', {match_id: tournament.id}); // You might need a function or just manual update
      // Simple manual update for now:
      const currentCount = tournament.current_players || 0;
      await supabase.from('tournaments').update({current_players: currentCount + 1}).eq('id', tournament.id);

      setAlreadyJoined(true);
      setShowDetails(true);
      alert("✅ Joined Successfully!");
    } else {
      alert("Error: " + error.message);
    }
    setJoining(false);
  };

  if (!tournament) return null;

  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>← Back</button>
      <div className="detail-hero" style={{backgroundImage: `url(https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800)`}}>
        <div className="detail-hero-overlay">
          <span className={`status-badge ${tournament.status}`} style={{marginBottom: '10px'}}>{tournament.status}</span>
          <h2>{tournament.name}</h2>
          <div className="detail-prize">Prize: ₹{tournament.prize}</div>
        </div>
      </div>

      <div className="view">
        <div className="info-grid">
          <div className="info-item"><span className="label">Entry Fee</span><span className="value">₹{tournament.entry_fee}</span></div>
          <div className="info-item"><span className="label">Mode</span><span className="value">{tournament.mode}</span></div>
          <div className="info-item"><span className="label">Players</span><span className="value">{tournament.current_players || 0}/{tournament.max_players}</span></div>
          <div className="info-item"><span className="label">Start Time</span><span className="value">{tournament.match_time ? new Date(tournament.match_time).toLocaleString() : 'TBA'}</span></div>
        </div>

        {/* Rules Section */}
        <div style={{background: '#1a1a1a', padding: '15px', borderRadius: '12px', marginBottom: '20px'}}>
          <h4 style={{color: 'var(--primary)', marginBottom: '8px'}}>📜 Match Rules</h4>
          <p style={{whiteSpace: 'pre-line', fontSize: '13px', color: '#ccc'}}>{tournament.rules || 'No specific rules defined.'}</p>
        </div>

        {!alreadyJoined ? (
          <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
            {joining ? <Loader className="spin" size={20}/> : <Trophy size={20}/>} 
            Join Now (₹{tournament.entry_fee})
          </button>
        ) : (
          <div style={{background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', padding: '20px', borderRadius: '16px', textAlign: 'center'}}>
            <h3 style={{color: '#22c55e', marginBottom: '15px'}}>✅ You are Registered!</h3>

            {!showDetails && <button className="btn btn-outline" onClick={() => setShowDetails(true)} style={{marginBottom: '15px'}}>Show Room Details</button>}

            {showDetails && (
              <>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px'}}>
                  <div className="info-item"><span className="label">Room ID</span><span className="value">{tournament.room_id || 'Wait for Admin'}</span></div>
                  <div className="info-item"><span className="label">Password</span><span className="value">{tournament.room_password || 'Wait for Admin'}</span></div>
                </div>
                <p style={{fontSize: '12px', color: '#aaa'}}>Room details will be active 15 mins before match.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletView({ balance }) {
  return (
    <div className="view">
      <h2 style={{fontSize: '24px', fontWeight: 800, marginBottom: '20px'}}>My Wallet</h2>
      <div className="info-item" style={{background: 'linear-gradient(135deg, rgba(255, 77, 0, 0.1), rgba(255, 215, 0, 0.1))', padding: '30px', border: '1px solid var(--primary)'}}>
        <p style={{color: 'var(--text-dim)', fontWeight: 600}}>Total Balance</p>
        <h1 style={{color: 'var(--gold)', fontSize: '48px', margin: '10px 0'}}>₹{balance}</h1>
        <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
          <button className="btn btn-primary" onClick={() => alert("UPI: your-upi-id@paytm\nSend screenshot on WhatsApp")}>Add Money</button>
          <button className="btn btn-outline" onClick={() => alert("Min withdrawal ₹100. Contact Support.")}>Withdraw</button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user, profileData }) {
  const [editing, setEditing] = useState(false);
  const [ffId, setFfId] = useState(profileData?.ff_id || '');
  const [nick, setNick] = useState(profileData?.nickname || '');

  const saveProfile = async () => {
    await supabase.from('profiles').update({ff_id: ffId, nickname: nick}).eq('id', profileData.id);
    alert("✅ Profile Updated!");
    setEditing(false);
    window.location.reload();
  };

  return (
    <div className="view">
      <div style={{textAlign: 'center', marginBottom: '30px'}}>
        <img src={user.avatar} alt="Profile" className="profile-avatar-large" />
        <h2 style={{fontSize: '24px', fontWeight: 800}}>{user.nickname || user.name}</h2>
        <span className="status-badge upcoming" style={{marginTop: '10px'}}>Level {user.level}</span>

        {editing ? (
          <div style={{marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '20px auto'}}>
            <input className="form-input" placeholder="Free Fire UID" value={ffId} onChange={e=>setFfId(e.target.value)} />
            <input className="form-input" placeholder="In-Game Nickname" value={nick} onChange={e=>setNick(e.target.value)} />
            <button className="btn btn-primary" onClick={saveProfile}>Save Changes</button>
            <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-outline" style={{width: 'auto', margin: '20px auto', padding: '8px 20px'}} onClick={() => setEditing(true)}>Edit Profile</button>
        )}
      </div>

      <div className="menu-list">
        <div className="menu-item"><MessageCircle size={20} color="#25D366"/> <span>WhatsApp Support</span> <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        <div className="menu-item"><Youtube size={20} color="#FF0000"/> <span>YouTube Channel</span> <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        <div className="menu-item"><Instagram size={20} color="#E1306C"/> <span>Follow on Insta</span> <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        <div className="menu-item" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)'}}><LogOut size={20}/> Logout</div>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  name: '', mode: 'Solo', prize: '', entry_fee: '', max_players: 100,
  status: 'registration', match_time: '', image_url: '', rules: '',
  room_id: '', room_password: ''
};

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = { background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px', color: 'white', fontSize: '14px', width: '100%', outline: 'none' };
  const labelStyle = { fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' };
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Tournament Name *</label>
        <input style={inputStyle} placeholder="e.g. Battle Royale Pro" value={form.name} onChange={e => set('name', e.target.value)} />
      </div>

      <div style={row2}>
        <div>
          <label style={labelStyle}>Mode *</label>
          <select style={inputStyle} value={form.mode} onChange={e => { set('mode', e.target.value); if (e.target.value === '1v1') set('max_players', 2); }}>
            <option>Solo</option>
            <option>Duo</option>
            <option>Squad</option>
            <option>1v1</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status *</label>
          <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="registration">Registration</option>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div style={row2}>
        <div>
          <label style={labelStyle}>Prize Pool (₹) *</label>
          <input style={inputStyle} type="number" placeholder="5000" value={form.prize} onChange={e => set('prize', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Entry Fee (₹) *</label>
          <input style={inputStyle} type="number" placeholder="50" value={form.entry_fee} onChange={e => set('entry_fee', e.target.value)} />
        </div>
      </div>

      <div style={row2}>
        <div>
          <label style={labelStyle}>Max Players</label>
          <input style={inputStyle} type="number" placeholder="100" value={form.max_players} onChange={e => set('max_players', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Match Time</label>
          <input style={inputStyle} type="datetime-local" value={form.match_time} onChange={e => set('match_time', e.target.value)} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Banner Image URL</label>
        <input style={inputStyle} placeholder="https://..." value={form.image_url} onChange={e => set('image_url', e.target.value)} />
      </div>

      <div style={row2}>
        <div>
          <label style={labelStyle}>Room ID</label>
          <input style={inputStyle} placeholder="Room ID" value={form.room_id} onChange={e => set('room_id', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Room Password</label>
          <input style={inputStyle} placeholder="Password" value={form.room_password} onChange={e => set('room_password', e.target.value)} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Rules & Instructions</label>
        <textarea
          style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
          placeholder={"1. Level 50+ required\n2. No emulators allowed\n3. Room code shared 15 mins before start\n4. Results announced after match"}
          value={form.rules}
          onChange={e => set('rules', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => onSave(form)}
          disabled={saving}
        >
          {saving ? <Loader size={16} className="spin" /> : <Plus size={16} />}
          {saving ? 'Saving...' : 'Save Tournament'}
        </button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AdminView({ isAdmin, tournaments, setTournaments, session }) {
  const [view, setView] = useState('dashboard');
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [registrationCounts, setRegistrationCounts] = useState({});

  useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.from('match_registrations').select('tournament_id');
      if (data) {
        const counts = {};
        data.forEach(r => { counts[r.tournament_id] = (counts[r.tournament_id] || 0) + 1; });
        setRegistrationCounts(counts);
      }
    };
    fetchCounts();
  }, [tournaments]);

  if (!isAdmin) return (
    <div className="view" style={{ textAlign: 'center', paddingTop: '60px' }}>
      <Shield size={56} color="#ef4444" style={{ marginBottom: '16px' }} />
      <h3>Access Denied</h3>
      <p style={{ color: 'var(--text-dim)', marginTop: '8px' }}>Admin only area</p>
    </div>
  );

  const handleCreate = async (form) => {
    if (!form.name || !form.prize) return alert('Tournament Name and Prize are required');
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
    alert('✅ Tournament Created!');
    setView('dashboard');
  };

  const handleUpdate = async (form) => {
    if (!form.name || !form.prize) return alert('Tournament Name and Prize are required');
    setSaving(true);
    const { error } = await supabase.from('tournaments').update({
      ...form,
      prize: Number(form.prize),
      entry_fee: Number(form.entry_fee),
      max_players: Number(form.max_players),
      match_time: form.match_time || null,
      image_url: form.image_url || null
    }).eq('id', editData.id);
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setTournaments(tournaments.map(t => t.id === editData.id ? { ...t, ...form } : t));
    alert('✅ Tournament Updated!');
    setView('list');
    setEditData(null);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    setTournaments(tournaments.filter(t => t.id !== id));
  };

  const openEdit = (t) => {
    setEditData({
      ...t,
      match_time: t.match_time ? new Date(t.match_time).toISOString().slice(0, 16) : ''
    });
    setView('edit');
  };

  const totalReg = Object.values(registrationCounts).reduce((a, b) => a + b, 0);
  const liveCount = tournaments.filter(t => t.status === 'live').length;
  const upcomingCount = tournaments.filter(t => t.status === 'upcoming').length;
  const regCount = tournaments.filter(t => t.status === 'registration').length;

  const filtered = tournaments.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusColor = { live: '#ef4444', upcoming: '#3b82f6', registration: '#22c55e', completed: '#888' };
  const cardStyle = { background: '#16161f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '18px' };

  if (view === 'create') return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setView('dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Create Tournament</h2>
      </div>
      <TournamentForm onSave={handleCreate} onCancel={() => setView('dashboard')} saving={saving} />
    </div>
  );

  if (view === 'edit') return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Edit Tournament</h2>
      </div>
      <TournamentForm initial={editData} onSave={handleUpdate} onCancel={() => { setView('list'); setEditData(null); }} saving={saving} />
    </div>
  );

  if (view === 'list') return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setView('dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>All Tournaments</h2>
      </div>

      <input
        style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', color: 'white', width: '100%', marginBottom: '12px', outline: 'none' }}
        placeholder="Search tournaments..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['all', 'live', 'upcoming', 'registration', 'completed'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', background: filterStatus === s ? 'var(--primary)' : 'transparent', color: filterStatus === s ? 'white' : 'var(--text-dim)', cursor: 'pointer', fontSize: '12px', textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.length === 0 && <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>No tournaments found.</p>}
        {filtered.map(t => (
          <div key={t.id} style={{ ...cardStyle, borderLeft: `3px solid ${statusColor[t.status] || '#888'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-dim)' }}>
                  <span style={{ color: statusColor[t.status], fontWeight: 600, textTransform: 'uppercase' }}>{t.status}</span>
                  <span>₹{t.prize} Prize</span>
                  <span>Entry ₹{t.entry_fee}</span>
                  <span>{registrationCounts[t.id] || 0}/{t.max_players} Joined</span>
                </div>
                {t.match_time && (
                  <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
                    🕐 {new Date(t.match_time).toLocaleString()}
                  </div>
                )}
                {t.room_id && (
                  <div style={{ fontSize: '12px', color: '#facc15', marginTop: '4px' }}>
                    🔐 Room: {t.room_id} | Pass: {t.room_password || '—'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => openEdit(t)}
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }} onClick={() => setView('create')}>
        <Plus size={16} /> Add New Tournament
      </button>
    </div>
  );

  return (
    <div className="view">
      <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '20px' }}>Admin Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(255,77,0,0.15), #16161f)', borderColor: 'rgba(255,77,0,0.2)' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary)' }}>{tournaments.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Total Tournaments</div>
        </div>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(34,197,94,0.15), #16161f)', borderColor: 'rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#22c55e' }}>{totalReg}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Total Registrations</div>
        </div>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(239,68,68,0.15), #16161f)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>{liveCount}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Live Now</div>
        </div>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(59,130,246,0.15), #16161f)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6' }}>{upcomingCount + regCount}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Upcoming/Open</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button className="btn btn-primary" onClick={() => setView('create')}>
          <Plus size={18} /> Create New Tournament
        </button>
        <button className="btn btn-outline" onClick={() => setView('list')}>
          <Settings size={18} /> Manage All Tournaments ({tournaments.length})
        </button>
      </div>

      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-dim)' }}>Recent Tournaments</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tournaments.slice(0, 4).map(t => (
            <div key={t.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</div>
                <div style={{ fontSize: '12px', color: statusColor[t.status] || '#888', marginTop: '2px', textTransform: 'uppercase', fontWeight: 600 }}>
                  {t.status} • {registrationCounts[t.id] || 0} joined
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => openEdit(t)} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(t.id, t.name)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
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