// api/wallet.js
//
// ONE wallet router (function-count budget: Vercel Hobby allows 12 functions
// per deployment; this file is the wallet's only route).
//
//   POST /api/wallet
//   { action: 'createWalletRequest', type: 'deposit' | 'withdraw',
//     amount: number, reference?: string, note?: string }
//   { action: 'listWalletRequests' }
//
// WHAT USERS CAN AND CANNOT DO (permanent rules 2, 3, 4):
//   - a user CREATES A REQUEST. The row is always written with
//     status = 'pending', user_id from the verified token, and no balance or
//     decision fields exist in the payload at all — the body cannot set a
//     status, a balance or a review.
//   - the request is visible to the user (`listWalletRequests` filters on the
//     token subject) and to admins (`api/admin.js`).
//   - MONEY ONLY MOVES when an admin approves, through the
//     approve_wallet_request() DB function. This route never touches balances.
//
// FLAGS / GRACEFUL DEGRADATION (permanent rule 7):
//   - ENABLE_WALLET_REQUESTS must be 'true' on the server, otherwise every
//     action answers 503 with an honest "not enabled" message.
//   - if the wallet_requests table is missing, the route answers 503
//     "requires database setup" (api/_lib/dbErrors.js) — never a fake success.
//
// RATE LIMITING (see docs/DB_REQUIREMENTS.md §5):
//   - per-user, enforced with a DB count query over the last hour
//     (WALLET_REQUESTS_PER_HOUR on the server, default 5) — NOT an in-memory
//     counter. Serverless note: each invocation may run on a different
//     instance and instances are recycled, so a module-level counter would be
//     neither shared nor durable. The DB count is shared across every
//     instance and survives cold starts; it is a coarse abuse brake, not a
//     billing-grade limiter (a sliding-window table or an external store is
//     the DB-phase upgrade).
//
// Response shapes:
//   { success: true, request }             createWalletRequest
//   { success: true, requests: [...] }     listWalletRequests
//   { error: string }                      failures (safe messages only)

import { requireUser } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { isMissingDbObjectError, missingSetupError } from './_lib/dbErrors.js';

// Sane bounds. Amounts are also constrained in the database (005 §2) and the
// admin approval function re-reads the balance before any debit.
export const MAX_REQUEST_AMOUNT = 50000; // ₹50,000 per request
export const MIN_REQUEST_AMOUNT = 1; // ₹1
const MAX_REFERENCE_LENGTH = 64;
const MAX_NOTE_LENGTH = 300;
const LIST_LIMIT = 50;

// Coarse abuse brake, per user, per rolling hour.
export const DEFAULT_REQUESTS_PER_HOUR = 5;

const WALLET_TABLE = 'wallet_requests';
const MISSING_TABLE_MESSAGE = 'the wallet_requests table';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (process.env.ENABLE_WALLET_REQUESTS !== 'true') {
      throw new HttpError(
        503,
        'Wallet requests are not enabled on this server yet. No request was created and no balance was changed.'
      );
    }

    const user = await requireUser(req);

    const body = req.body || {};
    const supabase = getSupabaseAdmin();

    switch (body.action) {
      case 'createWalletRequest':
        return await createWalletRequest(res, supabase, user.id, body);
      case 'listWalletRequests':
        return await listWalletRequests(res, supabase, user.id, body);
      default:
        throw new HttpError(400, 'Unknown wallet action.');
    }
  } catch (err) {
    return sendError(res, err);
  }
}

// ---------------------------------------------------------------------------
// createWalletRequest — inserts a PENDING request. Never a balance, never a
// status chosen by the client.
// ---------------------------------------------------------------------------
async function createWalletRequest(res, supabase, userId, body) {
  const type = validateType(body.type);
  const amount = validateAmount(body.amount);
  const reference = validateOptionalText(body.reference, 'Reference', MAX_REFERENCE_LENGTH);
  const note = validateOptionalText(body.note, 'Note', MAX_NOTE_LENGTH);

  await assertUnderRateLimit(supabase, userId);

  const { data, error } = await supabase
    .from(WALLET_TABLE)
    .insert([
      {
        // Identity from the token only — a body userId/status/balance is
        // simply not part of this object.
        user_id: userId,
        type,
        amount,
        reference,
        note,
        status: 'pending'
      }
    ])
    .select('id, type, amount, reference, note, status, created_at')
    .single();

  if (error) {
    if (isMissingDbObjectError(error)) {
      const { status, message } = missingSetupError(MISSING_TABLE_MESSAGE);
      throw new HttpError(status, message);
    }
    console.error('wallet: request insert failed:', error.message);
    throw new HttpError(500, 'Could not submit your request right now.');
  }

  return res.status(200).json({ success: true, request: data });
}

// ---------------------------------------------------------------------------
// listWalletRequests — only the caller's own rows.
// ---------------------------------------------------------------------------
async function listWalletRequests(res, supabase, userId, body) {
  const limit = clampPerPage(body.perPage);

  const { data, error } = await supabase
    .from(WALLET_TABLE)
    .select('id, type, amount, reference, note, status, admin_note, reviewed_at, created_at')
    .eq('user_id', userId) // own requests only — never filtered by the client
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingDbObjectError(error)) {
      const { status, message } = missingSetupError(MISSING_TABLE_MESSAGE);
      throw new HttpError(status, message);
    }
    console.error('wallet: request list failed:', error.message);
    throw new HttpError(500, 'Could not load your requests right now.');
  }

  return res.status(200).json({ success: true, requests: data || [] });
}

// ---------------------------------------------------------------------------
// Rate limit: count this user's requests in the last hour.
// ---------------------------------------------------------------------------
async function assertUnderRateLimit(supabase, userId) {
  const perHour = Number(process.env.WALLET_REQUESTS_PER_HOUR || DEFAULT_REQUESTS_PER_HOUR);
  const limit = Number.isFinite(perHour) && perHour > 0 ? perHour : DEFAULT_REQUESTS_PER_HOUR;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from(WALLET_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    if (isMissingDbObjectError(error)) {
      const { status, message } = missingSetupError(MISSING_TABLE_MESSAGE);
      throw new HttpError(status, message);
    }
    console.error('wallet: rate-limit query failed:', error.message);
    throw new HttpError(500, 'Could not submit your request right now.');
  }

  if ((count || 0) >= limit) {
    throw new HttpError(
      429,
      `Too many requests. You can submit at most ${limit} wallet requests per hour — please try again later.`
    );
  }
}

// ---------------------------------------------------------------------------
// Validation (server-side; the client's own checks are UX only)
// ---------------------------------------------------------------------------
function validateType(value) {
  if (value !== 'deposit' && value !== 'withdraw') {
    throw new HttpError(400, 'Request type must be "deposit" or "withdraw".');
  }
  return value;
}

function validateAmount(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) {
    throw new HttpError(400, 'Amount is required and must be a number.');
  }
  // Round to paise before comparing so 0.999 cannot slip under the minimum.
  const rounded = Math.round(n * 100) / 100;
  if (rounded < MIN_REQUEST_AMOUNT) {
    throw new HttpError(400, `Amount must be at least ₹${MIN_REQUEST_AMOUNT}.`);
  }
  if (rounded > MAX_REQUEST_AMOUNT) {
    throw new HttpError(400, `Amount must not exceed ₹${MAX_REQUEST_AMOUNT} per request.`);
  }
  return rounded;
}

function validateOptionalText(value, field, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function clampPerPage(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return LIST_LIMIT;
  return Math.min(n, LIST_LIMIT);
}
