import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, tournamentId, entryFee, ff_uid, ign } = req.body;

    if (!userId || !tournamentId || !ff_uid || !ign) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // 1. check duplicate join
    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('match_registrations')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingRegistrationError) {
      return res.status(500).json({ error: existingRegistrationError.message });
    }

    if (existingRegistration) {
      return res.status(400).json({ error: 'You already joined this tournament' });
    }

    // 2. get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    // 3. tournament capacity check
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, current_players, max_players')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      return res.status(500).json({ error: tournamentError.message });
    }

    if ((tournament.current_players || 0) >= tournament.max_players) {
      return res.status(400).json({ error: 'Tournament is full' });
    }

    // 4. balance check
    if (profile.balance < entryFee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const newBalance = profile.balance - entryFee;

    // 5. update balance
    const { error: balErr } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (balErr) {
      return res.status(500).json({ error: balErr.message });
    }

    // 6. insert registration
    const { error: regErr } = await supabase
      .from('match_registrations')
      .insert({
        tournament_id: tournamentId,
        user_id: userId,
        ff_uid,
        ign,
        status: 'joined'
      });

    if (regErr) {
      if (regErr.code === '23505') {
        return res.status(409).json({ error: 'Already joined', code: '23505' });
      }
      return res.status(500).json({ error: 'Could not complete registration' });
    }

    // 7. increment player count
    const { error: playerCountErr } = await supabase
      .from('tournaments')
      .update({ current_players: (tournament.current_players || 0) + 1 })
      .eq('id', tournamentId);

    if (playerCountErr) {
      return res.status(500).json({ error: playerCountErr.message });
    }

    // 8. transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'join',
      amount: entryFee,
      status: 'completed'
    });

    // ✅ ALWAYS JSON RESPONSE
    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: 'Server error while joining tournament' });
  }
}
