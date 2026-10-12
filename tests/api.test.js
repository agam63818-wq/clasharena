// tests/api.test.js
// API route tests with the Supabase client fully mocked (no network, no DB).
// Run: npm test

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null }));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => state.client
}));

import joinHandler from '../api/joinTournament.js';
import deleteHandler from '../api/deleteTournament.js';
import {
  createMockClient,
  makeReq,
  makeRes,
  authGetUserFor,
  USER_A,
  USER_B,
  ADMIN,
  TOURNAMENT_ID
} from './helpers.js';

// --- helpers ---------------------------------------------------------------

function setup(steps, tokens = { 'tok-A': USER_A, 'tok-admin': ADMIN }) {
  const { client, calls } = createMockClient({ steps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const selectSingle = (table) => (c) => c.kind === 'db' && c.table === table && c.op === 'select' && !!c.single;
const selectMaybe = (table) => (c) => c.kind === 'db' && c.table === table && c.op === 'select' && !!c.maybeSingle;
const op = (table, kind) => (c) => c.kind === 'db' && c.table === table && c.op === kind;
const countQuery = (table) => (c) =>
  c.kind === 'db' && c.table === table && c.op === 'select' && !c.single && !c.maybeSingle;

const TOURNAMENT_ROW = {
  id: TOURNAMENT_ID,
  entry_fee: 100,
  status: 'registration',
  max_players: 100,
  current_players: 3
};

function legacyHappySteps({ balance = 500, insertError = null } = {}) {
  return [
    { match: selectSingle('tournaments'), value: { data: TOURNAMENT_ROW, error: null } },
    { match: selectMaybe('match_registrations'), value: { data: null, error: null } },
    { match: selectSingle('profiles'), value: { data: { balance }, error: null } },
    { match: op('profiles', 'update'), value: { data: [{ id: USER_A.id }], error: null } },
    { match: op('match_registrations', 'insert'), value: { error: insertError } },
    { match: countQuery('match_registrations'), value: { count: 4, error: null } },
    { match: op('tournaments', 'update'), value: { error: null } },
    { match: op('transactions', 'insert'), value: { error: null } }
  ];
}

const joinBody = (extra = {}) => ({
  tournamentId: TOURNAMENT_ID,
  ff_uid: '123456789',
  ign: 'TestPlayer',
  ...extra
});

beforeEach(() => {
  delete process.env.JOIN_USE_RPC;
  delete process.env.ENABLE_TOURNAMENT_CANCELLATION;
});

afterEach(() => {
  delete process.env.JOIN_USE_RPC;
  delete process.env.ENABLE_TOURNAMENT_CANCELLATION;
});

// --- joinTournament: auth --------------------------------------------------

describe('POST /api/joinTournament — authentication', () => {
  it('401 when no Authorization header is sent', async () => {
    setup(legacyHappySteps());
    const res = makeRes();
    await joinHandler(makeReq({ body: joinBody() }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it('401 on an invalid token', async () => {
    setup(legacyHappySteps());
    const res = makeRes();
    await joinHandler(makeReq({ token: 'bad-token', body: joinBody() }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/session is invalid/i);
  });
});

// --- joinTournament: identity / fee trust ----------------------------------

describe('POST /api/joinTournament — server-derived identity and fee', () => {
  it('ignores body userId: user A acting as user B joins as A, never touching B', async () => {
    const calls = setup(legacyHappySteps());
    const res = makeRes();
    await joinHandler(
      makeReq({ token: 'tok-A', body: joinBody({ userId: USER_B.id }) }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    const insert = calls.find((c) => c.table === 'match_registrations' && c.op === 'insert');

    // balance write and registration both belong to the token's user (A)
    expect(update.chain).toContainEqual(['eq', 'id', USER_A.id]);
    expect(insert.payload.user_id).toBe(USER_A.id);
    expect(JSON.stringify(calls)).not.toContain(USER_B.id);
  });

  it('ignores a negative entryFee in the body; charges the tournament fee', async () => {
    const calls = setup(legacyHappySteps());
    const res = makeRes();
    await joinHandler(
      makeReq({ token: 'tok-A', body: joinBody({ entryFee: -50000 }) }),
      res
    );

    expect(res.statusCode).toBe(200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    expect(update.payload.balance).toBe(400); // 500 - 100 (server fee), not 50100
  });

  it('ignores a zero entryFee in the body as well', async () => {
    const calls = setup(legacyHappySteps());
    const res = makeRes();
    await joinHandler(
      makeReq({ token: 'tok-A', body: joinBody({ entryFee: 0 }) }),
      res
    );

    expect(res.statusCode).toBe(200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    expect(update.payload.balance).toBe(400);
  });
});

// --- joinTournament: business rules ----------------------------------------

describe('POST /api/joinTournament — business rules (legacy path)', () => {
  it('400 when the tournament is full', async () => {
    setup([
      {
        match: selectSingle('tournaments'),
        value: { data: { ...TOURNAMENT_ROW, current_players: 100, max_players: 100 }, error: null }
      }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/full/i);
  });

  it('400 on insufficient balance', async () => {
    setup([
      { match: selectSingle('tournaments'), value: { data: TOURNAMENT_ROW, error: null } },
      { match: selectMaybe('match_registrations'), value: { data: null, error: null } },
      { match: selectSingle('profiles'), value: { data: { balance: 50 }, error: null } }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/insufficient balance/i);
  });

  it('409 with code 23505 on duplicate join (pre-check)', async () => {
    setup([
      { match: selectSingle('tournaments'), value: { data: TOURNAMENT_ROW, error: null } },
      {
        match: selectMaybe('match_registrations'),
        value: { data: { id: 'existing' }, error: null }
      }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('23505');
  });

  it('refunds the balance and returns 409/23505 when the insert hits the unique index', async () => {
    const calls = setup([
      { match: selectSingle('tournaments'), value: { data: TOURNAMENT_ROW, error: null } },
      { match: selectMaybe('match_registrations'), value: { data: null, error: null } },
      { match: selectSingle('profiles'), value: { data: { balance: 500 }, error: null } },
      { match: op('profiles', 'update'), value: { data: [{ id: USER_A.id }], error: null } },
      {
        match: op('match_registrations', 'insert'),
        value: { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
      },
      // compensating rollback: fresh balance read (400) + write back to 500
      { match: selectSingle('profiles'), value: { data: { balance: 400 }, error: null } },
      { match: op('profiles', 'update'), value: { data: [{ id: USER_A.id }], error: null } }
    ]);

    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('23505');

    const updates = calls.filter((c) => c.table === 'profiles' && c.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].payload.balance).toBe(400); // deduction
    expect(updates[1].payload.balance).toBe(500); // refund restored original
  });

  it('409 when the match has already ended (status from the server row)', async () => {
    setup([
      {
        match: selectSingle('tournaments'),
        value: { data: { ...TOURNAMENT_ROW, status: 'completed' }, error: null }
      }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/ended/i);
  });

  it('404 when the tournament does not exist', async () => {
    setup([
      { match: selectSingle('tournaments'), value: { data: null, error: { message: 'row not found' } } }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(404);
  });
});

// --- joinTournament: validation --------------------------------------------

describe('POST /api/joinTournament — input validation', () => {
  it.each([
    ['bad tournamentId', joinBody({ tournamentId: 'not-a-uuid' }), /invalid tournament/i],
    ['bad ff_uid', joinBody({ ff_uid: 'abc' }), /5-20 digits/i],
    ['long ff_uid', joinBody({ ff_uid: '1'.repeat(21) }), /5-20 digits/i],
    ['short ign', joinBody({ ign: 'a' }), /2-32/i],
    ['ign with bad chars', joinBody({ ign: '<script>' }), /2-32/i],
    ['missing fields', { tournamentId: TOURNAMENT_ID }, /5-20 digits/i]
  ])('400 for %s', async (_name, body, errMatch) => {
    setup([]); // no DB steps needed — validation fails before any query
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(errMatch);
  });

  it('405 for non-POST methods', async () => {
    setup([]);
    const res = makeRes();
    await joinHandler(makeReq({ method: 'GET', token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(405);
  });
});

// --- joinTournament: RPC path ----------------------------------------------

describe('POST /api/joinTournament — JOIN_USE_RPC=true', () => {
  beforeEach(() => {
    process.env.JOIN_USE_RPC = 'true';
  });

  it('200 via the atomic RPC on success', async () => {
    const calls = setup([{ match: (c) => c.kind === 'rpc', value: { success: true } }]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(calls[0].fn).toBe('join_tournament');
    expect(calls[0].args).toEqual({
      p_tournament_id: TOURNAMENT_ID,
      p_ff_uid: '123456789',
      p_ign: 'TestPlayer'
    });
  });

  it.each([
    ['Tournament is full', 400],
    ['Insufficient balance', 400],
    ['You already joined this tournament', 409],
    ['Tournament not found', 404]
  ])('maps RPC error "%s" to HTTP %i', async (message, status) => {
    setup([{ match: (c) => c.kind === 'rpc', value: { error: message } }]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toBe(message);
  });

  it('passes through code 23505 from the RPC for the client branch', async () => {
    setup([
      { match: (c) => c.kind === 'rpc', value: { error: 'Already joined', code: '23505' } }
    ]);
    const res = makeRes();
    await joinHandler(makeReq({ token: 'tok-A', body: joinBody() }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('23505');
  });
});

// --- deleteTournament --------------------------------------------------------

describe('POST /api/deleteTournament', () => {
  it('401 with no token', async () => {
    setup([]);
    const res = makeRes();
    await deleteHandler(makeReq({ body: { tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when the caller is not an admin', async () => {
    setup([
      { match: selectSingle('profiles'), value: { data: { role: 'user' }, error: null } }
    ], { 'tok-A': USER_A });
    const res = makeRes();
    await deleteHandler(makeReq({ token: 'tok-A', body: { tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/admins/i);
  });

  it('409 when the tournament still has registered players', async () => {
    setup([
      { match: selectSingle('profiles'), value: { data: { role: 'admin' }, error: null } },
      { match: countQuery('match_registrations'), value: { count: 7, error: null } }
    ]);
    const res = makeRes();
    await deleteHandler(makeReq({ token: 'tok-admin', body: { tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/registered players/i);
  });

  it('deletes an empty tournament for an admin', async () => {
    const calls = setup([
      { match: selectSingle('profiles'), value: { data: { role: 'admin' }, error: null } },
      { match: countQuery('match_registrations'), value: { count: 0, error: null } },
      { match: (c) => c.table === 'match_registrations' && c.op === 'delete', value: { data: [], error: null } },
      { match: (c) => c.table === 'tournaments' && c.op === 'delete', value: { data: [{ id: TOURNAMENT_ID }], error: null } }
    ]);
    const res = makeRes();
    await deleteHandler(makeReq({ token: 'tok-admin', body: { tournamentId: TOURNAMENT_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    // authorization came from the token, not the body
    const roleRead = calls.find((c) => c.table === 'profiles' && c.op === 'select');
    expect(roleRead.chain).toContainEqual(['eq', 'id', ADMIN.id]);
  });

  it('404 when the tournament does not exist', async () => {
    setup([
      { match: selectSingle('profiles'), value: { data: { role: 'admin' }, error: null } },
      { match: countQuery('match_registrations'), value: { count: 0, error: null } },
      { match: (c) => c.table === 'match_registrations' && c.op === 'delete', value: { data: [], error: null } },
      { match: (c) => c.table === 'tournaments' && c.op === 'delete', value: { data: [], error: null } }
    ]);
    const res = makeRes();
    await deleteHandler(makeReq({ token: 'tok-admin', body: { tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('400 on a malformed tournamentId', async () => {
    // requireAdmin runs first and reads the caller's role from profiles
    setup([
      { match: selectSingle('profiles'), value: { data: { role: 'admin' }, error: null } }
    ]);
    const res = makeRes();
    await deleteHandler(makeReq({ token: 'tok-admin', body: { tournamentId: 'xyz' } }), res);
    expect(res.statusCode).toBe(400);
  });
});
