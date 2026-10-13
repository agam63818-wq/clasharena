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

// ---------------------------------------------------------------------------
// Tournament payload validation (used by api/admin.js)
//
// Everything an admin form submits is untrusted input (permanent rule 2), and
// only the fields in TOURNAMENT_COLUMNS below are ever written to the
// database — a client-supplied current_players, balance or anything else in
// the body is dropped, never spread into the write (AUDIT P2-1).
// ---------------------------------------------------------------------------

export const TOURNAMENT_MODES = ['Solo', 'Duo', 'Squad', '1v1'];
export const TOURNAMENT_STATUSES = ['registration', 'upcoming', 'live', 'completed'];

// Money cap (₹1 crore) — sanity bound, well above any real prize.
const MAX_MONEY = 10000000;
const MAX_PLAYERS = 10000;
// ISO-ish timestamp; a missing timezone designator is interpreted as UTC so the
// stored value can never depend on the server's local timezone.
const MATCH_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

function toMoney(value, field) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new HttpError(400, `${field} is required.`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) {
    throw new HttpError(400, `${field} must be a number between 0 and ${MAX_MONEY}.`);
  }
  return Math.round(n * 100) / 100;
}

function toPositiveInt(value, field) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new HttpError(400, `${field} is required.`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > MAX_PLAYERS) {
    throw new HttpError(400, `${field} must be a whole number between 1 and ${MAX_PLAYERS}.`);
  }
  return n;
}

function toOptionalText(value, field, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function toOptionalUrl(value, field) {
  const text = toOptionalText(value, field, 500);
  if (text === null) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new HttpError(400, `${field} must be a valid http(s) URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, `${field} must be a valid http(s) URL.`);
  }
  return text;
}

function toMatchTime(value) {
  if (typeof value !== 'string' || !MATCH_TIME_RE.test(value.trim())) {
    throw new HttpError(400, 'Match time must be a valid date and time.');
  }
  const raw = value.trim();
  const withZone = /(Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(withZone);
  if (!Number.isFinite(ms)) {
    throw new HttpError(400, 'Match time must be a valid date and time.');
  }
  const year = new Date(ms).getUTCFullYear();
  if (year < 2000 || year > 2100) {
    throw new HttpError(400, 'Match time must be a valid date and time.');
  }
  return new Date(ms).toISOString();
}

function toMode(value) {
  if (typeof value !== 'string' || !TOURNAMENT_MODES.includes(value)) {
    throw new HttpError(400, `Mode must be one of: ${TOURNAMENT_MODES.join(', ')}.`);
  }
  return value;
}

function toStatus(value) {
  if (value === 'cancelled') {
    throw new HttpError(400, 'Tournament cancellation is not implemented yet — no status was changed.');
  }
  if (typeof value !== 'string' || !TOURNAMENT_STATUSES.includes(value)) {
    throw new HttpError(400, `Status must be one of: ${TOURNAMENT_STATUSES.join(', ')}.`);
  }
  return value;
}

// Field -> validator. Boolean `required` fields must be present.
const TOURNAMENT_COLUMNS = {
  name: { validate: (v) => validateStringField(v, { field: 'Tournament name', min: 3, max: 80 }), required: true },
  mode: { validate: toMode, default: 'Solo' },
  status: { validate: toStatus, default: 'registration' },
  prize: { validate: (v) => toMoney(v, 'Prize'), default: 0 },
  entry_fee: { validate: (v) => toMoney(v, 'Entry fee'), default: 0 },
  max_players: { validate: (v) => toPositiveInt(v, 'Max players'), default: 100 },
  match_time: { validate: toMatchTime, required: true },
  room_id: { validate: (v) => toOptionalText(v, 'Room ID', 64), default: null },
  room_password: { validate: (v) => toOptionalText(v, 'Room password', 64), default: null },
  image_url: { validate: (v) => toOptionalUrl(v, 'Banner image URL'), default: null },
  rules: { validate: (v) => toOptionalText(v, 'Rules', 2000), default: null }
};

// Allowed status progression. Same-status updates are always allowed (an admin
// editing the name of a completed match must not be blocked). 'cancelled' is
// not a target: the cancellation-with-refunds flow does not exist yet.
const STATUS_TRANSITIONS = {
  registration: ['registration', 'upcoming', 'live'],
  upcoming: ['upcoming', 'live'],
  live: ['live', 'completed'],
  completed: ['completed']
};

export function assertStatusTransition(currentStatus, nextStatus) {
  if (nextStatus === undefined || nextStatus === null) return;
  if (nextStatus === currentStatus) return;
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new HttpError(409, `This match is "${currentStatus}" and its status cannot be changed.`);
  }
  if (!allowed.includes(nextStatus)) {
    throw new HttpError(409, `Status cannot change from "${currentStatus}" to "${nextStatus}".`);
  }
}

// Build the DB row for a NEW tournament. Unknown body keys are ignored.
export function validateTournamentCreate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Invalid tournament details.');
  }
  const row = {};
  for (const [column, spec] of Object.entries(TOURNAMENT_COLUMNS)) {
    const value = input[column];
    if (value === undefined || value === null || value === '') {
      if (spec.required) spec.validate(value); // throws with the right message
      row[column] = spec.default !== undefined ? spec.default : null;
      continue;
    }
    row[column] = spec.validate(value);
  }
  return row;
}

// Build the patch for an EXISTING tournament: only the keys actually supplied
// are written, so a partial update never blanks out unrelated columns.
export function validateTournamentUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Invalid tournament details.');
  }
  const id = validateTournamentId(input.id);
  const patch = {};
  for (const [column, spec] of Object.entries(TOURNAMENT_COLUMNS)) {
    if (!(column in input)) continue;
    const value = input[column];
    if (value === undefined || value === null || value === '') {
      if (spec.required) spec.validate(value); // throws with the right message
      patch[column] = spec.default !== undefined ? spec.default : null;
      continue;
    }
    patch[column] = spec.validate(value);
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'No valid fields were supplied to update.');
  }
  return { id, patch };
}
