// Tournament ids are bigint identity values in the live database (not uuids).
// Regression test: the API used to demand a UUID, so joining a match and editing it
// from the admin panel both failed with "Invalid tournament.".
import { describe, it, expect } from 'vitest';
import { validateTournamentId } from '../api/_lib/validate.js';
import { HttpError } from '../api/_lib/errors.js';

describe('validateTournamentId (bigint ids)', () => {
  it('accepts a positive integer number and returns a Number', () => {
    expect(validateTournamentId(10)).toBe(10);
    expect(validateTournamentId(9)).toBe(9);
  });

  it('accepts a digits-only string (PostgREST/JSON round trips) and returns a Number', () => {
    expect(validateTournamentId('10')).toBe(10);
    expect(validateTournamentId('123456789')).toBe(123456789);
  });

  it.each([
    ['zero', 0],
    ['zero string', '0'],
    ['negative', -5],
    ['negative string', '-5'],
    ['leading zeros', '007'],
    ['float', 1.5],
    ['float string', '1.5'],
    ['exponent', '1e3'],
    ['letters', '12abc'],
    ['whitespace', ' 10 '],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
    ['object', { id: 1 }],
    ['array', [1]],
    ['uuid', '44444444-4444-4444-8444-444444444444'],
    ['too long', '1234567890123456'],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 2]
  ])('rejects %s with 400 "Invalid tournament."', (_name, value) => {
    let error;
    try {
      validateTournamentId(value);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status ?? error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid tournament.');
  });
});
