// api/joinTournament.js
//
// SECURITY MODEL (docs/AUDIT.md P0-1, P0-6; permanent rules 2 & 3):
//   - The caller's identity comes ONLY from the verified Authorization Bearer
//     token. `userId` in the request body is IGNORED.
//   - The entry fee comes ONLY from the tournaments table. `entryFee` in the
//     request body is IGNORED (a negative/zero body value can never change a
//     balance).
//   - Success response shape is unchanged: { success: true } (permanent
//     rule 5). Error responses are { error: string } and, for the duplicate
//     case, { error, code: '23505' } which the client already handles
//     (src/App.jsx join modal).
//
// TWO PATHS:
//   - JOIN_USE_RPC === 'true'  -> atomic DB function join_tournament()
//     (contract in docs/DB_REQUIREMENTS.md §3.1). Preferred.
//     The function is granted to service_role ONLY and identifies the caller
//     through its p_user_id parameter, because this route runs with the
//     service-role key (no JWT -> auth.uid() is NULL). p_user_id is always
//     user.id as VERIFIED from the Bearer token above — never a body field.
//   - otherwise -> LEGACY path: best effort, NOT atomic. It uses an optimistic
//     lock on the balance and a compensating rollback if the registration
//     insert fails, but concurrent requests can still interleave between its
//     steps. This exists only to keep the app working before the DB phase.

import { requireUser } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { validateTournamentId, validateFfUid, validateIgn } from './_lib/validate.js';

const MAX_BALANCE_RETRIES = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireUser(req);

    const body = req.body || {};
    const tournamentId = validateTournamentId(body.tournamentId);
    const ff_uid = validateFfUid(body.ff_uid);
    const ign = validateIgn(body.ign);

    const supabase = getSupabaseAdmin();

    if (process.env.JOIN_USE_RPC === 'true') {
      return await joinViaRpc(res, supabase, user.id, tournamentId, ff_uid, ign);
    }
    return await joinLegacy(res, supabase, user.id, tournamentId, ff_uid, ign);
  } catch (err) {
    return sendError(res, err);
  }
}

// ---------------------------------------------------------------------------
// Atomic path: single DB function does check -> deduct -> insert -> count ->
// ledger. Its JSON contract (docs/DB_REQUIREMENTS.md §3.1):
//   { success: true } | { error: string, code?: '23505' }
//
// userId is the VERIFIED token subject (requireUser → auth.getUser(token)).
// p_user_id is the only identity channel: the service-role client has no JWT,
// so the function cannot and must not use auth.uid().
// ---------------------------------------------------------------------------
async function joinViaRpc(res, supabase, userId, tournamentId, ff_uid, ign) {
  const { data, error } = await supabase.rpc('join_tournament', {
    p_user_id: userId,
    p_tournament_id: tournamentId,
    p_ff_uid: ff_uid,
    p_ign: ign
  });

  if (error) {
    // RPC/transport failure — never leak the raw DB error to the client.
    console.error('join_tournament rpc failed:', error.message);
    throw new HttpError(500, 'Unable to join match right now.');
  }

  if (data && data.success) {
    return res.status(200).json({ success: true });
  }

  const message = (data && data.error) || 'Unable to join match right now.';
  return res.status(rpcErrorStatus(message)).json(
    data && data.code === '23505' ? { error: message, code: '23505' } : { error: message }
  );
}

function rpcErrorStatus(message) {
  switch (message) {
    case 'Missing data': return 400;
    case 'Tournament is full': return 400;
    case 'Insufficient balance': return 400;
    case 'You already joined this tournament': return 409;
    case 'Already joined': return 409;
    case 'This match has been cancelled': return 409;
    case 'This match has already ended': return 409;
    case 'Tournament not found': return 404;
    case 'Profile not found': return 404;
    case 'Not authenticated': return 401;
    default: return 500;
  }
}

// ---------------------------------------------------------------------------
// LEGACY path — best effort, NOT atomic (documented limitation).
// Steps that can still interleave under concurrency: capacity check, balance
// read, balance write. The optimistic lock + compensating rollback below
// reduce the damage windows but do not eliminate them; JOIN_USE_RPC='true'
// with the 003 migration is the real fix.
// ---------------------------------------------------------------------------
async function joinLegacy(res, supabase, userId, tournamentId, ff_uid, ign) {
  // 1. Tournament: fee, status and capacity come from the SERVER row.
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, entry_fee, status, max_players, current_players')
    .eq('id', tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new HttpError(404, 'Tournament not found.');
  }

  const entryFee = Number(tournament.entry_fee) || 0;
  if (entryFee < 0) {
    // Defensive: a bad row must never credit a wallet via the join path.
    throw new HttpError(500, 'Unable to join match right now.');
  }

  // Minimal status guard (behavior change kept as small as possible):
  // only closed matches are rejected; 'live'/'upcoming' keep joining as
  // before so existing flows are not broken (permanent rule 5).
  // A cancelled match is void — nothing may be deducted for it.
  if (tournament.status === 'cancelled') {
    throw new HttpError(409, 'This match has been cancelled. You have not been charged.');
  }
  if (tournament.status === 'completed') {
    throw new HttpError(409, 'This match has already ended.');
  }

  if ((tournament.current_players || 0) >= tournament.max_players) {
    throw new HttpError(400, 'Tournament is full');
  }

  // 2. Duplicate check for a clean message; the unique index remains the
  //    backstop (handled at the insert below).
  const { data: existing } = await supabase
    .from('match_registrations')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'Already joined', code: '23505' });
  }

  // 3. Optimistic-lock balance deduction: the write only lands if the balance
  //    is still exactly the value we read. On conflict, re-read and retry.
  let deducted = false;
  for (let attempt = 0; attempt < MAX_BALANCE_RETRIES; attempt++) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new HttpError(404, 'Profile not found.');
    }

    const oldBalance = Number(profile.balance);
    if (oldBalance < entryFee) {
      throw new HttpError(400, 'Insufficient balance');
    }

    const newBalance = oldBalance - entryFee;
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId)
      .eq('balance', oldBalance) // optimistic lock: fails if balance changed
      .select('id');

    if (updateError) {
      throw new HttpError(500, 'Unable to join match right now.');
    }
    if (Array.isArray(updated) && updated.length > 0) {
      deducted = true;
      break;
    }
    // 0 rows -> someone else changed the balance between read and write.
  }

  if (!deducted) {
    throw new HttpError(409, 'Your balance changed while joining. Please try again.');
  }

  // 4. Registration insert; on ANY failure, compensate the deduction first.
  const { error: regError } = await supabase
    .from('match_registrations')
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      ff_uid,
      ign,
      status: 'joined'
    });

  if (regError) {
    await refundBalance(supabase, userId, entryFee);

    if (regError.code === '23505') {
      return res.status(409).json({ error: 'Already joined', code: '23505' });
    }
    console.error('registration insert failed:', regError.message);
    throw new HttpError(500, 'Could not complete registration.');
  }

  // 5. Derive current_players from an actual count (best effort — a failure
  //    here must NOT fail the join: the user is already registered and
  //    charged, so we log and continue).
  const { count, error: countError } = await supabase
    .from('match_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if (countError) {
    console.error('player count query failed:', countError.message);
  } else {
    const { error: playerCountErr } = await supabase
      .from('tournaments')
      .update({ current_players: count || 0 })
      .eq('id', tournamentId);
    if (playerCountErr) {
      console.error('player count update failed:', playerCountErr.message);
    }
  }

  // 6. Ledger entry (best effort in the legacy path — logged, never blocks
  //    the completed join; the RPC path handles this atomically).
  const { error: txError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'join',
    amount: entryFee,
    status: 'completed'
  });
  if (txError) {
    console.error('transaction insert failed:', txError.message);
  }

  return res.status(200).json({ success: true });
}

// Compensating rollback for the legacy path. Best effort: re-read the
// balance and write it back with the fee added. If even this fails, the
// discrepancy is logged for manual reconciliation — we never leave the
// request silently.
async function refundBalance(supabase, userId, entryFee) {
  try {
    const { data: profile, error: readError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (readError || !profile) {
      console.error(`REFUND FAILED for user ${userId}: could not read balance`);
      return;
    }

    const refunded = Number(profile.balance) + entryFee;
    const { error: refundError } = await supabase
      .from('profiles')
      .update({ balance: refunded })
      .eq('id', userId)
      .eq('balance', Number(profile.balance));

    if (refundError) {
      console.error(`REFUND FAILED for user ${userId}:`, refundError.message);
    }
  } catch (e) {
    console.error(`REFUND FAILED for user ${userId}:`, e && e.message);
  }
}
