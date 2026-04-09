import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Edit, Trash2, Search, ArrowLeft,
  Users, Calendar, Trophy, ChevronRight,
  Gamepad2, AlertCircle, CheckCircle2,
  Award, DollarSign, Home,
  Flame, Mail, Lock, Loader,
  Eye, EyeOff, User, Phone,
  Wallet, FileText, LogOut,
  Save, X, Edit2,
  MessageCircle, Youtube, Instagram, Clock
} from 'lucide-react';
import supabase from './lib/supabaseClient';
import Terms from './pages/Terms';
import './App.css';

const formatMatchDateTime = (value, fallback = 'TBA') => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString();
};

const toDatetimeLocalInput = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 16);
};

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.2 } }
};

const cardVariants = {
  hover: { scale: 1.03, transition: { duration: 0.25 } },
  tap:   { scale: 0.97, transition: { duration: 0.25 } }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.07 } }
};

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
};

const modalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 }
};

const modalContent = {
  initial: { opacity: 0, scale: 0.9, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit:    { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.2 } }
};

function TournamentSkeleton() {
  return (
    <motion.div
      className="tournament-card"
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ pointerEvents: 'none' }}
    >
      <div className="skeleton-image" />
      <div className="tournament-info" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton-line" style={{ height: 18, width: '70%' }} />
        <div className="skeleton-line" style={{ height: 13, width: '50%' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton-line" style={{ height: 13, width: '35%' }} />
          <div className="skeleton-line" style={{ height: 13, width: '35%' }} />
        </div>
      </div>
    </motion.div>
  );
}

function LoginScreen({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [error, setError] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const handleLogin = async () => {
    const value = identifier.trim();

    if (!value || !password) {
      setError("Enter email and password");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: value,
      password
    });

    if (error) {
      setError(error.message);
    } else {
      onLogin(data.session);
    }

    setLoading(false);
  };
  const handleSignup = async () => {
    const value = identifier.trim();

    if (!value || !password) {
      setError("Fill all fields");
      return;
    }
    // ✅ ADD HERE
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Enter valid 10 digit phone number");
      return;
    }

    if (!termsAgreed) {
      setError("Accept terms first");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: value,
      password
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{
        id: data.user.id,
        username: username || value.split('@')[0],
        phone: phone || null,
        role: 'user'
      }]);

    // ✅ error handling (IMPORTANT)
    if (profileError) {
      if (profileError.message.includes('duplicate')) {
        setError('Username already taken');
      } else {
        setError(profileError.message);
      }
      setLoading(false);
      return;
    }

    setActiveTab('login');
    setError('Account created! Please login.');

    setLoading(false);
    };

    return (
    <div className="login-page">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%' }}
      >
        <div className="login-brand">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
          >
            <div style={{ background: 'linear-gradient(135deg, #ff4d00, #cc2900)', borderRadius: '50%', padding: 16, boxShadow: '0 0 30px rgba(255,77,0,0.5)' }}>
              <Flame size={32} color="white" />
            </div>
          </motion.div>
          <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
          <p>Compete. Dominate. Win Real Cash.</p>
        </div>

        <div className="login-card">
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 4, marginBottom: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
            {['login', 'signup'].map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setError(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, position: 'relative', transition: 'all 0.3s', background: activeTab === tab ? 'linear-gradient(135deg, #ff4d00, #cc2900)' : 'transparent', color: activeTab === tab ? 'white' : '#888' }}
              >
                {tab === 'login' ? 'Login' : 'Sign Up'}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ background: error.includes('created') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${error.includes('created') ? '#22c55e' : '#ef4444'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: error.includes('created') ? '#86efac' : '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <AlertCircle size={15} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="input-group">
            <Mail size={20} className="input-icon" />
            <input className="form-input" placeholder="Email" value={identifier} onChange={e => setIdentifier(e.target.value)} onFocus={() => setFocusedInput('id')} onBlur={() => setFocusedInput(null)} autoComplete="email" />
          </div>

          <AnimatePresence>
            {activeTab === 'signup' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="input-group">
                  <User size={20} className="input-icon" />
                  <input className="form-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
                </div>
                <div className="input-group">
                  <Phone size={20} className="input-icon" />
                  <input className="form-input" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="input-group" style={{ position: 'relative' }}>
            <Lock size={20} className="input-icon" />
            <input className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onFocus={() => setFocusedInput('pw')} onBlur={() => setFocusedInput(null)} autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'} style={{ paddingRight: 48 }} />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <AnimatePresence>
            {activeTab === 'signup' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', marginTop: 4 }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={termsAgreed}
                    onChange={e => setTermsAgreed(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                    >
                      Terms &amp; Conditions
                    </button>
                  </span>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            className="btn btn-primary"
            onClick={activeTab === 'login' ? handleLogin : handleSignup}
            disabled={loading || (activeTab === 'signup' && !termsAgreed)}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            style={{ marginTop: 8, overflow: 'hidden', position: 'relative', opacity: (activeTab === 'signup' && !termsAgreed) ? 0.5 : 1 }}
          >
            <motion.div
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)', skewX: -12 }}
              animate={{ x: ['-200%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
            />
            {loading ? <Loader size={20} className="spin" /> : <>{activeTab === 'login' ? 'Enter Arena' : 'Join the Battle'} <ChevronRight size={18} /></>}
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            variants={modalBackdrop} initial="initial" animate="animate" exit="exit"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 200, display: 'flex', flexDirection: 'column' }}
            onClick={e => e.target === e.currentTarget && setShowTermsModal(false)}
          >
            <motion.div
              variants={modalContent} initial="initial" animate="animate" exit="exit"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100dvh', overflow: 'hidden' }}
            >
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <Terms onBack={() => setShowTermsModal(false)} />
              </div>
              <div style={{ padding: '16px 20px', background: 'var(--bg-dark)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <motion.button
                  className="btn btn-primary"
                  onClick={() => { setTermsAgreed(true); setShowTermsModal(false); }}
                  whileTap={{ scale: 0.97 }}
                >
                  I Agree &amp; Continue
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setUserProfile(data);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchProfile(session.user.id);
  }, [session?.user?.id]);

  const fetchTournaments = async () => {
    setTournamentsLoading(true);
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    setTournaments(data || []);
    if (selectedTournament?.id) {
      const latest = (data || []).find(t => t.id === selectedTournament.id);
      if (latest) setSelectedTournament(latest);
    }
    setTournamentsLoading(false);
    return data || [];
  };

  useEffect(() => {
    if (session?.user?.id) fetchTournaments();
  }, [session?.user?.id]);

  if (authLoading) return (
    <div className="app-container">
      <div className="mobile-frame" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Flame size={50} style={{ color: 'var(--primary)' }} />
        </motion.div>
      </div>
    </div>
  );

  if (!session) return (
    <div className="app-container">
      <div className="mobile-frame">
        <LoginScreen onLogin={sess => setSession(sess)} />
      </div>
    </div>
  );

  const isAdmin = userProfile?.role === 'admin';
  const fallbackName = session.user.email ? session.user.email.split('@')[0] : 'player';
  const user = {
    name: userProfile?.username || fallbackName,
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
          <AnimatePresence mode="wait">
            {currentView === 'home' && (
              <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <HomeView tournaments={tournaments} loading={tournamentsLoading} onTournamentSelect={t => { setSelectedTournament(t); setCurrentView('tournament'); }} />
              </motion.div>
            )}
            {currentView === 'tournament' && (
              <motion.div key="tournament" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <TournamentDetailView tournament={selectedTournament} userProfile={userProfile} setView={setCurrentView} onJoinSuccess={fetchTournaments} />
              </motion.div>
            )}
            {currentView === 'wallet' && (
              <motion.div key="wallet" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <WalletView balance={userProfile?.balance || 0} />
              </motion.div>
            )}
            {currentView === 'profile' && (
              <motion.div key="profile" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <ProfileView
                  user={user}
                  profileData={userProfile}
                  onProfileUpdate={() => fetchProfile(session.user.id)}
                  onLogout={async () => { await supabase.auth.signOut(); }}
                  setView={setCurrentView}
                />
              </motion.div>
            )}
            {currentView === 'terms' && (
              <motion.div key="terms" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <Terms onBack={() => setCurrentView('profile')} />
              </motion.div>
            )}
            {currentView === 'admin' && (
              <motion.div key="admin" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <AdminView isAdmin={isAdmin} tournaments={tournaments} setTournaments={setTournaments} refreshList={fetchTournaments} userId={session.user.id} />
              </motion.div>
            )}
          </AnimatePresence>
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
        <motion.div className="brand" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <Flame size={24} color="#ff4d00" />
          <h1 style={{ marginLeft: 8 }}>CLASH<span className="brand-highlight">ARENA</span></h1>
        </motion.div>
        <div className="header-actions">
          <motion.div
            className="balance-pill"
            animate={{ boxShadow: ['0 0 0px rgba(34,197,94,0)', '0 0 14px rgba(34,197,94,0.5)', '0 0 0px rgba(34,197,94,0)'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Wallet size={16} /> ₹{balance}
          </motion.div>
          <motion.img src={user.avatar} alt="Avatar" className="header-avatar" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} />
        </div>
      </div>
    </header>
  );
}

function HomeView({ tournaments, loading, onTournamentSelect }) {
  return (
    <div className="view home-view">
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <motion.div
          className="hero-glow"
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.08, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <section className="hero-section">
          <motion.span className="live-badge" animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <span className="pulse" /> LIVE NOW
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
            Compete & Win<br /><span className="gradient-text">Real Cash</span>
          </motion.h2>
        </section>
      </div>

      <motion.section className="stats-row" variants={staggerContainer} initial="initial" animate="animate">
        <motion.div className="stat-card" variants={staggerItem} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={{ cursor: 'default' }}>
          <Trophy size={28} className="stat-icon" />
          <div><span className="stat-value">₹5L+</span><span className="stat-label">Prize Pool</span></div>
        </motion.div>
        <motion.div className="stat-card" variants={staggerItem} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={{ cursor: 'default' }}>
          <Users size={28} className="stat-icon" />
          <div><span className="stat-value">{tournaments.length}+</span><span className="stat-label">Matches</span></div>
        </motion.div>
      </motion.section>

      <section className="section">
        <div className="section-header"><h3>Live Matches</h3></div>
        {loading ? (
          <motion.div variants={staggerContainer} initial="initial" animate="animate">
            {[1, 2, 3].map(i => <motion.div key={i} variants={staggerItem}><TournamentSkeleton /></motion.div>)}
          </motion.div>
        ) : tournaments.length === 0 ? (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', color: '#666', padding: 40 }}>
            No matches available.
          </motion.p>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate">
            {tournaments.map(t => (
              <motion.div
                key={t.id}
                className="tournament-card"
                variants={staggerItem}
                whileHover={{ scale: 1.03, y: -4, boxShadow: '0 15px 30px rgba(255,77,0,0.18)', borderColor: 'rgba(255,77,0,0.5)', transition: { duration: 0.25 } }}
                whileTap={{ scale: 0.97, transition: { duration: 0.25 } }}
                onClick={() => onTournamentSelect(t)}
              >
                <div className="tournament-image" style={{ backgroundImage: `url(${t.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'})` }}>
                  <div className="tournament-overlay">
                    <span className={`status-badge ${t.status}`}>{t.status}</span>
                  </div>
                </div>
                <div className="tournament-info">
                  <div className="tournament-header"><h4>{t.name}</h4><span className="prize-tag">₹{t.prize}</span></div>
                  <div className="tournament-meta">
                    <span className="meta-item"><Users size={16} /> {t.current_players || 0}/{t.max_players}</span>
                    <span className="meta-item"><Clock size={16} /> {formatMatchDateTime(t.match_time)}</span>
                  </div>
                  <div className="tournament-footer">
                    <span className="mode-badge">{t.mode}</span>
                    <span className="entry-fee">₹{t.entry_fee}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, userProfile, setView, onJoinSuccess }) {
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [joinData, setJoinData] = useState({ ff_uid: '', ign: '' });
  const [joinMessage, setJoinMessage] = useState('');
  const [joinMessageType, setJoinMessageType] = useState('');
  const isMatchFull = (tournament?.current_players || 0) >= (tournament?.max_players || 0);

  useEffect(() => {
    if (!tournament || !userProfile) return;
    setAlreadyJoined(false);
    supabase.from('match_registrations').select('id')
      .eq('tournament_id', tournament.id).eq('user_id', userProfile.id).maybeSingle()
      .then(({ data }) => { if (data) setAlreadyJoined(true); });
  }, [tournament, userProfile]);

  const handleJoin = async () => {
    if (joining) return;
    setJoinMessage('');
    if (!joinData.ff_uid || !joinData.ign) { setJoinMessage('Please enter both FF UID and In-game Name.'); setJoinMessageType('error'); return; }
    if (userProfile.balance < tournament.entry_fee) { setJoinMessage('Insufficient balance for this match.'); setJoinMessageType('error'); return; }
    setJoining(true);
    try {
      const { data: existing } = await supabase.from('match_registrations').select('id').eq('tournament_id', tournament.id).eq('user_id', userProfile.id).maybeSingle();
      if (existing) { setAlreadyJoined(true); setShowJoinModal(false); return; }

      const { data: latest } = await supabase.from('tournaments').select('current_players, max_players').eq('id', tournament.id).single();
      if ((latest.current_players || 0) >= latest.max_players) { setJoinMessage('Match Full'); setJoinMessageType('error'); return; }

      const response = await fetch('/api/joinTournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userProfile.id, tournamentId: tournament.id, entryFee: tournament.entry_fee, ff_uid: joinData.ff_uid, ign: joinData.ign })
      });
      const result = await response.json();
      if (!response.ok) {
        if (result?.code === '23505') { setAlreadyJoined(true); setShowJoinModal(false); return; }
        throw new Error(result.error || 'Unable to join match right now.');
      }
      setAlreadyJoined(true);
      setShowJoinModal(false);
      setJoinMessage('Successfully joined this match.');
      setJoinMessageType('success');
      await onJoinSuccess();
    } catch (err) {
      setJoinMessage(err?.message || 'Unable to join match right now.');
      setJoinMessageType('error');
    } finally {
      setJoining(false);
    }
  };

  if (!tournament) return null;

  return (
    <div className="view detail-view">
      <motion.button className="back-btn" onClick={() => setView('home')} whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.05 }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>← Back</motion.button>

      <motion.div className="detail-hero" style={{ backgroundImage: `url(${tournament.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800'})` }} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }}>
        <div className="detail-hero-overlay">
          <span className={`status-badge ${tournament.status}`}>{tournament.status}</span>
          <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>{tournament.name}</motion.h2>
          <motion.div className="detail-prize" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>Prize: ₹{tournament.prize}</motion.div>
        </div>
      </motion.div>

      <motion.div className="detail-content" variants={staggerContainer} initial="initial" animate="animate">
        {joinMessage && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 12, borderRadius: 10, padding: '10px 12px', fontSize: 13, border: joinMessageType === 'success' ? '1px solid #22c55e' : '1px solid #ef4444', background: joinMessageType === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: joinMessageType === 'success' ? '#86efac' : '#fca5a5' }}>
            {joinMessage}
          </motion.div>
        )}
        <motion.div className="info-grid" variants={staggerItem}>
          <div className="info-item"><span className="label">Entry Fee</span><span className="value">₹{tournament.entry_fee}</span></div>
          <div className="info-item"><span className="label">Mode</span><span className="value">{tournament.mode}</span></div>
          <div className="info-item"><span className="label">Players</span><span className="value">{tournament.current_players || 0}/{tournament.max_players}</span></div>
          <div className="info-item"><span className="label">Time</span><span className="value">{formatMatchDateTime(tournament.match_time)}</span></div>
        </motion.div>

        <motion.div variants={staggerItem} style={{ background: 'var(--bg-card)', padding: 20, borderRadius: 16, marginBottom: 20 }}>
          <h4 style={{ color: 'var(--primary)', marginBottom: 10 }}>📜 Rules</h4>
          <p style={{ whiteSpace: 'pre-line', fontSize: 14, color: '#ccc' }}>{tournament.rules || 'No rules specified.'}</p>
        </motion.div>

        <motion.div variants={staggerItem}>
          {!alreadyJoined ? (
            <motion.button className="btn btn-primary" onClick={() => setShowJoinModal(true)} disabled={joining || alreadyJoined || isMatchFull} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>
              <Trophy size={20} /> {isMatchFull ? 'Match Full' : `Join Tournament (₹${tournament.entry_fee})`}
            </motion.button>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', padding: 20, borderRadius: 16 }}>
              <h3 style={{ color: '#22c55e', marginBottom: 15, textAlign: 'center' }}>✅ Registered!</h3>
              <div className="info-grid" style={{ marginBottom: 15 }}>
                <div className="info-item"><span className="label">Room ID</span><span className="value">{tournament.room_id || 'Wait...'}</span></div>
                <div className="info-item"><span className="label">Password</span><span className="value">{tournament.room_password || 'Wait...'}</span></div>
              </div>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>Room details active 15 mins before match</p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showJoinModal && (
          <motion.div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} variants={modalBackdrop} initial="initial" animate="animate" exit="exit" onClick={e => e.target === e.currentTarget && setShowJoinModal(false)}>
            <motion.div style={{ background: 'var(--bg-card)', padding: 30, borderRadius: 24, width: '100%', maxWidth: 350, border: '1px solid rgba(255,255,255,0.1)' }} variants={modalContent} initial="initial" animate="animate" exit="exit">
              <h3 style={{ marginBottom: 20, textAlign: 'center', fontSize: 20, fontWeight: 800 }}>Enter Game Details</h3>
              <input className="form-input" placeholder="Free Fire UID" value={joinData.ff_uid} onChange={e => setJoinData({ ...joinData, ff_uid: e.target.value })} style={{ marginBottom: 15 }} />
              <input className="form-input" placeholder="In-Game Name" value={joinData.ign} onChange={e => setJoinData({ ...joinData, ign: e.target.value })} style={{ marginBottom: 20 }} />
              <motion.button className="btn btn-primary" onClick={handleJoin} disabled={joining} style={{ marginBottom: 10 }} whileTap={{ scale: 0.95 }}>
                {joining ? <Loader className="spin" size={20} /> : 'Confirm Join'}
              </motion.button>
              <motion.button className="btn btn-outline" onClick={() => setShowJoinModal(false)} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WalletView({ balance }) {
  const [transactions, setTransactions] = useState([]);
  useEffect(() => {
    supabase.from('transactions').select('*').order('created_at', { ascending: false }).then(({ data }) => setTransactions(data || []));
  }, []);

  return (
    <div className="view">
      <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>My Wallet</motion.h2>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }} style={{ background: 'linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,215,0,0.1))', border: '1px solid var(--primary)', borderRadius: 24, padding: 30, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-dim)' }}>Total Balance</p>
        <motion.h1 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }} style={{ color: 'var(--gold)', fontSize: 48, margin: '10px 0' }}>₹{balance}</motion.h1>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <motion.button className="btn btn-primary" onClick={() => alert('UPI: yourupi@paytm\nSend screenshot on WhatsApp')} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>Add Money</motion.button>
          <motion.button className="btn btn-outline" onClick={() => alert('Min ₹100\nWhatsApp: 9999999999')} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>Withdraw</motion.button>
        </div>
      </motion.div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Transactions</h3>
        {transactions.length === 0 ? (
          <p style={{ color: '#666' }}>No transactions yet.</p>
        ) : (
          transactions.map(tx => (
            <motion.div key={tx.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#16161f', padding: 12, borderRadius: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tx.type}</span>
                <span style={{ color: tx.amount < 0 ? 'red' : 'green' }}>₹{tx.amount}</span>
              </div>
              <small style={{ color: '#888' }}>{new Date(tx.created_at).toLocaleString()}</small>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function ProfileView({ user, profileData, onProfileUpdate, onLogout, setView }) {
const [editing, setEditing] = useState(false);
const [saving, setSaving] = useState(false);
const [error, setError] = useState('');
const [success, setSuccess] = useState('');
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);
const [form, setForm] = useState({
ff_id: '',
nickname: '',
avatar_url: ''
});

useEffect(() => {
if (profileData) {
setForm({
ff_id: profileData.ff_id || '',
nickname: profileData.nickname || '',
avatar_url: profileData.avatar_url || ''
});
}
}, [profileData]);

const handleSave = async () => {
setError('');
setSuccess('');

if (!form.nickname.trim()) {  
  setError("Nickname cannot be empty");  
  return;  
}  

if (form.nickname.length < 3) {  
  setError("Nickname must be at least 3 characters");  
  return;  
}  

setSaving(true);  

try {  
  const { error } = await supabase  
    .from('profiles')  
    .update({  
      ff_id: form.ff_id.trim(),  
      nickname: form.nickname.trim(),  
      avatar_url: form.avatar_url.trim()  
    })  
    .eq('id', profileData.id);  

  if (error) throw error;  

  await onProfileUpdate();  

  setEditing(false);  
  setSuccess("Profile updated successfully ✅");  

  setTimeout(() => setSuccess(''), 3000); // 3 sec me success msg hide ho jayega  

} catch (err) {  
  setError(err.message);  
} finally {  
  setSaving(false);  
}

};

return (
<div className="view" style={{ padding: '20px 16px', background: '#050505', minHeight: '100vh' }}>

{/* ALERTS (Smooth Animation) */}  
  <AnimatePresence>  
    {success && (  
      <motion.div   
        initial={{ opacity: 0, y: -10 }}   
        animate={{ opacity: 1, y: 0 }}   
        exit={{ opacity: 0, y: -10 }}  
        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', padding: '12px', borderRadius: '12px', fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}  
      >  
        <CheckCircle2 size={18} /> {success}  
      </motion.div>  
    )}  

    {error && (  
      <motion.div   
        initial={{ opacity: 0, y: -10 }}   
        animate={{ opacity: 1, y: 0 }}   
        exit={{ opacity: 0, y: -10 }}  
        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '12px', borderRadius: '12px', fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}  
      >  
        <AlertCircle size={18} /> {error}  
      </motion.div>  
    )}  
  </AnimatePresence>  

  {/* PROFILE HEADER (Gaming Style) */}  
  <div style={{ textAlign: 'center', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', padding: '24px 16px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>  

    {/* Subtle Background Glow */}  
    <div style={{ position: 'absolute', top: '-50px', left: '50%', transform: 'translateX(-50%)', width: '150px', height: '150px', background: 'rgba(255,77,0,0.2)', filter: 'blur(50px)', borderRadius: '50%', zIndex: 0 }} />  

    <div style={{ position: 'relative', zIndex: 1 }}>  
      <motion.div   
        style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}  
        whileHover={{ scale: 1.05 }}  
      >  
        <img  
          src={profileData?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData?.username || "Player"}`}  
          className="profile-avatar-large"  
          style={{ width: '90px', height: '90px', borderRadius: '50%', border: '3px solid #ff4d00', padding: '3px', background: '#111' }}  
        />  
        <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#ff4d00', borderRadius: '50%', p: '4px', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>  
          <Award size={14} color="#fff" />  
        </div>  
      </motion.div>  

      <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '6px' }}>  
        {profileData?.username || "Player"}  
      </h2>  

      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>  
        <span className="status-badge upcoming" style={{ background: '#ff4d00', color: '#fff', fontWeight: 'bold' }}>  
          LVL {profileData?.level || 1}  
        </span>  
        {profileData?.role && (  
          <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(168,85,247,0.2)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)', textTransform: 'uppercase', fontWeight: 'bold' }}>  
            {profileData.role}  
          </span>  
        )}  
      </div>  
    </div>  
  </div>  

  {/* QUICK STATS (Balance & Details) */}  
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>  
    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>  
      <DollarSign size={20} color="#22c55e" style={{ marginBottom: '4px' }} />  
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>₹{profileData?.balance || 0}</div>  
      <div style={{ fontSize: '12px', color: '#888' }}>Wallet Balance</div>  
    </div>  
    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>  
      <Trophy size={20} color="#eab308" style={{ marginBottom: '4px' }} />  
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{profileData?.wins || 0}</div>  
      <div style={{ fontSize: '12px', color: '#888' }}>Total Wins</div>  
    </div>  
  </div>  

  {/* EDIT PROFILE SECTION */}  
  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>  
    <AnimatePresence mode="wait">  
      {editing ? (  
        <motion.div   
          key="editing"  
          initial={{ opacity: 0, y: 10 }}  
          animate={{ opacity: 1, y: 0 }}  
          exit={{ opacity: 0, y: -10 }}  
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}  
        >  
          <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>Update Profile</h4>  

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>  
            <input  
              className="form-input"  
              placeholder="Free Fire UID (Required)"  
              value={form.ff_id}  
              onChange={(e) => setForm({ ...form, ff_id: e.target.value })}  
              style={{ width: '100%', boxSizing: 'border-box' }}  
            />  

            <input  
              className="form-input"  
              placeholder="Game Nickname"  
              value={form.nickname}  
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}  
              style={{ width: '100%', boxSizing: 'border-box' }}  
            />  

            <input  
              className="form-input"  
              placeholder="Custom Avatar URL"  
              value={form.avatar_url}  
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}  
              style={{ width: '100%', boxSizing: 'border-box' }}  
            />  
          </div>  

          <div style={{ display: 'flex', gap: '10px' }}>  
            <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>  
              <Save size={16} /> {saving ? "Saving..." : "Save"}  
            </button>  

            <button className="btn btn-outline" onClick={() => {
                setEditing(false);
                setError('');
                setSuccess('');
                setForm({
                  ff_id: profileData?.ff_id || '',
                  nickname: profileData?.nickname || '',
                  avatar_url: profileData?.avatar_url || ''
                });
              }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>  
              <X size={16} /> Cancel  
            </button>  
          </div>  
        </motion.div>  
      ) : (  
        <motion.div  
          key="not-editing"  
          initial={{ opacity: 0 }}  
          animate={{ opacity: 1 }}  
          exit={{ opacity: 0 }}  
        >  
          <button   
            className="btn btn-outline"   
            onClick={() => setEditing(true)}  
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)' }}  
          >  
            <Edit2 size={16} /> Edit Profile Info  
          </button>  
        </motion.div>  
      )}  
    </AnimatePresence>  
  </div>  

  {/* ACTIONS MENU (Smooth styling) */}  
  <h4 style={{ color: '#888', fontSize: '13px', fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>App Settings</h4>  

  <div className="menu-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>  

    <motion.div   
      className="menu-item"   
      onClick={() => setView('myMatches')}  
      whileHover={{ x: 4, background: 'rgba(255,255,255,0.05)' }}  
      whileTap={{ scale: 0.98 }}  
      style={{ padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}  
    >  
      <Gamepad2 size={20} color="#ff4d00" />   
      <span style={{ color: '#fff', flex: 1, fontWeight: '500' }}>My Matches</span>  
      <ChevronRight size={18} color="#666" />  
    </motion.div>  

    <motion.div   
      className="menu-item"   
      onClick={() => setView('wallet')}  
      whileHover={{ x: 4, background: 'rgba(255,255,255,0.05)' }}  
      whileTap={{ scale: 0.98 }}  
      style={{ padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}  
    >  
      <Wallet size={20} color="#22c55e" />   
      <span style={{ color: '#fff', flex: 1, fontWeight: '500' }}>Wallet & Payments</span>  
      <ChevronRight size={18} color="#666" />  
    </motion.div>  

    <motion.div   
      className="menu-item"   
      onClick={() => setView('terms')}  
      whileHover={{ x: 4, background: 'rgba(255,255,255,0.05)' }}  
      whileTap={{ scale: 0.98 }}  
      style={{ padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}  
    >  
      <FileText size={20} color="#3b82f6" />   
      <span style={{ color: '#fff', flex: 1, fontWeight: '500' }}>Terms & Conditions</span>  
      <ChevronRight size={18} color="#666" />  
    </motion.div>  

    <motion.div   
      className="menu-item"   
      onClick={onLogout}  
      whileHover={{ x: 4, background: 'rgba(239,68,68,0.05)' }}  
      whileTap={{ scale: 0.98 }}  
      style={{ padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}  
    >  
      <LogOut size={20} color="#ef4444" />   
      <span style={{ color: '#ef4444', flex: 1, fontWeight: '600' }}>Logout Account</span>  
      <ChevronRight size={18} color="#ef4444" />  
    </motion.div>  

  </div>  
</div>

);
}

const EMPTY_FORM = {
  name: '', prize: '', entry_fee: '', mode: 'Solo', status: 'registration',
  max_players: 100, match_time: '', room_id: '', room_password: '', image_url: '', rules: ''
};

function TournamentForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} variants={staggerContainer} initial="initial" animate="animate">
      <motion.div variants={staggerItem}><input className="form-input" placeholder="Tournament Name *" value={form.name} onChange={e => set('name', e.target.value)} /></motion.div>
      <motion.div variants={staggerItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <input className="form-input" type="number" placeholder="Prize ₹ *" value={form.prize} onChange={e => set('prize', e.target.value)} />
        <input className="form-input" type="number" placeholder="Entry Fee ₹ *" value={form.entry_fee} onChange={e => set('entry_fee', e.target.value)} />
      </motion.div>
      <motion.div variants={staggerItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <select className="form-input" value={form.mode} onChange={e => { set('mode', e.target.value); if (e.target.value === '1v1') set('max_players', 2); }}>
          <option>Solo</option><option>Duo</option><option>Squad</option><option value="1v1">1v1</option>
        </select>
        <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="registration">Registration</option><option value="upcoming">Upcoming</option><option value="live">Live</option>
        </select>
      </motion.div>
      <motion.div variants={staggerItem}><input className="form-input" type="number" placeholder="Max Players" value={form.max_players} onChange={e => set('max_players', e.target.value)} disabled={form.mode === '1v1'} /></motion.div>
      <motion.div variants={staggerItem}><input className="form-input" type="datetime-local" value={form.match_time} onChange={e => set('match_time', e.target.value)} /></motion.div>
      <motion.div variants={staggerItem} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <input className="form-input" placeholder="Room ID" value={form.room_id} onChange={e => set('room_id', e.target.value)} />
        <input className="form-input" placeholder="Room Password" value={form.room_password} onChange={e => set('room_password', e.target.value)} />
      </motion.div>
      <motion.div variants={staggerItem}><input className="form-input" placeholder="Banner Image URL" value={form.image_url} onChange={e => set('image_url', e.target.value)} /></motion.div>
      <motion.div variants={staggerItem}><textarea className="form-input" placeholder="Rules..." rows="4" value={form.rules} onChange={e => set('rules', e.target.value)} style={{ resize: 'vertical' }} /></motion.div>
      <motion.div variants={staggerItem} style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <motion.button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving} whileTap={{ scale: 0.95 }}>
          {saving ? <Loader size={16} className="spin" /> : <Plus size={16} />} {saving ? 'Saving...' : 'Save Tournament'}
        </motion.button>
        <motion.button className="btn btn-outline" onClick={onCancel} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
      </motion.div>
    </motion.div>
  );
}

function AdminView({ isAdmin, tournaments, setTournaments, refreshList, userId }) {
  const [view, setView] = useState('dashboard');
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [registrationsByTournament, setRegistrationsByTournament] = useState({});

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('match_registrations')
      .select('id, tournament_id, ff_uid, ign, profiles(username)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        const grouped = (data || []).reduce((acc, row) => {
          if (!acc[row.tournament_id]) acc[row.tournament_id] = [];
          acc[row.tournament_id].push(row);
          return acc;
        }, {});
        setRegistrationsByTournament(grouped);
      });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          <Shield size={64} color="#ef4444" style={{ filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.5))' }} />
        </motion.div>
        <h3 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>Access Denied</h3>
        <p style={{ color: '#888' }}>You do not have admin privileges.</p>
      </div>
    );
  }

  const handleCreate = async (form) => {
    if (!form.name || !form.prize) return alert('Name and Prize required');
    if (!form.match_time) return alert('Match time is required');

    const date = new Date(form.match_time);

    if (isNaN(date.getTime())) {
      return alert("Invalid date");
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('tournaments')
      .insert([{
        ...form,
        prize: Number(form.prize),
        entry_fee: Number(form.entry_fee),
        max_players: Number(form.max_players),
        match_time: date.toISOString(), // ✅ यही सही है
        image_url: form.image_url || null
      }])
      .select();

    setSaving(false);

    if (error) return alert('Error: ' + error.message);

    setTournaments([data[0], ...tournaments]);
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
    match_time: new Date(form.match_time).toISOString(), 
    image_url: form.image_url || null
  }).eq('id', editData.id);
  setSaving(false);
  if (error) return alert('Error: ' + error.message);
  setTournaments(tournaments.map(t => t.id === editData.id ? { ...t, ...form } : t));
  setView('list');
  setEditData(null);
  refreshList();
}

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

    const response = await fetch('/api/deleteTournament', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ tournamentId: id, userId }) 
    });

    const result = await response.json();
    if (!response.ok) return alert('Error: ' + (result.error || 'Delete failed'));

    setTournaments(tournaments.filter(t => t.id !== id));
    refreshList();
  };

  const openEdit = (t) => { 
    setEditData({ ...t, match_time: toDatetimeLocalInput(t.match_time) }); 
    setView('edit'); 
  };

  const stats = { 
    total: tournaments.length, 
    live: tournaments.filter(t => t.status === 'live').length, 
    upcoming: tournaments.filter(t => t.status === 'upcoming').length, 
    registration: tournaments.filter(t => t.status === 'registration').length 
  };

  const statusColor = { live: '#22c55e', upcoming: '#3b82f6', registration: '#f59e0b', completed: '#888' };
  const filtered = tournaments.filter(t => (t.name || '').toLowerCase().includes(search.toLowerCase()));

  // -------------------------
  // CREATE / EDIT VIEWS
  // -------------------------
  if (view === 'create' || view === 'edit') {
    return (
      <div className="view">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <motion.button 
            onClick={() => setView(view === 'create' ? 'dashboard' : 'list')} 
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center' }} 
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft size={20} />
          </motion.button>
          <h2 style={{ fontSize: '22px', fontWeight: '800', margin: 0, color: '#fff' }}>
            {view === 'create' ? 'Create Tournament' : 'Edit Tournament'}
          </h2>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <motion.button 
            onClick={() => setView('dashboard')} 
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center' }} 
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft size={20} />
          </motion.button>
          <h2 style={{ fontSize: '22px', fontWeight: '800', margin: 0 }}>Manage Tournaments</h2>
        </div>

        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <Search size={20} color="#888" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '14px 16px 14px 48px', color: 'white', width: '100%', fontSize: '15px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.3s ease' }} 
            placeholder="Search tournaments by name..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
        </div>

        <motion.div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} variants={staggerContainer} initial="initial" animate="animate">
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
              <Search size={40} color="#444" style={{ marginBottom: '10px' }} />
              <p style={{ color: '#888', fontSize: '16px' }}>No tournaments found.</p>
            </div>
          )}

          {filtered.map(t => {
            const count = registrationsByTournament[t.id]?.length || 0;
            const sColor = statusColor[t.status] || '#888';

            return (
              <motion.div 
                key={t.id} 
                variants={staggerItem} 
                style={{ background: '#111116', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '20px', borderLeft: `4px solid ${sColor}`, position: 'relative', overflow: 'hidden' }}
              >
                {/* Glow effect matching status color */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100px', height: '100%', background: `linear-gradient(90deg, ${sColor}15, transparent)`, zIndex: 0, pointerEvents: 'none' }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', marginBottom: '4px' }}>{t.name}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', color: sColor, fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', background: `${sColor}20`, padding: '4px 10px', borderRadius: '8px' }}>
                          {t.status}
                        </span>
                        <span style={{ fontSize: '13px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={14} /> {count}/{t.max_players}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <motion.button onClick={() => openEdit(t)} style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center' }} whileTap={{ scale: 0.9 }}>
                        <Edit size={18} />
                      </motion.button>
                      <motion.button onClick={() => handleDelete(t.id, t.name)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center' }} whileTap={{ scale: 0.9 }}>
                        <Trash2 size={18} />
                      </motion.button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', fontSize: '13px', color: '#ccc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px' }}>
                      <Trophy size={14} color="#eab308" /> Prize: <strong style={{ color: '#fff' }}>₹{t.prize}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px' }}>
                      Entry: <strong style={{ color: '#fff' }}>₹{t.entry_fee}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', width: '100%' }}>
                      <Calendar size={14} color="#3b82f6" /> {formatMatchDateTime(t.match_time)}
                    </div>
                  </div>

                  {/* Registered Players List */}
                  <div style={{ background: '#0a0a0f', borderRadius: '12px', padding: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <h5 style={{ fontSize: '13px', color: '#888', marginBottom: '10px', fontWeight: '600' }}>REGISTERED PLAYERS ({count})</h5>
                    {count === 0 ? (
                      <div style={{ color: '#555', fontSize: '13px', fontStyle: 'italic' }}>No players have joined this match yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                        {(registrationsByTournament[t.id] || []).map(player => (
                          <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '8px' }}>
                            <div>
                              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>{player.profiles?.username || 'Unknown'}</div>
                              <div style={{ color: '#888', fontSize: '12px' }}>IGN: {player.ign || 'N/A'}</div>
                            </div>
                            <div style={{ color: '#aaa', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                              UID: {player.ff_uid || 'N/A'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    );
  }

  // -------------------------
  // MAIN DASHBOARD VIEW
  // -------------------------
  return (
    <div className="view">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Shield size={28} color="var(--primary)" />
        <h2 style={{ fontSize: '26px', fontWeight: '900', margin: 0, background: 'linear-gradient(90deg, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Admin Control</h2>
      </motion.div>

      {/* STATS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
        {[
          { value: stats.total, label: 'Total Matches', icon: <Trophy size={20}/>, color: '#fff', bg: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))', border: 'rgba(255,255,255,0.1)' },
          { value: stats.live, label: 'Live Now', icon: <span className="pulse" style={{width: 10, height: 10, background: '#22c55e', borderRadius: '50%', display: 'inline-block'}}/>, color: '#22c55e', bg: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.02))', border: 'rgba(34,197,94,0.2)' },
          { value: stats.upcoming, label: 'Upcoming', icon: <Calendar size={20}/>, color: '#3b82f6', bg: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.02))', border: 'rgba(59,130,246,0.2)' },
          { value: stats.registration, label: 'Open Reg', icon: <Users size={20}/>, color: '#f59e0b', bg: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.02))', border: 'rgba(245,158,11,0.2)' }
        ].map((item, i) => (
          <motion.div key={i} whileHover={{ scale: 1.02 }} style={{ padding: '20px', borderRadius: '20px', background: item.bg, border: `1px solid ${item.border}`, color: item.color, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', opacity: 0.8 }}>
              {item.icon}
            </div>
            <div style={{ fontSize: '32px', fontWeight: '900', lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: '13px', fontWeight: '600', marginTop: '4px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
          </motion.div>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <h3 style={{ fontSize: '16px', color: '#888', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Quick Actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <motion.button 
          className="btn"
          onClick={() => setView('create')} 
          whileTap={{ scale: 0.96 }}
          style={{ width: '100%', padding: '18px', borderRadius: '16px', background: 'linear-gradient(90deg, #ff4d00, #e63900)', border: 'none', color: 'white', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 25px rgba(255,77,0,0.3)' }}
        >
          <Plus size={22} /> Create New Tournament
        </motion.button>

        <motion.button 
          className="btn"
          onClick={() => setView('list')} 
          whileTap={{ scale: 0.96 }}
          style={{ width: '100%', padding: '18px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          <Edit size={20} color="#aaa" /> Manage Existing List
        </motion.button>
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
        <motion.button key={t.id} className={`nav-item ${currentView === t.id ? 'active' : ''}`} onClick={() => setView(t.id)} whileTap={{ scale: 0.85 }} animate={currentView === t.id ? { y: -4 } : { y: 0 }} transition={{ duration: 0.25 }}>
          <motion.div animate={currentView === t.id ? { filter: 'drop-shadow(0 0 8px rgba(255,77,0,0.7))' } : { filter: 'none' }} transition={{ duration: 0.3 }}>
            <t.icon size={22} />
          </motion.div>
          <span>{t.label}</span>
          {currentView === t.id && (
            <motion.div className="nav-active-dot" layoutId="nav-indicator" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} />
          )}
        </motion.button>
      ))}
    </nav>
  );
}