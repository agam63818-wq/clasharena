// api/_lib/errors.js
// Safe error handling for Vercel API routes.
// Raw database / provider errors must never reach the client (permanent
// rule 1 & docs/AUDIT.md P1-3): handlers throw HttpError with a safe message,
// and sendError() is the single place that writes an error response.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code; // optional machine-readable code (e.g. '23505')
  }
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return res.status(err.status).json(body);
  }
  // Unknown error: log only the message locally, return a generic response.
  console.error('API error:', err && err.message ? err.message : 'unknown error');
  return res.status(500).json({ error: 'Internal server error' });
}
