// api/_lib/dbErrors.js
// Detects "the database object for this feature was never created" versus
// "something went wrong". The first case must produce an honest
// "requires database setup" answer (permanent rule 7) — never a fake success
// and never a raw PostgREST error.
//
// PostgREST / Postgres signals we treat as a missing object:
//   42P01  undefined_table
//   42883  undefined_function
//   PGRST202  "Could not find the function public.x(...) in the schema cache"
//   PGRST205  "Could not find the table 'public.x' in the schema cache"

const MISSING_OBJECT_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

const MISSING_OBJECT_HINTS =
  /(does not exist|could not find the (table|function)|no such (table|function)|schema cache)/i;

export function isMissingDbObjectError(error) {
  if (!error) return false;
  if (error.code && MISSING_OBJECT_CODES.has(String(error.code))) return true;
  return MISSING_OBJECT_HINTS.test(String(error.message || ''));
}

// The one message every "the DB is not set up yet" response uses. It names the
// missing object so an operator can act, and it says explicitly that nothing
// happened — money and statuses are untouched.
export function missingSetupError(objectDescription) {
  return {
    status: 503,
    message:
      `This feature requires database setup: ${objectDescription} is not installed. ` +
      'No changes were made.'
  };
}
