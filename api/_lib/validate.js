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

// --- tournament status -----------------------------------------------------
//
// Admins must be able to fix mistakes, so the editable statuses form a fully
// connected graph: any change among registration/upcoming/live/completed is
// allowed. 'cancelled' is deliberately NOT a transition target — a tournament
// only becomes cancelled through the explicit Cancel action (which may carry
// refund mechanics later), never by silently saving a different status.

export const EDITABLE_STATUSES = ['registration', 'upcoming', 'live', 'completed'];

export const STATUS_TRANSITIONS = EDITABLE_STATUSES.reduce((map, from) => {
  map[from] = EDITABLE_STATUSES.filter((to) => to !== from);
  return map;
}, {});

export function isValidStatus(value) {
  return typeof value === 'string' && STATUS_TRANSITIONS[value] !== undefined;
}

export function canTransition(from, to) {
  return isValidStatus(from) && isValidStatus(to) && STATUS_TRANSITIONS[from].includes(to);
}

export function validateStatus(value) {
  if (!isValidStatus(value)) {
    throw new HttpError(400, 'Invalid tournament status.');
  }
  return value;
}

export function validateStatusTransition(from, to) {
  validateStatus(to);
  if (!canTransition(from, to)) {
    throw new HttpError(400, `Cannot change status from "${from}" to "${to}".`);
  }
  return to;
}
