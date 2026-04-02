import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Mail, Lock, Loader, LogIn, UserPlus } from 'lucide-react';
import supabase from '../lib/supabaseClient';

const authCardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.2, ease: 'easeIn' } }
};

export default function LoginScreen({ onLogin, onOpenSignup }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const value = identifier.trim();
    const normalizedPhone = value.replace(/\s|-/g, '');
    const isPhone = /^\+?\d{10,15}$/.test(normalizedPhone);

    if (!value || !password) {
      alert('Please enter email/phone and password.');
      return;
    }

    setLoading(true);
    try {
      const authPayload = isPhone
        ? { phone: normalizedPhone, password }
        : { email: value, password };

      const { data, error } = await supabase.auth.signInWithPassword(authPayload);
      if (error) throw error;
      onLogin(data.session);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="mobile-frame">
        <div className="login-page">
          <div className="login-brand">
            <Flame className="brand-icon" size={60} />
            <h1>CLASH<span className="brand-highlight">ARENA</span></h1>
          </div>
          <motion.div
            className="login-card"
            variants={authCardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="input-group">
              <Mail size={20} className="input-icon" />
              <input
                type="text"
                placeholder="Email or Phone"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="input-group">
              <Lock size={20} className="input-icon" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>
            <button onClick={handleLogin} disabled={loading} className="btn btn-primary">
              {loading ? <Loader size={20} className="spin" /> : <LogIn size={20} />} Login
            </button>
            <button onClick={onOpenSignup} disabled={loading} className="btn btn-outline">
              <UserPlus size={20} /> Create Account
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
