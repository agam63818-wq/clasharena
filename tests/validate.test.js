// tests/validate.test.js
// STATUS_TRANSITIONS contract: admins can move a tournament freely among the
// four editable statuses (mistake-fixing), but 'cancelled' is never a
// transition target — it is only written by the Cancel action.

import { describe, it, expect } from 'vitest';
import {
  EDITABLE_STATUSES,
  STATUS_TRANSITIONS,
  isValidStatus,
  canTransition,
  validateStatus,
  validateStatusTransition
} from '../api/_lib/validate.js';
import { HttpError } from '../api/_lib/errors.js';

const EDITABLE = ['registration', 'upcoming', 'live', 'completed'];

describe('STATUS_TRANSITIONS', () => {
  it('contains exactly the four editable statuses as keys', () => {
    expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual([...EDITABLE].sort());
  });

  it('allows ANY change among the editable statuses', () => {
    for (const from of EDITABLE) {
      for (const to of EDITABLE) {
        if (from === to) continue;
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it('never allows a transition to or from cancelled', () => {
    expect(canTransition('registration', 'cancelled')).toBe(false);
    expect(canTransition('live', 'cancelled')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'registration')).toBe(false);
    expect(canTransition('cancelled', 'live')).toBe(false);
    expect(EDITABLE_STATUSES).not.toContain('cancelled');
  });

  it('rejects unknown statuses', () => {
    expect(canTransition('paused', 'live')).toBe(false);
    expect(isValidStatus('paused')).toBe(false);
    expect(isValidStatus('')).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
  });
});

describe('validateStatus', () => {
  it('accepts every editable status', () => {
    for (const s of EDITABLE) {
      expect(validateStatus(s)).toBe(s);
    }
  });

  it('throws 400 for cancelled and garbage', () => {
    expect(() => validateStatus('cancelled')).toThrow(HttpError);
    expect(() => validateStatus('CANCELLED')).toThrow(/Invalid tournament status/);
    expect(() => validateStatus(42)).toThrow(HttpError);
  });
});

describe('validateStatusTransition', () => {
  it('returns the target status on any editable change', () => {
    expect(validateStatusTransition('live', 'registration')).toBe('registration');
    expect(validateStatusTransition('completed', 'upcoming')).toBe('upcoming');
  });

  it('refuses transitions through cancelled', () => {
    // 'cancelled' is not a valid save-time target at all — it is only
    // written by the Cancel action.
    expect(() => validateStatusTransition('live', 'cancelled')).toThrow(HttpError);
    expect(() => validateStatusTransition('live', 'cancelled')).toThrow(/Invalid tournament status|Cannot change status/);
  });

  it('refuses unknown target statuses', () => {
    expect(() => validateStatusTransition('live', 'paused')).toThrow(HttpError);
  });
});
