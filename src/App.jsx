import React, { useState, useEffect } from 'react';
import { Trophy, Home, Wallet, User, Shield, Flame, Clock, Users, Plus, ChevronRight, Star } from 'lucide-react';
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
  { rank: 1, name: "ProGamer_X", wins: 24, earnings: 12500 },
  { rank: 2, name: "Ninja_FF", wins: 21, earnings: 10200 },
  { rank: 3, name: "BeastMode", wins: 18, earnings: 8900 },
  { rank: 4, name: "Sniper_King", wins: 15, earnings: 7200 },
  { rank: 5, name: "Elite_Slayer", wins: 12, earnings: 5400 }
];

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [balance, setBalance] = useState(1250);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [user, setUser] = useState({ name: "Player_One", level: 42, avatar: "https://i.pravatar.cc/150?img=11" });

  const renderContent = () => {
    switch(currentView) {
      case 'home':
        return <HomeView onTournamentSelect={setSelectedTournament} setView={setCurrentView} />;
      case 'tournament':
        return <TournamentDetailView tournament={selectedTournament} balance={balance} setBalance={setBalance} setView={setCurrentView} />;
      case 'wallet':
        return <WalletView balance={balance} />;
      case 'profile':
        return <ProfileView user={user} />;
      case 'admin':
        return <AdminView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <Header balance={balance} user={user} />
        <main className="main-content">
          {renderContent()}
        </main>
        <BottomNav currentView={currentView} setView={setCurrentView} />
      </div>
    </div>
  );
}

// Components
function Header({ balance, user }) {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <Flame className="brand-icon" />
          <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
        </div>
        <div className="header-actions">
          <div className="balance-pill">
            <Wallet size={16} />
            <span>₹{balance}</span>
          </div>
          <img src={user.avatar} alt="Profile" className="header-avatar" />
        </div>
      </div>
    </header>
  );
}

function HomeView({ onTournamentSelect, setView }) {
  return (
    <div className="view home-view">
      <section className="hero-section">
        <div className="hero-content">
          <span className="badge live-badge">
            <span className="pulse"></span>
            LIVE TOURNAMENTS
          </span>
          <h2>Compete & Win<br/><span className="gradient-text">Real Cash</span></h2>
          <p>Join 50,000+ players in the ultimate Free Fire championship</p>
        </div>
      </section>

      <section className="stats-row">
        <div className="stat-card">
          <Trophy size={20} className="stat-icon" />
          <div>
            <span className="stat-value">₹5L+</span>
            <span className="stat-label">Prize Pool</span>
          </div>
        </div>
        <div className="stat-card">
          <Users size={20} className="stat-icon" />
          <div>
            <span className="stat-value">50K+</span>
            <span className="stat-label">Players</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h3>Live Tournaments</h3>
          <button className="see-all-btn">See All <ChevronRight size={16} /></button>
        </div>
        <div className="tournament-list">
          {TOURNAMENTS.map(t => (
            <div key={t.id} className="tournament-card" onClick={() => { onTournamentSelect(t); setView('tournament'); }}>
              <div className="tournament-image" style={{backgroundImage: `url(${t.image})`}}>
                <div className="tournament-overlay">
                  <span className={`status-badge ${t.status}`}>
                    {t.status === 'live' ? '● LIVE' : t.status === 'upcoming' ? 'UPCOMING' : 'OPEN'}
                  </span>
                  {t.status === 'live' && <div className="live-indicator"></div>}
                </div>
              </div>
              <div className="tournament-info">
                <div className="tournament-header">
                  <h4>{t.name}</h4>
                  <span className="prize-tag">₹{t.prize}</span>
                </div>
                <div className="tournament-meta">
                  <span className="meta-item"><Users size={14} /> {t.currentPlayers}/{t.maxPlayers}</span>
                  <span className="meta-item"><Clock size={14} /> {t.timeRemaining || t.startTime}</span>
                </div>
                <div className="tournament-footer">
                  <span className="mode-badge">{t.mode}</span>
                  <span className="entry-fee">Entry: ₹{t.entryFee}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Top Players</h3>
        <div className="leaderboard">
          {LEADERBOARD.map((player, idx) => (
            <div key={idx} className={`leaderboard-item rank-${player.rank}`}>
              <div className="rank">{player.rank}</div>
              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <span className="player-stats">{player.wins} wins</span>
              </div>
              <div className="player-earnings">₹{player.earnings}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TournamentDetailView({ tournament, balance, setBalance, setView }) {
  if (!tournament) return <div className="empty-state">Select a tournament</div>;

  const handleJoin = () => {
    if (balance >= tournament.entryFee) {
      setBalance(balance - tournament.entryFee);
      alert("Successfully joined tournament!");
    } else {
      alert("Insufficient balance!");
    }
  };

  return (
    <div className="view detail-view">
      <button className="back-btn" onClick={() => setView('home')}>← Back</button>

      <div className="detail-hero" style={{backgroundImage: `url(${tournament.image})`}}>
        <div className="detail-hero-overlay">
          <span className={`status-badge large ${tournament.status}`}>
            {tournament.status.toUpperCase()}
          </span>
          <h2>{tournament.name}</h2>
          <div className="detail-prize">Prize Pool: ₹{tournament.prize}</div>
        </div>
      </div>

      <div className="detail-content">
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Entry Fee</span>
            <span className="value">₹{tournament.entryFee}</span>
          </div>
          <div className="info-item">
            <span className="label">Mode</span>
            <span className="value">{tournament.mode}</span>
          </div>
          <div className="info-item">
            <span className="label">Players</span>
            <span className="value">{tournament.currentPlayers}/{tournament.maxPlayers}</span>
          </div>
          <div className="info-item">
            <span className="label">Starts In</span>
            <span className="value">{tournament.timeRemaining || tournament.startTime}</span>
          </div>
        </div>

        <div className="description">
          <h4>About Tournament</h4>
          <p>Compete against the best Free Fire players in India. Winners will be announced immediately after the match ends. Prize money will be credited within 24 hours.</p>
        </div>

        <div className="rules-section">
          <h4>Rules</h4>
          <ul>
            <li>Level 50+ required</li>
            <li>No emulators allowed</li>
            <li>Team code will be shared 15 mins before start</li>
            <li>Minimum 4 matches to qualify for prizes</li>
          </ul>
        </div>

        <button className="join-btn" onClick={handleJoin}>
          <Trophy size={20} />
          Join Tournament (₹{tournament.entryFee})
        </button>
      </div>
    </div>
  );
}

function WalletView({ balance }) {
  const transactions = [
    { id: 1, type: 'credit', amount: 500, desc: 'Tournament Win', date: '2 hours ago' },
    { id: 2, type: 'debit', amount: 100, desc: 'Entry Fee - Power Duo', date: '5 hours ago' },
    { id: 3, type: 'credit', amount: 1000, desc: 'Deposit', date: '1 day ago' },
    { id: 4, type: 'credit', amount: 200, desc: 'Referral Bonus', date: '2 days ago' }
  ];

  return (
    <div className="view wallet-view">
      <h2>Wallet</h2>

      <div className="balance-card">
        <div className="balance-label">Total Balance</div>
        <div className="balance-amount">₹{balance}</div>
        <div className="balance-actions">
          <button className="action-btn primary">Add Money</button>
          <button className="action-btn secondary">Withdraw</button>
        </div>
      </div>

      <div className="quick-add">
        <button className="quick-amount">+₹100</button>
        <button className="quick-amount">+₹500</button>
        <button className="quick-amount">+₹1000</button>
        <button className="quick-amount">+₹5000</button>
      </div>

      <div className="transactions-section">
        <h3>Recent Transactions</h3>
        <div className="transaction-list">
          {transactions.map(t => (
            <div key={t.id} className="transaction-item">
              <div className={`transaction-icon ${t.type}`}>
                {t.type === 'credit' ? '↓' : '↑'}
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
  return (
    <div className="view profile-view">
      <div className="profile-header">
        <img src={user.avatar} alt="Profile" className="profile-avatar-large" />
        <h3>{user.name}</h3>
        <span className="level-badge">Level {user.level}</span>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="stat-num">156</span>
            <span className="stat-name">Matches</span>
          </div>
          <div className="profile-stat">
            <span className="stat-num">43</span>
            <span className="stat-name">Wins</span>
          </div>
          <div className="profile-stat">
            <span className="stat-num">₹12.5K</span>
            <span className="stat-name">Earnings</span>
          </div>
        </div>
      </div>

      <div className="menu-list">
        <button className="menu-item">
          <User size={20} />
          <span>Edit Profile</span>
          <ChevronRight size={16} />
        </button>
        <button className="menu-item">
          <Trophy size={20} />
          <span>My Tournaments</span>
          <ChevronRight size={16} />
        </button>
        <button className="menu-item">
          <Star size={20} />
          <span>Achievements</span>
          <ChevronRight size={16} />
        </button>
        <button className="menu-item">
          <Shield size={20} />
          <span>Support</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function AdminView() {
  return (
    <div className="view admin-view">
      <h2>Admin Dashboard</h2>

      <div className="admin-grid">
        <div className="admin-card">
          <h4>Create Tournament</h4>
          <p>Create new tournament with custom rules</p>
          <button className="admin-btn"><Plus size={16} /> Create New</button>
        </div>

        <div className="admin-card">
          <h4>Manage Players</h4>
          <p>View and manage participants</p>
          <button className="admin-btn">View List</button>
        </div>

        <div className="admin-card">
          <h4>Results</h4>
          <p>Update match results and scores</p>
          <button className="admin-btn">Update</button>
        </div>
      </div>

      <div className="active-tournaments">
        <h3>Active Management</h3>
        <div className="management-list">
          {TOURNAMENTS.map(t => (
            <div key={t.id} className="management-item">
              <div>
                <h4>{t.name}</h4>
                <span>{t.currentPlayers} players joined</span>
              </div>
              <button className="manage-btn">Manage</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BottomNav({ currentView, setView }) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'admin', icon: Shield, label: 'Admin' },
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
          <item.icon size={24} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}