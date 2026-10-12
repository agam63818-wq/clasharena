// src/config/features.js
// Client feature flags (permanent rule 7): anything that depends on a
// database object or an external provider must be flaggable and must degrade
// gracefully with an honest message when its backend piece is missing.
//
// Safe defaults: a flag is only ON when its backend demonstrably exists.
// Server-side counterparts are env vars on the API routes
// (JOIN_USE_RPC, ENABLE_TOURNAMENT_CANCELLATION) — see api/joinTournament.js
// and api/deleteTournament.js.

const env = import.meta.env || {};

const isTrue = (v) => v === 'true';

export const features = {
  // Wallet history runs against the existing transactions table and the
  // query is user-filtered (docs/AUDIT.md P0-5). Set
  // VITE_FEATURE_WALLET_TRANSACTIONS=false to hide it with an honest
  // message if the DB piece is missing.
  walletTransactions: env.VITE_FEATURE_WALLET_TRANSACTIONS !== 'false',

  // NO payment provider is integrated yet. Must stay false until a real
  // flow exists — wallet buttons render disabled with an honest label
  // meanwhile (permanent rule 4: no fake payments, no invented UPI IDs or
  // WhatsApp numbers).
  payments: isTrue(env.VITE_FEATURE_PAYMENTS),

  // Room credentials via the get_room_details() RPC
  // (supabase/proposed/003_functions_triggers.sql — NOT applied yet).
  // While false, the app keeps today's behavior (room columns ride along on
  // the tournaments row). When true, list queries stop fetching room columns
  // entirely and joined players get them only through the RPC
  // (docs/AUDIT.md P0-3). Enabling it also requires the DB phase's
  // credentials table for admin room editing.
  roomDetailsRpc: isTrue(env.VITE_FEATURE_ROOM_RPC)
};
