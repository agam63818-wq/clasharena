import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Mail, Lock, Loader, LogIn, UserPlus,
  Trophy, Home, Wallet, User, Clock, Users
} from 'lucide-react';

import supabase from './lib/supabaseClient';
import SignupScreen from './components/SignupScreen';
import MyMatches from './components/MyMatches';
import Profile from './components/Profile';
import './App.css';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } }
};

const formatMatchDateTime = (value) => {
  if (!value) return "TBA";
  return new Date(value).toLocaleString();
};

// ================= LOGIN SCREEN =================
function LoginScreen({ onLogin, goSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      return alert("Email aur password daalo");
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (error) return alert(error.message);

    onLogin(data.session);
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <div className="login-page">
          <div className="login-brand">
            <Flame size={60} className="brand-icon" />
            <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
          </div>

          <motion.div
            className="login-card"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="input-group">
              <Mail size={20} />
              <input
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="input-group">
              <Lock size={20} />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={handleLogin}>
              {loading ? <Loader className="spin" /> : <LogIn />} Login
            </button>

            <button className="btn btn-outline" onClick={goSignup}>
              <UserPlus /> Create Account
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ================= MAIN APP =================
export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(true);

  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };

    init();

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    fetchProfile();
    fetchTournaments();
  }, [session]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    setUserProfile(data);
  };

  const fetchTournaments = async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });

    setTournaments(data || []);
  };

  // ================= AUTH =================
  if (loading) {
    return <div className="app-container"><Loader className="spin" /></div>;
  }

  if (!session) {
    return authMode === 'login'
      ? <LoginScreen
          onLogin={setSession}
          goSignup={() => setAuthMode('signup')}
        />
      : <SignupScreen
          onBack={() => setAuthMode('login')}
        />;
  }

  const user = {
    name: userProfile?.username || "player",
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">

        <Header user={user} balance={userProfile?.balance || 0} />

        <main className="main-content">
          <AnimatePresence mode="wait">

            {currentView === 'home' && (
              <motion.div key="home" {...pageVariants}>
                <HomeView
                  tournaments={tournaments}
                  onSelect={(t) => {
                    setSelectedTournament(t);
                    setCurrentView('tournament');
                  }}
                />
              </motion.div>
            )}

            {currentView === 'tournament' && (
              <motion.div key="tournament" {...pageVariants}>
                <TournamentView
                  tournament={selectedTournament}
                  setView={setCurrentView}
                />
              </motion.div>
            )}

            {currentView === 'mymatches' && (
              <motion.div key="matches" {...pageVariants}>
                <MyMatches userId={session.user.id} />
              </motion.div>
            )}

            {currentView === 'wallet' && (
              <motion.div key="wallet" {...pageVariants}>
                <WalletView balance={userProfile?.balance || 0} />
              </motion.div>
            )}

            {currentView === 'profile' && (
              <motion.div key="profile" {...pageVariants}>
                <Profile
                  user={user}
                  profileData={userProfile}
                  onLogout={async () => {
                    await supabase.auth.signOut();
                    setSession(null);
                  }}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        <BottomNav currentView={currentView} setView={setCurrentView} />
      </div>
    </div>
  );
}

// ================= COMPONENTS =================

function Header({ user, balance }) {
  return (
    <header className="app-header">
      <div className="brand">
        <Flame color="#ff4d00" />
        CLASH<span>ARENA</span>
      </div>

      <div className="header-actions">
        <div className="balance">₹{balance}</div>
        <img src={user.avatar} className="avatar" />
      </div>
    </header>
  );
}

function HomeView({ tournaments, onSelect }) {
  return (
    <div className="view">
      <h2>Live Matches</h2>

      {tournaments.map(t => (
        <div key={t.id} onClick={() => onSelect(t)} className="card">
          <h3>{t.name}</h3>
          <p>{formatMatchDateTime(t.match_time)}</p>
        </div>
      ))}
    </div>
  );
}

function TournamentView({ tournament, setView }) {
  if (!tournament) return null;

  return (
    <div className="view">
      <button onClick={() => setView('home')}>Back</button>
      <h2>{tournament.name}</h2>
      <p>{formatMatchDateTime(tournament.match_time)}</p>
      <button className="btn btn-primary">Join Tournament</button>
    </div>
  );
}

function WalletView({ balance }) {
  return (
    <div className="view">
      <h2>Wallet</h2>
      <h1>₹{balance}</h1>
    </div>
  );
}

function BottomNav({ currentView, setView }) {
  const tabs = [
    { id: 'home', icon: Home },
    { id: 'mymatches', icon: Trophy },
    { id: 'wallet', icon: Wallet },
    { id: 'profile', icon: User }
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.id} onClick={() => setView(t.id)}>
          <t.icon />
        </button>
      ))}
    </nav>
  );
}
