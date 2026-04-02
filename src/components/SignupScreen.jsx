import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Phone, Loader } from 'lucide-react';
import supabase from '../lib/supabaseClient';

export default function SignupScreen({ onBack }) {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username || !phone || !email || !password) {
      return alert("Sab fields fill karo");
    }

    setLoading(true);

    // 1. create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      setLoading(false);
      return alert(error.message);
    }

    // 2. insert profile
    const userId = data.user.id;

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: userId,
          username,
          phone,
          level: 1,
          wins: 0,
          balance: 0,
          is_admin: false
        }
      ]);

    setLoading(false);

    if (profileError) return alert(profileError.message);

    alert("Account created ✅ अब login करो");
    onBack();
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
      >

        <h2>Create Account</h2>

        <div className="input-group">
          <User />
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="input-group">
          <Phone />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="input-group">
          <Mail />
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <Lock />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={handleSignup}>
          {loading ? <Loader className="spin" /> : "Create Account"}
        </button>

        <button className="btn btn-outline" onClick={onBack}>
          Back to Login
        </button>

      </motion.div>
    </div>
  );
}
