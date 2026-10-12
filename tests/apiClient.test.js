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
