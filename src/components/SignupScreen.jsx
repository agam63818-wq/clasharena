import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, User, Phone, Mail, Lock, Loader, ArrowLeft, UserPlus } from 'lucide-react';
import supabase from '../lib/supabaseClient';

const authCardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.2, ease: 'easeIn' } }
};

export default function SignupScreen({ onSignupComplete, onBackToLogin }) {
  const [form, setForm] = useState({
    username: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSignup = async () => {
    const username = form.username.trim();
    const normalizedPhone = form.phone.replace(/\D/g, '');
    const email = form.email.trim();
    const password = form.password;
    const confirmPassword = form.confirmPassword;

    if (!username || !normalizedPhone || !password || !confirmPassword) {
      alert('Please fill all required fields.');
      return;
    }

    if (!/^\d{10,15}$/.test(normalizedPhone)) {
      alert('Phone number must be 10-15 digits.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Password and confirm password must match.');
      return;
    }

    setLoading(true);
    try {
      const authPayload = email
        ? { email, password }
        : { phone: normalizedPhone, password };

      const { data, error } = await supabase.auth.signUp(authPayload);
      if (error) throw error;
      if (!data.user?.id) throw new Error('Unable to create account. Please try again.');

      const { error: profileError } = await supabase.from('profiles').upsert([
        {
          id: data.user.id,
          username,
          phone: normalizedPhone,
          level: 1,
          wins: 0,
          balance: 0,
          ff_uid: '',
          ign: '',
          is_admin: false
        }
      ], { onConflict: 'id' });

      if (profileError) throw profileError;

      alert('Account created successfully! Please log in.');
      onSignupComplete();
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
            <h1>CREATE <span className="brand-highlight">ACCOUNT</span></h1>
          </div>
          <motion.div
            className="login-card"
            variants={authCardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="input-group">
              <User size={20} className="input-icon" />
              <input
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={(e) => updateField('username', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="input-group">
              <Phone size={20} className="input-icon" />
              <input
                type="tel"
                placeholder="Phone (10-15 digits)"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="input-group">
              <Mail size={20} className="input-icon" />
              <input
                type="email"
                placeholder="Email (optional)"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="input-group">
              <Lock size={20} className="input-icon" />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="input-group">
              <Lock size={20} className="input-icon" />
              <input
                type="password"
                placeholder="Confirm Password"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                className="form-input"
              />
            </div>
            <button onClick={handleSignup} disabled={loading} className="btn btn-primary">
              {loading ? <Loader size={20} className="spin" /> : <UserPlus size={20} />} Create Account
            </button>
            <button onClick={onBackToLogin} disabled={loading} className="btn btn-outline">
              <ArrowLeft size={20} /> Back to Login
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
