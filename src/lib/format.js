// src/lib/format.js
// Shared display formatters. INR currency + local time, consistent across
// every screen.

export function formatINR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function formatDateTime(value, fallback = 'TBA') {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
