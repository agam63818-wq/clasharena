// tests/admin.test.js
// api/admin.js — the single server-side admin router.
// Everything runs against a fully mocked Supabase client: no network, no DB.
//
// Covered here:
//   - authorization: no token (401), invalid token (401), non-admin (403),
//     admin allowed (role read from profiles with the SERVICE-ROLE client,
//     never from the request body);
//   - createTournament / updateTournament / getTournament / deleteTournament /
//     listRegistrations happy paths;
//   - invalid payloads (name, mode allow-list, prize, entry_fee, max_players,
//     match_time, unknown action, malformed id);
//   - status transition rules (server-side, against the DB's current status);
//   - capacity: max_players below the DB's current_players is refused;
//   - the client can never smuggle current_players or an extra column in.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null }));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => state.client
}));

import adminHandler from '../api/admin.js';
import {
  createMockClient,
  makeReq,
  makeRes,
  authGetUserFor,
  rpcFailure,
  USER_A,
  ADMIN,
  TOURNAMENT_ID
} from './helpers.js';

function setup(steps, tokens = { 'tok-A': USER_A, 'tok-admin': ADMIN }) {
  const { client, calls } = createMockClient({ steps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const selectSingle = (table) => (c) =>
  c.kind === 'db' && c.table === table && c.op === 'select' && !!c.single;
const op = (table, kind) => (c) => c.kind === 'db' && c.table === table && c.op === kind;
// a count-only select: .select(...) without .single()/.maybeSingle()
const countQuery = (table) => (c) =>
  c.kind === 'db' && c.table === table && c.op === 'select' && !c.single && !c.maybeSingle;

const adminStep = (role = 'admin') => ({
  match: selectSingle('profiles'),
  value: { data: { role }, error: null }
});

const auditRow = (c) => c.kind === 'db' && c.table === 'admin_audit_log' && c.op === 'insert';
const auditStep = (ok = true) => ({
  match: auditRow,
  value: ok ? { error: null } : { error: { message: 'relation "admin_audit_log" does not exist' } }
});

const TOURNAMENT_ROW = {
  id: TOURNAMENT_ID,
  name: 'Friday Showdown',
  mode: 'Squad',
  status: 'registration',
  prize: 1000,
  entry_fee: 50,
  max_players: 100,
  current_players: 12,
  match_time: '2026-11-01T18:30:00.000Z'
};

const validPayload = (extra = {}) => ({
  name: 'Friday Showdown',
  mode: 'Squad',
  status: 'registration',
  prize: 1000,
  entry_fee: 50,
  max_players: 100,
  match_time: '2026-11-01T18:30',
  room_id: '',
  room_password: '',
  image_url: '',
  rules: '',
  ...extra
});

const post = (body, token = 'tok-admin') => makeReq({ token, body });

// --- authorization ---------------------------------------------------------

describe('POST /api/admin — authorization', () => {
  it('401 when no Authorization header is sent', async () => {
    const calls = setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ body: { action: 'listRegistrations' } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
    expect(calls).toHaveLength(0); // nothing hit the database
  });

  it('401 when the token is invalid', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(post({ action: 'createTournament', tournament: validPayload() }, 'bogus'), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when the caller is signed in but not an admin', async () => {
    const calls = setup([adminStep('user')]);
    const res = makeRes();
    await adminHandler(post({ action: 'createTournament', tournament: validPayload() }, 'tok-A'), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/admins/i);
    // The role lookup used the TOKEN subject, not anything else.
    const roleRead = calls.find((c) => c.table === 'profiles');
    expect(roleRead.chain).toContainEqual(['eq', 'id', USER_A.id]);
    // and no write was attempted
    expect(calls.filter((c) => c.op === 'insert' || c.op === 'update')).toHaveLength(0);
  });

  it('403 when the caller has no profile row at all', async () => {
    setup([{ match: selectSingle('profiles'), value: { data: null, error: { message: 'no rows' } } }]);
    const res = makeRes();
    await adminHandler(post({ action: 'listRegistrations' }, 'tok-A'), res);
    expect(res.statusCode).toBe(403);
  });

  it('does not let a body field grant admin (userId/role in the body are ignored)', async () => {
    const calls = setup([adminStep('user')]);
    const res = makeRes();
    await adminHandler(
      post({
        action: 'listRegistrations',
        role: 'admin',
        userId: ADMIN.id,
        isAdmin: true
      }, 'tok-A'),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(calls.filter((c) => c.table === 'match_registrations')).toHaveLength(0);
    expect(JSON.stringify(calls)).not.toContain(ADMIN.id);
  });

  it('the browser cannot reach the router with an unknown action', async () => {
    setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'deleteEverything' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unknown admin action/i);
  });

  it('405 for non-POST methods', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ method: 'GET', token: 'tok-admin' }), res);
    expect(res.statusCode).toBe(405);
  });
});

// --- createTournament ------------------------------------------------------

describe('POST /api/admin — createTournament', () => {
  it('200 and returns the created row for an admin', async () => {
    const calls = setup([
      adminStep(),
      { match: op('tournaments', 'insert'), value: { data: TOURNAMENT_ROW, error: null } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'createTournament', tournament: validPayload() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tournament).toEqual(TOURNAMENT_ROW);
    expect(res.body.auditLogged).toBe(true);
    expect(calls.find(auditRow).payload[0].action).toBe('createTournament');

    const insert = calls.find((c) => c.table === 'tournaments' && c.op === 'insert');
    expect(insert.payload[0].name).toBe('Friday Showdown');
    // match_time normalized to a UTC ISO string
    expect(insert.payload[0].match_time).toBe('2026-11-01T18:30:00.000Z');
    expect(insert.payload[0].current_players).toBeUndefined();
  });

  it.each([
    ['missing name', validPayload({ name: '' }), /name/i],
    ['short name', validPayload({ name: 'ab' }), /name/i],
    ['bad mode', validPayload({ mode: 'Tournament' }), /mode/i],
    ['negative prize', validPayload({ prize: -1 }), /prize/i],
    ['non-numeric prize', validPayload({ prize: 'lots' }), /prize/i],
    ['negative entry fee', validPayload({ entry_fee: -0.01 }), /entry fee/i],
    ['zero max_players', validPayload({ max_players: 0 }), /max players/i],
    ['fractional max_players', validPayload({ max_players: 2.5 }), /max players/i],
    ['bad match_time', validPayload({ match_time: 'tomorrow' }), /match time/i],
    ['missing match_time', validPayload({ match_time: '' }), /match time/i],
    ['bad image url', validPayload({ image_url: 'javascript:alert(1)' }), /url/i],
    ['cancelled status', validPayload({ status: 'cancelled' }), /only be set through the cancel action/i],
    ['unknown status', validPayload({ status: 'paused' }), /status/i],
    ['missing tournament object', undefined, /invalid tournament details/i]
  ])('400 for %s', async (_name, tournament, errMatch) => {
    // requireAdmin runs first, then validation fails before any write.
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'createTournament', tournament }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(errMatch);
    expect(calls.filter((c) => c.table === 'tournaments')).toHaveLength(0);
  });

  it('drops columns the client must not set (current_players, balance, id)', async () => {
    const calls = setup([
      adminStep(),
      { match: op('tournaments', 'insert'), value: { data: TOURNAMENT_ROW, error: null } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(
      post({
        action: 'createTournament',
        tournament: validPayload({ current_players: 99, id: ADMIN.id, balance: 100000 })
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const insert = calls.find((c) => c.table === 'tournaments' && c.op === 'insert');
    expect(Object.keys(insert.payload[0]).sort()).toEqual([
      'entry_fee', 'image_url', 'match_time', 'max_players',
      'mode', 'name', 'prize', 'room_id', 'room_password', 'rules', 'status'
    ]);
  });

  it('500 with a safe message (no raw DB error) when the insert fails', async () => {
    setup([
      adminStep(),
      {
        match: op('tournaments', 'insert'),
        value: { data: null, error: { message: 'duplicate key value violates unique constraint "tournaments_pkey"' } }
      }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'createTournament', tournament: validPayload() }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not create the tournament.');
    expect(JSON.stringify(res.body)).not.toMatch(/constraint|pkey/i);
  });
});

// --- updateTournament ------------------------------------------------------

describe('POST /api/admin — updateTournament', () => {
  const currentStep = (row = {}) => ({
    match: selectSingle('tournaments'),
    value: { data: { ...TOURNAMENT_ROW, ...row }, error: null }
  });

  it('200 and returns the updated row for an admin', async () => {
    const calls = setup([
      adminStep(),
      currentStep(),
      {
        match: op('tournaments', 'update'),
        value: { data: { ...TOURNAMENT_ROW, name: 'Saturday Showdown' }, error: null }
      },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(
      post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID, name: 'Saturday Showdown' }) }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tournament.name).toBe('Saturday Showdown');
    expect(res.body.auditLogged).toBe(true);

    const update = calls.find((c) => c.table === 'tournaments' && c.op === 'update');
    expect(update.chain).toContainEqual(['eq', 'id', TOURNAMENT_ID]);
    expect(update.payload.current_players).toBeUndefined();
  });

  it('400 when the tournament id is missing or malformed', async () => {
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'updateTournament', tournament: validPayload() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid tournament/i);
    expect(calls.filter((c) => c.table === 'tournaments')).toHaveLength(0);
  });

  it('404 when the tournament does not exist', async () => {
    setup([
      adminStep(),
      { match: selectSingle('tournaments'), value: { data: null, error: { message: 'no rows' } } }
    ]);
    const res = makeRes();
    await adminHandler(
      post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID }) }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('409 when max_players is below the players already registered', async () => {
    // current_players comes from the DB row (12), not from the body (99).
    const calls = setup([adminStep(), currentStep({ current_players: 12 })]);
    const res = makeRes();
    await adminHandler(
      post({
        action: 'updateTournament',
        tournament: validPayload({ id: TOURNAMENT_ID, max_players: 5, current_players: 99 })
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/12 player/i);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('200 when max_players is reduced but still >= current_players', async () => {
    setup([
      adminStep(),
      currentStep({ current_players: 12 }),
      { match: op('tournaments', 'update'), value: { data: TOURNAMENT_ROW, error: null } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(
      post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID, max_players: 12 }) }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  describe('status transition rules (current status read from the DB)', () => {
    const editableStatuses = ['registration', 'upcoming', 'live', 'completed'];

    it.each(editableStatuses.flatMap(from => editableStatuses.map(to => [from, to])))('%s -> %s is allowed', async (from, to) => {
      const steps = [
        adminStep(),
        currentStep({ status: from }),
        { match: op('tournaments', 'update'), value: { data: { ...TOURNAMENT_ROW, status: to }, error: null } },
        auditStep()
      ];
      setup(steps);
      const res = makeRes();
      await adminHandler(
        post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID, status: to }) }),
        res
      );
      expect(res.statusCode).toBe(200);
    });

    it('409 and no write when the current row already has a status that cannot be changed', async () => {
      const calls = setup([adminStep(), currentStep({ status: 'cancelled' })]);
      const res = makeRes();
      await adminHandler(
        post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID, status: 'registration' }) }),
        res
      );
      expect(res.statusCode).toBe(409);
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    });

    it('cannot set status to cancelled outside the Cancel action', async () => {
      const calls = setup([adminStep(), currentStep()]);
      const res = makeRes();
      await adminHandler(
        post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID, status: 'cancelled' }) }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/only be set through the cancel action/i);
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    });
  });

  it('500 with a safe message when the update fails', async () => {
    setup([
      adminStep(),
      currentStep(),
      { match: op('tournaments', 'update'), value: { data: null, error: { message: 'permission denied for table tournaments' } } }
    ]);
    const res = makeRes();
    await adminHandler(
      post({ action: 'updateTournament', tournament: validPayload({ id: TOURNAMENT_ID }) }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not update the tournament.');
    expect(JSON.stringify(res.body)).not.toMatch(/permission denied/i);
  });
});

// --- getTournament ---------------------------------------------------------

describe('POST /api/admin — getTournament', () => {
  const FULL_TOURNAMENT_ROW = {
    ...TOURNAMENT_ROW,
    room_id: 'room-123',
    room_password: 'secret-pass',
    image_url: 'https://example.com/banner.jpg',
    rules: 'No teaming.',
    created_at: '2026-10-01T10:00:00.000Z'
  };

  it('returns the complete editable row, including room credentials, for an admin', async () => {
    const calls = setup([
      adminStep(),
      { match: selectSingle('tournaments'), value: { data: FULL_TOURNAMENT_ROW, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'getTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, tournament: FULL_TOURNAMENT_ROW });
    const read = calls.find((call) => call.table === 'tournaments');
    expect(String(read.chain[0][1])).toContain('room_id');
    expect(String(read.chain[0][1])).toContain('room_password');
  });

  it('rejects a non-admin before reading the tournament', async () => {
    const calls = setup([adminStep('user')]);
    const res = makeRes();
    await adminHandler(post({ action: 'getTournament', tournamentId: TOURNAMENT_ID }, 'tok-A'), res);

    expect(res.statusCode).toBe(403);
    expect(calls.filter((call) => call.table === 'tournaments')).toHaveLength(0);
  });

  it('returns 404 when the requested tournament does not exist', async () => {
    setup([
      adminStep(),
      { match: selectSingle('tournaments'), value: { data: null, error: { message: 'no rows' } } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'getTournament', tournamentId: TOURNAMENT_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Tournament not found.');
  });
});

// --- deleteTournament ------------------------------------------------------

describe('POST /api/admin — deleteTournament', () => {
  it('hard-deletes an empty tournament for an admin', async () => {
    const calls = setup([
      adminStep(),
      { match: countQuery('match_registrations'), value: { count: 0, error: null } },
      { match: op('tournaments', 'delete'), value: { data: { id: TOURNAMENT_ID, name: 'Friday Showdown' }, error: null } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'deleteTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tournamentId).toBe(TOURNAMENT_ID);
    expect(res.body.auditLogged).toBe(true);
    const deletion = calls.find((call) => call.table === 'tournaments' && call.op === 'delete');
    expect(deletion.chain).toContainEqual(['eq', 'id', TOURNAMENT_ID]);
  });

  it('keeps a tournament with registrations and gives the exact cancellation reason', async () => {
    const calls = setup([
      adminStep(),
      { match: countQuery('match_registrations'), value: { count: 3, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'deleteTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('This tournament has 3 registered player(s) and cannot be deleted. Cancel it instead so player refunds can be handled safely.');
    expect(calls.filter((call) => call.table === 'tournaments' && call.op === 'delete')).toHaveLength(0);
  });
});

// --- listRegistrations -----------------------------------------------------

describe('POST /api/admin — listRegistrations', () => {
  it('200 with the registration rows for an admin', async () => {
    const rows = [
      { id: 'r1', tournament_id: TOURNAMENT_ID, user_id: USER_A.id, ff_uid: '123456789', ign: 'Alpha', profiles: { username: 'alpha', phone: '9876543210' } },
      { id: 'r2', tournament_id: TOURNAMENT_ID, user_id: ADMIN.id, ff_uid: '987654321', ign: 'Bravo', profiles: { username: 'bravo', phone: null } }
    ];
    const calls = setup([
      adminStep(),
      { match: (c) => c.table === 'match_registrations', value: { data: rows, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'listRegistrations' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.registrations).toHaveLength(2);

    const query = calls.find((c) => c.table === 'match_registrations');
    // Bounded query, and phone is deliberately included only in this
    // server-authorized admin listing (never in player-facing reads).
    expect(query.chain).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(query.chain.some(([fn]) => fn === 'limit')).toBe(true);
    expect(query.chain[0][1]).toBe('id, tournament_id, user_id, ff_uid, ign, created_at, profiles(username, phone)');
    expect(res.body.registrations[0].profiles.phone).toBe('9876543210');
  });

  it('rejects a non-admin before querying registrations', async () => {
    const calls = setup([adminStep('user')]);
    const res = makeRes();
    await adminHandler(post({ action: 'listRegistrations' }, 'tok-A'), res);

    expect(res.statusCode).toBe(403);
    expect(calls.filter((call) => call.table === 'match_registrations')).toHaveLength(0);
  });

  it('500 with a safe message when the read fails', async () => {
    setup([
      adminStep(),
      { match: (c) => c.table === 'match_registrations', value: { data: null, error: { message: 'relation "match_registrations" does not exist' } } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'listRegistrations' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not load registered players.');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/i);
  });
});

// --- getTournamentResults / setTournamentResults --------------------------

describe('POST /api/admin — getTournamentResults', () => {
  beforeEach(() => {
    delete process.env.ENABLE_TOURNAMENT_RESULTS;
  });

  afterEach(() => {
    delete process.env.ENABLE_TOURNAMENT_RESULTS;
  });

  it('returns editable result fields only to an authenticated admin', async () => {
    const rows = [{ user_id: USER_A.id, placement: 1, kills: 8, prize_amount: 1000, note: 'Winner' }];
    const calls = setup([
      adminStep(),
      { match: (c) => c.table === 'tournament_results', value: { data: rows, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'getTournamentResults', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, results: rows });
    const read = calls.find(c => c.table === 'tournament_results');
    expect(read.chain).toContainEqual(['eq', 'tournament_id', TOURNAMENT_ID]);
    expect(read.chain[0][1]).toBe('user_id, placement, kills, prize_amount, note');
  });

  it('returns an honest 503 when the results table is not installed', async () => {
    setup([
      adminStep(),
      { match: (c) => c.table === 'tournament_results', value: { data: null, error: { code: '42P01', message: 'relation does not exist' } } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'getTournamentResults', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup.*tournament_results/i);
  });
});

const validResults = (extra = {}) => ([
  { user_id: USER_A.id, placement: 1, kills: 8, prize_amount: 750, note: 'Winner', ...extra },
  { user_id: ADMIN.id, placement: 2, kills: 4, prize_amount: 250, note: null }
]);

const resultRegistrationsStep = (rows = [USER_A.id, ADMIN.id]) => ({
  match: (c) => c.table === 'match_registrations' && c.op === 'select' && !c.single && !c.maybeSingle,
  value: { data: rows.map(user_id => ({ user_id })), error: null }
});

describe('POST /api/admin — setTournamentResults', () => {
  beforeEach(() => {
    delete process.env.ENABLE_TOURNAMENT_RESULTS;
  });

  afterEach(() => {
    delete process.env.ENABLE_TOURNAMENT_RESULTS;
  });

  it('rejects a non-admin before reading registrations or calling the RPC', async () => {
    const calls = setup([adminStep('user')], { 'tok-A': USER_A });
    const res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }, 'tok-A'), res);

    expect(res.statusCode).toBe(403);
    expect(calls.some(c => c.table === 'match_registrations' || c.kind === 'rpc')).toBe(false);
  });

  it('validates registered players and records results through the service-role RPC', async () => {
    const calls = setup([
      adminStep(),
      resultRegistrationsStep(),
      { match: (c) => c.kind === 'rpc' && c.fn === 'admin_set_tournament_results', value: { success: true } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(post({
      action: 'setTournamentResults',
      tournamentId: TOURNAMENT_ID,
      results: validResults({ ignored_balance: 999999 })
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      tournament: { id: TOURNAMENT_ID, status: 'completed' },
      resultCount: 2,
      auditLogged: true
    });

    const registrationRead = calls.find(c => c.table === 'match_registrations');
    expect(registrationRead.chain).toContainEqual(['eq', 'tournament_id', TOURNAMENT_ID]);

    const rpcCall = calls.find(c => c.kind === 'rpc');
    expect(rpcCall.args).toEqual({
      p_tournament_id: TOURNAMENT_ID,
      p_admin_id: ADMIN.id,
      p_results: [
        { user_id: USER_A.id, placement: 1, kills: 8, prize_amount: 750, note: 'Winner' },
        { user_id: ADMIN.id, placement: 2, kills: 4, prize_amount: 250, note: null }
      ]
    });
    expect(calls.find(auditRow).payload[0]).toMatchObject({
      action: 'setTournamentResults',
      target_type: 'tournament',
      target_id: TOURNAMENT_ID,
      details: { result_count: 2, recorded_prize_total: 1000 }
    });
  });

  it.each([
    ['zero placement', validResults({ placement: 0 }), /placement/i],
    ['fractional placement', validResults({ placement: 1.5 }), /placement/i],
    ['negative kills', validResults({ kills: -1 }), /kills/i],
    ['fractional kills', validResults({ kills: 1.2 }), /kills/i],
    ['negative prize', validResults({ prize_amount: -1 }), /prize amount/i],
    ['invalid user id', validResults({ user_id: 'not-a-uuid' }), /invalid player/i]
  ])('400 for %s before querying registrations', async (_name, results, errorMatch) => {
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(errorMatch);
    expect(calls.some(c => c.table === 'match_registrations')).toBe(false);
    expect(calls.some(c => c.kind === 'rpc')).toBe(false);
  });

  it('400 when a submitted player is not registered in the selected tournament', async () => {
    const calls = setup([
      adminStep(),
      resultRegistrationsStep([USER_A.id])
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/registered for this tournament/i);
    expect(calls.some(c => c.kind === 'rpc')).toBe(false);
  });

  it('returns an honest 503 when the results RPC is missing', async () => {
    setup([
      adminStep(),
      resultRegistrationsStep(),
      {
        match: (c) => c.kind === 'rpc' && c.fn === 'admin_set_tournament_results',
        value: rpcFailure({ code: 'PGRST202', message: 'Could not find the function public.admin_set_tournament_results in the schema cache' })
      }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup.*admin_set_tournament_results/i);
  });

  it('maps an RPC tournament-not-found verdict to 404 without leaking unknown verdicts', async () => {
    let calls = setup([
      adminStep(),
      resultRegistrationsStep(),
      { match: (c) => c.kind === 'rpc', value: { error: 'Tournament not found' } }
    ]);
    let res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Tournament not found.');

    calls = setup([
      adminStep(),
      resultRegistrationsStep(),
      { match: (c) => c.kind === 'rpc', value: { error: 'sensitive database failure' } }
    ]);
    res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not save tournament results right now.');
    expect(JSON.stringify(res.body)).not.toContain('sensitive database failure');
    expect(calls.some(c => c.kind === 'rpc')).toBe(true);
  });

  it('does not touch registrations or the RPC when the server feature is explicitly disabled', async () => {
    process.env.ENABLE_TOURNAMENT_RESULTS = 'false';
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'setTournamentResults', tournamentId: TOURNAMENT_ID, results: validResults() }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
    expect(calls.some(c => c.table === 'match_registrations' || c.kind === 'rpc')).toBe(false);
  });
});

// --- missing server env ----------------------------------------------------

describe('POST /api/admin — service unavailable', () => {
  it('503 with an honest message propagates when the server client is unavailable', async () => {
    // getSupabaseAdmin throws HttpError(503) before any DB call.
    const { HttpError } = await import('../api/_lib/errors.js');
    state.client = { auth: { getUser: async () => { throw new HttpError(503, 'Service temporarily unavailable. Please try again later.'); } } };
    const res = makeRes();
    await adminHandler(post({ action: 'listRegistrations' }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
  });
});

// ===========================================================================
// cancelTournament
// ===========================================================================

const cancelSteps = ({ status = 'registration', entryFee = 100, registrations = 0, audit = true } = {}) => {
  const steps = [
    adminStep(),
    {
      match: selectSingle('tournaments'),
      value: { data: { id: TOURNAMENT_ID, name: 'Friday Showdown', status, entry_fee: entryFee, current_players: registrations }, error: null }
    },
    { match: countQuery('match_registrations'), value: { count: registrations, error: null } }
  ];
  if (audit) steps.push(auditStep());
  return steps;
};

describe('POST /api/admin — cancelTournament', () => {
  beforeEach(() => {
    delete process.env.ENABLE_TOURNAMENT_CANCELLATION;
  });
  afterEach(() => {
    delete process.env.ENABLE_TOURNAMENT_CANCELLATION;
  });

  it('401 without a token', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 for a signed-in non-admin', async () => {
    setup([adminStep('user')]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }, 'tok-A'), res);
    expect(res.statusCode).toBe(403);
  });

  it('404 for an unknown tournament', async () => {
    setup([adminStep(), { match: selectSingle('tournaments'), value: { data: null, error: { message: 'no rows' } } }]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);
    expect(res.statusCode).toBe(404);
  });

  it('409 when the tournament is already cancelled', async () => {
    setup([adminStep(), { match: selectSingle('tournaments'), value: { data: { id: TOURNAMENT_ID, status: 'cancelled', entry_fee: 100, current_players: 0 }, error: null } }]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already cancelled/i);
  });

  it('400 for a malformed tournamentId and for an over-long reason', async () => {
    setup([adminStep()]);
    let res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: 'nope' }), res);
    expect(res.statusCode).toBe(400);

    setup([adminStep()]);
    res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID, reason: 'x'.repeat(301) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/note/i);
  });

  it('no registrations: cancels with a plain status update (no RPC, no flag needed)', async () => {
    process.env.ENABLE_TOURNAMENT_CANCELLATION = 'false'; // even with the flag OFF
    const calls = setup([
      ...cancelSteps({ registrations: 0 }),
      { match: op('tournaments', 'update'), value: { data: { id: TOURNAMENT_ID, status: 'cancelled' }, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID, reason: 'venue unavailable' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tournament.status).toBe('cancelled');
    expect(res.body.refunded).toBe(0);
    expect(res.body.auditLogged).toBe(true);

    const update = calls.find((c) => c.table === 'tournaments' && c.op === 'update');
    expect(update.payload).toEqual({ status: 'cancelled' }); // status ONLY
    expect(calls.filter((c) => c.kind === 'rpc')).toHaveLength(0);
  });

  it('free tournament (entry_fee = 0) with registrations: cancels without refunds', async () => {
    const calls = setup([
      ...cancelSteps({ entryFee: 0, registrations: 7 }),
      { match: op('tournaments', 'update'), value: { data: { id: TOURNAMENT_ID, status: 'cancelled' }, error: null } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.refunded).toBe(0);
    expect(calls.filter((c) => c.kind === 'rpc')).toHaveLength(0);
    // no balance was touched anywhere (the only profiles access is the
    // requireAdmin role read)
    expect(calls.filter((c) => c.table === 'profiles' && c.op !== 'select')).toHaveLength(0);
  });

  it('paid registrations + flag OFF: 409 with the exact reason and nothing changed', async () => {
    const calls = setup(cancelSteps({ entryFee: 100, registrations: 4 }));
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/4 paid registration/i);
    expect(res.body.error).toMatch(/ENABLE_TOURNAMENT_CANCELLATION=true/);
    expect(res.body.error).toMatch(/nothing was changed/i);
    expect(calls.filter((c) => c.op === 'update' || c.kind === 'rpc')).toHaveLength(0);
  });

  it('paid registrations + flag ON but the RPC is missing: 503 "requires database setup", no refunds', async () => {
    process.env.ENABLE_TOURNAMENT_CANCELLATION = 'true';
    const calls = setup([
      ...cancelSteps({ entryFee: 100, registrations: 4, audit: false }),
      {
        match: (c) => c.kind === 'rpc',
        value: rpcFailure({ code: 'PGRST202', message: 'Could not find the function public.cancel_tournament_with_refund(p_admin_id, p_reason, p_tournament_id) in the schema cache' })
      }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
    expect(res.body.error).toMatch(/cancel_tournament_with_refund/);
    expect(res.body.error).toMatch(/no refunds were issued/i);
    // the router itself never wrote a status or a balance
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    expect(calls.filter((c) => c.table === 'profiles' && c.op !== 'select')).toHaveLength(0);
  });

  it('paid registrations + flag ON: calls the atomic RPC and reports the real refund count', async () => {
    process.env.ENABLE_TOURNAMENT_CANCELLATION = 'true';
    const calls = setup([
      ...cancelSteps({ entryFee: 50, registrations: 3 }),
      { match: (c) => c.kind === 'rpc', value: { success: true, refunded: 3, already_cancelled: false } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID, reason: 'server maintenance' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.refunded).toBe(3);

    const rpc = calls.find((c) => c.kind === 'rpc');
    expect(rpc.fn).toBe('cancel_tournament_with_refund');
    expect(rpc.args).toEqual({
      p_tournament_id: TOURNAMENT_ID,
      p_admin_id: ADMIN.id, // the verified admin, never a body field
      p_reason: 'server maintenance'
    });

    const audit = calls.find(auditRow);
    expect(audit.payload[0].action).toBe('cancelTournament');
    expect(audit.payload[0].admin_id).toBe(ADMIN.id);
    expect(audit.payload[0].details.refunded).toBe(3);
  });

  it('passes an RPC refusal through with the right status (no invention of success)', async () => {
    process.env.ENABLE_TOURNAMENT_CANCELLATION = 'true';
    setup([
      ...cancelSteps({ entryFee: 50, registrations: 2, audit: false }),
      { match: (c) => c.kind === 'rpc', value: { error: 'Tournament not found' } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Tournament not found');
  });

  it('is honest when the audit log could not be written (auditLogged: false)', async () => {
    const calls = setup([
      ...cancelSteps({ registrations: 0, audit: false }),
      { match: op('tournaments', 'update'), value: { data: { id: TOURNAMENT_ID, status: 'cancelled' }, error: null } },
      auditStep(false)
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'cancelTournament', tournamentId: TOURNAMENT_ID }), res);

    expect(res.statusCode).toBe(200); // the cancellation itself succeeded
    expect(res.body.auditLogged).toBe(false);
    expect(calls.find((c) => c.table === 'tournaments' && c.op === 'update')).toBeTruthy();
  });
});

// ===========================================================================
// Wallet requests (admin side)
// ===========================================================================

const WALLET_REQUEST_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const PENDING_ROWS = [
  { id: WALLET_REQUEST_ID, user_id: USER_A.id, type: 'deposit', amount: 500, reference: 'UPI-1', note: null, status: 'pending', created_at: '2026-10-13T08:00:00.000Z' }
];

const walletQueue = () => ({
  match: (c) => c.table === 'wallet_requests',
  value: { data: PENDING_ROWS, error: null }
});
const profileLookup = () => ({
  match: (c) => c.table === 'profiles' && c.op === 'select',
  value: { data: [{ id: USER_A.id, username: 'alpha' }], error: null }
});

describe('POST /api/admin — wallet requests', () => {
  beforeEach(() => {
    delete process.env.ENABLE_WALLET_REQUESTS;
  });
  afterEach(() => {
    delete process.env.ENABLE_WALLET_REQUESTS;
  });

  it.each([
    ['listWalletRequests', {}],
    ['approveWalletRequest', { requestId: WALLET_REQUEST_ID }],
    ['rejectWalletRequest', { requestId: WALLET_REQUEST_ID }]
  ])('%s answers 503 while ENABLE_WALLET_REQUESTS is off (kill switch, no DB work)', async (action, extra) => {
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action, ...extra }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/not enabled/i);
    expect(calls.filter((c) => c.kind === 'rpc' || c.table === 'wallet_requests')).toHaveLength(0);
  });

  it('listWalletRequests returns the pending queue with usernames', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    const calls = setup([adminStep(), walletQueue(), profileLookup()]);
    const res = makeRes();
    await adminHandler(post({ action: 'listWalletRequests' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].username).toBe('alpha');

    const q = calls.find((c) => c.table === 'wallet_requests');
    expect(q.chain).toContainEqual(['eq', 'status', 'pending']);
    expect(q.chain.some(([fn]) => fn === 'limit')).toBe(true);
  });

  it('listWalletRequests still answers when usernames cannot be loaded (best effort)', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([
      adminStep(),
      walletQueue(),
      { match: (c) => c.table === 'profiles' && c.op === 'select', value: { data: null, error: { message: 'permission denied' } } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'listWalletRequests' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.requests[0].username).toBeNull();
  });

  it('listWalletRequests: 503 "requires database setup" when wallet_requests is missing', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([
      adminStep(),
      { match: (c) => c.table === 'wallet_requests', value: { data: null, error: { code: '42P01', message: 'relation "public.wallet_requests" does not exist' } } }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'listWalletRequests' }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
  });

  it('approveWalletRequest calls the atomic RPC with the verified admin id', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    const calls = setup([
      adminStep(),
      { match: (c) => c.kind === 'rpc', value: { success: true, amount: 500, type: 'deposit' } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'approveWalletRequest', requestId: WALLET_REQUEST_ID, note: 'UPI verified' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.walletRequest).toEqual({ id: WALLET_REQUEST_ID, status: 'approved' });
    expect(res.body.auditLogged).toBe(true);

    const rpc = calls.find((c) => c.kind === 'rpc');
    expect(rpc.fn).toBe('approve_wallet_request');
    expect(rpc.args).toEqual({ p_request_id: WALLET_REQUEST_ID, p_admin_id: ADMIN.id, p_admin_note: 'UPI verified' });

    // the router never writes a balance itself — the RPC owns the money
    expect(calls.filter((c) => c.table === 'profiles' && c.op === 'update')).toHaveLength(0);
    expect(calls.filter((c) => c.table === 'transactions')).toHaveLength(0);
  });

  it('approveWalletRequest: 503 "requires database setup" when the RPC is missing (never a fake success)', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([
      adminStep(),
      { match: (c) => c.kind === 'rpc', value: rpcFailure({ code: 'PGRST202', message: 'Could not find the function public.approve_wallet_request in the schema cache' }) }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'approveWalletRequest', requestId: WALLET_REQUEST_ID }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/requires database setup/i);
    expect(res.body.error).toMatch(/approve_wallet_request/);
    expect(res.body.success).toBeUndefined();
  });

  it.each([
    ['Request already approved', 409],
    ['Request already rejected', 409],
    ['Insufficient balance at approval time', 409],
    ['Request not found', 404]
  ])('approveWalletRequest passes the RPC verdict "%s" through as %i', async (message, status) => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([adminStep(), { match: (c) => c.kind === 'rpc', value: { error: message } }]);
    const res = makeRes();
    await adminHandler(post({ action: 'approveWalletRequest', requestId: WALLET_REQUEST_ID }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toBe(message);
  });

  it('rejectWalletRequest records a rejection via its own RPC', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    const calls = setup([
      adminStep(),
      { match: (c) => c.kind === 'rpc', value: { success: true } },
      auditStep()
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'rejectWalletRequest', requestId: WALLET_REQUEST_ID, note: 'reference not found' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.walletRequest.status).toBe('rejected');
    const rpc = calls.find((c) => c.kind === 'rpc');
    expect(rpc.fn).toBe('reject_wallet_request');
    expect(rpc.args.p_admin_id).toBe(ADMIN.id);
  });

  it('rejectWalletRequest refuses to reject an already-approved request (money moved)', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([adminStep(), { match: (c) => c.kind === 'rpc', value: { error: 'Request already approved and cannot be rejected' } }]);
    const res = makeRes();
    await adminHandler(post({ action: 'rejectWalletRequest', requestId: WALLET_REQUEST_ID }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/cannot be rejected/i);
  });

  it.each([
    ['missing requestId', {}],
    ['malformed requestId', { requestId: 'not-a-uuid' }]
  ])('400 for a %s', async (_name, extra) => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    const calls = setup([adminStep()]);
    const res = makeRes();
    await adminHandler(post({ action: 'approveWalletRequest', ...extra }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid request id/i);
    expect(calls.filter((c) => c.kind === 'rpc')).toHaveLength(0);
  });

  it('500 with a safe message for an unknown RPC failure', async () => {
    process.env.ENABLE_WALLET_REQUESTS = 'true';
    setup([
      adminStep(),
      { match: (c) => c.kind === 'rpc', value: rpcFailure({ message: 'connection reset by peer' }) }
    ]);
    const res = makeRes();
    await adminHandler(post({ action: 'approveWalletRequest', requestId: WALLET_REQUEST_ID }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Could not approve the request right now.');
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/i);
  });
});
