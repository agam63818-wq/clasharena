// src/components/TournamentCard.jsx
// Home/matches tournament card. The whole card is a <button> for keyboard
// access; all values come from real data, formatted via src/lib/format.

import { useState } from 'react';
import { Users, Clock } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatINR, formatDateTime } from '../lib/format';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=640&q=70&auto=format&fit=crop';

export default function TournamentCard({ tournament, onSelect }) {
  const [imgError, setImgError] = useState(false);
  const t = tournament;
  const current = Number(t.current_players) || 0;
  const max = Number(t.max_players) || 0;
  const fillPct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

  return (
    <button
      type="button"
      className="t-card"
      onClick={() => onSelect(t)}
      aria-label={`${t.name || 'Match'} — prize ${formatINR(t.prize)}, entry ${formatINR(
        t.entry_fee
      )}, ${current} of ${max} slots, ${formatDateTime(t.match_time)}`}
    >
      <span className="t-card-media">
        {!imgError && (
          <img
            src={t.image_url || FALLBACK_IMAGE}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        )}
        <StatusBadge tournament={t} />
      </span>
      <span className="t-card-body">
        <span className="t-card-title-row">
          <span className="t-card-title">{t.name || 'Unnamed match'}</span>
          <span className="prize-tag">{formatINR(t.prize)}</span>
        </span>
        <span className="t-card-meta">
          <span className="meta-item">
            <Users size={14} aria-hidden="true" /> {current}/{max} slots
          </span>
          <span className="meta-item">
            <Clock size={14} aria-hidden="true" /> {formatDateTime(t.match_time)}
          </span>
        </span>
        <span
          className="slots"
          role="img"
          aria-label={`Slots filled: ${current} of ${max}`}
        >
          <span className="slots-bar" style={{ width: `${fillPct}%` }} />
        </span>
        <span className="t-card-footer">
          <span className="chip">{t.mode || 'Solo'}</span>
          <span className="entry-fee">Entry {formatINR(t.entry_fee)}</span>
        </span>
      </span>
    </button>
  );
}
