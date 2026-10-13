// tests/transactions.test.js
// src/lib/transactions.js — the INTERIM wallet sign convention (sign from the
// transaction type, not from the stored number) and the pagination helpers.
// src/config/support.js — public support contact (display-only values).

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  txSign,
  txAmount,
  totalPages,
  pageRange,
  TRANSACTIONS_PER_PAGE
} from '../src/lib/transactions.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('txSign — sign from the transaction type', () => {
  it.each([
    ['join', -1],
    ['withdraw', -1],
    ['deposit', 1],
    ['refund', 1],
    ['prize', 1]
  ])('%s is %i', (type, expected) => {
    // Joins are stored POSITIVE by today's writers; the type still decides.
    expect(txSign({ type, amount: 100 })).toBe(expected);
  });

  it('treats a join stored positive as money out (the bug the map fixes)', () => {
    expect(txSign({ type: 'join', amount: 100 })).toBe(-1);
  });

  it('falls back to the sign of the amount for unknown types (future signed rows)', () => {
    expect(txSign({ type: 'adjustment', amount: -250 })).toBe(-1);
    expect(txSign({ type: 'adjustment', amount: 250 })).toBe(1);
  });

  it('returns 0 when there is nothing to show (zero, junk amount, missing row)', () => {
    expect(txSign({ type: 'join', amount: 0 })).toBe(0);
    expect(txSign({ type: 'unknown', amount: 'not-a-number' })).toBe(0);
    expect(txSign(null)).toBe(0);
  });

  it('txAmount always returns a non-negative absolute value', () => {
    expect(txAmount({ amount: -100 })).toBe(100);
    expect(txAmount({ amount: 100 })).toBe(100);
    expect(txAmount({ amount: null })).toBe(0);
  });
});

describe('pagination helpers', () => {
  it('per page defaults to 10', () => {
    expect(TRANSACTIONS_PER_PAGE).toBe(10);
  });

  it.each([
    [0, 1],
    [1, 1],
    [10, 1],
    [11, 2],
    [25, 3],
    [30, 3]
  ])('%i rows -> %i page(s)', (total, expected) => {
    expect(totalPages(total)).toBe(expected);
  });

  it('pageRange maps a 1-based UI page to a 0-based PostgREST range', () => {
    expect(pageRange(0)).toEqual({ from: 0, to: 9 });
    expect(pageRange(1)).toEqual({ from: 10, to: 19 });
    expect(pageRange(2, 5)).toEqual({ from: 10, to: 14 });
  });

  it('pageRange is defensive about bad input', () => {
    expect(pageRange(-3)).toEqual({ from: 0, to: 9 });
    expect(pageRange(undefined)).toEqual({ from: 0, to: 9 });
  });
});

describe('src/config/support.js', () => {
  it('reports no support contact configured by default (never a made-up number)', async () => {
    const { support, supportConfigured } = await import('../src/config/support.js');
    expect(supportConfigured).toBe(false);
    expect(support.whatsapp).toBeNull();
    expect(support.upi).toBeNull();
  });

  it('reads the public VITE_ values when they are set', async () => {
    vi.stubEnv('VITE_SUPPORT_WHATSAPP', ' +91 90000 00000 ');
    vi.stubEnv('VITE_SUPPORT_UPI', 'arena@example');
    const { support, supportConfigured } = await import('../src/config/support.js');
    expect(supportConfigured).toBe(true);
    expect(support.whatsapp).toBe('+91 90000 00000');
    expect(support.upi).toBe('arena@example');
  });

  it('builds a wa.me link from digits only', async () => {
    const { whatsappLink } = await import('../src/config/support.js');
    expect(whatsappLink('+91 90000-00000')).toBe('https://wa.me/919000000000');
    expect(whatsappLink('+91 90000 00000', 'ClashArena')).toBe(
      'https://wa.me/919000000000?text=ClashArena'
    );
    expect(whatsappLink('')).toBeNull();
  });
});
