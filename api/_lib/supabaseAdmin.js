// api/_lib/supabaseAdmin.js
// Server-only Supabase client built from env secrets ONLY (permanent rule 1).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as Vercel server
// environment variables — never prefixed with VITE_.
//
// The client is created lazily (not at module import) so that a missing env
// var produces an honest 503 response instead of a crash at import time
// (permanent rule 7, docs/AUDIT.md P1-1).

import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors.js';

let cachedClient = null;

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new HttpError(503, 'Service temporarily unavailable. Please try again later.');
  }

  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cachedClient;
}
