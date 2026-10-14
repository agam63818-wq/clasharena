// api/deleteTournament.js
//
// SECURITY MODEL (docs/AUDIT.md P0-2; permanent rule 3):
//   - Admin authorization comes from the verified Authorization Bearer token
//     plus a server-side role lookup. `userId` in the request body is IGNORED.
//   - Tournaments that still have registered players are refused with 409:
//     deleting them would silently take players' entry fees. A cancellation
//     flow WITH refunds will be gated behind the
//     ENABLE_TOURNAMENT_CANCELLATION env flag once the DB phase provides the
//     refund mechanics; until then the flag only produces an explicit
//     "not implemented" response — it never deletes.
//
// Response shapes unchanged from the previous version:
//   success: { success: true }   failure: { error: string }

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
    const tournamentId = validateTournamentId(body.tournamentId);

    const supabase = getSupabaseAdmin();

    // Refuse when players are registered — their money is at stake.
    const { count, error: countError } = await supabase
      .from('match_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (countError) {
      console.error('registration count failed:', countError.message);
      throw new HttpError(500, 'Unable to delete tournament right now.');
    }

    if (count > 0) {
      if (process.env.ENABLE_TOURNAMENT_CANCELLATION === 'true') {
        // Flag is on but refunds do not exist yet — be honest, delete nothing.
        throw new HttpError(501, 'Cancellation with refunds is not implemented yet. No players were removed.');
      }
      throw new HttpError(409, 'This tournament has registered players. Deletion is disabled until cancellation with refunds is available.');
    }

    // Empty tournament: same two-step delete as before, but errors are
    // normalized and a missing tournament is reported as 404.
    const { error: regError } = await supabase
      .from('match_registrations')
      .delete()
      .eq('tournament_id', tournamentId)
      .select('id');

    if (regError) {
      console.error('registration delete failed:', regError.message);
      throw new HttpError(500, 'Unable to delete tournament right now.');
    }

    const { data: deletedTournaments, error: tournamentError } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId)
      .select('id');

    if (tournamentError) {
      console.error('tournament delete failed:', tournamentError.message);
      throw new HttpError(500, 'Unable to delete tournament right now.');
    }

    if (!deletedTournaments || deletedTournaments.length === 0) {
      throw new HttpError(404, 'Tournament not found.');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
}
