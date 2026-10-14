// api/admin.js
//
// ONE admin router for every admin write/read that used to run in the browser
// with the anon key (docs/AUDIT.md P1-2, permanent rules 3 & 2). Vercel Hobby
// allows 12 serverless functions per deployment, so all admin actions live
// behind a single route with a `{ action }` envelope:
//
//   POST /api/admin
//   body: { action: 'createTournament',     tournament: {...} }
//         { action: 'updateTournament',     tournament: { id, ...fields } }
//         { action: 'listRegistrations' }
//         { action: 'cancelTournament',     tournamentId, reason? }
//         { action: 'listWalletRequests' }
//         { action: 'approveWalletRequest', requestId, note? }
//         { action: 'rejectWalletRequest',  requestId, note? }
//
// Authorization (on EVERY action, before any DB work):
//   requireAdmin(req) → identifies the caller from the Authorization Bearer
//   token and reads `profiles.role` from the DATABASE with the service role.
//   The browser's `isAdmin` flag is never trusted (hiding a button is not
//   authorization). No token → 401, not an admin → 403.
//
// Validation: server-side only (api/_lib/validate.js) — name length, mode
// allow-list, prize/entry_fee >= 0, max_players > 0 and never below the
// tournament's current_players, valid match_time, and the status transition
// rules. Only known columns are ever written; body fields such as
// current_players are ignored.
//
// MONEY (permanent rule 4): this router never writes a balance itself.
//   - wallet requests are approved/rejected through the DB functions
//     approve_wallet_request()/reject_wallet_request(), which move the balance
//     and the ledger row in ONE transaction. If the function is missing, the
//     caller gets an honest "requires database setup" (503) — never a fake
//     success.
//   - cancelling a tournament that has PAID registrations goes through
//     cancel_tournament_with_refund() (atomic, idempotent, service_role only)
//     and ONLY when ENABLE_TOURNAMENT_CANCELLATION=true. Otherwise the answer
//     is a 409 naming the exact reason and nothing is changed. Refunds are
//     never looped client-side (nor route-side).
//
// AUDIT (api/_lib/audit.js → admin_audit_log, 007): every action is recorded
// best effort. The response carries `auditLogged` so the client can say
// "action done, audit note not stored" instead of inventing one.
//
// Response shapes (kept in the shape the client already consumes):
//   success: { success: true, tournament }                        (create/update/cancel)
//            { success: true, registrations: [] }                 (listRegistrations)
//            { success: true, requests: [] }                       (listWalletRequests)
//            { success: true, walletRequest: {...}, auditLogged }  (approve/reject)
//   failure: { error: string } — safe messages only, never raw DB errors.
// `api/deleteTournament.js` is unchanged and still owns deletion (the UI no
// longer calls it; tournaments are cancelled, not deleted).

import { requireAdmin } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { isMissingDbObjectError, missingSetupError } from './_lib/dbErrors.js';
import { recordAdminAction } from './_lib/audit.js';
import {
  validateTournamentUpdate,
  validateTournamentCreate,
  validateTournamentId,
  assertStatusTransition
} from './_lib/validate.js';

// Bound the registration listing (AUDIT P2-2: unbounded selects).
const REGISTRATION_LIMIT = 500;
// Bound the pending wallet-request queue an admin screen loads at once.
const WALLET_QUEUE_LIMIT = 200;
const MAX_ADMIN_NOTE_LENGTH = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = await requireAdmin(req); // throws 401 (no/invalid token) or 403 (not admin)

    const body = req.body || {};
    const action = body.action;
    const supabase = getSupabaseAdmin();

    switch (action) {
      case 'createTournament':
        return await createTournament(res, supabase, admin, body.tournament);
      case 'updateTournament':
        return await updateTournament(res, supabase, admin, body.tournament);
      case 'listRegistrations':
        return await listRegistrations(res, supabase);
      case 'cancelTournament':
        return await cancelTournament(res, supabase, admin, body);
      case 'listWalletRequests':
        return await listWalletRequests(res, supabase);
      case 'approveWalletRequest':
        return await reviewWalletRequest(res, supabase, admin, body, 'approve');
      case 'rejectWalletRequest':
        return await reviewWalletRequest(res, supabase, admin, body, 'reject');
      default:
        throw new HttpError(400, 'Unknown admin action.');
    }
  } catch (err) {
    return sendError(res, err);
  }
}

async function createTournament(res, supabase, admin, input) {
  const row = validateTournamentCreate(input);

  const { data, error } = await supabase
    .from('tournaments')
    .insert([row])
    .select()
    .single();

  if (error || !data) {
    console.error('admin: tournament insert failed:', error && error.message);
    throw new HttpError(500, 'Could not create the tournament.');
  }

  const auditLogged = await recordAdminAction(supabase, {
    adminId: admin.id,
    action: 'createTournament',
    targetType: 'tournament',
    targetId: data.id,
    details: { name: data.name, mode: data.mode, status: data.status, entry_fee: data.entry_fee }
  });

  return res.status(200).json({ success: true, tournament: data, auditLogged });
}

async function updateTournament(res, supabase, admin, input) {
  const { id, patch } = validateTournamentUpdate(input);

  // current_players and the real current status come from the DATABASE row,
  // never from the request (permanent rule 2).
  const { data: current, error: readError } = await supabase
    .from('tournaments')
    .select('id, status, current_players')
    .eq('id', id)
    .single();

  if (readError || !current) {
    throw new HttpError(404, 'Tournament not found.');
  }

  assertStatusTransition(current.status, patch.status);

  const currentPlayers = Number(current.current_players) || 0;
  if (patch.max_players !== undefined && patch.max_players < currentPlayers) {
    throw new HttpError(
      409,
      `Max players cannot be lower than the ${currentPlayers} player(s) already registered.`
    );
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('admin: tournament update failed:', error.message);
    throw new HttpError(500, 'Could not update the tournament.');
  }
  if (!data) {
    throw new HttpError(404, 'Tournament not found.');
  }

  const auditLogged = await recordAdminAction(supabase, {
    adminId: admin.id,
    action: 'updateTournament',
    targetType: 'tournament',
    targetId: id,
    details: { fields: Object.keys(patch), status: { from: current.status, to: data.status } }
  });

  return res.status(200).json({ success: true, tournament: data, auditLogged });
}

async function listRegistrations(res, supabase) {
  const { data, error } = await supabase
    .from('match_registrations')
    .select('id, tournament_id, ff_uid, ign, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(REGISTRATION_LIMIT);

  if (error) {
    console.error('admin: registrations query failed:', error.message);
    throw new HttpError(500, 'Could not load registered players.');
  }

  return res.status(200).json({ success: true, registrations: data || [] });
}

// ---------------------------------------------------------------------------
// cancelTournament
//
// Two paths, and the honest one is always chosen:
//   1. no PAID registrations (empty tournament, or entry_fee = 0) -> a plain
//      status update to 'cancelled'. No money is involved, so no RPC is
//      needed and the flag is irrelevant.
//   2. PAID registrations exist -> require ENABLE_TOURNAMENT_CANCELLATION=true
//      AND the cancel_tournament_with_refund() function. That function does
//      status + every refund + every ledger row atomically and idempotently.
//      If either piece is missing the answer is 409/503 with the exact reason
//      and NOTHING changes — refunds are never looped from here.
// ---------------------------------------------------------------------------
async function cancelTournament(res, supabase, admin, input) {
  const tournamentId = validateTournamentId(input.tournamentId);
  const reason = validateAdminNote(input.reason);

  // status / entry_fee / current_players come from the DATABASE row.
  const { data: tournament, error: readError } = await supabase
    .from('tournaments')
    .select('id, name, status, entry_fee, current_players')
    .eq('id', tournamentId)
    .single();

  if (readError || !tournament) {
    throw new HttpError(404, 'Tournament not found.');
  }

  if (tournament.status === 'cancelled') {
    throw new HttpError(409, 'This tournament is already cancelled. Nothing was changed.');
  }

  const { count, error: countError } = await supabase
    .from('match_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    console.error('admin: registration count failed:', countError.message);
    throw new HttpError(500, 'Could not cancel the tournament right now.');
  }

  const registrations = Number(count) || 0;
  const entryFee = Number(tournament.entry_fee) || 0;
  const paidRegistrations = entryFee > 0 ? registrations : 0;

  // --- path 1: nothing to refund -------------------------------------------
  if (paidRegistrations === 0) {
    const { data: updated, error: updateError } = await supabase
      .from('tournaments')
      .update({ status: 'cancelled' })
      .eq('id', tournamentId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('admin: tournament cancel failed:', updateError && updateError.message);
      throw new HttpError(500, 'Could not cancel the tournament right now.');
    }

    const auditLogged = await recordAdminAction(supabase, {
      adminId: admin.id,
      action: 'cancelTournament',
      targetType: 'tournament',
      targetId: tournamentId,
      details: { refunded: 0, registrations, entry_fee: entryFee, reason }
    });

    return res.status(200).json({ success: true, tournament: updated, refunded: 0, auditLogged });
  }

  // --- path 2: paid registrations exist ------------------------------------
  if (process.env.ENABLE_TOURNAMENT_CANCELLATION !== 'true') {
    throw new HttpError(
      409,
      `This tournament has ${paidRegistrations} paid registration(s). Refunding them needs the ` +
        'cancellation-with-refunds flag (ENABLE_TOURNAMENT_CANCELLATION=true), which is off on this ' +
        'server. Nothing was changed and no refunds were issued.'
    );
  }

  const { data, error: rpcError } = await supabase.rpc('cancel_tournament_with_refund', {
    p_tournament_id: tournamentId,
    p_admin_id: admin.id,
    p_reason: reason
  });

  if (rpcError) {
    if (isMissingDbObjectError(rpcError)) {
      const { status, message } = missingSetupError('the cancel_tournament_with_refund() function');
      throw new HttpError(
        status,
        `${message} No refunds were issued and the tournament status is unchanged.`
      );
    }
    console.error('admin: cancel rpc failed:', rpcError.message);
    throw new HttpError(500, 'Could not cancel the tournament right now.');
  }

  if (data && data.success) {
    const refunded = Number(data.refunded) || 0;
    const auditLogged = await recordAdminAction(supabase, {
      adminId: admin.id,
      action: 'cancelTournament',
      targetType: 'tournament',
      targetId: tournamentId,
      details: { refunded, entry_fee: entryFee, registrations, reason, already_cancelled: !!data.already_cancelled }
    });

    return res.status(200).json({
      success: true,
      tournament: { id: tournamentId, name: tournament.name, status: 'cancelled' },
      refunded,
      auditLogged
    });
  }

  const message = (data && data.error) || 'Could not cancel the tournament right now.';
  return res.status(rpcMessageStatus(message)).json({ error: message });
}

// ---------------------------------------------------------------------------
// listWalletRequests — the pending queue an admin reviews.
// ---------------------------------------------------------------------------
async function listWalletRequests(res, supabase) {
  assertWalletRequestsEnabled();

  const { data, error } = await supabase
    .from('wallet_requests')
    .select('id, user_id, type, amount, reference, note, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(WALLET_QUEUE_LIMIT);

  if (error) {
    if (isMissingDbObjectError(error)) {
      throw missingSetupHttpError('the wallet_requests table');
    }
    console.error('admin: wallet request list failed:', error.message);
    throw new HttpError(500, 'Could not load wallet requests.');
  }

  const rows = data || [];

  // Usernames are fetched separately instead of through a PostgREST embed, so
  // the queue never depends on a foreign-key relationship existing.
  const usernames = {};
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    if (profileError) {
      // Best effort: the queue is still useful without display names.
      console.warn('admin: wallet request usernames not loaded:', profileError.message);
    } else {
      for (const p of profiles || []) usernames[p.id] = p.username;
    }
  }

  const requests = rows.map((r) => ({ ...r, username: usernames[r.user_id] || null }));
  return res.status(200).json({ success: true, requests });
}

// ---------------------------------------------------------------------------
// approve / reject a wallet request.
//
// The ONLY money path: approve_wallet_request() updates the request status, the
// balance and the ledger row in a single transaction (005). A missing function
// is reported as "requires database setup"; an RPC verdict is passed through
// untouched so the admin sees exactly why nothing happened.
// ---------------------------------------------------------------------------
async function reviewWalletRequest(res, supabase, admin, body, decision) {
  assertWalletRequestsEnabled();

  const requestId = validateRequestId(body.requestId);
  const note = validateAdminNote(body.note);

  const fn = decision === 'approve' ? 'approve_wallet_request' : 'reject_wallet_request';
  const { data, error } = await supabase.rpc(fn, {
    p_request_id: requestId,
    p_admin_id: admin.id,
    p_admin_note: note
  });

  if (error) {
    if (isMissingDbObjectError(error)) {
      throw missingSetupHttpError(`the ${fn}() function`);
    }
    console.error(`admin: ${fn} rpc failed:`, error.message);
    throw new HttpError(500, `Could not ${decision} the request right now.`);
  }

  if (data && data.success) {
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const auditLogged = await recordAdminAction(supabase, {
      adminId: admin.id,
      action: decision === 'approve' ? 'approveWalletRequest' : 'rejectWalletRequest',
      targetType: 'wallet_request',
      targetId: requestId,
      details: { status, note, type: data.type || null, amount: data.amount ?? null }
    });

    return res.status(200).json({
      success: true,
      walletRequest: { id: requestId, status },
      auditLogged
    });
  }

  const message = (data && data.error) || `Could not ${decision} the request right now.`;
  return res.status(rpcMessageStatus(message)).json({ error: message });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function assertWalletRequestsEnabled() {
  if (process.env.ENABLE_WALLET_REQUESTS !== 'true') {
    throw new HttpError(
      503,
      'Wallet requests are not enabled on this server yet. Nothing was changed and no balance was touched.'
    );
  }
}

function missingSetupHttpError(objectDescription) {
  const { status, message } = missingSetupError(objectDescription);
  return new HttpError(status, message);
}

function validateRequestId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid request id.');
  }
  return value;
}

function validateAdminNote(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Note must be text.');
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_ADMIN_NOTE_LENGTH) {
    throw new HttpError(400, `Note must be at most ${MAX_ADMIN_NOTE_LENGTH} characters.`);
  }
  return trimmed;
}

// Verdicts the RPC functions can return -> HTTP status. Unknown verdicts stay
// 500 (they mean "we do not know what happened", never "it worked").
function rpcMessageStatus(message) {
  switch (message) {
    case 'Request not found': return 404;
    case 'Profile not found': return 404;
    case 'Tournament not found': return 404;
    case 'Request already approved': return 409;
    case 'Request already rejected': return 409;
    case 'Request already approved and cannot be rejected': return 409;
    case 'Insufficient balance at approval time': return 409;
    case 'This match is already completed and cannot be cancelled': return 409;
    default: return 500;
  }
}
