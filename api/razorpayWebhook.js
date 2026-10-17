// api/razorpayWebhook.js
//
// Razorpay webhook receiver (deposit events only). Called by Razorpay, so
// there is NO requireUser — the protection is the webhook signature over the
// RAW request body bytes.
//
//   POST /api/razorpayWebhook
//   headers: x-razorpay-signature (HMAC-SHA256 hex of the raw body with
//            RAZORPAY_WEBHOOK_SECRET), x-razorpay-event-id
//
// The body parser is disabled (config below) so the signature is verified
// against the exact bytes Razorpay signed, never a re-serialized JSON. The
// payload is parsed only AFTER the signature check.
//
// Balance is NEVER written here: a payment becomes balance only through the
// deployed, atomic, idempotent credit_payment() RPC (service_role only).
// Logs carry ids and RPC verdicts only — never secrets, signatures, card or
// contact data, and never a full webhook payload.

import crypto from 'node:crypto';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// Vercel Node runtime: keep the raw stream intact for signature verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function signatureIsValid(expectedHex, provided) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function handleCaptured(res, event, eventId) {
  const entity = event && event.payload && event.payload.payment && event.payload.payment.entity;
  const orderId = entity && entity.order_id;
  const paymentId = entity && entity.id;
  const amount = entity && entity.amount;
  const currency = entity && entity.currency;
  const usable = typeof orderId === 'string' && orderId
    && typeof paymentId === 'string' && paymentId
    && Number.isInteger(amount) && amount > 0
    && typeof currency === 'string' && currency;
  if (!usable) {
    // Unusable capture payload: 200 so Razorpay does not retry forever; ids only in logs.
    console.error('razorpayWebhook: payment.captured with unusable entity', paymentId || '(no payment id)');
    return res.status(200).json({ success: true, ignored: true });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('credit_payment', {
    p_provider_order_id: orderId,
    p_provider_payment_id: paymentId,
    p_amount_paise: amount,
    p_currency: currency,
    p_event_id: typeof eventId === 'string' && eventId ? eventId : null
  });

  if (error) {
    // DB/transport failure: 500 so Razorpay retries; credit_payment is
    // idempotent, so a retry can never double-credit.
    console.error('razorpayWebhook: credit_payment failed for', orderId, paymentId);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
  if (data && data.success) {
    // credited, or duplicate (already credited) — both are success.
    return res.status(200).json({ success: true });
  }
  // Rejections ('Unknown order', 'Amount mismatch', 'Currency mismatch',
  // 'Payment already used'): not fixable by retrying — 200 + loud server log
  // with ids only, so Razorpay does not retry forever.
  console.error('razorpayWebhook: credit rejected for', orderId, paymentId, data && data.error);
  return res.status(200).json({ success: true });
}

async function handleFailed(res, event) {
  const entity = event && event.payload && event.payload.payment && event.payload.payment.entity;
  const orderId = entity && entity.order_id;
  if (typeof orderId !== 'string' || !orderId) {
    return res.status(200).json({ success: true, ignored: true });
  }
  const reason = typeof entity.error_description === 'string'
    ? entity.error_description.slice(0, 200)
    : null;

  // Only a still-pending order moves to 'failed'. A credited payment is never
  // touched (the .eq('status', 'created') filter enforces that at the DB).
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('payments')
    .update({ status: 'failed', failure_reason: reason })
    .eq('provider_order_id', orderId)
    .eq('status', 'created');
  if (error) {
    console.error('razorpayWebhook: failed-payment status not updated for', orderId);
  }
  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (process.env.ENABLE_PAYMENTS !== 'true') {
      return res.status(503).json({ error: 'Payments are not enabled.' });
    }
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Payments are not enabled.' });
    }

    let raw;
    try {
      raw = await readRawBody(req);
    } catch {
      console.error('razorpayWebhook: could not read raw body');
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const signatureHeader = req.headers && req.headers['x-razorpay-signature'];
    const provided = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!signatureIsValid(expected, provided)) {
      return res.status(400).json({ error: 'Invalid signature.' });
    }

    // Parse only after the signature check.
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid payload.' });
    }

    const eventIdHeader = req.headers && req.headers['x-razorpay-event-id'];
    const eventId = Array.isArray(eventIdHeader) ? eventIdHeader[0] : eventIdHeader;
    const eventType = event && event.event;

    if (eventType === 'payment.captured') {
      return await handleCaptured(res, event, eventId);
    }
    if (eventType === 'payment.failed') {
      return await handleFailed(res, event);
    }
    // Any other event: accepted and ignored.
    return res.status(200).json({ success: true, ignored: true });
  } catch (err) {
    console.error('razorpayWebhook: unexpected failure:', err && err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
