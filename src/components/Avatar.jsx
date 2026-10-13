// src/components/Avatar.jsx
// Local avatar: uses the user's own avatar_url when set, otherwise initials.
// No external avatar services (they leak user IDs — docs/AUDIT.md P2-4).

import { useState } from 'react';

export default function Avatar({ name = 'P', src, size = 36, className = '' }) {
  const [broken, setBroken] = useState(false);
  const initials = String(name || 'P').trim().charAt(0).toUpperCase() || 'P';

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`avatar ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}
