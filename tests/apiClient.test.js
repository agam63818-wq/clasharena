// tests/apiClient.test.js
// src/lib/apiClient.js — token attachment and error normalization.
// The Supabase client is mocked so no network or env vars are needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ session: null }));

vi.mock('../src/lib/supabaseClient', () => ({
  default: {
    auth: {
      getSession: async () => state.session
    }
  }
}));

import { api, ApiError } from '../src/lib/apiClient.js';

const signedIn = { data: { session: { access_token: 'tok-123' } }, error: null };

beforeEach(() => {
  state.session = signedIn;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('src/lib/apiClient.js', () => {
  it('throws ApiError 401 and never calls fetch when there is no session', async () => {
    state.session = { data: { session: null }, error: null };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const err = await api
      .joinTournament({ tournamentId: 't1', ff_uid: '12345', ign: 'Player' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attaches the session token as a Bearer header and sends only safe fields', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await api.joinTournament({ tournamentId: 't1', ff_uid: '12345', ign: 'Player' });

    expect(result).toEqual({ success: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/joinTournament');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    // userId and entryFee are deliberately absent — the server derives them.
    expect(JSON.parse(init.body)).toEqual({ tournamentId: 't1', ff_uid: '12345', ign: 'Player' });
  });

  it('normalizes an error response and keeps the machine code (duplicate join)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Already joined', code: '23505' }), { status: 409 })
      )
    );

    const err = await api.joinTournament({ tournamentId: 't1', ff_uid: '12345', ign: 'Player' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('23505');
    expect(err.message).toBe('Already joined');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 }))
    );

    const err = await api.deleteTournament({ tournamentId: 't1' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Request failed. Please try again.');
  });

  it('sends admin actions through the single /api/admin route with the token', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ success: true, tournament: { id: 't1' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const payload = { id: 't1', name: 'Friday Showdown', mode: 'Squad', max_players: 100 };
    const result = await api.adminUpdateTournament(payload);

    expect(result.tournament.id).toBe('t1');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    // the action envelope is built by the client, not supplied by the caller
    expect(JSON.parse(init.body)).toEqual({ action: 'updateTournament', tournament: payload });
  });

  it('admin reads use the same token-authenticated route', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ success: true, registrations: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await api.adminListRegistrations();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin');
    expect(JSON.parse(init.body)).toEqual({ action: 'listRegistrations' });
  });

  it('an admin call with no session never reaches fetch (401)', async () => {
    state.session = { data: { session: null }, error: null };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const err = await api.adminCreateTournament({ name: 'x' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends wallet requests through /api/wallet with the token and only user-side fields', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true, request: { id: 'w1', status: 'pending' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await api.createWalletRequest({ type: 'deposit', amount: 500, reference: 'UPI-1', note: 'paid' });

    expect(result.request.status).toBe('pending');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/wallet');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    // no status, no balance, no userId — a request cannot decide anything
    expect(JSON.parse(init.body)).toEqual({
      action: 'createWalletRequest',
      type: 'deposit',
      amount: 500,
      reference: 'UPI-1',
      note: 'paid'
    });
  });

  it('lists the caller’s own wallet requests through the same route', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true, requests: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await api.listWalletRequests();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/wallet');
    expect(JSON.parse(init.body).action).toBe('listWalletRequests');
  });

  it('sends the admin currency actions (cancel + wallet review) via /api/admin', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await api.adminCancelTournament({ tournamentId: 't1', reason: 'maintenance' });
    await api.adminListWalletRequests();
    await api.adminApproveWalletRequest({ requestId: 'w1', note: 'checked' });
    await api.adminRejectWalletRequest({ requestId: 'w2' });

    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(fetchSpy.mock.calls.every(([url]) => url === '/api/admin')).toBe(true);
    expect(bodies).toEqual([
      { action: 'cancelTournament', tournamentId: 't1', reason: 'maintenance' },
      { action: 'listWalletRequests' },
      { action: 'approveWalletRequest', requestId: 'w1', note: 'checked' },
      { action: 'rejectWalletRequest', requestId: 'w2', note: undefined }
    ]);
  });

  it('surfaces the honest 503 message when the wallet backend is not set up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: 'This feature requires database setup: the wallet_requests table is not installed. No changes were made.' }),
          { status: 503 }
        )
      )
    );

    const err = await api.createWalletRequest({ type: 'deposit', amount: 100 }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/requires database setup/i);
  });

  it('turns a network failure into ApiError status 0 with an honest message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const err = await api.deleteTournament({ tournamentId: 't1' }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/network error/i);
  });
});
