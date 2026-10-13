// src/components/ErrorRetry.jsx
// Honest error state with a retry action for every screen.

import { AlertCircle, RotateCw } from 'lucide-react';

export default function ErrorRetry({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="error-retry" role="alert">
      <AlertCircle size={28} color="var(--danger-text)" aria-hidden="true" />
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-outline btn--sm" onClick={onRetry}>
          <RotateCw size={15} aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
}
