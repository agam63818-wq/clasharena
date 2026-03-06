import React, { useState, useEffect } from 'react';
import { 
  Flame, Mail, Lock, Loader, LogIn, UserPlus, LogOut,
  Trophy, Home, Wallet, User, Shield, Clock, Users, Plus, ChevronRight, Star, Settings
} from 'lucide-react';
import supabase from './lib/supabaseClient';
import './App.css';

// ================== MOCK DATA ==================
const TOURNAMENTS = [
  { id: 1, name: "Battle Royale Pro", mode: "Solo", prize: 5000, entryFee: 50, maxPlayers: 100, currentPlayers: 87, status: "live", timeRemaining: "2h 15m", image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop" },
  { id: 2, name: "Power Duo Championship", mode: "Duo", prize: 10000, entryFee: 100, maxPlayers: 50, currentPlayers: 32, status: "upcoming", startTime: "Today, 6:00 PM", image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop" },
  { id: 3, name: "Squad Rush", mode: "Squad", prize: 15000, entryFee: 200, maxPlayers: 25, currentPlayers: 12, status: "registration", startTime: "Tomorrow, 8:00 PM", image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop" }
];

const LEADERBOARD = [
  { rank: 1, name: "ProGamer_X", wins: 24, earnings: 12500 },
  { rank: 2, name: "Ninja_FF", wins: 21, earnings: 10200 },
  { rank: 3, name: "BeastMode", wins: 18, earnings: 8900 },
  { rank: 4, name: "Sniper_King", wins: 15, earnings: 7200 },
  { rank: 5, name: "Elite_Slayer", wins: 12, earnings: 5400 }
];

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
          await supabase.from('profiles').upsert([{ id: data.user.id, username: email.split('@')[0], level: 1, wins: 0, role: 'user', balance: 0 }]);
        }
        alert("✅ Account Created! You can now login.");
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
            <h1 style={{fontSize: '32px', fontWeight: 800, marginTop: '10px'}}>CLASH<span className="brand-highlight">ARENA</span></h1>
            <p style={{color: 'var(--text-dim)', marginTop: '8px'}}>Compete & Win Real Cash</p>
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
            <button onClick={() => handleAuth('login')} disabled={loading} className="btn btn-primary" style={{marginTop: '10px'}}>
              {loading ? <Loader size={20} className="spin" /> : <LogIn size={20} />} {loading ? "Processing..." : "Login to Arena"}
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if(!session) return;
    const fetchProfile = async () => {
      const {data} = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setUserProfile(data);
    };
    fetchProfile();
  }, [session]);

  if (authLoading) return <div className="app-container"><div className="mobile-frame" style={{display:'flex', justifyContent:'center', alignItems:'center'}}><Flame size={50} className="spin" /></div></div>;
  if (!session) return <LoginScreen />;

  const balance = userProfile?.balance || 0;
  const isAdmin = userProfile?.role === 'admin';
  const user = {
    name: userProfile?.username || session.user.email.split('@')[0],
    level: userProfile?.level || 1,
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`
  };

  const renderContent = () => {
    switch(currentView) {
      case 'home': return <HomeView onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} />;
      case 'tournament': return <TournamentDetailView tournament={selectedTournament} balance={balance} setView={setCurrentView} />;
      case 'wallet': return <WalletView balance={balance} />;
      case 'profile': return <ProfileView user={user} />;
      case 'admin': return <AdminView isAdmin={isAdmin} setView={setCurrentView} />;
      default: return <HomeView onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} />;
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={balance} user={user} />
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

function HomeView({ onTournamentSelect }) {
  return (
    <div className="view home-view">
      <section className="hero-section">
        <div className="status-badge live" style={{marginBottom: '12px'}}><span className="live-dot"></span> LIVE NOW</div>
        <h2>Compete & Win<br/><span className="gradient-text">Real Cash</span></h2>
        <p style={{color: 'var(--text-dim)', fontSize: '13px', marginTop: '8px'}}>Join 50K+ players in the ultimate arena</p>
      </section>

      <section className="stats-row">
        <div className="stat-card"><Trophy size={28} className="stat-icon" /><div><span className="stat-value">₹5L+</span><span className="stat-label">Prize Pool</span></div></div>
        <div className="stat-card"><Users size={28} className="stat-icon" /><div><span className="stat-value">50K+</span><span className="stat-label">Players</span></div></div>
      </section>

      <section className="section">
        <div className="section-header"><h3>Live Tournaments</h3><button className="see-all-btn">See All <ChevronRight size={16}/></button></div>
        {TOURNAMENTS.map(t => (
          <div key={t.id} className="tournament-card" onClick={() => onTournamentSelect(t)}>
            <div className="tournament-image" style={{backgroundImage: `url(${t.image})`}}>
              <div className="tournament-overlay">
                <span className={`status-badge ${t.status}`}>
                  {t.status === 'live' && <span className="live-dot"></span>}
                  {t.status}
                </span>
              </div>
            </div>
            <div className="tournament-info">
              <div className="tournament-header"><h4>{t.name}</h4><span className="prize-tag">₹{t.prize}</span></div>
              <div className="tournament-meta">
                <span className="meta-item"><Users size={16} /> {t.currentPlayers}/{t.maxPlayers}</span>
                <span className="meta-item"><Clock size={16} /> {t.timeRemaining || t.startTime}</span>
              </div>
              <div className="tournament-footer">
                <span className="mode-badge">{t.mode}</span>
                <span className="entry-fee">Entry: ₹{t.entryFee}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="section" style={{marginTop: '24px'}}>
        <div className="section-header"><h3>Top Players</h3></div>
        <div className="leaderboard">
          {LEADERBOARD.map((player, idx) => (
            <div key={idx} className={`leaderboard-item rank-${player.rank}`}>
              <div className="rank">#{player.rank}</div>
              <div><span className="player-name">{player.name}</span><span className="player-stats">{player.wins} Tournament Wins</span></div>
              <div className="player-earnings">₹{player.earnings}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, balance, setView }) {
  if (!tournament) return null;
  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>← Back</button>
      <div className="detail-hero" style={{backgroundImage: `url(${tournament.image})`}}>
        <div className="detail-hero-overlay">
          <span className={`status-badge ${tournament.status}`} style={{marginBottom: '10px'}}>{tournament.status}</span>
          <h2>{tournament.name}</h2>
          <div className="detail-prize">Prize Pool: ₹{tournament.prize}</div>
        </div>
      </div>
      <div className="view">
        <div className="info-grid">
          <div className="info-item"><span className="label">Entry Fee</span><span className="value">₹{tournament.entryFee}</span></div>
          <div className="info-item"><span className="label">Mode</span><span className="value">{tournament.mode}</span></div>
          <div className="info-item"><span className="label">Players Joined</span><span className="value">{tournament.currentPlayers}/{tournament.maxPlayers}</span></div>
          <div className="info-item"><span className="label">Starts In</span><span className="value">{tournament.timeRemaining || tournament.startTime}</span></div>
        </div>
        <button className="btn btn-primary" onClick={() => alert("Tournament Joined!")}><Trophy size={20}/> Join Now (₹{tournament.entryFee})</button>
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
          <button className="btn btn-primary" onClick={() => alert("Add Money Flow")}>Add Money</button>
          <button className="btn btn-outline" onClick={() => alert("Withdraw Flow")}>Withdraw</button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user }) {
  const logout = async () => { await supabase.auth.signOut(); window.location.reload(); };
  return (
    <div className="view">
      <div style={{textAlign: 'center', marginBottom: '30px'}}>
        <img src={user.avatar} alt="Profile" className="profile-avatar-large" />
        <h2 style={{fontSize: '24px', fontWeight: 800}}>{user.name}</h2>
        <span className="status-badge upcoming" style={{marginTop: '10px'}}>Level {user.level}</span>
      </div>
      <div className="menu-list">
        <div className="menu-item"><Settings size={20} color="var(--primary)"/> Account Settings <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        <div className="menu-item"><Trophy size={20} color="var(--gold)"/> Match History <ChevronRight size={16} style={{marginLeft: 'auto'}}/></div>
        <div className="menu-item" onClick={logout} style={{color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)'}}><LogOut size={20}/> Logout</div>
      </div>
    </div>
  );
}

function AdminView({ isAdmin, setView }) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: '',
    mode: 'Solo',
    prize: '',
    entryFee: '',
    maxPlayers: 100,
    status: 'registration',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'
  });

  // ✅ Real Supabase Insert Function
  const handleCreateTournament = async () => {
    if (!newTournament.name || !newTournament.prize || !newTournament.entryFee) {
      alert("❌ Please fill all fields!");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .insert([
          {
            name: newTournament.name,
            mode: newTournament.mode,
            prize: parseInt(newTournament.prize),
            entry_fee: parseInt(newTournament.entryFee),
            max_players: parseInt(newTournament.maxPlayers),
            status: newTournament.status,
            image_url: newTournament.image,
            current_players: 0
          }
        ])
        .select();

      if (error) throw error;

      alert(`✅ Tournament "${newTournament.name}" Created Successfully!`);
      setShowCreateForm(false);
      setNewTournament({
        name: '', mode: 'Solo', prize: '', entryFee: '', maxPlayers: 100, status: 'registration', image: ''
      });

    } catch (error) {
      alert("❌ Error: " + error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="view empty-state">
        <Shield size={48} color="#ef4444" />
        <p>Access Denied</p>
      </div>
    );
  }

  return (
    <div className="view" style={{ paddingBottom: '100px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '20px' }}>
        Admin Control
      </h2>

      {/* Create Tournament Form - Modal Style */}
      {showCreateForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: '#16161f', width: '100%', maxWidth: '380px',
            borderRadius: '20px', padding: '24px', border: '1px solid rgba(255,77,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Create New Event</h3>
              <button onClick={() => setShowCreateForm(false)} style={{ background: 'none', border: 'none', color: 'white' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Tournament Name"
                value={newTournament.name}
                onChange={(e) => setNewTournament({...newTournament, name: e.target.value})}
                style={{
                  background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '14px', color: 'white'
                }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="number"
                  placeholder="Prize ₹"
                  value={newTournament.prize}
                  onChange={(e) => setNewTournament({...newTournament, prize: e.target.value})}
                  style={{
                    background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '14px', color: 'white'
                  }}
                />
                <input
                  type="number"
                  placeholder="Entry ₹"
                  value={newTournament.entryFee}
                  onChange={(e) => setNewTournament({...newTournament, entryFee: e.target.value})}
                  style={{
                    background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '14px', color: 'white'
                  }}
                />
              </div>

              <select
                value={newTournament.mode}
                onChange={(e) => setNewTournament({...newTournament, mode: e.target.value})}
                style={{
                  background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '14px', color: 'white'
                }}
              >
                <option value="Solo">Solo</option>
                <option value="Duo">Duo</option>
                <option value="Squad">Squad</option>
              </select>

              <select
                value={newTournament.status}
                onChange={(e) => setNewTournament({...newTournament, status: e.target.value})}
                style={{
                  background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '14px', color: 'white'
                }}
              >
                <option value="registration">Registration Open</option>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live Now</option>
              </select>

              <button
                onClick={handleCreateTournament}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #ff4d00, #ff6b00)',
                  color: 'white', border: 'none', padding: '16px',
                  borderRadius: '12px', fontWeight: 700, marginTop: '10px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Creating...' : '➕ Create Tournament'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Grid */}
      <div className="admin-grid">
        <div className="admin-card">
          <h4>🎮 Create Tournament</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: '8px 0' }}>
            Add new Free Fire events
          </p>
          <button 
            className="admin-btn" 
            onClick={() => setShowCreateForm(true)}
          >
            + New Event
          </button>
        </div>

        <div className="admin-card">
          <h4>📋 Active Tournaments</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: '8px 0' }}>
            Manage participants & results
          </p>
          <button className="admin-btn" onClick={() => alert("Feature coming soon")}>
            View List
          </button>
        </div>

        <div className="admin-card">
          <h4>💰 Withdraw Requests</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: '8px 0' }}>
            Approve user withdrawals
          </p>
          <button className="admin-btn" onClick={() => alert("No pending requests")}>
            Approve (0)
          </button>
        </div>

        <div className="admin-card">
          <h4>👥 User Management</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: '8px 0' }}>
            Ban/Kick players
          </p>
          <button className="admin-btn" onClick={() => alert("User list loading...")}>
            Manage Users
          </button>
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