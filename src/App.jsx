import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Loader, Trophy, Home, Wallet, User, Clock, Users } from 'lucide-react';
import supabase from './lib/supabaseClient';
import MyMatches from './components/MyMatches';
import Profile from './components/Profile';
import LoginScreen from './components/LoginScreen';
import SignupScreen from './components/SignupScreen';
import './App.css';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } }
};

const formatMatchDateTime = (value, fallback = 'TBA') => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString();
};

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [authView, setAuthView] = useState('login');

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthLoading(false);
    };
    loadSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setUserProfile(data || null);
  };

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    setTournaments(data || []);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchProfile(session.user.id);
    fetchTournaments();
  }, [session?.user?.id]);

  if (authLoading) return <div className="app-container"><div className="mobile-frame" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Loader className="spin" /></div></div>;

  if (!session) {
    return (
      <AnimatePresence mode="wait">
        {authView === 'login' ? (
          <LoginScreen
            key="login-screen"
            onLogin={setSession}
            onOpenSignup={() => setAuthView('signup')}
          />
        ) : (
          <SignupScreen
            key="signup-screen"
            onSignupComplete={() => setAuthView('login')}
            onBackToLogin={() => setAuthView('login')}
          />
        )}
      </AnimatePresence>
    );
  }

  const user = {
    name: userProfile?.username || 'player',
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={userProfile?.balance || 0} user={user} />
        <main className="main-content">
          <AnimatePresence mode="wait">
            {currentView === 'home' && <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit"><HomeView tournaments={tournaments} onTournamentSelect={(t) => { setSelectedTournament(t); setCurrentView('tournament'); }} /></motion.div>}
            {currentView === 'tournament' && <motion.div key="tournament" variants={pageVariants} initial="initial" animate="animate" exit="exit"><TournamentDetailView tournament={selectedTournament} userProfile={userProfile} onJoinSuccess={fetchTournaments} setView={setCurrentView} /></motion.div>}
            {currentView === 'mymatches' && <motion.div key="mymatches" variants={pageVariants} initial="initial" animate="animate" exit="exit"><MyMatches userId={session.user.id} /></motion.div>}
            {currentView === 'wallet' && <motion.div key="wallet" variants={pageVariants} initial="initial" animate="animate" exit="exit"><WalletView balance={userProfile?.balance || 0} /></motion.div>}
            {currentView === 'profile' && <motion.div key="profile" variants={pageVariants} initial="initial" animate="animate" exit="exit"><Profile user={user} profileData={userProfile} onProfileUpdate={() => fetchProfile(session.user.id)} onLogout={async () => { await supabase.auth.signOut(); setSession(null); }} tournaments={tournaments} refreshTournaments={fetchTournaments} /></motion.div>}
          </AnimatePresence>
        </main>
        <BottomNav currentView={currentView} setView={setCurrentView} />
      </div>
    </div>
  );
}

function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand"><Flame size={24} color="#ff4d00" /><h1 style={{ marginLeft: '8px' }}>CLASH<span className="brand-highlight">ARENA</span></h1></div>
        <div className="header-actions"><div className="balance-pill"><Wallet size={16} /> ₹{balance}</div><img src={user.avatar} alt="Avatar" className="header-avatar" /></div>
      </div>
    </header>
  );
}

function HomeView({ tournaments, onTournamentSelect }) {
  return (
    <div className="view home-view">
      <section className="hero-section"><h2>Compete & Win<br /><span className="gradient-text">Real Cash</span></h2></section>
      <section className="section">
        <div className="section-header"><h3>Live Matches</h3></div>
        {tournaments.map((t) => (
          <div key={t.id} className="tournament-card" onClick={() => onTournamentSelect(t)}>
            <div className="tournament-image" style={{ backgroundImage: `url(${t.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'})` }}>
              <div className="tournament-overlay"><span className={`status-badge ${t.status}`}>{t.status}</span></div>
            </div>
            <div className="tournament-info">
              <div className="tournament-header"><h4>{t.name}</h4><span className="prize-tag">₹{t.prize}</span></div>
              <div className="tournament-meta"><span className="meta-item"><Users size={16} /> {t.current_players || 0}/{t.max_players}</span><span className="meta-item"><Clock size={16} /> {formatMatchDateTime(t.match_time)}</span></div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, userProfile, setView, onJoinSuccess }) {
  const [joining, setJoining] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinData, setJoinData] = useState({ ff_uid: userProfile?.ff_uid || '', ign: userProfile?.ign || '' });

  useEffect(() => {
    if (!tournament || !userProfile?.id) return;
    setAlreadyJoined(false);
    supabase.from('match_registrations').select('id').eq('tournament_id', tournament.id).eq('user_id', userProfile.id).maybeSingle().then(({ data }) => setAlreadyJoined(Boolean(data)));
  }, [tournament, userProfile?.id]);

  if (!tournament) return null;

  const handleJoin = async () => {
    if (joining || !userProfile?.id) return;
    if (!joinData.ff_uid.trim() || !joinData.ign.trim()) return alert('Please enter FF UID and IGN');
    setJoining(true);

    const { data: profileCheck } = await supabase.from('profiles').select('id').eq('id', userProfile.id).maybeSingle();
    if (!profileCheck) {
      setJoining(false);
      alert('Please complete your profile first.');
      return;
    }

    const response = await fetch('/api/joinTournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userProfile.id, tournamentId: tournament.id, entryFee: tournament.entry_fee, ff_uid: joinData.ff_uid.trim(), ign: joinData.ign.trim() })
    });
    const result = await response.json();
    setJoining(false);

    if (!response.ok) {
      alert(result.error || 'Unable to join now.');
      return;
    }

    await supabase.from('profiles').update({ ff_uid: joinData.ff_uid.trim(), ign: joinData.ign.trim() }).eq('id', userProfile.id);

    setAlreadyJoined(true);
    setShowJoinModal(false);
    await onJoinSuccess();
  };

  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>← Back</button>
      <div className="detail-content">
        <h2>{tournament.name}</h2>
        <p style={{ color: 'var(--text-dim)' }}>Match time: {formatMatchDateTime(tournament.match_time)}</p>
        {!alreadyJoined ? <button className="btn btn-primary" onClick={() => setShowJoinModal(true)}><Trophy size={16} /> Join Tournament</button> : <div className="status-badge upcoming">Joined</div>}
      </div>
      {showJoinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '340px', display: 'grid', gap: '10px' }}>
            <input className="form-input" placeholder="FF UID" value={joinData.ff_uid} onChange={(e) => setJoinData({ ...joinData, ff_uid: e.target.value })} />
            <input className="form-input" placeholder="IGN" value={joinData.ign} onChange={(e) => setJoinData({ ...joinData, ign: e.target.value })} />
            <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>{joining ? <Loader size={16} className="spin" /> : 'Confirm Join'}</button>
            <button className="btn btn-outline" onClick={() => setShowJoinModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletView({ balance }) {
  return <div className="view"><h2>My Wallet</h2><h1 style={{ color: 'var(--gold)' }}>₹{balance}</h1></div>;
}

function BottomNav({ currentView, setView }) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'mymatches', icon: Trophy, label: 'My Matches' },
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <button key={t.id} className={`nav-item ${currentView === t.id ? 'active' : ''}`} onClick={() => setView(t.id)}>
          <t.icon size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
