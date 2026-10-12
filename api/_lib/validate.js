// api/_lib/validate.js
// Input validation for API routes. Every client-supplied value is untrusted
// (permanent rule 2). All failures throw HttpError(400) with a safe message.

import { HttpError } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Free Fire UIDs are numeric; 5–20 digits covers legacy through newest.
const FF_UID_RE = /^[0-9]{5,20}$/;
// IGN: letters, digits, space, underscore, dash, dot, apostrophe. 2–32 chars.
const IGN_RE = /^[A-Za-z0-9 _.\-']{2,32}$/;

export function validateTournamentId(value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'Invalid tournament.');
  }
  return value;
}

export function validateFfUid(value) {
  if (typeof value !== 'string' || !FF_UID_RE.test(value)) {
    throw new HttpError(400, 'Free Fire UID must be 5-20 digits.');
  }
  return value;
}

export function validateIgn(value) {
  if (typeof value !== 'string' || !IGN_RE.test(value)) {
    throw new HttpError(400, 'In-game name must be 2-32 letters, numbers, spaces or . - _ \' characters.');
  }
  return value;
}

export function validateStringField(value, { field, min, max }) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, `${field} must be ${min}-${max} characters.`);
  }
  return trimmed;
}
