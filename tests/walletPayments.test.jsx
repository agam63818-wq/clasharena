// tests/walletPayments.test.jsx
// Razorpay wallet top-up client flow (R2) with a mocked Razorpay Checkout and
// a mocked /api/payments client — no real network, no real Razorpay.
// The flow helpers live in src/App.jsx (same exported-helper pattern as the
// player-side tests); WalletView drives them with React state.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient', () => ({ default: { auth: {} } }));
vi.mock('../src/lib/apiClient', () => ({
  api: {},
  ApiError: class ApiError extends Error {}
}));
vi.mock('../src/config/features', () => ({
  features: {
    walletTransactions: true,
    payments: true,
    walletRequests: false,
    roomDetailsRpc: false,
    tournamentResults: true
  }
}));
// The real Modal portal-renders into document.body, which does not exist in
// the node test environment; a closed modal renders nothing either way.
vi.mock('../src/components/Modal', () => ({
  default: ({ open, children }) => (open ? children : null)
}));

import {
  WalletView,
  parseTopupAmount,
  isTestModeKey,
  loadRazorpayCheckout,
  openRazorpayCheckout,
  pollForCreditedPayment,
  startWalletTopup,
  TOPUP_AMOUNT_CHIPS,
  RAZORPAY_CHECKOUT_SRC
} from '../src/App.jsx';

// --- fakes -------------------------------------------------------------------

function makeRazorpayCtor(behaviour = 'success') {
  const instances = [];
  class FakeRazorpay {
    constructor(options) {
      this.options = options;
      instances.push(this);
    }

    open() {
      if (behaviour === 'success') {
        this.options.handler({
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'sig_1'
        });
      } else if (behaviour === 'dismiss') {
        this.options.modal.ondismiss();
      }
    }
  }
  return { FakeRazorpay, instances };
}

function makeApiClient(overrides = {}) {
  return {
    createPaymentOrder: vi.fn(async () => ({
      orderId: 'order_1',
      amountPaise: 10000,
      currency: 'INR',
      keyId: 'rzp_test_abc'
    })),
    verifyPayment: vi.fn(async () => ({ status: 'credited', balance: 250 })),
    listPayments: vi.fn(async () => ({ payments: [] })),
    ...overrides
  };
}

const httpError = (message, status) => Object.assign(new Error(message), { status });
const noSleep = async () => {};

// --- parseTopupAmount ---------------------------------------------------------

describe('parseTopupAmount', () => {
  it('accepts whole rupees inside the server limits, including the chips', () => {
    expect(TOPUP_AMOUNT_CHIPS).toEqual([50, 100, 200, 500]);
    expect(parseTopupAmount('10')).toEqual({ amountRupees: 10, error: '' });
    expect(parseTopupAmount('5000')).toEqual({ amountRupees: 5000, error: '' });
    expect(parseTopupAmount(200)).toEqual({ amountRupees: 200, error: '' });
    expect(parseTopupAmount(' 150 ')).toEqual({ amountRupees: 150, error: '' });
  });

  it('rejects out-of-range, fractional and non-numeric amounts', () => {
    for (const bad of ['', ' ', '0', '9', '5001', '10.5', 'abc', '-50', '1e3', null, undefined]) {
      const parsed = parseTopupAmount(bad);
      expect(parsed.amountRupees).toBe(null);
      expect(parsed.error).toMatch(/whole-rupee amount between/);
    }
  });
});

// --- isTestModeKey --------------------------------------------------------------

describe('isTestModeKey', () => {
  it('is true only for test-mode key ids', () => {
    expect(isTestModeKey('rzp_test_abc123')).toBe(true);
    expect(isTestModeKey('rzp_prod_abc123')).toBe(false);
    expect(isTestModeKey('')).toBe(false);
    expect(isTestModeKey(null)).toBe(false);
    expect(isTestModeKey(undefined)).toBe(false);
  });
});

// --- loadRazorpayCheckout ---------------------------------------------------------

function fakeDocument() {
  const appended = [];
  return {
    appended,
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({})
  };
}

describe('loadRazorpayCheckout', () => {
  it('injects the Checkout script once and resolves the Razorpay constructor', async () => {
    const doc = fakeDocument();
    const win = {};
    const { FakeRazorpay } = makeRazorpayCtor();

    const first = loadRazorpayCheckout(doc, win);
    const second = loadRazorpayCheckout(doc, win);

    expect(doc.appended).toHaveLength(1);
    expect(doc.appended[0].src).toBe(RAZORPAY_CHECKOUT_SRC);
    expect(doc.appended[0].src).toBe('https://checkout.razorpay.com/v1/checkout.js');

    win.Razorpay = FakeRazorpay;
    doc.appended[0].onload();

    await expect(first).resolves.toBe(FakeRazorpay);
    await expect(second).resolves.toBe(FakeRazorpay);
    // already available on window: no new script tag
    await expect(loadRazorpayCheckout(doc, win)).resolves.toBe(FakeRazorpay);
    expect(doc.appended).toHaveLength(1);
  });

  it('rejects on a script load failure and lets a later call retry', async () => {
    const doc = fakeDocument();
    const win = {};
    const { FakeRazorpay } = makeRazorpayCtor();

    const failing = loadRazorpayCheckout(doc, win);
    doc.appended[0].onerror();
    await expect(failing).rejects.toThrow(/Could not load the payment window/);

    const retry = loadRazorpayCheckout(doc, win);
    expect(doc.appended).toHaveLength(2);
    win.Razorpay = FakeRazorpay;
    doc.appended[1].onload();
    await expect(retry).resolves.toBe(FakeRazorpay);
  });
});

// --- openRazorpayCheckout ---------------------------------------------------------

describe('openRazorpayCheckout', () => {
  const order = { keyId: 'rzp_test_abc', orderId: 'order_1', amountPaise: 10000, currency: 'INR' };

  it('opens Checkout with the server order and resolves the raw handler response', async () => {
    const { FakeRazorpay, instances } = makeRazorpayCtor('success');

    const opened = await openRazorpayCheckout({
      RazorpayCtor: FakeRazorpay,
      order,
      displayName: 'Player One'
    });

    expect(opened.outcome).toBe('handler');
    expect(opened.response).toEqual({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig_1'
    });
    const options = instances[0].options;
    expect(options.key).toBe('rzp_test_abc');
    expect(options.order_id).toBe('order_1');
    expect(options.amount).toBe(10000);
    expect(options.currency).toBe('INR');
    expect(options.name).toBe('ClashArena');
    expect(options.prefill).toEqual({ name: 'Player One' });
  });

  it('resolves as dismissed when the player closes the window', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('dismiss');
    const opened = await openRazorpayCheckout({ RazorpayCtor: FakeRazorpay, order });
    expect(opened).toEqual({ outcome: 'dismissed' });
  });

  it('rejects honestly when Checkout cannot even open', async () => {
    class BrokenRazorpay {
      open() {
        throw new Error('boom');
      }
    }
    await expect(openRazorpayCheckout({ RazorpayCtor: BrokenRazorpay, order }))
      .rejects.toThrow(/No money was charged/);
  });
});

// --- pollForCreditedPayment ---------------------------------------------------------

describe('pollForCreditedPayment', () => {
  it('reports a credit only for a payment row that was not already credited', async () => {
    const responses = [
      { payments: [{ id: 'old', status: 'credited' }, { id: 'p1', status: 'created' }] },
      { payments: [{ id: 'p1', status: 'credited' }, { id: 'old', status: 'credited' }] }
    ];
    const listPaymentsFn = vi.fn(async () => responses.shift());
    const onPayments = vi.fn();

    const result = await pollForCreditedPayment({
      listPaymentsFn,
      knownCreditedIds: new Set(['old']),
      attempts: 4,
      sleep: noSleep,
      onPayments
    });

    expect(result.credited).toBe(true);
    expect(result.payment.id).toBe('p1');
    expect(listPaymentsFn).toHaveBeenCalledTimes(2);
    expect(onPayments).toHaveBeenCalledTimes(2);
  });

  it('never treats a pre-existing credited payment as this top-up', async () => {
    const listPaymentsFn = vi.fn(async () => ({ payments: [{ id: 'old', status: 'credited' }] }));
    const result = await pollForCreditedPayment({
      listPaymentsFn,
      knownCreditedIds: new Set(['old']),
      attempts: 2,
      sleep: noSleep
    });
    expect(result.credited).toBe(false);
  });

  it('cannot confirm anything without a baseline of known credited ids', async () => {
    const listPaymentsFn = vi.fn(async () => ({ payments: [{ id: 'any', status: 'credited' }] }));
    const result = await pollForCreditedPayment({
      listPaymentsFn,
      knownCreditedIds: null,
      attempts: 1,
      sleep: noSleep
    });
    expect(result.credited).toBe(false);
  });

  it('keeps polling through a transient list failure', async () => {
    const listPaymentsFn = vi.fn()
      .mockRejectedValueOnce(httpError('Network error. Please check your connection and try again.', 0))
      .mockResolvedValue({ payments: [{ id: 'p1', status: 'credited' }] });
    const result = await pollForCreditedPayment({
      listPaymentsFn,
      knownCreditedIds: new Set(),
      attempts: 3,
      sleep: noSleep
    });
    expect(result.credited).toBe(true);
  });
});

// --- startWalletTopup (full flow, mocked Razorpay + API) ---------------------------

describe('startWalletTopup', () => {
  it('happy path: order -> checkout -> server verify credited, with exact payloads', async () => {
    const { FakeRazorpay, instances } = makeRazorpayCtor('success');
    const apiClient = makeApiClient();
    const onKeyId = vi.fn();
    const phases = [];

    const outcome = await startWalletTopup({
      amountRupees: 100,
      displayName: 'Player One',
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep,
      onKeyId,
      onPhase: (p) => phases.push(p)
    });

    expect(outcome).toMatchObject({ status: 'credited', balance: 250, testMode: true, via: 'verify' });
    expect(apiClient.createPaymentOrder).toHaveBeenCalledWith({ amountRupees: 100 });
    expect(apiClient.verifyPayment).toHaveBeenCalledWith({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig_1'
    });
    expect(onKeyId).toHaveBeenCalledWith('rzp_test_abc');
    expect(phases).toEqual(['creating', 'opening', 'verifying']);
    expect(instances[0].options.prefill).toEqual({ name: 'Player One' });
  });

  it('dismissed checkout: no verify call, no credit', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('dismiss');
    const apiClient = makeApiClient();

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });

    expect(outcome.status).toBe('dismissed');
    expect(apiClient.verifyPayment).not.toHaveBeenCalled();
  });

  it('checkout handler alone is never success: a verify failure stays an error', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('success');
    const apiClient = makeApiClient({
      verifyPayment: vi.fn(async () => {
        throw httpError('Payment verification failed.', 400);
      })
    });

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });

    expect(outcome).toMatchObject({ status: 'error', stage: 'verify', httpStatus: 400 });
    expect(outcome.message).toMatch(/verification failed/);
  });

  it('script load failure stops before Checkout and charges nothing', async () => {
    const { instances } = makeRazorpayCtor('success');
    const apiClient = makeApiClient();

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => {
        throw new Error('Could not load the payment window. Please try again.');
      },
      sleep: noSleep
    });

    expect(outcome).toMatchObject({ status: 'error', stage: 'script' });
    expect(outcome.message).toMatch(/No money was charged/);
    expect(instances).toHaveLength(0);
    expect(apiClient.verifyPayment).not.toHaveBeenCalled();
  });

  it('createOrder failures (503 off / network) never reach Checkout', async () => {
    const loadCheckout = vi.fn();
    const offClient = makeApiClient({
      createPaymentOrder: vi.fn(async () => {
        throw httpError('Payments are not enabled.', 503);
      })
    });

    const offOutcome = await startWalletTopup({
      amountRupees: 100,
      apiClient: offClient,
      loadCheckout,
      sleep: noSleep
    });
    expect(offOutcome).toMatchObject({ status: 'error', stage: 'createOrder', httpStatus: 503 });
    expect(loadCheckout).not.toHaveBeenCalled();

    const netClient = makeApiClient({
      createPaymentOrder: vi.fn(async () => {
        throw httpError('Network error. Please check your connection and try again.', 0);
      })
    });
    const netOutcome = await startWalletTopup({
      amountRupees: 100,
      apiClient: netClient,
      loadCheckout,
      sleep: noSleep
    });
    expect(netOutcome).toMatchObject({ status: 'error', stage: 'createOrder', httpStatus: 0 });
    expect(netOutcome.message).toMatch(/Network error/);
  });

  it('rejects an invalid amount before any API call', async () => {
    const apiClient = makeApiClient();
    const outcome = await startWalletTopup({
      amountRupees: 5,
      apiClient,
      loadCheckout: vi.fn(),
      sleep: noSleep
    });
    expect(outcome).toMatchObject({ status: 'error', stage: 'validation' });
    expect(apiClient.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('already_credited from verify is a success outcome (idempotent retry)', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('success');
    const apiClient = makeApiClient({
      verifyPayment: vi.fn(async () => ({ status: 'already_credited', balance: 250 }))
    });

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });
    expect(outcome).toMatchObject({ status: 'already_credited', balance: 250 });
  });

  it("verify 'pending' polls the Payments list and succeeds only when it shows the credit", async () => {
    const { FakeRazorpay } = makeRazorpayCtor('success');
    const responses = [
      { payments: [{ id: 'p1', status: 'created' }] },
      { payments: [{ id: 'p1', status: 'credited' }] }
    ];
    const apiClient = makeApiClient({
      verifyPayment: vi.fn(async () => ({ status: 'pending' })),
      listPayments: vi.fn(async () => responses.shift())
    });
    const phases = [];
    const onPayments = vi.fn();
    const onPoll = vi.fn();

    const outcome = await startWalletTopup({
      amountRupees: 100,
      knownCreditedIds: new Set(),
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep,
      onPhase: (p) => phases.push(p),
      onPayments,
      onPoll
    });

    expect(outcome).toMatchObject({ status: 'credited', via: 'poll' });
    expect(phases).toContain('confirming');
    expect(apiClient.listPayments).toHaveBeenCalledTimes(2);
    expect(onPayments).toHaveBeenCalledTimes(2);
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("verify 'pending' with no credit after polling stays pending — never a fake success", async () => {
    const { FakeRazorpay } = makeRazorpayCtor('success');
    const apiClient = makeApiClient({
      verifyPayment: vi.fn(async () => ({ status: 'pending' })),
      listPayments: vi.fn(async () => ({ payments: [{ id: 'p1', status: 'created' }] }))
    });

    const outcome = await startWalletTopup({
      amountRupees: 100,
      knownCreditedIds: new Set(),
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });

    expect(outcome.status).toBe('pending');
    expect(apiClient.listPayments).toHaveBeenCalledTimes(4);
  });

  it('an unknown verify verdict is an honest error, not a success', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('success');
    const apiClient = makeApiClient({
      verifyPayment: vi.fn(async () => ({ status: 'mystery' }))
    });

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });
    expect(outcome).toMatchObject({ status: 'error', stage: 'verify' });
  });

  it('flags a non-test key as not test mode', async () => {
    const { FakeRazorpay } = makeRazorpayCtor('dismiss');
    const apiClient = makeApiClient({
      createPaymentOrder: vi.fn(async () => ({
        orderId: 'order_1',
        amountPaise: 10000,
        currency: 'INR',
        keyId: 'rzp_prod_abc'
      }))
    });

    const outcome = await startWalletTopup({
      amountRupees: 100,
      apiClient,
      loadCheckout: async () => FakeRazorpay,
      sleep: noSleep
    });
    expect(outcome.testMode).toBe(false);
  });
});

// --- WalletView with the payments flag ON (static render) --------------------------

describe('WalletView (features.payments on)', () => {
  const markup = renderToStaticMarkup(
    React.createElement(WalletView, {
      balance: 150,
      userId: 'user-1',
      displayName: 'Player One',
      onProfileUpdate: () => {}
    })
  );

  it('shows amount chips (50/100/200/500) as pressed-state buttons and a labelled custom amount', () => {
    for (const chip of ['₹50', '₹100', '₹200', '₹500']) {
      expect(markup).toContain(chip);
    }
    expect(markup).toContain('aria-pressed="true"'); // default ₹100 selected
    expect(markup).toContain('aria-label="Choose a top-up amount"');
    expect(markup).toContain('for="topup-amount"');
    expect(markup).toContain('id="topup-amount"');
    expect(markup).toContain('id="topup-amount-hint"');
    expect(markup).toContain('min="10"');
    expect(markup).toContain('max="5000"');
  });

  it('wires Add Money to Razorpay while Withdraw stays an honest disabled control', () => {
    expect(markup).toContain('aria-label="Add money with Razorpay"');
    expect(markup).toContain('Pay securely with Razorpay.');
    expect(markup).toContain('aria-label="Withdraw — coming soon"');
    expect(markup).not.toContain('Online payments are coming soon.');
  });

  it('renders the Payments history section (loading before effects run)', () => {
    expect(markup).toContain('aria-label="Payments"');
    expect(markup).toContain('Loading payments');
  });

  it('does not claim TEST MODE before the server returns a key id', () => {
    expect(markup).not.toContain('TEST MODE');
  });
});
