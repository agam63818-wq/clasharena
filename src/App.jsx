import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Shield, ArrowLeft,
  Users, Trophy, ChevronRight,
  Gamepad2, AlertCircle, CheckCircle2,
  Award, DollarSign, Home,
  Flame, Mail, Lock, Loader,
  Eye, EyeOff, User, Phone,
  Wallet, FileText, LogOut,
  Save, X, Edit2,
  Clock, Copy
} from 'lucide-react';
import supabase from './lib/supabaseClient';
import { api, ApiError } from './lib/apiClient';
import { features } from './config/features';
import { formatINR, formatDateTime } from './lib/format';
import { txSign, txAmount, totalPages, pageRange } from './lib/transactions';
import { support, supportConfigured, whatsappLink } from './config/support';
import Avatar from './components/Avatar';
import StatusBadge from './components/StatusBadge';
import EmptyState from './components/EmptyState';
import ErrorRetry from './components/ErrorRetry';
import TournamentCard from './components/TournamentCard';
import { ListSkeleton } from './components/Skeletons';
import Modal from './components/Modal';
import Terms from './pages/Terms';
import './App.css';

// Admin dashboard is code-split: only admins pay for this bundle.
const AdminView = React.lazy(() => import('./pages/AdminView'));

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

// Explicit rather than `*`: a player only needs these fields and must never
// receive a phone number in ordinary client-side profile data.
export const PLAYER_PROFILE_COLUMNS = 'id, username, level, wins, role, balance, ff_id, nickname, avatar_url';

function LoginScreen({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [error, setError] = useState('');
  const [signupFieldErrors, setSignupFieldErrors] = useState({});
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
    const email = identifier.trim();
    const cleanUsername = username.trim();
    const cleanPhone = phone.trim();
    const fieldErrors = {};

    if (!email) fieldErrors.identifier = 'Enter your email address.';
    if (!password) fieldErrors.password = 'Enter a password.';
    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      fieldErrors.username = 'Username must be between 3 and 30 characters.';
    }
    if (!cleanPhone) {
      fieldErrors.phone = 'Phone number is required.';
    } else if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      fieldErrors.phone = 'Phone number must be exactly 10 digits and start with 6, 7, 8, or 9.';
    }

    setSignupFieldErrors(fieldErrors);
    setError('');

    if (Object.keys(fieldErrors).length > 0) return;

    if (!termsAgreed) {
      setSignupFieldErrors(current => ({ ...current, terms: 'Accept the Terms & Conditions before signing up.' }));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          phone: cleanPhone
        }
      }
    });

    if (error) {
      setError(error.message);
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
                onClick={() => { setActiveTab(tab); setError(''); setSignupFieldErrors({}); }}
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
            <Mail size={20} className="input-icon" aria-hidden="true" />
            {/* The visual design uses an icon + placeholder instead of a <label>;
                a placeholder is not an accessible name, so it is set explicitly. */}
            <input
              className="form-input"
              placeholder="Email"
              aria-label="Email address"
              value={identifier}
              onChange={e => {
                setIdentifier(e.target.value);
                setSignupFieldErrors(current => ({ ...current, identifier: '' }));
              }}
              onFocus={() => setFocusedInput('id')}
              onBlur={() => setFocusedInput(null)}
              autoComplete="email"
              aria-invalid={activeTab === 'signup' && !!signupFieldErrors.identifier}
              aria-describedby={activeTab === 'signup' && signupFieldErrors.identifier ? 'signup-email-error' : undefined}
            />
          </div>
          {activeTab === 'signup' && signupFieldErrors.identifier && (
            <p className="field-error" id="signup-email-error" role="alert" style={{ margin: '4px 0 8px' }}>
              <AlertCircle size={13} aria-hidden="true" /> {signupFieldErrors.identifier}
            </p>
          )}

          <AnimatePresence>
            {activeTab === 'signup' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="input-group">
                  <User size={20} className="input-icon" aria-hidden="true" />
                  <input
                    className="form-input"
                    placeholder="Username"
                    aria-label="Username"
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      setSignupFieldErrors(current => ({ ...current, username: '' }));
                    }}
                    autoComplete="username"
                    aria-invalid={!!signupFieldErrors.username}
                    aria-describedby={signupFieldErrors.username ? 'signup-username-error' : undefined}
                  />
                </div>
                {signupFieldErrors.username && (
                  <p className="field-error" id="signup-username-error" role="alert" style={{ margin: '4px 0 8px' }}>
                    <AlertCircle size={13} aria-hidden="true" /> {signupFieldErrors.username}
                  </p>
                )}
                <div className="input-group">
                  <Phone size={20} className="input-icon" aria-hidden="true" />
                  <input
                    className="form-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="Phone Number"
                    aria-label="Phone number"
                    value={phone}
                    onChange={e => {
                      setPhone(e.target.value);
                      setSignupFieldErrors(current => ({ ...current, phone: '' }));
                    }}
                    autoComplete="tel"
                    aria-invalid={!!signupFieldErrors.phone}
                    aria-describedby={signupFieldErrors.phone ? 'signup-phone-hint signup-phone-error' : 'signup-phone-hint'}
                  />
                </div>
                <p className="field-hint" id="signup-phone-hint" style={{ margin: '4px 0 4px' }}>
                  Used by the organizers to contact you about your matches.
                </p>
                {signupFieldErrors.phone && (
                  <p className="field-error" id="signup-phone-error" role="alert" style={{ margin: '0 0 8px' }}>
                    <AlertCircle size={13} aria-hidden="true" /> {signupFieldErrors.phone}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="input-group" style={{ position: 'relative' }}>
            <Lock size={20} className="input-icon" aria-hidden="true" />
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              aria-label={activeTab === 'login' ? 'Password' : 'New password'}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setSignupFieldErrors(current => ({ ...current, password: '' }));
              }}
              onFocus={() => setFocusedInput('pw')}
              onBlur={() => setFocusedInput(null)}
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
              style={{ paddingRight: 48 }}
              aria-invalid={activeTab === 'signup' && !!signupFieldErrors.password}
              aria-describedby={activeTab === 'signup' && signupFieldErrors.password ? 'signup-password-error' : undefined}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {activeTab === 'signup' && signupFieldErrors.password && (
            <p className="field-error" id="signup-password-error" role="alert" style={{ margin: '4px 0 8px' }}>
              <AlertCircle size={13} aria-hidden="true" /> {signupFieldErrors.password}
            </p>
          )}

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
                    onChange={e => {
                      setTermsAgreed(e.target.checked);
                      setSignupFieldErrors(current => ({ ...current, terms: '' }));
                    }}
                    aria-invalid={!!signupFieldErrors.terms}
                    aria-describedby={signupFieldErrors.terms ? 'signup-terms-error' : undefined}
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
                {signupFieldErrors.terms && (
                  <p className="field-error" id="signup-terms-error" role="alert" style={{ margin: '4px 0 0' }}>
                    <AlertCircle size={13} aria-hidden="true" /> {signupFieldErrors.terms}
                  </p>
                )}
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
  const [tournamentBackView, setTournamentBackView] = useState('home');
  const [tournamentDetailLoading, setTournamentDetailLoading] = useState(false);
  const [tournamentDetailError, setTournamentDetailError] = useState('');
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
    // Player-facing profile state never requests a phone number. Phone is
    // handled only by the authenticated server join/profile routes and is
    // surfaced to admins through their protected registration endpoint.
    const { data, error } = await supabase
      .from('profiles')
      .select(PLAYER_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();
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

  const openTournament = async (candidate, backView = 'home') => {
    const tournamentId = typeof candidate === 'string'
      ? candidate
      : candidate?.id || candidate?.tournament_id || candidate?.tournaments?.id;
    if (!tournamentId) return;

    setTournamentBackView(backView);
    setTournamentDetailError('');
    setCurrentView('tournament');

    // Tournament cards on Home already have the player-safe full row. My
    // Matches can arrive before that list (or with a partial embedded row), so
    // resolve the canonical row by ID before showing its detail view.
    const fromList = tournaments.find(item => item.id === tournamentId);
    if (fromList) {
      setSelectedTournament(fromList);
      setTournamentDetailLoading(false);
      return;
    }

    setSelectedTournament({ id: tournamentId });
    setTournamentDetailLoading(true);
    const columns = features.roomDetailsRpc
      ? 'id, name, mode, prize, entry_fee, max_players, current_players, status, match_time, image_url, rules, created_at'
      : '*';
    const { data, error } = await supabase
      .from('tournaments')
      .select(columns)
      .eq('id', tournamentId)
      .single();

    if (error || !data) {
      console.error('tournament detail query failed:', error?.message || 'row not found');
      setTournamentDetailError('Could not load this match. Please try again.');
      setTournamentDetailLoading(false);
      return;
    }

    setSelectedTournament(data);
    setTournamentDetailLoading(false);
  };

  const returnToTournamentSource = () => {
    setTournamentDetailLoading(false);
    setTournamentDetailError('');
    setCurrentView(tournamentBackView);
  };

  useEffect(() => {
    if (session?.user?.id) fetchTournaments();
    // Intentional: one fetch per authenticated session. fetchTournaments is
    // re-created on every render (it closes over selectedTournament), and adding it
    // here would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per session, see note above
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
  const profileNeedsCompletion = Boolean(userProfile) && ['ff_id', 'nickname']
    .some(field => !String(userProfile[field] ?? '').trim());

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
          {profileNeedsCompletion && (
            <section
              role="status"
              aria-label="Complete your profile"
              style={{ margin: '10px 16px 0', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--info-soft)', border: '1px solid var(--info-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <User size={20} color="var(--info-text)" aria-hidden="true" style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)' }}>Complete your profile</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 2 }}>Add your Free Fire UID and nickname to get match-ready.</p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn--sm"
                onClick={() => setCurrentView('profile')}
                aria-label="Open Profile screen to complete your profile"
                style={{ flexShrink: 0 }}
              >
                Profile <ChevronRight size={15} aria-hidden="true" />
              </button>
            </section>
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
                    onTournamentSelect={t => openTournament(t, 'home')}
                  />
                </motion.div>
              )}
            {currentView === 'tournament' && (
              <motion.div key="tournament" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <TournamentDetailView
                  tournament={selectedTournament}
                  userProfile={userProfile}
                  loading={tournamentDetailLoading}
                  loadError={tournamentDetailError}
                  onBack={returnToTournamentSource}
                  onRetry={() => selectedTournament?.id && openTournament(selectedTournament.id, tournamentBackView)}
                  onJoinSuccess={fetchTournaments}
                  onProfileUpdate={() => fetchProfile(session.user.id)}
                />
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
                <MyMatchesView
                  userId={session.user.id}
                  setView={setCurrentView}
                  onTournamentSelect={tournament => openTournament(tournament, 'myMatches')}
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
                <React.Suspense fallback={<div className="view" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }} role="status">Loading admin…</div>}>
                  <AdminView isAdmin={isAdmin} tournaments={tournaments} setTournaments={setTournaments} refreshList={fetchTournaments} />
                </React.Suspense>
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

// Join values are deliberately derived from the current parent-held profile,
// not copied once at sign-in. This lets a Profile save flow into a later match
// join without a browser reload.
export function getJoinPrefill(profile) {
  const ff_uid = typeof profile?.ff_id === 'string' ? profile.ff_id.trim() : '';
  const ign = typeof profile?.nickname === 'string' ? profile.nickname.trim() : '';
  return {
    ff_uid,
    ign,
    hasSavedGameDetails: Boolean(ff_uid && ign)
  };
}

// My Matches receives an embedded tournament when PostgREST can supply one,
// but the parent can also resolve this minimal ID through its main list/API.
export function getTournamentForMyMatch(registration) {
  if (registration?.tournaments?.id) return registration.tournaments;
  return registration?.tournament_id ? { id: registration.tournament_id } : null;
}

// Kept separate from the card's markup so the selection behavior can be
// verified without a browser DOM. The parent resolves a minimal payload by ID
// when the all-tournaments list does not already contain the full row.
export function selectMyMatchTournament(registration, onSelect) {
  const tournament = getTournamentForMyMatch(registration);
  if (tournament && typeof onSelect === 'function') onSelect(tournament);
  return tournament;
}

function TournamentDetailView({
  tournament,
  userProfile,
  loading = false,
  loadError = '',
  onBack,
  onRetry,
  onJoinSuccess,
  onProfileUpdate
}) {
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [joinData, setJoinData] = useState(() => getJoinPrefill(userProfile));
  const [joinFieldErrors, setJoinFieldErrors] = useState({});
  const [joinMessage, setJoinMessage] = useState('');
  const [joinMessageType, setJoinMessageType] = useState('');
  const [editingGameDetails, setEditingGameDetails] = useState(false);
  const [saveGameDetails, setSaveGameDetails] = useState(false);
  const [joinStep, setJoinStep] = useState('game');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [addingPhone, setAddingPhone] = useState(false);

  const profileFfUid = typeof userProfile?.ff_id === 'string' ? userProfile.ff_id.trim() : '';
  const profileIgn = typeof userProfile?.nickname === 'string' ? userProfile.nickname.trim() : '';
  const savedGameDetails = {
    ff_uid: profileFfUid,
    ign: profileIgn,
    hasSavedGameDetails: Boolean(profileFfUid && profileIgn)
  };
  const isMatchFull = (tournament?.current_players || 0) >= (tournament?.max_players || 0);
  const needsGameDetailsInputs = editingGameDetails || !savedGameDetails.hasSavedGameDetails;

  useEffect(() => {
    if (!loading && tournament?.id && userProfile?.id) {
      let cancelled = false;
      setAlreadyJoined(false);
      supabase
        .from('match_registrations')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userProfile.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setAlreadyJoined(true);
        });
      return () => { cancelled = true; };
    }

    setAlreadyJoined(false);
    return undefined;
  }, [loading, tournament?.id, userProfile?.id]);

  // Keep future joins in sync with Profile screen saves. Do not overwrite a
  // player while they are actively changing values inside the open modal.
  useEffect(() => {
    if (!showJoinModal) {
      setJoinData({ ff_uid: profileFfUid, ign: profileIgn });
      setEditingGameDetails(false);
      setSaveGameDetails(false);
      setJoinStep('game');
      setPhone('');
      setPhoneError('');
    }
  }, [showJoinModal, profileFfUid, profileIgn]);

  // Room credentials only arrive through the flag-gated RPC. When the flag is
  // off, the existing tournament row behavior is retained for deployments
  // that have not migrated yet.
  const [roomDetails, setRoomDetails] = useState(null);
  useEffect(() => {
    setRoomDetails(null);
    if (loading || !features.roomDetailsRpc || !alreadyJoined || !tournament?.id) return undefined;

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
        setRoomDetails({
          error: false,
          roomId: row?.room_id ?? null,
          roomPassword: row?.room_password ?? null
        });
      });
    return () => { cancelled = true; };
    // features.* lives on a module-level constant object, so the rule calls it
    // an "outer scope value" — but the guard above reads it, and keeping it in
    // the list is what makes the effect re-run if that ever becomes dynamic.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [features.roomDetailsRpc, loading, alreadyJoined, tournament?.id]);

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

  const saveGameDetailsToProfile = async () => {
    if (!saveGameDetails || !userProfile?.id) return;

    // This browser update is intentionally limited to the game identifiers;
    // mobile-number ownership is handled by api/profile.js instead.
    const { error } = await supabase
      .from('profiles')
      .update({ ff_id: joinData.ff_uid.trim(), nickname: joinData.ign.trim() })
      .eq('id', userProfile.id);
    if (error) throw error;
    if (onProfileUpdate) await onProfileUpdate();
  };

  const submitJoin = async () => {
    if (joining || !tournament) return;
    setJoinMessage('');
    if (!validateJoinForm()) return;
    if (!userProfile) {
      setJoinMessage('Your profile is still loading. Please try again in a moment.');
      setJoinMessageType('error');
      return;
    }
    if (Number(userProfile.balance) < Number(tournament.entry_fee)) {
      setJoinMessage('Insufficient balance for this match. Add money from your wallet.');
      setJoinMessageType('error');
      return;
    }

    setJoining(true);
    try {
      const { data: existing } = await supabase
        .from('match_registrations')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('user_id', userProfile.id)
        .maybeSingle();
      if (existing) {
        setAlreadyJoined(true);
        setShowJoinModal(false);
        return;
      }

      const { data: latest, error: latestError } = await supabase
        .from('tournaments')
        .select('current_players, max_players')
        .eq('id', tournament.id)
        .single();
      if (latestError || !latest) {
        throw new Error('Could not confirm match availability. Please try again.');
      }
      if ((latest.current_players || 0) >= latest.max_players) {
        setJoinMessage('Match is full.');
        setJoinMessageType('error');
        return;
      }

      // Identity (userId) and entry fee are derived server-side from the
      // verified session token and the tournaments table — never sent here.
      await api.joinTournament({
        tournamentId: tournament.id,
        ff_uid: joinData.ff_uid.trim(),
        ign: joinData.ign.trim()
      });

      let gameDetailsSaveFailed = false;
      try {
        await saveGameDetailsToProfile();
      } catch (saveError) {
        console.error('game details profile update failed:', saveError?.message || saveError);
        gameDetailsSaveFailed = true;
      }

      setAlreadyJoined(true);
      setShowJoinModal(false);
      setJoinMessage(gameDetailsSaveFailed
        ? 'Successfully joined this match. Your game details could not be saved to your profile.'
        : 'Successfully joined this match.');
      setJoinMessageType('success');
      if (onJoinSuccess) await onJoinSuccess();
    } catch (err) {
      if (err?.code === 'PHONE_REQUIRED') {
        setJoinStep('phone');
        setPhoneError('');
        return;
      }
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

  const handleJoin = (event) => {
    event.preventDefault();
    submitJoin();
  };

  const handlePhoneSubmit = async (event) => {
    event.preventDefault();
    if (addingPhone) return;

    const cleanedPhone = phone.trim();
    if (!/^[6-9][0-9]{9}$/.test(cleanedPhone)) {
      setPhoneError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setAddingPhone(true);
    setPhoneError('');
    try {
      await api.updatePhone({ phone: cleanedPhone });
      if (onProfileUpdate) await onProfileUpdate();
      setJoinStep('game');
      // The blocked join continues immediately after the server accepts the
      // number, so the player does not have to re-enter game details.
      await submitJoin();
    } catch (err) {
      setPhoneError(err?.message || 'Could not save your mobile number. Please try again.');
    } finally {
      setAddingPhone(false);
    }
  };

  const openJoinModal = () => {
    const prefill = getJoinPrefill(userProfile);
    setJoinData({ ff_uid: prefill.ff_uid, ign: prefill.ign });
    setJoinFieldErrors({});
    setJoinMessage('');
    setEditingGameDetails(!prefill.hasSavedGameDetails);
    setSaveGameDetails(false);
    setJoinStep('game');
    setPhone('');
    setPhoneError('');
    setShowJoinModal(true);
  };

  const copyRoomDetail = async (value, label) => {
    if (!value) return;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable');
      }
      await globalThis.navigator.clipboard.writeText(String(value));
      setJoinMessage(`${label} copied.`);
      setJoinMessageType('success');
    } catch {
      setJoinMessage(`Could not copy ${label.toLowerCase()}. Please copy it manually.`);
      setJoinMessageType('error');
    }
  };

  const backButton = (
    <button type="button" className="back-btn" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" style={{ verticalAlign: -2 }} /> Back
    </button>
  );

  if (loading) {
    return (
      <div className="view detail-view">
        {backButton}
        <div role="status" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader size={24} className="spin" aria-hidden="true" /> Loading match details…
        </div>
      </div>
    );
  }

  if (loadError || !tournament?.id) {
    return (
      <div className="view detail-view">
        {backButton}
        <ErrorRetry
          message={loadError || 'This match is unavailable.'}
          onRetry={onRetry || onBack}
        />
      </div>
    );
  }

  const roomDisplay = features.roomDetailsRpc
    ? { id: roomDetails?.roomId || '', password: roomDetails?.roomPassword || '' }
    : { id: tournament.room_id || '', password: tournament.room_password || '' };
  const hasRoomId = Boolean(roomDisplay.id);
  const hasRoomPassword = Boolean(roomDisplay.password);
  const hasAnyRoomCredential = hasRoomId || hasRoomPassword;

  return (
    <div className="view detail-view">
      {backButton}

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
          <div className="info-item"><span className="label">Slots</span><span className="value">{tournament.current_players || 0}/{tournament.max_players}</span></div>
          <div className="info-item"><span className="label">Match time</span><span className="value">{formatDateTime(tournament.match_time)}</span></div>
          <div className="info-item"><span className="label">Status</span><span className="value" style={{ textTransform: 'capitalize' }}>{tournament.status || 'Unknown'}</span></div>
        </section>

        <section aria-label="Rules" style={{ background: 'var(--bg-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-5)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ color: 'var(--accent-text)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rules</h3>
          <p style={{ whiteSpace: 'pre-line', fontSize: 'var(--text-md)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{tournament.rules || 'No rules specified.'}</p>
        </section>

        {!alreadyJoined ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openJoinModal}
            disabled={joining || isMatchFull || !userProfile}
          >
            <Trophy size={20} aria-hidden="true" />
            {isMatchFull ? 'Match Full' : `Join Tournament (${formatINR(tournament.entry_fee)})`}
          </button>
        ) : (
          <section style={{ background: 'var(--success-soft)', border: '1px solid var(--success-border)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }} aria-label="Registration and room details">
            <h3 style={{ color: 'var(--success-text)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>Registered!</h3>
            {!hasAnyRoomCredential ? (
              <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Room will be shared soon</p>
            ) : (
              <>
                <div className="info-grid" style={{ marginBottom: hasRoomId && hasRoomPassword ? 0 : 'var(--space-3)' }}>
                  <div className="info-item">
                    <span className="label">Room ID</span>
                    <span className="value">{hasRoomId ? roomDisplay.id : 'Not set'}</span>
                    {hasRoomId && (
                      <button type="button" className="btn btn-outline btn--sm" onClick={() => copyRoomDetail(roomDisplay.id, 'Room ID')}>
                        <Copy size={14} aria-hidden="true" /> Copy Room ID
                      </button>
                    )}
                  </div>
                  <div className="info-item">
                    <span className="label">Password</span>
                    <span className="value">{hasRoomPassword ? roomDisplay.password : 'Not set'}</span>
                    {hasRoomPassword && (
                      <button type="button" className="btn btn-outline btn--sm" onClick={() => copyRoomDetail(roomDisplay.password, 'Password')}>
                        <Copy size={14} aria-hidden="true" /> Copy Password
                      </button>
                    )}
                  </div>
                </div>
                {(!hasRoomId || !hasRoomPassword) && (
                  <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>Room will be shared soon</p>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <Modal
        open={showJoinModal}
        onClose={() => !joining && !addingPhone && setShowJoinModal(false)}
        title={joinStep === 'phone' ? 'Add mobile number' : 'Enter game details'}
        labelledBy="join-modal-title"
      >
        {joinStep === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} noValidate>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
              Add your mobile number to join this match. It is verified on the server and is not shown to other players.
            </p>
            <div className="field">
              <label className="field-label" htmlFor="join-phone">Mobile number</label>
              <input
                id="join-phone"
                className="input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="10-digit Indian mobile number"
                value={phone}
                onChange={event => { setPhone(event.target.value); setPhoneError(''); }}
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? 'join-phone-error' : undefined}
              />
              {phoneError && (
                <p className="field-error" id="join-phone-error" role="alert"><AlertCircle size={13} aria-hidden="true" /> {phoneError}</p>
              )}
            </div>
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary" disabled={addingPhone}>
                {addingPhone ? <Loader size={18} className="spin" aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}
                {addingPhone ? 'Saving…' : 'Save and join'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowJoinModal(false)} disabled={addingPhone}>Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} noValidate>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
              Entry fee {formatINR(tournament.entry_fee)} will be deducted from your wallet balance.
            </p>

            {!needsGameDetailsInputs ? (
              <section aria-label="Saved game details" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 'var(--space-3)' }}>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 4 }}>Free Fire UID: {joinData.ff_uid}</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>In-game name: {joinData.ign}</span>
                  </div>
                  <button type="button" className="btn btn-outline btn--sm" onClick={() => setEditingGameDetails(true)}>Change</button>
                </div>
              </section>
            ) : (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="join-ff-uid">Free Fire UID</label>
                  <input
                    id="join-ff-uid"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 123456789"
                    value={joinData.ff_uid}
                    onChange={event => setJoinData({ ...joinData, ff_uid: event.target.value })}
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
                    onChange={event => setJoinData({ ...joinData, ign: event.target.value })}
                    aria-invalid={!!joinFieldErrors.ign}
                    aria-describedby={joinFieldErrors.ign ? 'join-ign-error' : undefined}
                  />
                  {joinFieldErrors.ign && (
                    <p className="field-error" id="join-ign-error"><AlertCircle size={13} aria-hidden="true" /> {joinFieldErrors.ign}</p>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={saveGameDetails}
                    onChange={event => setSaveGameDetails(event.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Save to my profile
                </label>
              </>
            )}
            <div className="modal-actions">
              <button type="submit" className="btn btn-primary" disabled={joining}>
                {joining ? <Loader size={18} className="spin" aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
                {joining ? 'Joining…' : 'Confirm Join'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowJoinModal(false)} disabled={joining}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// Status labels for wallet requests (the row status is always the server's).
const WALLET_REQUEST_STATUS = {
  pending: { label: 'Pending review', className: 'badge--upcoming' },
  approved: { label: 'Approved', className: 'badge--completed' },
  rejected: { label: 'Rejected', className: 'badge--cancelled' }
};

function WalletView({ balance, userId }) {
  const [transactions, setTransactions] = useState([]);
  // loading | ready | unavailable | error — honest states (permanent rule 7)
  const [txState, setTxState] = useState('loading');
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);

  // --- wallet requests -----------------------------------------------------
  // The client flag decides whether the UI exists at all; the server flag
  // (ENABLE_WALLET_REQUESTS) and the wallet_requests table decide whether it
  // can actually work. Anything missing degrades to an honest message.
  const [requests, setRequests] = useState([]);
  const [requestsState, setRequestsState] = useState(features.walletRequests ? 'loading' : 'off');
  const [requestsMessage, setRequestsMessage] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState('deposit');
  const [requestForm, setRequestForm] = useState({ amount: '', reference: '', note: '' });
  const [requestError, setRequestError] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState('');

  const refetch = () => {
    if (!features.walletTransactions) {
      setTxState('unavailable');
      return;
    }
    if (!userId) {
      setTxState('error');
      return;
    }
    setTxState('loading');
    const { from, to } = pageRange(txPage - 1);
    supabase
      .from('transactions')
      .select('id, type, amount, created_at', { count: 'exact' })
      .eq('user_id', userId) // own transactions only (docs/AUDIT.md P0-5)
      .order('created_at', { ascending: false })
      .range(from, to)
      .then(({ data, error, count }) => {
        if (error) {
          console.error('transactions query failed:', error.message);
          setTxState('error');
          return;
        }
        setTransactions(data || []);
        setTxTotal(Number(count) || 0);
        setTxState('ready');
      });
  };

  const loadRequests = () => {
    if (!features.walletRequests) {
      setRequestsState('off');
      return;
    }
    setRequestsState('loading');
    setRequestsMessage('');
    api.listWalletRequests()
      .then((result) => {
        setRequests((result && result.requests) || []);
        setRequestsState('ready');
      })
      .catch((err) => {
        // 503 = the server or the database object is missing. Say so, and
        // never pretend the feature works (permanent rule 7).
        if (err && err.status === 503) {
          setRequestsMessage(err.message);
          setRequestsState('unavailable');
          return;
        }
        if (err && err.status === 401) {
          setRequestsMessage('Your session expired. Please log in again.');
          setRequestsState('unavailable');
          return;
        }
        setRequestsMessage((err && err.message) || 'Could not load your requests right now.');
        setRequestsState('error');
      });
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, txPage]);

  useEffect(() => {
    loadRequests();
  }, [userId]);

  useEffect(() => {
    if (!requestFeedback) return undefined;
    const timer = setTimeout(() => setRequestFeedback(''), 5000);
    return () => clearTimeout(timer);
  }, [requestFeedback]);

  const openRequest = (type) => {
    setRequestType(type);
    setRequestForm({ amount: '', reference: '', note: '' });
    setRequestError('');
    setShowRequestModal(true);
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    setRequestError('');

    const amount = Number(requestForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRequestError('Enter an amount greater than 0.');
      return;
    }
    // The server holds the authoritative limits (₹1 – ₹50,000, rate limit).
    if (requestType === 'withdraw' && amount > Number(balance)) {
      setRequestError('You cannot request more than your current balance.');
      return;
    }

    setSubmittingRequest(true);
    try {
      await api.createWalletRequest({
        type: requestType,
        amount,
        reference: requestForm.reference,
        note: requestForm.note
      });
      setShowRequestModal(false);
      setRequestFeedback(
        `${requestType === 'deposit' ? 'Deposit' : 'Withdraw'} request submitted. ` +
          'It is pending admin review — your balance changes only after approval.'
      );
      loadRequests();
    } catch (err) {
      setRequestError((err && err.message) || 'Could not submit your request right now.');
      if (err && err.status === 503) {
        // The feature is not set up on this server: reflect that immediately.
        setShowRequestModal(false);
        setRequestsMessage(err.message);
        setRequestsState('unavailable');
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  // No payment provider and no request backend: buttons stay disabled with an
  // honest label — no fake UPI/WhatsApp instructions (permanent rule 4).
  const requestsReady = features.walletRequests && (requestsState === 'ready' || requestsState === 'loading' || requestsState === 'error');
  const requestsUnavailable = features.walletRequests && requestsState === 'unavailable';
  const pages = totalPages(txTotal);

  return (
    <div className="view">
      <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-extrabold)', marginBottom: 'var(--space-5)' }}>My Wallet</h2>
      <section
        aria-label="Balance"
        style={{ background: 'linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,215,0,0.06))', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-7) var(--space-5)', textAlign: 'center' }}
      >
        <p style={{ color: 'var(--text-secondary)' }}>Total Balance</p>
        <p style={{ color: 'var(--gold)', fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-black)', margin: 'var(--space-2) 0' }}>{formatINR(balance)}</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!requestsReady}
            onClick={() => openRequest('deposit')}
            aria-label={features.walletRequests ? 'Request a deposit' : 'Add money — coming soon'}
          >
            Add Money {!features.walletRequests && <span className="visually-hidden">(coming soon)</span>}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!requestsReady}
            onClick={() => openRequest('withdraw')}
            aria-label={features.walletRequests ? 'Request a withdrawal' : 'Withdraw — coming soon'}
          >
            Withdraw {!features.walletRequests && <span className="visually-hidden">(coming soon)</span>}
          </button>
        </div>
        {!features.walletRequests && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Online payments are coming soon. Buttons are disabled until then.
          </p>
        )}
        {requestsReady && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Requests are reviewed by an admin. Submitting one never changes your balance — only an approval does.
          </p>
        )}
        {requestsUnavailable && (
          <p className="feedback feedback--error" role="status" style={{ marginTop: 'var(--space-4)' }}>
            <AlertCircle size={16} aria-hidden="true" /> {requestsMessage}
          </p>
        )}
      </section>

      {requestFeedback && (
        <div className="feedback feedback--success" role="status" style={{ marginTop: 'var(--space-4)' }}>
          <CheckCircle2 size={16} aria-hidden="true" /> {requestFeedback}
        </div>
      )}

      {features.walletRequests && (requestsState === 'ready' || requestsState === 'error') && (
        <section className="section" aria-label="Wallet requests">
          <div className="section-header"><h3>Your requests</h3></div>
          {requestsState === 'error' && (
            <ErrorRetry message={requestsMessage || 'Could not load your requests right now.'} onRetry={loadRequests} />
          )}
          {requestsState === 'ready' && requests.length === 0 && (
            <EmptyState icon={Wallet} title="No requests yet" hint="Deposit and withdraw requests you submit will be listed here with their review status." />
          )}
          {requestsState === 'ready' && requests.length > 0 && (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {requests.map(req => {
                const meta = WALLET_REQUEST_STATUS[req.status] || { label: req.status, className: 'badge--unknown' };
                return (
                  <li key={req.id} style={{ background: 'var(--bg-surface)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'var(--weight-semibold)', textTransform: 'capitalize' }}>{req.type}</span>
                      <span className={`badge ${meta.className}`}>{meta.label}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 4 }}>
                      <small style={{ color: 'var(--text-muted)' }}>{formatDateTime(req.created_at)}</small>
                      <span style={{ fontWeight: 'var(--weight-bold)' }}>{formatINR(Number(req.amount) || 0)}</span>
                    </div>
                    {req.reference && (
                      <small style={{ color: 'var(--text-muted)', display: 'block' }}>Reference: {req.reference}</small>
                    )}
                    {req.admin_note && (
                      <small style={{ color: 'var(--text-secondary)', display: 'block' }}>Admin note: {req.admin_note}</small>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="section" aria-label="Transaction history">
        <div className="section-header"><h3>Transactions</h3></div>
        {txState === 'loading' && (
          <div role="status" aria-label="Loading transactions" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[0, 1, 2].map(i => (
              <span key={i} className="skeleton" style={{ display: 'block', height: 58, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        )}
        {txState === 'unavailable' && (
          <EmptyState icon={FileText} title="Transaction history is not available yet" hint="Your match entries will be listed here." />
        )}
        {txState === 'error' && (
          <ErrorRetry message="Could not load your transactions right now." onRetry={refetch} />
        )}
        {txState === 'ready' && transactions.length === 0 && (
          <EmptyState icon={FileText} title="No transactions yet" hint="Entry fees you pay for matches will appear here." />
        )}
        {txState === 'ready' && transactions.length > 0 && (
          <>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {transactions.map(tx => {
                // Sign comes from the transaction TYPE (interim — the DB phase
                // stores signed amounts; see src/lib/transactions.js).
                const sign = txSign(tx);
                return (
                  <li key={tx.id} style={{ background: 'var(--bg-surface)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                      <span style={{ fontWeight: 'var(--weight-semibold)', textTransform: 'capitalize' }}>{tx.type}</span>
                      <span style={{ color: sign < 0 ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 'var(--weight-bold)' }}>
                        {sign < 0 ? '−' : sign > 0 ? '+' : ''}{formatINR(txAmount(tx))}
                      </span>
                    </div>
                    <small style={{ color: 'var(--text-muted)' }}>{formatDateTime(tx.created_at)}</small>
                  </li>
                );
              })}
            </ul>
            {(pages > 1 || txPage > 1) && (
              <nav aria-label="Transaction pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-4)', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-outline btn--sm"
                  onClick={() => setTxPage(p => Math.max(1, p - 1))}
                  disabled={txPage <= 1}
                >
                  Newer
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                  Page {txPage} of {pages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn--sm"
                  onClick={() => setTxPage(p => p + 1)}
                  disabled={txPage >= pages}
                >
                  Older
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      <Modal open={showRequestModal} onClose={() => !submittingRequest && setShowRequestModal(false)} title={requestType === 'deposit' ? 'Request a deposit' : 'Request a withdrawal'}>
        <form onSubmit={submitRequest} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="wr-type">Type</label>
            <select id="wr-type" className="input" value={requestType} onChange={e => setRequestType(e.target.value)}>
              <option value="deposit">Deposit (add money)</option>
              <option value="withdraw">Withdraw</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wr-amount">Amount (INR) *</label>
            <input
              id="wr-amount"
              className="input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={requestForm.amount}
              onChange={e => setRequestForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
            <p className="field-hint">Between ₹1 and ₹50,000 per request. A maximum number of requests per hour applies.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wr-reference">{requestType === 'deposit' ? 'Payment reference (UPI/txn id)' : 'Payout reference (UPI id)'}</label>
            <input
              id="wr-reference"
              className="input"
              value={requestForm.reference}
              onChange={e => setRequestForm(f => ({ ...f, reference: e.target.value }))}
              maxLength={64}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wr-note">Note (optional)</label>
            <textarea
              id="wr-note"
              className="input"
              rows="2"
              value={requestForm.note}
              onChange={e => setRequestForm(f => ({ ...f, note: e.target.value }))}
              maxLength={300}
            />
          </div>

          <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {supportConfigured ? (
              <>
                <strong style={{ color: 'var(--text-primary)' }}>Support</strong>
                <div style={{ marginTop: 4 }}>
                  {support.upi && <>UPI (display only): <code>{support.upi}</code><br /></>}
                  {support.whatsapp && (
                    <>
                      WhatsApp: <a href={whatsappLink(support.whatsapp, 'ClashArena wallet request')} target="_blank" rel="noopener noreferrer">{support.whatsapp}</a>
                    </>
                  )}
                </div>
                <p style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                  These details are public contact info. A UPI ID is shown for reference only — it is never used to
                  verify a payment. Approval is a manual admin decision.
                </p>
              </>
            ) : (
              <span>Support contact is not configured on this deployment yet. Your request is still recorded and reviewed by an admin.</span>
            )}
          </div>

          {requestError && (
            <p className="feedback feedback--error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
              <AlertCircle size={16} aria-hidden="true" /> {requestError}
            </p>
          )}

          <div className="modal-actions" style={{ marginTop: 'var(--space-5)' }}>
            <button type="submit" className="btn btn-primary" disabled={submittingRequest}>
              {submittingRequest ? <Loader size={16} className="spin" aria-hidden="true" /> : <Wallet size={16} aria-hidden="true" />}
              {submittingRequest ? 'Submitting…' : 'Submit request'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowRequestModal(false)} disabled={submittingRequest}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
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
function MyMatchesView({ userId, setView, onTournamentSelect }) {
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
          mode,
          current_players,
          max_players,
          match_time,
          status,
          image_url,
          rules
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
            <MyMatchCard key={m.id} registration={m} onSelect={onTournamentSelect} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

export function MyMatchCard({ registration, onSelect }) {
  const [imgError, setImgError] = useState(false);
  const t = getTournamentForMyMatch(registration);
  const current = Number(t?.current_players) || 0;
  const max = Number(t?.max_players) || 0;
  const matchName = t?.name || 'Unknown match';

  return (
    <li>
      <button
        type="button"
        className="t-card"
        style={{ padding: 0 }}
        onClick={() => selectMyMatchTournament(registration, onSelect)}
        aria-label={`Open details for ${matchName}`}
      >
        <span className="t-card-media">
          {!imgError && t?.image_url && (
            <img src={t.image_url} alt="" loading="lazy" decoding="async" onError={() => setImgError(true)} />
          )}
          <StatusBadge tournament={t} />
        </span>
        <span className="t-card-body">
          <span className="t-card-title-row">
            <span className="t-card-title">{matchName}</span>
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
      </button>
    </li>
  );
}