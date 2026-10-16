// api/profile.js
//
// Narrow, authenticated profile operations that must not be performed with the
// browser's database client. At present this route only records a player's
// mobile number, which is required before joining a tournament.

import { requireUser } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

const INDIAN_MOBILE_RE = /^[6-9][0-9]{9}$/;
const PHONE_IN_USE_MESSAGE = 'This mobile number is already linked to another account.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireUser(req);
    const body = req.body || {};

    if (body.action !== 'updatePhone') {
      throw new HttpError(400, 'Unknown profile action.');
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!INDIAN_MOBILE_RE.test(phone)) {
      throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number.');
    }

    const supabase = getSupabaseAdmin();

    // The same caller may re-submit their own number, but no account may claim
    // a number that is already associated with a different profile.
    const { data: owner, error: ownerError } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .neq('id', user.id)
      .maybeSingle();
    if (ownerError) throw ownerError;
    if (owner) {
      throw new HttpError(409, PHONE_IN_USE_MESSAGE, 'PHONE_IN_USE');
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ phone })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    if (updateError) {
      // A unique index is the final authority if two requests race after the
      // ownership lookup above.
      if (updateError.code === '23505') {
        throw new HttpError(409, PHONE_IN_USE_MESSAGE, 'PHONE_IN_USE');
      }
      throw updateError;
    }
    if (!updated) throw new HttpError(404, 'Profile not found.');

    // Do not echo a phone number or any other profile data into a generic
    // player-facing response.
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
}
