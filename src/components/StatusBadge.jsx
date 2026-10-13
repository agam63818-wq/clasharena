// src/components/StatusBadge.jsx
// Status badge derived from real tournament data (src/lib/tournamentStatus).

import { deriveStatus, STATUS_META } from '../lib/tournamentStatus';

export default function StatusBadge({ tournament, status }) {
  const key = status || deriveStatus(tournament);
  const meta = STATUS_META[key] || STATUS_META.unknown;
  return (
    <span className={`badge badge--${key}`}>
      {meta.dot && <span className="badge-dot" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}
