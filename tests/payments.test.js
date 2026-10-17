// tests/payments.test.js
// Razorpay deposit routes (api/payments.js + api/razorpayWebhook.js) with the
// Supabase client and global fetch fully mocked — no network, no DB, no real
// Razorpay. Run: npm test

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

const state = vi.hoisted(() => ({ client: null, fetch: null }));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => state.client
}));

import paymentsHandler from '../api/payments.js';
import webhookHandler from '../api/razorpayWebhook.js';
import {
  createMockClient,
  makeReq,
  makeRes,
  authGetUserFor,
  USER_A,
  USER_B,
  rpcFailure
} from './helpers.js';

const ENV = {
  ENABLE_PAYMENTS: 'true',
  RAZORPAY_KEY_ID: 'rzp_test_keyid',
  RAZORPAY_KEY_SECRET: 'test_key_secret_0123456789',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_test_0123456789abcdef0123456789abcdef'
};

beforeEach(() => {
  Object.assign(process.env, ENV);
  state.fetch = vi.fn();
  vi.stubGlobal('fetch', state.fetch);
});

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- mock harness -----------------------------------------------------------

function setup(steps, tokens = { 'tok-A': USER_A, 'tok-B': USER_B }) {
  const { client, calls } = createMockClient({ steps, getUser: authGetUserFor(tokens) });
  state.client = client;
  return calls;
}

const paymentsSelect = (fields, { single = false, maybeSingle = false } = {}) => (c) =>
  c.kind === 'db' && c.table === 'payments' && c.op === 'select'
  && c.chain.some(([fn, v]) => fn === 'select' && v === fields)
  && (single ? !!c.single : !c.single)
  && (maybeSingle ? !!c.maybeSingle : !c.maybeSingle);
const op = (table, kind) => (c) => c.kind === 'db' && c.table === table && c.op === kind;
const rpc = (fn) => (c) => c.kind === 'rpc' && c.fn === fn;
const profilesSingle = (c) => c.kind === 'db' && c.table === 'profiles' && c.op === 'select' && !!c.single;

function fetchResolves(payload, ok = true, status = 200) {
  state.fetch.mockResolvedValue({ ok, status, json: async () => payload });
}

// --- fixtures ---------------------------------------------------------------

const ORDER_ROW = {
  user_id: USER_A.id,
  provider_order_id: 'order_Test1',
  amount_paise: 10000,
  currency: 'INR',
  status: 'created'
};

const orderRowStep = (row = ORDER_ROW) => ({
  match: paymentsSelect('user_id, provider_order_id, amount_paise, currency, status', { maybeSingle: true }),
  value: { data: row, error: null }
});
const rateLimitStep = (rows = []) => ({
  match: paymentsSelect('id'),
  value: { data: rows, error: null }
});
const insertOk = () => ({ match: op('payments', 'insert'), value: { error: null } });
const creditStep = (value) => ({ match: rpc('credit_payment'), value });
const balanceOk = () => ({ match: profilesSingle, value: { data: { balance: 100 }, error: null } });

const verifySignature = (orderId, paymentId) =>
  crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const verifyBody = (over = {}) => ({
  action: 'verify',
  razorpay_order_id: 'order_Test1',
  razorpay_payment_id: 'pay_Test1',
  razorpay_signature: verifySignature('order_Test1', 'pay_Test1'),
  ...over
});

// --- api/payments.js: auth + flag ------------------------------------------

describe('POST /api/payments — flag and auth', () => {
  it('answers 503 "Payments are not enabled." when ENABLE_PAYMENTS is not exactly "true"', async () => {
    delete process.env.ENABLE_PAYMENTS;
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'listPayments' } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Payments are not enabled.');
  });

  it('answers 503 when the Razorpay keys are missing', async () => {
    setup([]);
    delete process.env.RAZORPAY_KEY_SECRET;
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'createOrder', amountRupees: 100 } }), res);
    expect(res.statusCode).toBe(503);
  });

  it('401 without a token and 401 on an invalid token', async () => {
    setup([]);
    const resNoToken = makeRes();
    await paymentsHandler(makeReq({ body: { action: 'listPayments' } }), resNoToken);
    expect(resNoToken.statusCode).toBe(401);

    const resBadToken = makeRes();
    await paymentsHandler(makeReq({ token: 'bad', body: { action: 'listPayments' } }), resBadToken);
    expect(resBadToken.statusCode).toBe(401);
  });

  it('400 on an unknown action', async () => {
    setup([]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'withdraw' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// --- api/payments.js: createOrder -------------------------------------------

describe('POST /api/payments — createOrder', () => {
  it('creates a Razorpay order and records the row with the VERIFIED user id', async () => {
    const calls = setup([rateLimitStep(), insertOk()]);
    fetchResolves({ id: 'order_Test1', amount: 10000, currency: 'INR' });

    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'createOrder', amountRupees: 100 } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      orderId: 'order_Test1',
      amountPaise: 10000,
      currency: 'INR',
      keyId: ENV.RAZORPAY_KEY_ID
    });
    expect(JSON.stringify(res.body)).not.toContain(ENV.RAZORPAY_KEY_SECRET);

    const [url, init] = state.fetch.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const sent = JSON.parse(init.body);
    expect(sent.amount).toBe(10000);
    expect(sent.currency).toBe('INR');
    expect(typeof sent.receipt).toBe('string');
    expect(sent.receipt.length).toBeLessThanOrEqual(40);
    expect(sent.notes).toEqual({ user_id: USER_A.id });

    const row = calls.find(op('payments', 'insert')).payload[0];
    expect(row).toMatchObject({
      user_id: USER_A.id,
      provider: 'razorpay',
      provider_order_id: 'order_Test1',
      amount_paise: 10000,
      currency: 'INR',
      status: 'created'
    });
  });

  it('ignores client-supplied user_id, amount_paise and currency', async () => {
    const calls = setup([rateLimitStep(), insertOk()]);
    fetchResolves({ id: 'order_Test1', amount: 10000, currency: 'INR' });

    const res = makeRes();
    await paymentsHandler(
      makeReq({
        token: 'tok-A',
        body: { action: 'createOrder', amountRupees: 100, user_id: USER_B.id, amount_paise: 1, currency: 'USD' }
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = calls.find(op('payments', 'insert')).payload[0];
    expect(row.user_id).toBe(USER_A.id);
    expect(row.amount_paise).toBe(10000);
    expect(row.currency).toBe('INR');
  });

  it.each([
    ['zero', 0],
    ['below minimum', 9],
    ['above maximum', 5001],
    ['float', 100.5],
    ['string', '100'],
    ['missing', undefined]
  ])('rejects %s amount with 400 and no gateway call', async (_name, amount) => {
    setup([]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'createOrder', amountRupees: amount } }), res);
    expect(res.statusCode).toBe(400);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('429 after the configured number of created orders in the window', async () => {
    setup([rateLimitStep([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }])]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'createOrder', amountRupees: 100 } }), res);
    expect(res.statusCode).toBe(429);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('502 when the gateway call fails, without recording a payments row', async () => {
    setup([rateLimitStep()]);
    state.fetch.mockRejectedValue(new Error('connection reset'));
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'createOrder', amountRupees: 100 } }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/gateway/i);
  });
});

// --- api/payments.js: verify -------------------------------------------------

describe('POST /api/payments — verify', () => {
  it('credits through credit_payment and returns the new balance', async () => {
    const calls = setup([
      orderRowStep(),
      creditStep({ success: true, credited: true, amount_rupees: 100 }),
      balanceOk()
    ]);
    fetchResolves({ id: 'pay_Test1', status: 'captured', order_id: 'order_Test1', amount: 10000, currency: 'INR' });

    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'credited', balance: 100 });

    const rpcCall = calls.find(rpc('credit_payment'));
    expect(rpcCall.args).toEqual({
      p_provider_order_id: 'order_Test1',
      p_provider_payment_id: 'pay_Test1',
      p_amount_paise: 10000,
      p_currency: 'INR',
      p_event_id: 'verify:pay_Test1'
    });
  });

  it('reports already_credited when credit_payment says duplicate', async () => {
    setup([orderRowStep(), creditStep({ success: true, duplicate: true, credited: false }), balanceOk()]);
    fetchResolves({ id: 'pay_Test1', status: 'captured', order_id: 'order_Test1', amount: 10000, currency: 'INR' });

    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('already_credited');
  });

  it('reports already_credited without re-verifying a row that is already credited', async () => {
    setup([
      orderRowStep({ ...ORDER_ROW, status: 'credited' }),
      balanceOk()
    ]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('already_credited');
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('404 when the order belongs to another user', async () => {
    setup([orderRowStep({ ...ORDER_ROW, user_id: USER_B.id })]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(404);
  });

  it('404 when the order does not exist', async () => {
    setup([orderRowStep(null)]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(404);
  });

  it('400 on a bad signature and nothing is credited', async () => {
    setup([orderRowStep()]);
    const res = makeRes();
    await paymentsHandler(
      makeReq({ token: 'tok-A', body: verifyBody({ razorpay_signature: '0'.repeat(64) }) }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/verification failed/i);
  });

  it.each([
    ['hash character', 'pay#Test1'],
    ['too long', 'a'.repeat(65)]
  ])('400 on tampered %s before any database or gateway work', async (_name, paymentId) => {
    setup([]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody({ razorpay_payment_id: paymentId }) }), res);
    expect(res.statusCode).toBe(400);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('pending (no credit) when Razorpay says authorized', async () => {
    setup([orderRowStep()]);
    fetchResolves({ id: 'pay_Test1', status: 'authorized', order_id: 'order_Test1', amount: 10000, currency: 'INR' });
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'pending' });
  });

  it('409 when Razorpay says the payment is not captured', async () => {
    setup([orderRowStep()]);
    fetchResolves({ id: 'pay_Test1', status: 'failed', order_id: 'order_Test1', amount: 10000, currency: 'INR' });
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(409);
  });

  it('409 when Razorpay reports a different amount than the recorded order', async () => {
    setup([orderRowStep()]);
    fetchResolves({ id: 'pay_Test1', status: 'captured', order_id: 'order_Test1', amount: 9900, currency: 'INR' });
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(409);
  });

  it('409 when Razorpay reports a different currency than the recorded order', async () => {
    setup([orderRowStep()]);
    fetchResolves({ id: 'pay_Test1', status: 'captured', order_id: 'order_Test1', amount: 10000, currency: 'USD' });
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(409);
  });

  it('502 when the Razorpay payment lookup fails', async () => {
    setup([orderRowStep()]);
    state.fetch.mockRejectedValue(new Error('connection reset'));
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(502);
  });

  it('503 (honest, no fake success) when credit_payment fails', async () => {
    setup([orderRowStep(), creditStep(rpcFailure({ message: 'function not found' }))]);
    fetchResolves({ id: 'pay_Test1', status: 'captured', order_id: 'order_Test1', amount: 10000, currency: 'INR' });
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: verifyBody() }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/could not credit/i);
  });
});

// --- api/payments.js: listPayments -------------------------------------------

describe('POST /api/payments — listPayments', () => {
  it("returns the caller's last 20 payments", async () => {
    const rows = [{ id: 'p1', amount_paise: 10000, status: 'credited', created_at: '2026-10-17T00:00:00Z' }];
    const calls = setup([{ match: paymentsSelect('id, amount_paise, status, created_at'), value: { data: rows, error: null } }]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'listPayments' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.payments).toEqual(rows);
    const listCall = calls.find(paymentsSelect('id, amount_paise, status, created_at'));
    expect(listCall.chain).toContainEqual(['eq', 'user_id', USER_A.id]);
    expect(listCall.chain).toContainEqual(['limit', 20]);
  });

  it('503 on a database error', async () => {
    setup([{ match: paymentsSelect('id, amount_paise, status, created_at'), value: { data: null, error: { message: 'x' } } }]);
    const res = makeRes();
    await paymentsHandler(makeReq({ token: 'tok-A', body: { action: 'listPayments' } }), res);
    expect(res.statusCode).toBe(503);
  });
});

// --- api/razorpayWebhook.js ---------------------------------------------------

const WEBHOOK_SECRET = ENV.RAZORPAY_WEBHOOK_SECRET;

function rawReq(rawBody, headers = {}) {
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  return {
    method: 'POST',
    headers,
    [Symbol.asyncIterator]: async function* () {
      yield buf;
    }
  };
}

function webhookSignature(rawBody) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

const capturedEvent = (over = {}) => JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: { id: 'pay_Test1', order_id: 'order_Test1', amount: 10000, currency: 'INR', ...over }
    }
  }
});

const capturedSteps = (rpcValue = { success: true, credited: true, amount_rupees: 100 }) => [
  creditStep(rpcValue)
];

describe('POST /api/razorpayWebhook', () => {
  it('405 on GET, 503 with the flag off', async () => {
    setup([]);
    const resGet = makeRes();
    await webhookHandler({ method: 'GET', headers: {}, [Symbol.asyncIterator]: async function* () {} }, resGet);
    expect(resGet.statusCode).toBe(405);

    delete process.env.ENABLE_PAYMENTS;
    const resFlag = makeRes();
    await webhookHandler(rawReq(capturedEvent(), { 'x-razorpay-signature': webhookSignature(capturedEvent()) }), resFlag);
    expect(resFlag.statusCode).toBe(503);
  });

  it('400 on a bad signature without touching the database', async () => {
    setup([]);
    const res = makeRes();
    await webhookHandler(rawReq(capturedEvent(), { 'x-razorpay-signature': '0'.repeat(64) }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when the signature was made over different bytes than the body sent (raw-body proof)', async () => {
    setup([]);
    const signed = capturedEvent();
    // Same JSON data, re-serialized with different whitespace — the signed
    // bytes no longer match the raw bytes, so the check must fail.
    const pretty = JSON.stringify(JSON.parse(signed), null, 2);
    const res = makeRes();
    await webhookHandler(rawReq(pretty, { 'x-razorpay-signature': webhookSignature(signed) }), res);
    expect(res.statusCode).toBe(400);
  });

  it('credits payment.captured through credit_payment with the webhook event id', async () => {
    const calls = setup(capturedSteps());
    const raw = capturedEvent();
    const res = makeRes();
    await webhookHandler(
      rawReq(raw, {
        'x-razorpay-signature': webhookSignature(raw),
        'x-razorpay-event-id': 'evt_Test9'
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(calls.find(rpc('credit_payment')).args).toEqual({
      p_provider_order_id: 'order_Test1',
      p_provider_payment_id: 'pay_Test1',
      p_amount_paise: 10000,
      p_currency: 'INR',
      p_event_id: 'evt_Test9'
    });
  });

  it('treats a duplicate event as success', async () => {
    setup(capturedSteps({ success: true, duplicate: true, credited: false }));
    const raw = capturedEvent();
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(200);
  });

  it("answers 200 (no retry storm) for an order that is not ours, and logs it", async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(capturedSteps({ success: false, error: 'Unknown order' }));
    const raw = capturedEvent();
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(200);
    expect(errSpy).toHaveBeenCalled();
  });

  it('answers 200 + console.error for an amount mismatch (ids only, no payload)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(capturedSteps({ success: false, error: 'Amount mismatch' }));
    const raw = capturedEvent();
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('payload');
    expect(logged).not.toContain('amount_paise');
  });

  it('500 so Razorpay retries when credit_payment hits a database error', async () => {
    setup([creditStep(rpcFailure({ message: 'connection reset' }))]);
    const raw = capturedEvent();
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(500);
  });

  it('marks a pending order failed on payment.failed, only where status is still created', async () => {
    const calls = setup([{ match: op('payments', 'update'), value: { error: null } }]);
    const raw = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: 'pay_Fail1', order_id: 'order_Test1', error_description: 'Payment cancelled by user' }
        }
      }
    });
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(200);

    const updateCall = calls.find(op('payments', 'update'));
    expect(updateCall.payload).toEqual({ status: 'failed', failure_reason: 'Payment cancelled by user' });
    expect(updateCall.chain).toContainEqual(['eq', 'provider_order_id', 'order_Test1']);
    expect(updateCall.chain).toContainEqual(['eq', 'status', 'created']);
  });

  it('ignores any other event with 200', async () => {
    setup([]);
    const raw = JSON.stringify({ event: 'refund.processed', payload: {} });
    const res = makeRes();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ignored).toBe(true);
  });

  it('does not log the webhook secret or the signature', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup([creditStep(rpcFailure({ message: 'connection reset' }))]);
    const raw = capturedEvent();
    await webhookHandler(rawReq(raw, { 'x-razorpay-signature': webhookSignature(raw) }), makeRes());
    const logged = errSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain(WEBHOOK_SECRET);
    expect(logged).not.toContain(webhookSignature(raw));
  });
});
