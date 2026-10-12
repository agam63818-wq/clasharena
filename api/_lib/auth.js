// api/_lib/auth.js
// Request authentication and admin authorization.
//
// requireUser(req): reads `Authorization: Bearer <token>`, verifies the token
// with supabase.auth.getUser(token) and returns the verified auth user.
// The caller's identity comes ONLY from the token — never from the request
// body (docs/AUDIT.md P0-1, P0-2).
//
// requireAdmin(req): requireUser + role read from the profiles table
// server-side. Hiding a UI button is never authorization (permanent rule 3).

import { HttpError } from './errors.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export async function requireUser(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const [scheme, token] = String(header).split(' ');

  if (!token || scheme !== 'Bearer') {
    throw new HttpError(401, 'Authentication required. Please log in.');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data || !data.user) {
    throw new HttpError(401, 'Your session is invalid or has expired. Please log in again.');
  }

  return data.user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // A missing profile or a DB failure must never look like "not admin by
  // accident vs. by policy" — both are a plain refusal.
  if (error || !data || data.role !== 'admin') {
    throw new HttpError(403, 'Only admins can perform this action.');
  }

  return user;
}
