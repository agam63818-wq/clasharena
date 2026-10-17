// api/payments.js
//
// Razorpay wallet top-up router (deposit only — no withdrawals, no payouts,
// no refunds in this release). One Vercel serverless function, POST with an
// `{ action }` envelope like api/admin.js:
//
//   POST /api/payments
//   body: { action: 'createOrder',  amountRupees }
//         { action: 'verify',       razorpay_order_id, razorpay_payment_id, razorpay_signature }
//         { action: 'listPayments' }
//
// Authorization (on EVERY action, before any DB/provider work):
//   requireUser(req) — the caller's identity comes ONLY from the Bearer token
//   (never from the body). The router answers 503 for every action while
//   ENABLE_PAYMENTS is not exactly 'true' (permanent rule 7: degrade honestly).
//
// MONEY (permanent rule 4): balance is NEVER written here. The only path a
// payment becomes balance is the deployed, atomic, idempotent
// credit_payment() RPC (service_role only). Amounts in paise come from
// Razorpay's own responses, never from the client. Secrets are never
// returned or logged — only ids.
//
// Response shapes:
//   createOrder  -> { orderId, amountPaise, currency: 'INR', keyId }
//   verify       -> { status: 'credited' | 'already_credited' | 'pending', balance? }
//   listPayments -> { payments: [{ id, amount_paise, status, created_at }] }
//   failure      -> { error: string } — safe messages only.

import crypto from 'node:crypto';
import { requireUser } from './_lib/auth.js';
import { HttpError, sendError } from './_lib/errors.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// Top-up bounds (whole rupees). The DB allows more, but this release caps a
// single top-up well below the payment table's limit.
const MIN_AMOUNT_RUPEES = 10;
const MAX_AMOUNT_RUPEES = 5000;
// Rate limit: at most this many 'created' orders per user inside the window.
const ORDER_RATE_LIMIT = 5;
const ORDER_RATE_WINDOW_MINUTES = 10;
const LIST_PAYMENTS_LIMIT = 20;
// Razorpay ids/signatures are short alphanumeric strings.
const PROVIDER_ID_RE = /^[A-Za-z0-9_]{1,64}$/;
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

function assertPaymentsEnabled() {
  if (process.env.ENABLE_PAYMENTS !== 'true') {
    throw new HttpError(503, 'Payments are not enabled.');
  }
}

function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpError(503, 'Payments are not enabled.');
  }
  return { keyId, keySecret };
}

// One Razorpay API call. Logs status codes only — never the key, the secret,
// or the Authorization header.
async function razorpayFetch(path, { method = 'GET', keyId, keySecret, body } = {}) {
  let res;
  try {
    res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    console.error(`razorpay: ${method} ${path} transport failed`);
    throw new HttpError(502, 'Payment gateway error. Please try again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    console.error(`razorpay: ${method} ${path} -> HTTP ${res.status}`);
    throw new HttpError(502, 'Payment gateway error. Please try again.');
  }
  return data;
}

async function readBalance(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data.balance;
}

async function createOrder(res, supabase, user, body) {
  const { keyId, keySecret } = razorpayCredentials();

  const amountRupees = body ? body.amountRupees : undefined;
  if (!Number.isInteger(amountRupees) || amountRupees < MIN_AMOUNT_RUPEES || amountRupees > MAX_AMOUNT_RUPEES) {
    throw new HttpError(
      400,
      `Amount must be a whole number between ${MIN_AMOUNT_RUPEES} and ${MAX_AMOUNT_RUPEES} rupees.`
    );
  }
  // body.user_id, body.amount_paise and body.currency are deliberately
  // ignored — identity comes from the token, paise/currency from Razorpay.

  const windowStart = new Date(Date.now() - ORDER_RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from('payments')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'created')
    .gte('created_at', windowStart);
  if (recentError) {
    console.error('payments: rate-limit check failed');
    throw new HttpError(503, 'Service temporarily unavailable. Please try again later.');
  }
  if (Array.isArray(recent) && recent.length >= ORDER_RATE_LIMIT) {
    throw new HttpError(429, 'Too many payment attempts. Please try again in a few minutes.');
  }

  const receipt = `cr_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  const order = await razorpayFetch('/orders', {
    method: 'POST',
    keyId,
    keySecret,
    body: {
      amount: amountRupees * 100,
      currency: 'INR',
      receipt,
      notes: { user_id: user.id }
    }
  });
  if (!order || typeof order.id !== 'string' || !order.id
      || !Number.isInteger(order.amount) || order.amount <= 0
      || order.currency !== 'INR') {
    throw new HttpError(502, 'Payment gateway error. Please try again.');
  }

  const { error: insertError } = await supabase.from('payments').insert([
    {
      user_id: user.id,
      provider: 'razorpay',
      provider_order_id: order.id,
      amount_paise: order.amount,
      currency: 'INR',
      status: 'created'
    }
  ]);
  if (insertError) {
    console.error('payments: order row not recorded for', order.id);
    throw new HttpError(502, 'Could not start the payment. Please try again.');
  }

  return res.status(200).json({
    orderId: order.id,
    amountPaise: order.amount,
    currency: 'INR',
    keyId
  });
}

async function verifyPayment(res, supabase, user, body) {
  const { keyId, keySecret } = razorpayCredentials();

  const orderId = body ? body.razorpay_order_id : undefined;
  const paymentId = body ? body.razorpay_payment_id : undefined;
  const signature = body ? body.razorpay_signature : undefined;
  const isValidId = (v) => typeof v === 'string' && v.length <= 64 && PROVIDER_ID_RE.test(v);
  if (!isValidId(orderId) || !isValidId(paymentId) || !isValidId(signature)) {
    throw new HttpError(400, 'Invalid payment confirmation.');
  }

  const { data: row, error: rowError } = await supabase
    .from('payments')
    .select('user_id, provider_order_id, amount_paise, currency, status')
    .eq('provider_order_id', orderId)
    .maybeSingle();
  if (rowError) {
    console.error('payments: order lookup failed for', orderId);
    throw new HttpError(503, 'Service temporarily unavailable. Please try again later.');
  }
  if (!row || row.user_id !== user.id) {
    // Another player's order is "not found" from here — never an authorization hint.
    throw new HttpError(404, 'Payment not found.');
  }

  if (row.status === 'credited') {
    return res.status(200).json({
      status: 'already_credited',
      balance: await readBalance(supabase, user.id)
    });
  }

  // Signature over `${order_id}|${payment_id}` with the KEY SECRET. A failure
  // here credits nothing.
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new HttpError(400, 'Payment verification failed.');
  }

  // Ask Razorpay — never trust the confirmation the browser relayed.
  const payment = await razorpayFetch(`/payments/${paymentId}`, { keyId, keySecret });
  if (!payment || typeof payment.status !== 'string') {
    throw new HttpError(502, 'Payment gateway error. Please try again.');
  }
  if (payment.status === 'authorized') {
    // Money reserved but not captured yet: honest "pending", nothing credited.
    return res.status(200).json({ status: 'pending' });
  }
  if (payment.status !== 'captured'
      || payment.order_id !== orderId
      || payment.amount !== row.amount_paise
      || payment.currency !== row.currency) {
    console.error('payments: verify mismatch for', orderId, paymentId, 'status', payment.status);
    throw new HttpError(409, 'Payment details could not be confirmed. Contact support if money was deducted.');
  }

  const { data: verdict, error: rpcError } = await supabase.rpc('credit_payment', {
    p_provider_order_id: orderId,
    p_provider_payment_id: payment.id,
    p_amount_paise: payment.amount,
    p_currency: payment.currency,
    p_event_id: `verify:${payment.id}`
  });
  if (rpcError) {
    console.error('payments: credit_payment failed for', orderId, paymentId);
    throw new HttpError(503, 'Could not credit the wallet. Please try again shortly.');
  }
  let status;
  if (verdict && verdict.success && verdict.credited) {
    status = 'credited';
  } else if (verdict && verdict.success && verdict.duplicate) {
    status = 'already_credited';
  } else {
    console.error('payments: credit rejected for', orderId, paymentId, verdict && verdict.error);
    throw new HttpError(409, 'Payment details could not be confirmed. Contact support if money was deducted.');
  }

  return res.status(200).json({
    status,
    balance: await readBalance(supabase, user.id)
  });
}

async function listPayments(res, supabase, user) {
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount_paise, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(LIST_PAYMENTS_LIMIT);
  if (error) {
    console.error('payments: list failed for', user.id);
    throw new HttpError(503, 'Service temporarily unavailable. Please try again later.');
  }
  return res.status(200).json({ payments: data || [] });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Method not allowed.');
    }
    assertPaymentsEnabled();
    const user = await requireUser(req);
    const supabase = getSupabaseAdmin();

    const action = req.body ? req.body.action : undefined;
    if (action === 'createOrder') return await createOrder(res, supabase, user, req.body);
    if (action === 'verify') return await verifyPayment(res, supabase, user, req.body);
    if (action === 'listPayments') return await listPayments(res, supabase, user);
    throw new HttpError(400, 'Unknown action.');
  } catch (err) {
    sendError(res, err);
  }
}
