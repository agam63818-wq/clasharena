// tests/wallet.test.js
// api/wallet.js — deposit/withdraw REQUESTS. Supabase fully mocked.
//
// Covered: flag/kill-switch degradation, authentication, create (own pending
// row, token identity, body fields ignored), the full validation matrix,
// server-side rate limiting, the user list (own rows only) and the honest
// "requires database setup" path when wallet_requests does not exist.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null }));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => state.client
}));

import walletHandler, { DEFAULT_REQUESTS_PER_HOUR } from '../api/wallet.js';
import {
  createMockClient,
  makeReq,
  makeRes,
  authGetUserFor,
  USER_A,
  USER_B
} from './helpers.js';

function setup(steps, tokens = { 'tok-A': USER_A, 'tok-admin': { id: '33333333-3333-4333-8333-333333333333' } }) {
  const { client, calls } = createMockClient({ steps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const op = (table, kind) => (c) => c.kind === 'db' && c.table === table && c.op === kind;
const countQuery = (table) => (c) =>
  c.kind === 'db' && c.table === table && c.op === 'select' && !c.single && !c.maybeSingle;

const MISSING_TABLE_ERROR = {
  code: 'PGRST205',
  message: "Could not find the table 'public.wallet_requests' in the schema cache"
};

const REQUEST_ROW = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  type: 'deposit',
  amount: 500,
  reference: 'UPI-123',
  note: null,
  status: 'pending',
  created_at: '2026-10-13T09:00:00.000Z'
};

const post = (body, token = 'tok-A') => makeReq({ token, body });

beforeEach(() => {
  process.env.ENABLE_WALLET_REQUESTS = 'true';
  delete process.env.WALLET_REQUESTS_PER_HOUR;
});

afterEach(() => {
  delete process.env.ENABLE_WALLET_REQUESTS;
  delete process.env.WALLET_REQUESTS_PER_HOUR;
});

// --- kill switch -----------------------------------------------------------

describe('POST /api/wallet — ENABLE_WALLET_REQUESTS', () => {
  it.each([['createWalletRequest', { type: 'deposit', amount: 100 }], ['listWalletRequests', {}]])(
    '%s answers 503 with an honest message while the flag is off',
    async (action, extra) => {
      process.env.ENABLE_WALLET_REQUESTS = 'false';
      const calls = setup([]);
      const res = makeRes();
      await walletHandler(post({ action, ...extra }), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/not enabled/i);
      expect(res.body.error).toMatch(/no balance was changed/i);
      expect(calls).toHaveLength(0); // nothing reached the database
    }
  );

  it('405 for non-POST methods', async () => {
    setup([]);
    const res = makeRes();
    await walletHandler(makeReq({ method: 'GET', token: 'tok-A' }), res);
    expect(res.statusCode).toBe(405);
  });
});

// --- authentication --------------------------------------------------------

describe('POST /api/wallet — authentication', () => {
  it('401 without a token', async () => {
    setup([]);
    const res = makeRes();
    await walletHandler(makeReq({ body: { action: 'listWalletRequests' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('401 with an invalid token', async () => {
    setup([]);
    const res = makeRes();
    await walletHandler(post({ action: 'listWalletRequests' }, 'nope'), res);
    expect(res.statusCode).toBe(401);
  });
});

// --- createWalletRequest ---------------------------------------------------

describe('POST /api/wallet — createWalletRequest', () => {
  const createSteps = (overrides = {}) => [
    { match: countQuery('wallet_requests'), value: { count: 0, error: null } },
    {
      match: op('wallet_requests', 'insert'),
      value: { data: { ...REQUEST_ROW, ...overrides }, error: null }
    }
  ];

  it('creates a deposit request as the token subject, always pending', async () => {
    const calls = setup(createSteps());
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 500, reference: 'UPI-123' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.request.status).toBe('pending');

    const insert = calls.find((c) => c.table === 'wallet_requests' && c.op === 'insert');
    expect(insert.payload[0]).toEqual({
      user_id: USER_A.id,
      type: 'deposit',
      amount: 500,
      reference: 'UPI-123',
      note: null,
      status: 'pending'
    });
  });

  it('creates a withdraw request too', async () => {
    const calls = setup(createSteps({ type: 'withdraw' }));
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'withdraw', amount: 250 }), res);

    expect(res.statusCode).toBe(200);
    const insert = calls.find((c) => c.table === 'wallet_requests' && c.op === 'insert');
    expect(insert.payload[0].type).toBe('withdraw');
  });

  it('ignores body userId / status / balance / reviewed_by — a user cannot decide anything', async () => {
    const calls = setup(createSteps());
    const res = makeRes();
    await walletHandler(
      post({
        action: 'createWalletRequest',
        type: 'deposit',
        amount: 100,
        userId: USER_B.id,
        user_id: USER_B.id,
        status: 'approved',
        balance: 999999,
        reviewed_by: USER_A.id,
        reviewed_at: '2026-01-01T00:00:00Z'
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const insert = calls.find((c) => c.table === 'wallet_requests' && c.op === 'insert');
    expect(Object.keys(insert.payload[0]).sort()).toEqual(
      ['amount', 'note', 'reference', 'status', 'type', 'user_id'].sort()
    );
    expect(insert.payload[0].user_id).toBe(USER_A.id);
    expect(insert.payload[0].status).toBe('pending');
    expect(JSON.stringify(calls)).not.toContain(USER_B.id);
  });

  it.each([
    ['missing type', { amount: 100 }, /type/i],
    ['bad type', { type: 'transfer', amount: 100 }, /type/i],
    ['missing amount', { type: 'deposit' }, /amount/i],
    ['zero amount', { type: 'deposit', amount: 0 }, /at least/i],
    ['negative amount', { type: 'deposit', amount: -500 }, /at least/i],
    ['non-numeric amount', { type: 'deposit', amount: 'lots' }, /amount/i],
    ['amount above the cap', { type: 'deposit', amount: 50001 }, /must not exceed/i],
    ['reference too long', { type: 'deposit', amount: 100, reference: 'x'.repeat(65) }, /reference/i],
    ['note too long', { type: 'deposit', amount: 100, note: 'x'.repeat(301) }, /note/i]
  ])('400 for %s', async (_name, body, errMatch) => {
    const calls = setup([]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', ...body }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(errMatch);
    expect(calls).toHaveLength(0);
  });

  it('accepts exactly the maximum amount', async () => {
    const calls = setup(createSteps({ amount: 50000 }));
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 50000 }), res);
    expect(res.statusCode).toBe(200);
    expect(calls.find((c) => c.op === 'insert').payload[0].amount).toBe(50000);
  });

  it('400 for an unknown action', async () => {
    setup([]);
    const res = makeRes();
    await walletHandler(post({ action: 'setMyBalance', amount: 1 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unknown wallet action/i);
  });

  it('503 "requires database setup" when wallet_requests does not exist (insert path)', async () => {
    setup([
      { match: countQuery('wallet_requests'), value: { count: 0, error: null } },
      { match: op('wallet_requests', 'insert'), value: { data: null, error: MISSING_TABLE_ERROR } }
    ]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 100 }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
    expect(res.body.error).toMatch(/wallet_requests/);
    expect(res.body.error).toMatch(/no changes were made/i);
  });

  it('500 with a safe message for a real insert failure', async () => {
    setup([
      { match: countQuery('wallet_requests'), value: { count: 0, error: null } },
      {
        match: op('wallet_requests', 'insert'),
        value: { data: null, error: { code: '23514', message: 'new row violates check constraint "wallet_requests_amount_check"' } }
      }
    ]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 100 }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not submit your request right now.');
    expect(JSON.stringify(res.body)).not.toMatch(/constraint|check/i);
  });
});

// --- rate limiting ---------------------------------------------------------

describe('POST /api/wallet — per-user rate limit', () => {
  it('allows a request when the user is under the limit', async () => {
    const calls = setup([
      { match: countQuery('wallet_requests'), value: { count: DEFAULT_REQUESTS_PER_HOUR - 1, error: null } },
      { match: op('wallet_requests', 'insert'), value: { data: REQUEST_ROW, error: null } }
    ]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 100 }), res);

    expect(res.statusCode).toBe(200);
    // The count was scoped to the caller and to a rolling hour window.
    const count = calls.find((c) => c.kind === 'db' && c.op === 'select');
    expect(count.chain).toContainEqual(['eq', 'user_id', USER_A.id]);
    expect(count.chain.some(([fn]) => fn === 'gte')).toBe(true);
  });

  it('429 when the user has already made the maximum number of requests this hour', async () => {
    const calls = setup([
      { match: countQuery('wallet_requests'), value: { count: DEFAULT_REQUESTS_PER_HOUR, error: null } }
    ]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 100 }), res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
    expect(res.body.error).toMatch(new RegExp(String(DEFAULT_REQUESTS_PER_HOUR)));
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('honours WALLET_REQUESTS_PER_HOUR when set', async () => {
    process.env.WALLET_REQUESTS_PER_HOUR = '2';
    setup([{ match: countQuery('wallet_requests'), value: { count: 2, error: null } }]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'withdraw', amount: 100 }), res);
    expect(res.statusCode).toBe(429);
  });

  it('503 "requires database setup" when the rate-limit count cannot run', async () => {
    setup([{ match: countQuery('wallet_requests'), value: { count: null, error: MISSING_TABLE_ERROR } }]);
    const res = makeRes();
    await walletHandler(post({ action: 'createWalletRequest', type: 'deposit', amount: 100 }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
  });
});

// --- listWalletRequests ----------------------------------------------------

describe('POST /api/wallet — listWalletRequests', () => {
  it('returns only the caller’s own requests, newest first, bounded', async () => {
    const rows = [REQUEST_ROW, { ...REQUEST_ROW, id: 'bbbb', status: 'approved' }];
    const calls = setup([{ match: (c) => c.table === 'wallet_requests', value: { data: rows, error: null } }]);
    const res = makeRes();
    await walletHandler(post({ action: 'listWalletRequests' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.requests).toHaveLength(2);

    const q = calls.find((c) => c.table === 'wallet_requests');
    expect(q.chain).toContainEqual(['eq', 'user_id', USER_A.id]);
    expect(q.chain).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(q.chain.some(([fn]) => fn === 'limit')).toBe(true);
    // no admin-only column in the user's own payload selection
    expect(String(q.chain[0][1])).not.toContain('reviewed_by');
  });

  it('503 "requires database setup" when the table is missing', async () => {
    setup([{ match: (c) => c.table === 'wallet_requests', value: { data: null, error: MISSING_TABLE_ERROR } }]);
    const res = makeRes();
    await walletHandler(post({ action: 'listWalletRequests' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
  });

  it('500 with a safe message when the read fails', async () => {
    setup([
      {
        match: (c) => c.table === 'wallet_requests',
        value: { data: null, error: { code: '42501', message: 'permission denied for table wallet_requests' } }
      }
    ]);
    const res = makeRes();
    await walletHandler(post({ action: 'listWalletRequests' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not load your requests right now.');
  });
});
