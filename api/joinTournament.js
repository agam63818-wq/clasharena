import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, tournamentId, entryFee, ff_uid, ign } = req.body;
    const safeFfUid = String(ff_uid || '').trim();
    const safeIgn = String(ign || '').trim();

    if (!userId || !tournamentId || !safeFfUid || !safeIgn) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('match_registrations')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingRegistrationError) return res.status(500).json({ error: existingRegistrationError.message });
    if (existingRegistration) return res.status(409).json({ error: 'You already joined this tournament', code: '23505' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, balance')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) return res.status(500).json({ error: profileError.message });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Complete your profile first.' });

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('id, current_players, max_players')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) return res.status(500).json({ error: tournamentError.message });
    if ((tournament.current_players || 0) >= tournament.max_players) return res.status(400).json({ error: 'Tournament is full' });
    if (profile.balance < entryFee) return res.status(400).json({ error: 'Insufficient balance' });

    const { error: balErr } = await supabase.from('profiles').update({ balance: profile.balance - entryFee, ff_uid: safeFfUid, ign: safeIgn }).eq('id', userId);
    if (balErr) return res.status(500).json({ error: balErr.message });

    const { error: regErr } = await supabase.from('match_registrations').insert({
      tournament_id: tournamentId,
      user_id: userId,
      ff_uid: safeFfUid,
      ign: safeIgn,
      status: 'joined'
    });

    if (regErr) {
      if (regErr.code === '23505') return res.status(409).json({ error: 'Already joined', code: '23505' });
      return res.status(500).json({ error: 'Could not complete registration' });
    }

    const { count } = await supabase
      .from('match_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    await supabase.from('tournaments').update({ current_players: count || 0 }).eq('id', tournamentId);
    await supabase.from('transactions').insert({ user_id: userId, type: 'join', amount: entryFee, status: 'completed' });

    return res.status(200).json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Server error while joining tournament' });
  }
}
