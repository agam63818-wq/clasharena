// src/config/features.js
// Client feature flags (permanent rule 7): anything that depends on a
// database object or an external provider must be flaggable and must degrade
// gracefully with an honest message when its backend piece is missing.
//
// Safe defaults: a flag is only ON when its backend demonstrably exists.
// Server-side counterparts are env vars on the API routes (JOIN_USE_RPC,
// ENABLE_WALLET_REQUESTS, ENABLE_TOURNAMENT_CANCELLATION,
// ENABLE_TOURNAMENT_RESULTS) — see api/joinTournament.js, api/wallet.js,
// api/admin.js.
// The authoritative flag table (what each flag needs in the database and its
// safe default) is README.md → "Feature flags". Do not add flag names here
// that are not in that table.

const env = import.meta.env || {};

const isTrue = (v) => v === 'true';

export const features = {
  // Wallet history runs against the existing transactions table and the
  // query is user-filtered (docs/AUDIT.md P0-5). Set
  // VITE_FEATURE_WALLET_TRANSACTIONS=false to hide it with an honest
  // message if the DB piece is missing.
  walletTransactions: env.VITE_FEATURE_WALLET_TRANSACTIONS !== 'false',

  // Razorpay wallet top-up (deposit only): the server routes
  // (api/payments.js + api/razorpayWebhook.js) and the Wallet "Add money"
  // UI exist, but the feature stays OFF until the OWNER sets BOTH this flag
  // AND the server flag ENABLE_PAYMENTS=true with Razorpay keys configured
  // in Vercel (test mode first). While off, the wallet keeps the honest
  // "coming soon" state (permanent rule 4: no fake payments).
  payments: isTrue(env.VITE_FEATURE_PAYMENTS),

  // Deposit / withdraw REQUESTS (no gateway): users ask, an admin approves,
  // and only the approve RPC touches money. Needs BOTH this flag AND the
  // server flag ENABLE_WALLET_REQUESTS=true AND the wallet_requests table +
  // approve_wallet_request()/reject_wallet_request() functions
  // (supabase/proposed/005_wallet_requests.sql — NOT applied). While off, the
  // wallet keeps the honest "coming soon" state.
  walletRequests: isTrue(env.VITE_FEATURE_WALLET_REQUESTS),

  // Room credentials via the get_room_details() RPC
  // (supabase/proposed/003_functions_triggers.sql — NOT applied yet).
  // While false, the app keeps today's behavior (room columns ride along on
  // the tournaments row). When true, list queries stop fetching room columns
  // entirely and joined players get them only through the RPC
  // (docs/AUDIT.md P0-3). Enabling it also requires the DB phase's
  // credentials table for admin room editing.
  roomDetailsRpc: isTrue(env.VITE_FEATURE_ROOM_RPC),

  // The tournament_results table/RLS policy are deployed for this release.
  // Operators can explicitly disable its player-facing reads while diagnosing
  // a database deployment; result views then say so rather than inventing
  // standings or payouts.
  tournamentResults: env.VITE_FEATURE_TOURNAMENT_RESULTS !== 'false'
};
