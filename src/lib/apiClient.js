// src/lib/apiClient.js
// Single client entry point for calls to /api/* serverless routes.
// - Attaches the current Supabase session access token as
//   `Authorization: Bearer <token>` on every request (the server derives the
//   user identity from this token — it never trusts body fields).
// - Normalizes errors into ApiError { message, status, code } so callers can
//   branch on the duplicate-join code ('23505') exactly as before.

import supabase from './supabaseClient';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code; // e.g. '23505' for duplicate join
  }
}

async function request(path, { body } = {}) {
  const { data, error } = await supabase.auth.getSession();
  const session = data && data.session;

  if (error || !session) {
    throw new ApiError('You are signed out. Please log in again.', 401);
  }

  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body || {})
    });
  } catch {
    throw new ApiError('Network error. Please check your connection and try again.', 0);
  }

  let result = null;
  try {
    result = await res.json();
  } catch {
    // Non-JSON response body — fall through to the status-based error below.
  }

  if (!res.ok) {
    throw new ApiError(
      (result && result.error) || 'Request failed. Please try again.',
      res.status,
      result && result.code
    );
  }

  return result;
}

export const api = {
  // userId / entryFee deliberately NOT sent: the server takes them from the
  // verified token and the tournaments table respectively.
  joinTournament: ({ tournamentId, ff_uid, ign }) =>
    request('/api/joinTournament', { body: { tournamentId, ff_uid, ign } }),

  deleteTournament: ({ tournamentId }) =>
    request('/api/deleteTournament', { body: { tournamentId } })
};
