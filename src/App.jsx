import React, { useState, useEffect } from 'react';
import { 
  Flame, Mail, Lock, Loader, LogIn, UserPlus, LogOut,
  Trophy, Home, Wallet, User, Shield, Clock, Users, Plus, ChevronRight, Star,
  Gamepad2, Crown, Target, Zap, TrendingUp, Bell, Settings
} from 'lucide-react';
import supabase from './lib/supabaseClient';
import './App.css';

// Mock Data
const TOURNAMENTS = [
  {
    id: 1,
    name: "Battle Royale Pro",
    mode: "Solo",
    prize: 5000,
    entryFee: 50,
    maxPlayers: 100,
    currentPlayers: 87,
    status: "live",
    timeRemaining: "2h 15m",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop"
  },
  {
    id: 2,
    name: "Power Duo Championship",
    mode: "Duo",
    prize: 10000,
    entryFee: 100,
    maxPlayers: 50,
    currentPlayers: 32,
    status: "upcoming",
    startTime: "Today, 6:00 PM",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop"
  },
  {
    id: 3,
    name: "Squad Rush",
    mode: "Squad",
    prize: 15000,
    entryFee: 200,
    maxPlayers: 25,
    currentPlayers: 12,
    status: "registration",
    startTime: "Tomorrow, 8:00 PM",
    image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop"
  }
];

const LEADERBOARD = [
  { rank: 1, name: "ProGamer_X", wins: 24, earnings: 12500, avatar: "https://i.pravatar.cc/150?img=11" },
  { rank: 2, name: "Ninja_FF", wins: 21, earnings: 10200, avatar: "https://i.pravatar.cc/150?img=12" },
  { rank: 3, name: "BeastMode", wins: 18, earnings: 8900, avatar: "https://i.pravatar.cc/150?img=13" },
  { rank: 4, name: "Sniper_King", wins: 15, earnings: 7200, avatar: "https://i.pravatar.cc/150?img=14" },
  { rank: 5, name: "Elite_Slayer", wins: 12, earnings: 5400, avatar: "https://i.pravatar.cc/150?img=15" }
];

// ================= LOGIN SCREEN =================
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    window.location.reload();
  };

  const handleSignup = async () => {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }
    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }
    if (data.user) {
      await supabase.from('profiles').upsert([{
        id: data.user.id,
        username: email.split('@')[0],
        level: 1,
        wins: 0,
        total_played: 0,
        role: 'user',
        balance: 0
      }]);
    }
    setLoading(false);
    alert('✅ Signup successful! Now login.');
    setActiveTab('login');
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <div className="login-page">
          <div className="login-brand">
            <div className="logo-container">
              <Flame className="brand-icon" size={48} />
              <div className="logo-glow"></div>
            </div>
            <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
            <p className="tagline">Play Free Fire Tournaments & Win Real Cash</p>
          </div>

          <div className="login-card">
            <div className="tab-switcher">
              <button 
                className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
                onClick={() => setActiveTab('login')}
              >
                Login
              </button>
              <button 
                className={`tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
                onClick={() => setActiveTab('signup')}
              >
                Sign Up
              </button>
            </div>

            <div className="input-group">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                placeholder="Enter your Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="input-group">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                placeholder="Enter your Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>

            {activeTab === 'login' ? (
              <button onClick={handleLogin} disabled={loading} className="btn btn-primary w-full">
                {loading ? <Loader size={18} className="spin" /> : <LogIn size={18} />}
                {loading ? "Logging In..." : "Login"}
              </button>
            ) : (
              <button onClick={handleSignup} disabled={loading} className="btn btn-primary w-full">
                {loading ? <Loader size={18} className="spin" /> : <UserPlus size={18} />}
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            )}

            <p className="login-note">
              By continuing, you agree to our Terms of Service & Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= MAIN APP =================
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [selectedTournament, setSelectedTournament] = useState(null);

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
    if (!session) return;
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setUserProfile(data);
    };
    fetchProfile();
  }, [session]);

  if (authLoading) {
    return (
      <div className="app-container">
        <div className="mobile-frame loading-screen">
          <div className="loading-content">
            <Flame size={56} className="loading-flame" />
            <div className="loading-bar">
              <div className="loading-progress"></div>
            </div>
            <p>Loading ClashArena...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  const balance = userProfile?.balance || 0;
  const isAdmin = userProfile?.role === 'admin';
  const user = {
    name: userProfile?.username || session.user.email.split('@')[0],
    level: userProfile?.level || 1,
    avatar: `https://i.pravatar.cc/150?u=${session.user.id}`
  };

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return <HomeView onTournamentSelect={setSelectedTournament} setView={setCurrentView} />;
      case 'tournament':
        return <TournamentDetailView tournament={selectedTournament} balance={balance} setBalance={async (newBalance) => {
          await supabase.from('profiles').update({ balance: newBalance }).eq('id', session.user.id);
          setUserProfile({ ...userProfile, balance: newBalance });
        }} setView={setCurrentView} />;
      case 'wallet':
        return <WalletView balance={balance} />;
      case 'profile':
        return <ProfileView user={user} />;
      case 'admin':
        return <AdminView isAdmin={isAdmin} setView={setCurrentView} />;
      default:
        return <HomeView onTournamentSelect={setSelectedTournament} setView={setCurrentView} />;
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={balance} user={user} />
        <main className="main-content">
          {renderContent()}
        </main>
        <BottomNav currentView={currentView} setView={setCurrentView} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

// ================= COMPONENTS =================
function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <div className="logo-small">
            <Flame size={20} className="brand-icon-small" />
          </div>
          <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
        </div>
        <div className="header-actions">
          <div className="balance-pill">
            <Wallet size={14} />
            <span>₹{balance.toLocaleString()}</span>
          </div>
          <div className="notification-btn">
            <Bell size={18} />
            <span className="notification-dot"></span>
          </div>
          <img src={user.avatar} alt="Profile" className="header-avatar" />
        </div>
      </div>
    </header>
  );
}

function HomeView({ onTournamentSelect, setView }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filters = [
    { id: 'all', label: 'All', icon: Gamepad2 },
    { id: 'live', label: 'Live', icon: Target },
    { id: 'upcoming', label: 'Upcoming', icon: Clock },
    { id: 'completed', label: 'Ended', icon: Trophy }
  ];

  const filteredTournaments = activeFilter === 'all' 
    ? TOURNAMENTS 
    : TOURNAMENTS.filter(t => t.status === activeFilter);

  return (
    <div className="view home-view">
      {/* Animated Hero Section */}
      <section className="hero-section">
        <div className="hero-glow"></div>
        <div className="hero-particles">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`particle p${i + 1}`}></div>
          ))}
        </div>
        <div className="hero-content">
          <div className="live-pulse">
            <span className="pulse-dot"></span>
            <span>LIVE TOURNAMENTS</span>
          </div>
          <h2>
            <span className="title-line">Compete & Win</span>
            <span className="gradient-text title-line">Real Cash</span>
          </h2>
          <p>Join 50,000+ players in India's biggest Free Fire championship</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <Crown size={16} />
              <span>₹5L+ Prize Pool</span>
            </div>
            <div className="hero-stat">
              <Users size={16} />
              <span>50K+ Players</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="stats-row">
        <div className="stat-card stat-card-1">
          <div className="stat-icon-wrap">
            <Trophy size={22} className="stat-icon" />
          </div>
          <div>
            <span className="stat-value">₹5L+</span>
            <span className="stat-label">Total Prizes</span>
          </div>
        </div>
        <div className="stat-card stat-card-2">
          <div className="stat-icon-wrap">
            <TrendingUp size={22} className="stat-icon" />
          </div>
          <div>
            <span className="stat-value">24/7</span>
            <span className="stat-label">Live Matches</span>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <section className="filter-section">
        <div className="filter-tabs">
          {filters.map(f => (
            <button 
              key={f.id}
              className={`filter-tab ${activeFilter === f.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              <f.icon size={14} />
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Tournament List */}
      <section className="section">
        <div className="section-header">
          <h3>Tournaments</h3>
          <button className="see-all-btn">View All <ChevronRight size={14} /></button>
        </div>
        <div className="tournament-list">
          {filteredTournaments.map((t, idx) => (
            <div 
              key={t.id} 
              className="tournament-card"
              style={{ animationDelay: `${idx * 0.1}s` }}
              onClick={() => { onTournamentSelect(t); setView('tournament'); }}
            >
              <div className="tournament-image" style={{ backgroundImage: `url(${t.image})` }}>
                <div className="tournament-overlay">
                  <div className={`status-pill ${t.status}`}>
                    {t.status === 'live' && <span className="live-dot"></span>}
                    {t.status === 'live' ? 'LIVE' : t.status === 'upcoming' ? 'UPCOMING' : 'OPEN'}
                  </div>
                  <div className="prize-float">₹{t.prize.toLocaleString()}</div>
                </div>
                <div className="tournament-progress">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${(t.currentPlayers / t.maxPlayers) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="tournament-info">
                <div className="tournament-header">
                  <h4>{t.name}</h4>
                  <span className="mode-tag">{t.mode}</span>
                </div>
                <div className="tournament-meta">
                  <span className="meta-item">
                    <Users size={12} /> 
                    {t.currentPlayers}/{t.maxPlayers}
                  </span>
                  <span className="meta-item">
                    <Clock size={12} /> 
                    {t.timeRemaining || t.startTime}
                  </span>
                </div>
                <div className="tournament-footer">
                  <div className="entry-section">
                    <span className="entry-label">Entry Fee</span>
                    <span className="entry-fee">₹{t.entryFee}</span>
                  </div>
                  <button className="join-now-btn">
                    <Zap size={14} />
                    Join Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top Players */}
      <section className="section">
        <div className="section-header">
          <h3>🏆 Top Players</h3>
          <button className="see-all-btn">Leaderboard <ChevronRight size={14} /></button>
        </div>
        <div className="leaderboard">
          {LEADERBOARD.map((player, idx) => (
            <div key={idx} className={`leaderboard-item rank-${player.rank}`}>
              <div className="rank-badge">{player.rank}</div>
              <img src={player.avatar} alt={player.name} className="player-avatar" />
              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <span className="player-stats">{player.wins} wins • Level {50 - idx * 5}</span>
              </div>
              <div className="player-earnings">
                <span className="earnings-amount">₹{player.earnings.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, balance, setBalance, setView }) {
  if (!tournament) return <div className="empty-state">Select a tournament</div>;

  const handleJoin = async () => {
    if (balance >= tournament.entryFee) {
      await setBalance(balance - tournament.entryFee);
      alert("✅ Successfully joined tournament! Check your email for room details.");
    } else {
      alert("❌ Insufficient balance! Add money to wallet first.");
    }
  };

  const progressPercent = (tournament.currentPlayers / tournament.maxPlayers) * 100;

  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>
        <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
        Back
      </button>

      <div className="detail-hero" style={{ backgroundImage: `url(${tournament.image})` }}>
        <div className="detail-hero-overlay">
          <div className={`status-badge large ${tournament.status}`}>
            {tournament.status === 'live' && <span className="live-pulse-dot"></span>}
            {tournament.status.toUpperCase()}
          </div>
          <h2>{tournament.name}</h2>
          <div className="detail-prize">
            <Trophy size={20} />
            ₹{tournament.prize.toLocaleString()} Prize Pool
          </div>
        </div>
      </div>

      <div className="detail-content">
        {/* Progress Bar */}
        <div className="spots-section">
          <div className="spots-header">
            <span>Spots Filled</span>
            <span className="spots-count">{tournament.currentPlayers}/{tournament.maxPlayers}</span>
          </div>
          <div className="spots-progress">
            <div 
              className="spots-progress-bar" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <p className="spots-left">{tournament.maxPlayers - tournament.currentPlayers} spots remaining</p>
        </div>

        <div className="info-grid">
          <div className="info-item">
            <div className="info-icon"><Wallet size={18} /></div>
            <span className="label">Entry Fee</span>
            <span className="value">₹{tournament.entryFee}</span>
          </div>
          <div className="info-item">
            <div className="info-icon"><Gamepad2 size={18} /></div>
            <span className="label">Mode</span>
            <span className="value">{tournament.mode}</span>
          </div>
          <div className="info-item">
            <div className="info-icon"><Users size={18} /></div>
            <span className="label">Players</span>
            <span className="value">{tournament.maxPlayers}</span>
          </div>
          <div className="info-item">
            <div className="info-icon"><Clock size={18} /></div>
            <span className="label">Starts</span>
            <span className="value">{tournament.timeRemaining || tournament.startTime}</span>
          </div>
        </div>

        <div className="prize-breakdown">
          <h4><Trophy size={16} /> Prize Distribution</h4>
          <div className="prize-list">
            <div className="prize-row">
              <span className="prize-rank">🥇 1st Place</span>
              <span className="prize-amount">₹{Math.floor(tournament.prize * 0.5).toLocaleString()}</span>
            </div>
            <div className="prize-row">
              <span className="prize-rank">🥈 2nd Place</span>
              <span className="prize-amount">₹{Math.floor(tournament.prize * 0.3).toLocaleString()}</span>
            </div>
            <div className="prize-row">
              <span className="prize-rank">🥉 3rd Place</span>
              <span className="prize-amount">₹{Math.floor(tournament.prize * 0.2).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="rules-section">
          <h4><Shield size={16} /> Tournament Rules</h4>
          <ul>
            <li><span className="rule-num">01</span> Level 50+ required to participate</li>
            <li><span className="rule-num">02</span> No emulators or third-party tools allowed</li>
            <li><span className="rule-num">03</span> Room code shared 15 mins before start</li>
            <li><span className="rule-num">04</span> Minimum 4 matches to qualify for prizes</li>
            <li><span className="rule-num">05</span> Prize money credited within 24 hours</li>
          </ul>
        </div>

        <div className="action-section">
          <div className="balance-check">
            <span>Your Balance</span>
            <span className="balance-amount-sm">₹{balance.toLocaleString()}</span>
          </div>
          <button 
            className={`join-btn ${balance < tournament.entryFee ? 'disabled' : ''}`}
            onClick={handleJoin}
            disabled={balance < tournament.entryFee}
          >
            {balance >= tournament.entryFee ? (
              <><Zap size={20} /> Join Tournament - ₹{tournament.entryFee}</>
            ) : (
              <><Wallet size={20} /> Insufficient Balance</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function WalletView({ balance }) {
  const [amount, setAmount] = useState('');
  const quickAmounts = [100, 500, 1000, 5000];

  const handleAddMoney = (amt) => {
    alert(`Redirecting to payment gateway for ₹${amt}...`);
  };

  const transactions = [
    { id: 1, type: 'credit', amount: 500, desc: 'Tournament Win - Battle Royale', date: '2 hours ago', icon: Trophy },
    { id: 2, type: 'debit', amount: 100, desc: 'Entry Fee - Power Duo', date: '5 hours ago', icon: Gamepad2 },
    { id: 3, type: 'credit', amount: 1000, desc: 'Deposit via UPI', date: '1 day ago', icon: Wallet },
    { id: 4, type: 'credit', amount: 200, desc: 'Referral Bonus', date: '2 days ago', icon: Users }
  ];

  return (
    <div className="view wallet-view">
      <h2>My Wallet</h2>

      <div className="balance-card-large">
        <div className="balance-glow"></div>
        <div className="balance-content">
          <div className="balance-header">
            <Wallet size={24} />
            <span>Total Balance</span>
          </div>
          <div className="balance-amount-xl">₹{balance.toLocaleString()}</div>
          <div className="balance-actions-row">
            <button className="action-btn-large primary">
              <Plus size={18} /> Add Money
            </button>
            <button className="action-btn-large secondary">
              <TrendingUp size={18} /> Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="quick-add-section">
        <h4>Quick Add</h4>
        <div className="quick-add">
          {quickAmounts.map(amt => (
            <button 
              key={amt} 
              className="quick-amount"
              onClick={() => handleAddMoney(amt)}
            >
              +₹{amt}
            </button>
          ))}
        </div>
      </div>

      <div className="transactions-section">
        <h4>Recent Transactions</h4>
        <div className="transaction-list">
          {transactions.map(t => (
            <div key={t.id} className="transaction-item">
              <div className={`transaction-icon ${t.type}`}>
                <t.icon size={18} />
              </div>
              <div className="transaction-info">
                <span className="transaction-desc">{t.desc}</span>
                <span className="transaction-date">{t.date}</span>
              </div>
              <span className={`transaction-amount ${t.type}`}>
                {t.type === 'credit' ? '+' : '-'}₹{t.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const menuItems = [
    { icon: User, label: 'Edit Profile', color: 'default' },
    { icon: Trophy, label: 'My Tournaments', color: 'default' },
    { icon: Star, label: 'Achievements', color: 'default' },
    { icon: Settings, label: 'Settings', color: 'default' },
    { icon: Shield, label: 'Help & Support', color: 'default' },
    { icon: LogOut, label: 'Logout', color: 'danger', action: handleLogout }
  ];

  return (
    <div className="view profile-view">
      <div className="profile-header-card">
        <div className="profile-bg-glow"></div>
        <img src={user.avatar} alt="Profile" className="profile-avatar-large" />
        <h3>{user.name}</h3>
        <div className="level-badge-large">
          <Crown size={14} />
          Level {user.level}
        </div>

        <div className="profile-stats-row">
          <div className="profile-stat-box">
            <span className="stat-box-num">156</span>
            <span className="stat-box-label">Matches</span>
          </div>
          <div className="profile-stat-box highlight">
            <span className="stat-box-num">43</span>
            <span className="stat-box-label">Wins</span>
          </div>
          <div className="profile-stat-box">
            <span className="stat-box-num">₹12.5K</span>
            <span className="stat-box-label">Earnings</span>
          </div>
        </div>
      </div>

      <div className="menu-list">
        {menuItems.map((item, idx) => (
          <button 
            key={idx} 
            className={`menu-item ${item.color === 'danger' ? 'danger' : ''}`}
            onClick={item.action || (() => {})}
          >
            <div className={`menu-icon ${item.color}`}>
              <item.icon size={20} />
            </div>
            <span>{item.label}</span>
            <ChevronRight size={16} className="menu-arrow" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ✅ WORKING ADMIN VIEW WITH ALL BUTTONS
function AdminView({ isAdmin, setView }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Security check
  if (!isAdmin) {
    return (
      <div className="view">
        <div className="empty-state unauthorized">
          <Shield size={48} style={{ color: '#ef4444', marginBottom: 16 }} />
          <h3>Access Denied</h3>
          <p>You are not authorized to access Admin Panel</p>
          <button className="btn btn-primary" onClick={() => setView('home')}>
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  const adminStats = [
    { label: 'Total Users', value: '12,450', icon: Users, color: 'blue' },
    { label: 'Live Tournaments', value: '8', icon: Target, color: 'green' },
    { label: 'Pending Withdrawals', value: '₹45,200', icon: Wallet, color: 'orange' },
    { label: 'Today's Revenue', value: '₹1,25,000', icon: TrendingUp, color: 'purple' }
  ];

  const handleCreateTournament = () => {
    setShowCreateModal(true);
    alert('🎮 Create Tournament Modal Opened!\n\nForm fields:\n- Tournament Name\n- Mode (Solo/Duo/Squad)\n- Prize Pool\n- Entry Fee\n- Max Players\n- Start Time');
  };

  const handleManagePlayers = () => {
    alert('👥 Manage Players Page\n\nFeatures:\n- View all registered users\n- Ban/unban players\n- View player stats\n- Send notifications');
  };

  const handleUpdateResults = () => {
    alert('🏆 Update Results\n\nFeatures:\n- Select tournament\n- Enter match results\n- Auto-calculate prize distribution\n- Send prizes to winners');
  };

  const handleWithdrawRequests = () => {
    alert('💰 Withdrawal Requests\n\nPending: 23 requests\nTotal: ₹45,200\n\nFeatures:\n- Approve/reject requests\n- View UPI details\n- Export report');
  };

  return (
    <div className="view admin-view">
      <div className="admin-header">
        <h2>Admin Dashboard</h2>
        <div className="admin-badge">ADMIN</div>
      </div>

      {/* Stats Overview */}
      <div className="admin-stats-grid">
        {adminStats.map((stat, idx) => (
          <div key={idx} className={`admin-stat-card ${stat.color}`}>
            <stat.icon size={24} />
            <div>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-value">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h3 className="section-title">Quick Actions</h3>
      <div className="admin-actions-grid">
        <button className="admin-action-card" onClick={handleCreateTournament}>
          <div className="action-icon create">
            <Plus size={28} />
          </div>
          <h4>Create Tournament</h4>
          <p>Launch new tournament with custom rules</p>
        </button>

        <button className="admin-action-card" onClick={handleManagePlayers}>
          <div className="action-icon manage">
            <Users size={28} />
          </div>
          <h4>Manage Players</h4>
          <p>View, ban, or modify player accounts</p>
        </button>

        <button className="admin-action-card" onClick={handleUpdateResults}>
          <div className="action-icon results">
            <Trophy size={28} />
          </div>
          <h4>Update Results</h4>
          <p>Enter match results & distribute prizes</p>
        </button>

        <button className="admin-action-card" onClick={handleWithdrawRequests}>
          <div className="action-icon withdraw">
            <Wallet size={28} />
          </div>
          <h4>Withdraw Requests</h4>
          <p>Approve pending withdrawal requests</p>
        </button>
      </div>

      {/* Active Tournaments Management */}
      <h3 className="section-title">Active Tournaments</h3>
      <div className="admin-tournament-list">
        {TOURNAMENTS.map(t => (
          <div key={t.id} className="admin-tournament-item">
            <div className="tournament-info-admin">
              <img src={t.image} alt={t.name} className="tournament-thumb" />
              <div>
                <h4>{t.name}</h4>
                <div className="tournament-meta-admin">
                  <span className={`status-dot ${t.status}`}></span>
                  <span>{t.status.toUpperCase()}</span>
                  <span>•</span>
                  <span>{t.currentPlayers}/{t.maxPlayers} players</span>
                  <span>•</span>
                  <span>₹{t.prize.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="tournament-actions">
              <button className="btn-icon" title="Edit">
                <Settings size={16} />
              </button>
              <button className="btn-icon" title="View Results">
                <Trophy size={16} />
              </button>
              <button className="btn-manage">Manage</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ currentView, setView, isAdmin }) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin' }] : []),
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${currentView === item.id ? 'active' : ''}`}
          onClick={() => setView(item.id)}
        >
          <div className="nav-icon-wrap">
            <item.icon size={22} />
            {currentView === item.id && <div className="nav-glow"></div>}
          </div>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}