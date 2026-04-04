import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, Clock, Hash } from 'lucide-react';
import supabase from '../lib/supabaseClient';

const STATUS_META = {
  joined: { label: 'Joined', className: 'registration', icon: CheckCircle2 },
  upcoming: { label: 'Upcoming', className: 'upcoming', icon: Clock },
  completed: { label: 'Completed', className: 'completed', icon: CheckCircle2 }
};

function formatDate(value) {
  if (!value) return 'TBA';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'TBA';
  return parsed.toLocaleString();
}

function resolveMatchStatus(registrationStatus, tournamentStatus, matchTime) {
  if (registrationStatus === 'completed' || tournamentStatus === 'completed') return 'completed';
  const now = Date.now();
  const matchTimestamp = matchTime ? new Date(matchTime).getTime() : null;
  if (matchTimestamp && !Number.isNaN(matchTimestamp) && matchTimestamp > now) return 'upcoming';
  return 'joined';
}

export default function MyMatches({ userId }) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (!userId) return;

    const fetchMatches = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('match_registrations')
        .select('id, status, ff_uid, ign, created_at, tournaments:tournament_id(id, name, match_time, status, room_id)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setMatches([]);
      } else {
        setMatches(data || []);
      }
      setLoading(false);
    };

    fetchMatches();
  }, [userId]);

  const mappedMatches = useMemo(
    () => matches.map((item) => {
      const matchStatus = resolveMatchStatus(item.status, item.tournaments?.status, item.tournaments?.match_time);
      const meta = STATUS_META[matchStatus] || STATUS_META.joined;
      return {
        id: item.id,
        name: item.tournaments?.name || 'Tournament',
        dateTime: formatDate(item.tournaments?.match_time),
        roomId: item.tournaments?.room_id || 'Not assigned yet',
        statusLabel: meta.label,
        statusClassName: meta.className,
        Icon: meta.icon
      };
    }),
    [matches]
  );

  return (
    <div className="view">
      <motion.h2 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '16px' }}>
        My Matches
      </motion.h2>

      {loading ? (
        <p style={{ color: 'var(--text-dim)' }}>Loading your matches...</p>
      ) : mappedMatches.length === 0 ? (
        <p style={{ color: 'var(--text-dim)' }}>You have not joined any matches yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mappedMatches.map((match) => (
            <motion.div
              key={match.id}
              className="tournament-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ padding: '14px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>{match.name}</h4>
                <span className={`status-badge ${match.statusClassName}`}>
                  <match.Icon size={14} style={{ marginRight: '6px' }} />
                  {match.statusLabel}
                </span>
              </div>

              <div style={{ marginTop: '10px', color: 'var(--text-dim)', fontSize: '13px', display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarClock size={14} /> {match.dateTime}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Hash size={14} /> Room ID: {match.roomId}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
