import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
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
import { api, ApiError } from './lib/apiClient';
import { features } from './config/features';
import { formatINR, formatDateTime } from './lib/format';
import Avatar from './components/Avatar';
import StatusBadge from './components/StatusBadge';
import EmptyState from './components/EmptyState';
import ErrorRetry from './components/ErrorRetry';
import TournamentCard from './components/TournamentCard';
import { ListSkeleton } from './components/Skeletons';
import Modal from './components/Modal';
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
  const [tournamentsError, setTournamentsError] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [profileError, setProfileError] = useState('');

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !data) {
      // Honest failure state (docs/AUDIT.md P1-5): never silently pretend a
      // missing profile is fine — wallet/joins depend on it.
      setUserProfile(null);
      setProfileError('Could not load your profile. Wallet and match joins may not work — please log out and log in again.');
      return;
    }
    setProfileError('');
    setUserProfile(data);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchProfile(session.user.id);
  }, [session?.user?.id]);

  const fetchTournaments = async () => {
    setTournamentsLoading(true);
    setTournamentsError('');
    // With the room RPC flag on, room credentials are never fetched in list
    // queries (docs/AUDIT.md P0-3); joined players get them via
    // get_room_details() instead.
    const columns = features.roomDetailsRpc
      ? 'id, name, mode, prize, entry_fee, max_players, current_players, status, match_time, image_url, rules, created_at'
      : '*';
    const { data, error } = await supabase.from('tournaments').select(columns).order('created_at', { ascending: false });
    if (error) {
      console.error('tournaments query failed:', error.message);
      setTournamentsError('Could not load matches. Please try again.');
      setTournamentsLoading(false);
      return [];
    }
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
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <div className="app-frame app-frame--center">
          <div role="status" aria-label="Loading ClashArena">
            <Loader size={48} className="spin" style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );

  if (!session) return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <div className="app-frame">
          <LoginScreen onLogin={sess => setSession(sess)} />
        </div>
      </div>
    </MotionConfig>
  );

  const isAdmin = userProfile?.role === 'admin';
  const fallbackName = session.user.email ? session.user.email.split('@')[0] : 'player';
  const user = {
    name: userProfile?.username || fallbackName,
    level: userProfile?.level || 1,
    avatarUrl: userProfile?.avatar_url || '',
    ff_id: userProfile?.ff_id || '',
    nickname: userProfile?.nickname || ''
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <DesktopNav currentView={currentView} setView={setCurrentView} isAdmin={isAdmin} />
        <div className="app-frame">
          <Header balance={userProfile?.balance || 0} user={user} />
          {profileError && (
            <div
              role="alert"
              style={{ margin: '10px 16px 0', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', fontSize: 'var(--text-base)' }}
            >
              {profileError}
            </div>
          )}
          <main id="main-content" className="main-content">
            <AnimatePresence mode="wait">
              {currentView === 'home' && (
                <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <HomeView
                    tournaments={tournaments}
                    loading={tournamentsLoading}
                    error={tournamentsError}
                    onRetry={fetchTournaments}
                    onTournamentSelect={t => { setSelectedTournament(t); setCurrentView('tournament'); }}
                  />
                </motion.div>
              )}
            {currentView === 'tournament' && (
              <motion.div key="tournament" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <TournamentDetailView tournament={selectedTournament} userProfile={userProfile} setView={setCurrentView} onJoinSuccess={fetchTournaments} />
              </motion.div>
            )}
            {currentView === 'wallet' && (
              <motion.div key="wallet" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <WalletView balance={userProfile?.balance || 0} userId={session.user.id} />
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
            {currentView === 'myMatches' && (
              <motion.div key="myMatches" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <MyMatchesView userId={session.user.id} setView={setCurrentView} />
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
    </MotionConfig>
  );
}

function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <Flame size={24} color="var(--accent)" aria-hidden="true" />
          <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
        </div>
        <div className="header-actions">
          <span className="balance-pill" title="Wallet balance">
            <Wallet size={16} aria-hidden="true" /> {formatINR(balance)}
          </span>
          <Avatar name={user.name} src={user.avatarUrl} size={36} className="header-avatar" />
        </div>
      </div>
    </header>
  );
}

function HomeView({ tournaments, loading, error, onRetry, onTournamentSelect }) {
  // Real, derived numbers only (no invented marketing values).
  const liveCount = tournaments.filter(t => t.status === 'live').length;
  const openCount = tournaments.filter(t => t.status === 'registration').length;
  const totalPrize = tournaments
    .filter(t => ['registration', 'upcoming', 'live'].includes(t.status))
    .reduce((sum, t) => sum + (Number(t.prize) || 0), 0);

  return (
    <div className="view home-view">
      <section className="hero-section" aria-label="Welcome">
        {liveCount > 0 ? (
          <span className="live-badge live-badge--live">
            <span className="pulse" aria-hidden="true" /> Live now — {liveCount} match{liveCount > 1 ? 'es' : ''}
          </span>
        ) : openCount > 0 ? (
          <span className="live-badge"><span className="pulse" aria-hidden="true" /> {openCount} match{openCount > 1 ? 'es' : ''} open for entry</span>
        ) : (
          <span className="live-badge"><span className="pulse" aria-hidden="true" /> New matches coming soon</span>
        )}
        <h2>Compete &amp; Win<br /><span className="gradient-text">Real Cash</span></h2>
      </section>

      <motion.section className="stats-row" variants={staggerContainer} initial="initial" animate="animate" aria-label="Platform stats">
        <div className="stat-card">
          <Trophy size={26} className="stat-icon" aria-hidden="true" />
          <div><span className="stat-value">{formatINR(totalPrize)}</span><span className="stat-label">Prize Pool</span></div>
        </div>
        <div className="stat-card">
          <Users size={26} className="stat-icon" aria-hidden="true" />
          <div><span className="stat-value">{tournaments.length}</span><span className="stat-label">Matches</span></div>
        </div>
      </motion.section>

      <section className="section" aria-label="All matches">
        <div className="section-header"><h3>All Matches</h3></div>
        {loading ? (
          <ListSkeleton count={3} />
        ) : error ? (
          <ErrorRetry message={error} onRetry={onRetry} />
        ) : tournaments.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No matches yet"
            hint="New tournaments are announced here. Check back soon."
          />
        ) : (
          <motion.ul className="card-grid" variants={staggerContainer} initial="initial" animate="animate">
            {tournaments.map(t => (
              <motion.li key={t.id} variants={staggerItem}>
                <TournamentCard tournament={t} onSelect={onTournamentSelect} />
              </motion.li>
            ))}
          </motion.ul>
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
  const [joinFieldErrors, setJoinFieldErrors] = useState({});
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

  // Room credentials via the get_room_details() RPC (flag-gated, default
  // off). When off, room details keep coming from the tournament row exactly
  // as before — enabling the flag is coordinated with the DB phase.
  const [roomDetails, setRoomDetails] = useState(null);
  useEffect(() => {
    if (!features.roomDetailsRpc || !alreadyJoined || !tournament?.id) return;
    let cancelled = false;
    supabase
      .rpc('get_room_details', { p_tournament_id: tournament.id })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('get_room_details failed:', error.message);
          setRoomDetails({ error: true });
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        setRoomDetails({ error: false, roomId: row?.room_id ?? null, roomPassword: row?.room_password ?? null });
      });
    return () => { cancelled = true; };
  }, [features.roomDetailsRpc, alreadyJoined, tournament?.id]);

  // Client-side mirror of the server's validation (api/_lib/validate.js) —
  // the server remains authoritative; this only gives instant feedback.
  const validateJoinForm = () => {
    const errors = {};
    if (!/^[0-9]{5,20}$/.test(joinData.ff_uid.trim())) {
      errors.ff_uid = 'Free Fire UID must be 5-20 digits.';
    }
    const ign = joinData.ign.trim();
    if (ign.length < 2 || ign.length > 32) {
      errors.ign = 'In-game name must be 2-32 characters.';
    } else if (!/^[A-Za-z0-9 _.\-']+$/.test(ign)) {
      errors.ign = "Only letters, numbers, spaces and . - _ ' are allowed.";
    }
    setJoinFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleJoin = async (e) => {
    e && e.preventDefault();
    if (joining) return;
    setJoinMessage('');
    if (!validateJoinForm()) return;
    if (userProfile.balance < tournament.entry_fee) { setJoinMessage('Insufficient balance for this match. Add money from your wallet.'); setJoinMessageType('error'); return; }
    setJoining(true);
    try {
      const { data: existing } = await supabase.from('match_registrations').select('id').eq('tournament_id', tournament.id).eq('user_id', userProfile.id).maybeSingle();
      if (existing) { setAlreadyJoined(true); setShowJoinModal(false); return; }

      const { data: latest } = await supabase.from('tournaments').select('current_players, max_players').eq('id', tournament.id).single();
      if ((latest.current_players || 0) >= latest.max_players) { setJoinMessage('Match is full.'); setJoinMessageType('error'); return; }

      // Identity (userId) and entry fee are derived server-side from the
      // verified session token and the tournaments table — never sent here.
      await api.joinTournament({ tournamentId: tournament.id, ff_uid: joinData.ff_uid.trim(), ign: joinData.ign.trim() });
      setAlreadyJoined(true);
      setShowJoinModal(false);
      setJoinMessage('Successfully joined this match.');
      setJoinMessageType('success');
      await onJoinSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.code === '23505') {
        setAlreadyJoined(true);
        setShowJoinModal(false);
        return;
      }
      setJoinMessage(err?.message || 'Unable to join match right now.');
      setJoinMessageType('error');
    } finally {
      setJoining(false);
    }
  };

  if (!tournament) return null;

  const roomDisplay = features.roomDetailsRpc
    ? {
        id: roomDetails?.error ? 'Unavailable' : (roomDetails?.roomId || 'Wait...'),
        password: roomDetails?.error ? 'Unavailable' : (roomDetails?.roomPassword || 'Wait...')
      }
    : {
        id: tournament.room_id || 'Wait...',
        password: tournament.room_password || 'Wait...'
      };

  return (
    <div className="view detail-view">
      <button type="button" className="back-btn" onClick={() => setView('home')}>
        <ArrowLeft size={16} aria-hidden="true" style={{ verticalAlign: -2 }} /> Back
      </button>

      <div className="detail-hero" style={{ backgroundImage: `url(${tournament.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=70&auto=format&fit=crop'})` }}>
        <div className="detail-hero-overlay">
          <StatusBadge tournament={tournament} />
          <h2>{tournament.name}</h2>
          <p className="detail-prize">Prize: {formatINR(tournament.prize)}</p>
        </div>
      </div>

      <div className="detail-content">
        <div aria-live="polite">
          {joinMessage && (
            <div className={`feedback ${joinMessageType === 'success' ? 'feedback--success' : 'feedback--error'}`} role={joinMessageType === 'success' ? 'status' : 'alert'}>
              {joinMessageType === 'success'
                ? <CheckCircle2 size={16} aria-hidden="true" />
                : <AlertCircle size={16} aria-hidden="true" />}
              {joinMessage}
            </div>
          )}
        </div>

        <section className="info-grid" aria-label="Match details">
          <div className="info-item"><span className="label">Entry Fee</span><span className="value">{formatINR(tournament.entry_fee)}</span></div>
          <div className="info-item"><span className="label">Mode</span><span className="value">{tournament.mode}</span></div>
          <div className="info-item"><span className="label">Players</span><span className="value">{tournament.current_players || 0}/{tournament.max_players}</span></div>
          <div className="info-item"><span className="label">Time</span><span className="value">{formatDateTime(tournament.match_time)}</span></div>
        </section>

        <section aria-label="Rules" style={{ background: 'var(--bg-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-5)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ color: 'var(--accent-text)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rules</h3>
          <p style={{ whiteSpace: 'pre-line', fontSize: 'var(--text-md)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{tournament.rules || 'No rules specified.'}</p>
        </section>

        {!alreadyJoined ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setJoinFieldErrors({}); setShowJoinModal(true); }}
            disabled={joining || isMatchFull}
          >
            <Trophy size={20} aria-hidden="true" />
            {isMatchFull ? 'Match Full' : `Join Tournament (${formatINR(tournament.entry_fee)})`}
          </button>
        ) : (
          <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success-border)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ color: 'var(--success-text)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>Registered!</h3>
            <div className="info-grid" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="info-item"><span className="label">Room ID</span><span className="value">{roomDisplay.id}</span></div>
              <div className="info-item"><span className="label">Password</span><span className="value">{roomDisplay.password}</span></div>
            </div>
            <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Room details are shared around match time.</p>
          </div>
        )}
      </div>

      <Modal open={showJoinModal} onClose={() => setShowJoinModal(false)} title="Enter game details" labelledBy="join-modal-title">
        <form onSubmit={handleJoin} noValidate>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
            Entry fee {formatINR(tournament.entry_fee)} will be deducted from your wallet balance.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="join-ff-uid">Free Fire UID</label>
            <input
              id="join-ff-uid"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 123456789"
              value={joinData.ff_uid}
              onChange={e => setJoinData({ ...joinData, ff_uid: e.target.value })}
              aria-invalid={!!joinFieldErrors.ff_uid}
              aria-describedby={joinFieldErrors.ff_uid ? 'join-ff-uid-error' : undefined}
            />
            {joinFieldErrors.ff_uid && (
              <p className="field-error" id="join-ff-uid-error"><AlertCircle size={13} aria-hidden="true" /> {joinFieldErrors.ff_uid}</p>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="join-ign">In-game name</label>
            <input
              id="join-ign"
              className="input"
              autoComplete="off"
              placeholder="e.g. ShadowSlayer"
              value={joinData.ign}
              onChange={e => setJoinData({ ...joinData, ign: e.target.value })}
              aria-invalid={!!joinFieldErrors.ign}
              aria-describedby={joinFieldErrors.ign ? 'join-ign-error' : undefined}
            />
            {joinFieldErrors.ign && (
              <p className="field-error" id="join-ign-error"><AlertCircle size={13} aria-hidden="true" /> {joinFieldErrors.ign}</p>
            )}
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={joining}>
              {joining ? <Loader size={18} className="spin" aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
              {joining ? 'Joining…' : 'Confirm Join'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowJoinModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function WalletView({ balance, userId }) {
  const [transactions, setTransactions] = useState([]);
  // loading | ready | unavailable | error — honest states (permanent rule 7)
  const [txState, setTxState] = useState('loading');

  useEffect(() => {
    if (!features.walletTransactions) {
      setTxState('unavailable');
      return;
    }
    if (!userId) {
      setTxState('error');
      return;
    }
    let cancelled = false;
    supabase
      .from('transactions')
      .select('id, type, amount, created_at')
      .eq('user_id', userId) // own transactions only (docs/AUDIT.md P0-5)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('transactions query failed:', error.message);
          setTxState('error');
          return;
        }
        setTransactions(data || []);
        setTxState('ready');
      });
    return () => { cancelled = true; };
  }, [userId]);

  // No payment provider is integrated yet: buttons stay disabled with an
  // honest label — no fake UPI/WhatsApp instructions (permanent rule 4).
  const paymentsReady = features.payments;

  return (
    <div className="view">
      <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>My Wallet</motion.h2>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }} style={{ background: 'linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,215,0,0.1))', border: '1px solid var(--primary)', borderRadius: 24, padding: 30, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-dim)' }}>Total Balance</p>
        <motion.h1 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }} style={{ color: 'var(--gold)', fontSize: 48, margin: '10px 0' }}>₹{balance}</motion.h1>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <motion.button className="btn btn-primary" disabled={!paymentsReady} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} style={{ opacity: paymentsReady ? 1 : 0.5, cursor: paymentsReady ? 'pointer' : 'not-allowed' }}>Add Money</motion.button>
          <motion.button className="btn btn-outline" disabled={!paymentsReady} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} style={{ opacity: paymentsReady ? 1 : 0.5, cursor: paymentsReady ? 'pointer' : 'not-allowed' }}>Withdraw</motion.button>
        </div>
        {!paymentsReady && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#888' }}>Online payments and withdrawals are not available yet.</p>
        )}
      </motion.div>

      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Transactions</h3>
        {txState === 'loading' && <p style={{ color: '#666' }}>Loading transactions...</p>}
        {txState === 'unavailable' && <p style={{ color: '#666' }}>Transaction history is not available yet.</p>}
        {txState === 'error' && <p style={{ color: '#fca5a5' }}>Could not load your transactions right now. Please try again later.</p>}
        {txState === 'ready' && transactions.length === 0 && <p style={{ color: '#666' }}>No transactions yet.</p>}
        {txState === 'ready' && transactions.length > 0 && transactions.map(tx => (
          <motion.div key={tx.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ background: '#16161f', padding: 12, borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{tx.type}</span>
              <span style={{ color: tx.amount < 0 ? 'red' : 'green' }}>₹{tx.amount}</span>
            </div>
            <small style={{ color: '#888' }}>{new Date(tx.created_at).toLocaleString()}</small>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ProfileView({ user, profileData, onProfileUpdate, onLogout, setView }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    ff_id: '',
    nickname: '',
    avatar_url: ''
  });

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (profileData) {
      setForm({
        ff_id: profileData.ff_id || '',
        nickname: profileData.nickname || '',
        avatar_url: profileData.avatar_url || ''
      });
    }
  }, [profileData]);

  const validateForm = () => {
    const errors = {};
    const nickname = form.nickname.trim();
    if (!nickname) {
      errors.nickname = 'Nickname cannot be empty.';
    } else if (nickname.length < 3) {
      errors.nickname = 'Nickname must be at least 3 characters.';
    }
    const avatar = form.avatar_url.trim();
    if (avatar && !/^https?:\/\/.+/i.test(avatar)) {
      errors.avatar_url = 'Avatar URL must start with http:// or https://.';
    }
    const ffId = form.ff_id.trim();
    if (ffId && !/^[0-9]{5,20}$/.test(ffId)) {
      errors.ff_id = 'Free Fire UID must be 5-20 digits.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e) => {
    e && e.preventDefault();
    setError('');
    setSuccess('');
    if (!validateForm()) return;

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
      setSuccess('Profile updated successfully.');

    } catch (err) {
      setError(err.message || 'Could not update your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view">
      <div aria-live="polite">
        {success && (
          <div className="feedback feedback--success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" /> {success}
          </div>
        )}
        {error && (
          <div className="feedback feedback--error" role="alert">
            <AlertCircle size={16} aria-hidden="true" /> {error}
          </div>
        )}
      </div>

      <section
        aria-label="Profile"
        style={{
          textAlign: 'center',
          marginBottom: 'var(--space-6)',
          background: 'var(--bg-surface)',
          padding: 'var(--space-6) var(--space-4)',
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: -50, left: '50%', transform: 'translateX(-50%)', width: 150, height: 150, background: 'var(--accent-soft)', filter: 'blur(50px)', borderRadius: '50%' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-block', position: 'relative', marginBottom: 'var(--space-3)' }}>
            <Avatar name={profileData?.username || user.name} src={profileData?.avatar_url} size={90} />
            <span
              aria-hidden="true"
              style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', borderRadius: '50%', padding: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Award size={14} color="#fff" />
            </span>
          </div>
          <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)', marginBottom: 'var(--space-2)' }}>
            {profileData?.username || user.name}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge--open" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' }}>
              LVL {profileData?.level || 1}
            </span>
            {profileData?.role && (
              <span className="badge badge--unknown">{'role' in profileData ? profileData.role : ''}</span>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <div className="info-item">
          <DollarSign size={20} color="var(--success-text)" aria-hidden="true" />
          <div><span className="label">Wallet Balance</span><span className="value">{formatINR(profileData?.balance)}</span></div>
        </div>
        <div className="info-item">
          <Trophy size={20} color="var(--gold)" aria-hidden="true" />
          <div><span className="label">Total Wins</span><span className="value">{profileData?.wins || 0}</span></div>
        </div>
      </section>

      <section aria-label="Edit profile" style={{ background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-6)' }}>
        {editing ? (
          <form onSubmit={handleSave} noValidate>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-4)' }}>Update profile</h3>

            <div className="field">
              <label className="field-label" htmlFor="profile-ff-id">Free Fire UID</label>
              <input
                id="profile-ff-id"
                className="input"
                inputMode="numeric"
                placeholder="Required to join matches"
                value={form.ff_id}
                onChange={(e) => setForm({ ...form, ff_id: e.target.value })}
                aria-invalid={!!fieldErrors.ff_id}
                aria-describedby={fieldErrors.ff_id ? 'profile-ff-id-error' : undefined}
              />
              {fieldErrors.ff_id && <p className="field-error" id="profile-ff-id-error"><AlertCircle size={13} aria-hidden="true" /> {fieldErrors.ff_id}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="profile-nickname">Game nickname</label>
              <input
                id="profile-nickname"
                className="input"
                placeholder="Shown to opponents"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                aria-invalid={!!fieldErrors.nickname}
                aria-describedby={fieldErrors.nickname ? 'profile-nickname-error' : undefined}
              />
              {fieldErrors.nickname && <p className="field-error" id="profile-nickname-error"><AlertCircle size={13} aria-hidden="true" /> {fieldErrors.nickname}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="profile-avatar">Avatar URL (optional)</label>
              <input
                id="profile-avatar"
                className="input"
                type="url"
                placeholder="https://example.com/avatar.png"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                aria-invalid={!!fieldErrors.avatar_url}
                aria-describedby={fieldErrors.avatar_url ? 'profile-avatar-error' : undefined}
              />
              {fieldErrors.avatar_url && <p className="field-error" id="profile-avatar-error"><AlertCircle size={13} aria-hidden="true" /> {fieldErrors.avatar_url}</p>}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                <Save size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1 }}
                onClick={() => {
                  setEditing(false);
                  setError('');
                  setSuccess('');
                  setFieldErrors({});
                  setForm({
                    ff_id: profileData?.ff_id || '',
                    nickname: profileData?.nickname || '',
                    avatar_url: profileData?.avatar_url || ''
                  });
                }}
              >
                <X size={16} aria-hidden="true" /> Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setEditing(true)}
            style={{ width: '100%' }}
          >
            <Edit2 size={16} aria-hidden="true" /> Edit profile info
          </button>
        )}
      </section>

      <h3 style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>App settings</h3>

      <nav className="menu-list" aria-label="App settings">
        <button type="button" className="menu-item" onClick={() => setView('myMatches')}>
          <Gamepad2 size={20} color="var(--accent-text)" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'left' }}>My Matches</span>
          <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
        </button>
        <button type="button" className="menu-item" onClick={() => setView('wallet')}>
          <Wallet size={20} color="var(--success-text)" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'left' }}>Wallet &amp; Payments</span>
          <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
        </button>
        <button type="button" className="menu-item" onClick={() => setView('terms')}>
          <FileText size={20} color="var(--info-text)" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'left' }}>Terms &amp; Conditions</span>
          <ChevronRight size={18} color="var(--text-muted)" aria-hidden="true" />
        </button>
        <button type="button" className="menu-item" onClick={onLogout} style={{ color: 'var(--danger-text)' }}>
          <LogOut size={20} color="var(--danger-text)" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'left' }}>Logout Account</span>
          <ChevronRight size={18} color="var(--danger-text)" aria-hidden="true" />
        </button>
      </nav>
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

    try {
      // Authorization is server-side (token + role); no userId is sent.
      await api.deleteTournament({ tournamentId: id });
    } catch (err) {
      return alert('Error: ' + (err?.message || 'Delete failed'));
    }

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

function navItems(isAdmin) {
  return [
    { id: 'home', icon: Home, label: 'Home' },
    ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin' }] : []),
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];
}

function BottomNav({ currentView, setView, isAdmin }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {navItems(isAdmin).map(t => (
        <button
          key={t.id}
          type="button"
          className={`nav-item ${currentView === t.id ? 'active' : ''}`}
          onClick={() => setView(t.id)}
          aria-current={currentView === t.id ? 'page' : undefined}
        >
          <t.icon size={22} aria-hidden="true" />
          <span>{t.label}</span>
          {currentView === t.id && <span className="nav-active-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}

function DesktopNav({ currentView, setView, isAdmin }) {
  return (
    <aside className="desktop-nav" aria-label="Primary">
      <div className="brand">
        <Flame size={26} color="var(--accent)" aria-hidden="true" />
        <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
      </div>
      <ul className="dnav-list">
        {navItems(isAdmin).map(t => (
          <li key={t.id}>
            <button
              type="button"
              className={`dnav-item ${currentView === t.id ? 'active' : ''}`}
              onClick={() => setView(t.id)}
              aria-current={currentView === t.id ? 'page' : undefined}
            >
              <t.icon size={20} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="dnav-hint">Free Fire tournaments.<br />Play smart. Win real.</p>
    </aside>
  );
}
function MyMatchesView({ userId, setView }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('match_registrations')
      .select(`
        id,
        tournament_id,
        tournaments (
          id,
          name,
          prize,
          entry_fee,
          match_time,
          status,
          image_url
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('my matches query failed:', error.message);
      setError('Could not load your matches. Please try again.');
      setLoading(false);
      return;
    }

    setMatches(data || []);
    setLoading(false);
  };

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <button type="button" className="btn btn-ghost btn--sm" onClick={() => setView('profile')}>
          <ArrowLeft size={15} aria-hidden="true" /> Back
        </button>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)' }}>My Matches</h2>
      </div>

      {loading ? (
        <ListSkeleton count={2} />
      ) : error ? (
        <ErrorRetry message={error} onRetry={fetchMatches} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title="No matches joined yet"
          hint="Join a tournament to see it here with room details and schedules."
          action={
            <button type="button" className="btn btn-primary btn--sm" onClick={() => setView('home')}>
              <Trophy size={16} aria-hidden="true" /> Browse matches
            </button>
          }
        />
      ) : (
        <motion.ul className="card-grid" variants={staggerContainer} initial="initial" animate="animate">
          {matches.map(m => (
            <MyMatchCard key={m.id} registration={m} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function MyMatchCard({ registration }) {
  const [imgError, setImgError] = useState(false);
  const t = registration.tournaments;
  const current = Number(t?.current_players) || 0;
  const max = Number(t?.max_players) || 0;

  return (
    <li>
      <article className="t-card" style={{ cursor: 'default' }}>
        <span className="t-card-media">
          {!imgError && t?.image_url && (
            <img src={t.image_url} alt="" loading="lazy" decoding="async" onError={() => setImgError(true)} />
          )}
          <StatusBadge tournament={t} />
        </span>
        <span className="t-card-body">
          <span className="t-card-title-row">
            <span className="t-card-title">{t?.name || 'Unknown match'}</span>
            <span className="prize-tag">{formatINR(t?.prize)}</span>
          </span>
          <span className="t-card-meta">
            <span className="meta-item"><DollarSign size={14} aria-hidden="true" /> Entry {formatINR(t?.entry_fee)}</span>
            <span className="meta-item"><Clock size={14} aria-hidden="true" /> {formatDateTime(t?.match_time)}</span>
            {max > 0 && (
              <span className="meta-item"><Users size={14} aria-hidden="true" /> {current}/{max} slots</span>
            )}
          </span>
        </span>
      </article>
    </li>
  );
}