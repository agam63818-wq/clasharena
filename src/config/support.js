// src/config/support.js
// Public support contact, read from VITE_ env vars.
//
// ⚠️ VITE_ values are PUBLIC: they are inlined into the JavaScript bundle every
// visitor downloads. The WhatsApp number and UPI ID below are DISPLAY-ONLY:
//   - the UPI ID is shown so a user can pay the operator's own UPI address and
//     quote a reference; it is NEVER used to verify a payment. Verification is
//     a human decision made by an admin through the wallet-request queue
//     (docs/DB_REQUIREMENTS.md §3.4), and only the approve RPC moves money.
//   - nothing here is a secret and nothing here is trusted server-side.
//
// Unset vars render as an honest "not configured yet" line — never a made-up
// number (permanent rule 4).

const env = import.meta.env || {};

const clean = (value) => {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === '' ? null : v;
};

export const support = {
  whatsapp: clean(env.VITE_SUPPORT_WHATSAPP),
  upi: clean(env.VITE_SUPPORT_UPI)
};

export const supportConfigured = Boolean(support.whatsapp || support.upi);

// wa.me needs digits only (no +, spaces or dashes).
export function whatsappLink(number, text = '') {
  const digits = String(number || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}
