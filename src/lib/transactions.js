// src/lib/transactions.js
// INTERIM sign convention for transaction history.
//
// Why this file exists: `transactions.amount` is currently stored UNSIGNED for
// joins (api/joinTournament.js and join_tournament() write the fee positive),
// while a debit should read as "−" to the user. The wallet therefore derives
// the sign from the row's `type` instead of from the number, which is the
// honest representation of what the code knows today.
//
// PROPER CONVENTION (documented for the DB phase — docs/DB_REQUIREMENTS.md §5):
//   signed amounts, negative = money leaving the user's wallet
//     join     -> -entry_fee
//     withdraw -> -amount
//     deposit  -> +amount
//     refund   -> +amount
//     prize    -> +amount
// Once every writer stores signed values (and historical join rows are
// migrated), `txSign()` can be replaced by `Math.sign(amount)` — the UI reads
// the type map so it works BEFORE and AFTER that migration, and the map and
// `Math.sign` agree for the signed convention too.

export const TX_SIGN_BY_TYPE = {
  join: -1,
  withdraw: -1,
  deposit: 1,
  refund: 1,
  prize: 1
};

// 1 = credit (+), -1 = debit (−), 0 = nothing to show (missing row, zero or
// unparseable amount).
// A known type wins over the stored number (joins are stored positive today);
// unknown types fall back to the sign of the number, which is the right answer
// once signed amounts are the rule.
export function txSign(tx) {
  if (!tx) return 0;
  const amount = Number(tx.amount);

  const byType = TX_SIGN_BY_TYPE[tx.type];
  if (byType) return amount === 0 ? 0 : byType;

  if (!Number.isFinite(amount) || amount === 0) return 0;
  return amount < 0 ? -1 : 1;
}

// Absolute value to render next to the sign (never a negative "−₹-100").
export function txAmount(tx) {
  const amount = Number(tx && tx.amount);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

// --- pagination ------------------------------------------------------------
export const TRANSACTIONS_PER_PAGE = 10;

export function totalPages(total, perPage = TRANSACTIONS_PER_PAGE) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (perPage <= 0) return 1;
  return Math.max(1, Math.ceil(n / perPage));
}

// 0-based page + perPage -> the inclusive range PostgREST expects.
export function pageRange(page, perPage = TRANSACTIONS_PER_PAGE) {
  const safePage = Math.max(0, Math.floor(Number(page) || 0));
  const from = safePage * perPage;
  return { from, to: from + perPage - 1 };
}
