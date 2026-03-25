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
    const { tournamentId, userId } = req.body;
    if (!tournamentId || !userId) {
      return res.status(400).json({ error: 'Missing tournamentId or userId' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }
    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete tournaments' });
    }

    const { error: regError } = await supabase
      .from('match_registrations')
      .delete()
      .eq('tournament_id', tournamentId);

    if (regError) {
      return res.status(500).json({ error: regError.message });
    }

    const { error: tournamentError } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);

    if (tournamentError) {
      return res.status(500).json({ error: tournamentError.message });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
