import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Trophy, Home, Wallet, User, Loader } from 'lucide-react';

import supabase from './lib/supabaseClient';
import LoginScreen from './components/LoginScreen';
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
  if (!value) return 'TBA';
  return new Date(value).toLocaleString();
};

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

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    fetchProfile();
    fetchTournaments();
  }, [session]);

  const fetchProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();

    setUserProfile(data);
  };

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });

    setTournaments(data || []);
  };

  if (loading) {
    return (
      <div className="app-container">
        <Loader className="spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-container">
        <div className="mobile-frame">
          <AnimatePresence mode="wait">
            {authMode === 'login' ? (
              <motion.div key="login" {...pageVariants}>
                <LoginScreen onLoginSuccess={setSession} onSwitchToSignup={() => setAuthMode('signup')} />
              </motion.div>
            ) : (
              <motion.div key="signup" {...pageVariants}>
                <SignupScreen
                  onBackToLogin={() => setAuthMode('login')}
                  onSignupSuccess={(nextSession) => setSession(nextSession)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  const user = {
    name: userProfile?.username || 'player',
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
                  onSelect={(tournament) => {
                    setSelectedTournament(tournament);
                    setCurrentView('tournament');
                  }}
                />
              </motion.div>
            )}

            {currentView === 'tournament' && (
              <motion.div key="tournament" {...pageVariants}>
                <TournamentView tournament={selectedTournament} setView={setCurrentView} />
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
                    setAuthMode('login');
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

      {tournaments.map((tournament) => (
        <div key={tournament.id} onClick={() => onSelect(tournament)} className="card">
          <h3>{tournament.name}</h3>
          <p>{formatMatchDateTime(tournament.match_time)}</p>
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
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setView(tab.id)}>
          <tab.icon />
        </button>
      ))}
    </nav>
  );
}
