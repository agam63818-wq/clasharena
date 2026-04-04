import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Phone, Loader, Flame } from 'lucide-react';
import supabase from '../lib/supabaseClient';

export default function SignupScreen({ onBackToLogin, onSignupSuccess }) {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (event) => {
    event.preventDefault();

    if (!username || !phone || !email || !password || !confirmPassword) {
      alert('Please fill username, phone, email, password and confirm password.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Password and confirm password must match.');
      return;
    }

    setLoading(true);

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          phone
        }
      }
    });

    if (signupError) {
      setLoading(false);
      alert(signupError.message);
      return;
    }

    const userId = signupData?.user?.id;

    if (!userId) {
      setLoading(false);
      alert('Unable to create user account. Please try again.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        username,
        phone,
        level: 1,
        wins: 0,
        balance: 0,
        is_admin: false
      },
      {
        onConflict: 'id'
      }
    );

    if (profileError) {
      setLoading(false);
      alert(profileError.message);
      return;
    }

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (loginError) {
      alert(loginError.message);
      return;
    }

    onSignupSuccess(loginData.session);
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
        onSubmit={handleSignup}
      >
        <div className="input-group">
          <User className="input-icon" />
          <input
            className="form-input"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="input-group">
          <Phone className="input-icon" />
          <input
            className="form-input"
            placeholder="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />
        </div>

        <div className="input-group">
          <Mail className="input-icon" />
          <input
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="input-group">
          <Lock className="input-icon" />
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="input-group">
          <Lock className="input-icon" />
          <input
            className="form-input"
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Loader className="spin" /> : 'Create Account'}
        </button>

        <button className="btn btn-outline" type="button" onClick={onBackToLogin} disabled={loading}>
          Back to Login
        </button>
      </motion.form>
    </div>
  );
}
