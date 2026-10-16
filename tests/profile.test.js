// tests/profile.test.js
// api/profile.js — authenticated, server-side mobile-number updates.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ client: null }));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => state.client
}));

import profileHandler from '../api/profile.js';
import { createMockClient, makeReq, makeRes, authGetUserFor, USER_A, USER_B } from './helpers.js';

function setup(steps = [], tokens = { 'tok-A': USER_A }) {
  const { client, calls } = createMockClient({ steps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const duplicateLookup = (c) => c.kind === 'db'
  && c.table === 'profiles'
  && c.op === 'select'
  && !!c.maybeSingle
  && c.chain.some(([fn, fields]) => fn === 'select' && fields === 'id');

const phoneUpdate = (c) => c.kind === 'db'
  && c.table === 'profiles'
  && c.op === 'update'
  && !!c.maybeSingle;

describe('POST /api/profile — updatePhone', () => {
  beforeEach(() => {
    state.client = null;
  });

  it.each(['987654321', '5876543210', '98765432101', 'not-a-number', '', null])(
    'returns 400 for invalid phone %j',
    async (phone) => {
      setup();
      const res = makeRes();
      await profileHandler(makeReq({ token: 'tok-A', body: { action: 'updatePhone', phone } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid 10-digit Indian mobile number/i);
    }
  );

  it('returns 409 when another account already uses the mobile number', async () => {
    const calls = setup([
      { match: duplicateLookup, value: { data: { id: USER_B.id }, error: null } }
    ]);
    const res = makeRes();
    await profileHandler(makeReq({ token: 'tok-A', body: { action: 'updatePhone', phone: '9876543210' } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'This mobile number is already linked to another account.',
      code: 'PHONE_IN_USE'
    });
    expect(calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(false);
  });

  it('updates only the authenticated caller and never returns another player’s phone', async () => {
    const calls = setup([
      { match: duplicateLookup, value: { data: null, error: null } },
      { match: phoneUpdate, value: { data: { id: USER_A.id }, error: null } }
    ]);
    const res = makeRes();
    await profileHandler(makeReq({ token: 'tok-A', body: { action: 'updatePhone', phone: '9876543210' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(JSON.stringify(res.body)).not.toContain('phone');
    expect(JSON.stringify(res.body)).not.toContain(USER_B.id);

    const lookup = calls.find(duplicateLookup);
    expect(lookup.chain).toContainEqual(['eq', 'phone', '9876543210']);
    expect(lookup.chain).toContainEqual(['neq', 'id', USER_A.id]);

    const update = calls.find(phoneUpdate);
    expect(update.payload).toEqual({ phone: '9876543210' });
    expect(update.chain).toContainEqual(['eq', 'id', USER_A.id]);
  });

  it('requires an authenticated caller', async () => {
    setup();
    const res = makeRes();
    await profileHandler(makeReq({ body: { action: 'updatePhone', phone: '9876543210' } }), res);

    expect(res.statusCode).toBe(401);
  });
});
