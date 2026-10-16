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

  // Legacy endpoint retained for existing callers. The admin UI uses the
  // requireAdmin-protected adminDeleteTournament action below instead.
  deleteTournament: ({ tournamentId }) =>
    request('/api/deleteTournament', { body: { tournamentId } }),

  // --- admin (single server route: api/admin.js) ---------------------------
  // The browser no longer writes tournaments or reads registrations with the
  // anon key: every admin action carries the session token and the server
  // re-reads the caller's role from the database (docs/AUDIT.md P1-2). The
  // UI's isAdmin flag is cosmetic only.
  adminCreateTournament: (tournament) =>
    request('/api/admin', { body: { action: 'createTournament', tournament } }),

  adminUpdateTournament: (tournament) =>
    request('/api/admin', { body: { action: 'updateTournament', tournament } }),

  adminGetTournament: ({ tournamentId }) =>
    request('/api/admin', { body: { action: 'getTournament', tournamentId } }),

  adminDeleteTournament: ({ tournamentId }) =>
    request('/api/admin', { body: { action: 'deleteTournament', tournamentId } }),

  adminListRegistrations: () =>
    request('/api/admin', { body: { action: 'listRegistrations' } }),

  // Cancel (not delete): the server decides whether the tournament can simply
  // be closed or needs the atomic refund RPC, and answers 409/503 with the
  // exact reason when it cannot. The UI shows that message verbatim.
  adminCancelTournament: ({ tournamentId, reason }) =>
    request('/api/admin', { body: { action: 'cancelTournament', tournamentId, reason } }),

  // Wallet request review (server checks ENABLE_WALLET_REQUESTS first).
  adminListWalletRequests: () =>
    request('/api/admin', { body: { action: 'listWalletRequests' } }),

  adminApproveWalletRequest: ({ requestId, note }) =>
    request('/api/admin', { body: { action: 'approveWalletRequest', requestId, note } }),

  adminRejectWalletRequest: ({ requestId, note }) =>
    request('/api/admin', { body: { action: 'rejectWalletRequest', requestId, note } }),

  // --- wallet requests (user side, api/wallet.js) --------------------------
  // A request is never a balance: it is a pending row an admin must approve.
  createWalletRequest: ({ type, amount, reference, note }) =>
    request('/api/wallet', { body: { action: 'createWalletRequest', type, amount, reference, note } }),

  listWalletRequests: ({ perPage } = {}) =>
    request('/api/wallet', { body: { action: 'listWalletRequests', perPage } })
};
