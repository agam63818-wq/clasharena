// api/admin.js
//
// Admin-only tournament actions, dispatched on `action` in the POST body:
//   getTournament    — returns the FULL tournament row, including
//                      room_id/room_password. Needed because when
//                      VITE_FEATURE_ROOM_RPC is on, list queries never fetch
//                      the room columns (docs/AUDIT.md P0-3), so an edit form
//                      populated from a list row would wipe the credentials
//                      on save. Only admins may read room credentials.
//   cancelTournament — sets status='cancelled'. The only path to 'cancelled':
//                      STATUS_TRANSITIONS (api/_lib/validate.js) never allows
//                      it as a save-time transition target. No refunds exist
//                      yet (ENABLE_TOURNAMENT_CANCELLATION stays a delete-side
//                      flag) — this only marks the tournament cancelled.
//
// SECURITY MODEL (permanent rule 3): admin authorization comes from the
// verified Bearer token plus a server-side role lookup. `userId` in the body
// is IGNORED. Every action validates ids server-side (permanent rule 2).

import { requireAdmin } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { validateTournamentId } from './_lib/validate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req); // throws 401 (no/invalid token) or 403 (not admin)

    const body = req.body || {};
    const action = body.action;

    switch (action) {
      case 'getTournament':
        return await getTournament(req, res, body);
      case 'cancelTournament':
        return await cancelTournament(req, res, body);
      default:
        throw new HttpError(400, 'Unknown admin action.');
    }
  } catch (err) {
    return sendError(res, err);
  }
}

async function getTournament(req, res, body) {
  const tournamentId = validateTournamentId(body.tournamentId);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (error) {
    console.error('admin getTournament failed:', error.message);
    throw new HttpError(404, 'Tournament not found.');
  }

  return res.status(200).json({ tournament: data });
}

async function cancelTournament(req, res, body) {
  const tournamentId = validateTournamentId(body.tournamentId);
  const supabase = getSupabaseAdmin();

  // Current status comes from the SERVER row, never the request body.
  const { data: current, error: fetchError } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();

  if (fetchError || !current) {
    console.error('admin cancelTournament fetch failed:', fetchError?.message);
    throw new HttpError(404, 'Tournament not found.');
  }

  if (current.status === 'cancelled') {
    throw new HttpError(409, 'This tournament is already cancelled.');
  }
  if (current.status === 'completed') {
    throw new HttpError(409, 'A completed tournament cannot be cancelled.');
  }

  // to='cancelled' is intentionally outside STATUS_TRANSITIONS — the Cancel
  // action is the only writer of that status, so it does not go through the
  // editable-status transition validator. Registered players are NOT touched:
  // refunds do not exist yet, and inventing them would break permanent rule 4.
  const { error: updateError } = await supabase
    .from('tournaments')
    .update({ status: 'cancelled' })
    .eq('id', tournamentId);

  if (updateError) {
    console.error('admin cancelTournament update failed:', updateError.message);
    throw new HttpError(500, 'Unable to cancel the tournament right now.');
  }

  return res.status(200).json({ success: true, status: 'cancelled' });
}
