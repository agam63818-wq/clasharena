import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Mail, Lock, Loader, LogIn, UserPlus } from 'lucide-react';
import supabase from '../lib/supabaseClient';

export default function LoginScreen({ onLoginSuccess, onSwitchToSignup }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();

    if (!identifier || !password) {
      alert('Please enter email/phone and password.');
      return;
    }

    setLoading(true);

    const authPayload = identifier.includes('@')
      ? { email: identifier, password }
      : { phone: identifier, password };

    const { data, error } = await supabase.auth.signInWithPassword(authPayload);

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    onLoginSuccess(data.session);
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <Flame size={60} className="brand-icon" />
        <h1>
          CLASH<span className="brand-highlight">ARENA</span>
        </h1>
      </div>

      <motion.form
        className="login-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleLogin}
      >
        <div className="input-group">
          <Mail size={20} className="input-icon" />
          <input
            className="form-input"
            placeholder="Email or Phone (+91...)"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="input-group">
          <Lock size={20} className="input-icon" />
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Loader className="spin" /> : <LogIn />} Login
        </button>

        <button
          className="btn btn-outline"
          type="button"
          onClick={onSwitchToSignup}
          disabled={loading}
        >
          <UserPlus /> Create Account
        </button>
      </motion.form>
    </div>
  );
}
