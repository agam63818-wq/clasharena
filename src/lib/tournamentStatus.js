// src/lib/tournamentStatus.js
// Derives the DISPLAY status of a tournament from real data only
// (docs/AUDIT.md rule: no invented values). The database `status` values are
// untouched — this is presentation mapping:
//   registration + full  -> full
//   registration         -> open
//   upcoming/live/completed/cancelled -> as-is

export function deriveStatus(tournament) {
  if (!tournament) return 'unknown';
  const s = tournament.status;
  if (s === 'cancelled') return 'cancelled';
  if (s === 'completed') return 'completed';
  const cur = Number(tournament.current_players) || 0;
  const max = Number(tournament.max_players) || 0;
  if (max > 0 && cur >= max) return 'full';
  if (s === 'live') return 'live';
  if (s === 'registration') return 'open';
  if (s === 'upcoming') return 'upcoming';
  return 'unknown';
}

export const STATUS_META = {
  open: { label: 'Open', dot: false },
  upcoming: { label: 'Upcoming', dot: false },
  live: { label: 'Live', dot: true },
  completed: { label: 'Completed', dot: false },
  cancelled: { label: 'Cancelled', dot: false },
  full: { label: 'Full', dot: false },
  unknown: { label: 'TBA', dot: false }
};
