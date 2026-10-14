// tests/adminApi.test.js
// POST /api/admin — admin-only actions with the Supabase client fully mocked.
//   getTournament    returns the FULL row (room fields included) so the edit
//                    form never saves null over stored credentials.
//   cancelTournament writes status='cancelled' and is the only path to it.

import { describe, it, expect, vi } from 'vitest';

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
  USER_A,
  ADMIN,
  TOURNAMENT_ID
} from './helpers.js';

function setup(steps, { tokens = { 'tok-A': USER_A, 'tok-admin': ADMIN }, adminProfile = true } = {}) {
  // requireAdmin always reads profiles.role first; default it to admin.
  const allSteps = adminProfile
    ? [{ match: selectSingle('profiles'), value: { data: { role: 'admin' }, error: null } }, ...steps]
    : steps;
  const { client, calls } = createMockClient({ steps: allSteps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const selectSingle = (table) => (c) => c.kind === 'db' && c.table === table && c.op === 'select' && !!c.single;
const op = (table, kind) => (c) => c.kind === 'db' && c.table === table && c.op === kind;

const FULL_ROW = {
  id: TOURNAMENT_ID,
  name: 'FF Duos Cup',
  mode: 'Duo',
  prize: 500,
  entry_fee: 20,
  max_players: 50,
  current_players: 3,
  status: 'upcoming',
  match_time: '2026-10-20T14:30:00.000Z',
  room_id: 'ROOM-123',
  room_password: 'secret-pass',
  image_url: 'https://example.com/banner.png',
  rules: 'Be nice.'
};

// --- authentication / authorization ----------------------------------------

describe('POST /api/admin — authentication and authorization', () => {
  it('401 when no Authorization header is sent', async () => {
    setup([{ match: selectSingle('tournaments'), value: { data: FULL_ROW, error: null } }]);
    const res = makeRes();
    await adminHandler(makeReq({ body: { action: 'getTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it('401 on an invalid token', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'bad', body: { action: 'getTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when the caller is authenticated but not an admin', async () => {
    // profiles.role lookup fails the admin check before any DB work happens.
    setup(
      [{ match: selectSingle('profiles'), value: { data: { role: 'user' }, error: null } }],
      { adminProfile: false }
    );
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-A', body: { action: 'getTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/only admins/i);
  });

  it('405 for non-POST methods', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ method: 'GET', token: 'tok-admin' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on an unknown action', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'deleteEverything' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unknown admin action/i);
  });

  it('400 on a malformed tournamentId', async () => {
    setup([]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'getTournament', tournamentId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// --- getTournament ----------------------------------------------------------

describe('POST /api/admin — getTournament', () => {
  it('returns the full row including room_id/room_password for an admin', async () => {
    setup([{ match: selectSingle('tournaments'), value: { data: FULL_ROW, error: null } }]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'getTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.tournament).toEqual(FULL_ROW);
    expect(res.body.tournament.room_id).toBe('ROOM-123');
    expect(res.body.tournament.room_password).toBe('secret-pass');
  });

  it('404 when the tournament does not exist', async () => {
    setup([{ match: selectSingle('tournaments'), value: { data: null, error: { message: 'row not found' } } }]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'getTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// --- cancelTournament -------------------------------------------------------

describe('POST /api/admin — cancelTournament', () => {
  const fetchStatus = (status) => [{ match: selectSingle('tournaments'), value: { data: { status }, error: null } }];

  it('sets status=cancelled for an admin', async () => {
    const calls = setup([
      ...fetchStatus('upcoming'),
      { match: op('tournaments', 'update'), value: { error: null } }
    ]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'cancelled' });
    const updateCall = calls.find(c => c.kind === 'db' && c.table === 'tournaments' && c.op === 'update');
    expect(updateCall.payload).toEqual({ status: 'cancelled' });
  });

  it('409 when the tournament is already cancelled', async () => {
    setup(fetchStatus('cancelled'));
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already cancelled/i);
  });

  it('409 when the tournament is completed', async () => {
    setup(fetchStatus('completed'));
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/completed/i);
  });

  it('404 when the tournament does not exist', async () => {
    setup([{ match: selectSingle('tournaments'), value: { data: null, error: { message: 'row not found' } } }]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('500 when the status update fails', async () => {
    setup([
      ...fetchStatus('live'),
      { match: op('tournaments', 'update'), value: { error: { message: 'update failed' } } }
    ]);
    const res = makeRes();
    await adminHandler(makeReq({ token: 'tok-admin', body: { action: 'cancelTournament', tournamentId: TOURNAMENT_ID } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/unable to cancel/i);
  });
});
