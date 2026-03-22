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

    if (!userId || !tournamentId) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // 1. get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    // 2. balance check
    if (profile.balance < entryFee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const newBalance = profile.balance - entryFee;

    // 3. update balance
    const { error: balErr } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (balErr) {
      return res.status(500).json({ error: balErr.message });
    }

    // 4. insert registration
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
      return res.status(500).json({ error: regErr.message });
    }

    // 5. transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'join',
      amount: entryFee,
      status: 'completed'
    });

    // ✅ ALWAYS JSON RESPONSE
    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
