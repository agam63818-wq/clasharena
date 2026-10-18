// tests/walletPaymentsOff.test.jsx
// With VITE_FEATURE_PAYMENTS unset (the real src/config/features.js default),
// the wallet must keep today's honest "coming soon" state: no top-up controls,
// no Payments section, disabled buttons (R2 requirement, permanent rule 4/7).

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient', () => ({ default: { auth: {} } }));
vi.mock('../src/lib/apiClient', () => ({
  api: {},
  ApiError: class ApiError extends Error {}
}));
// The real Modal portal-renders into document.body, absent in node tests.
vi.mock('../src/components/Modal', () => ({
  default: ({ open, children }) => (open ? children : null)
}));

import { WalletView } from '../src/App.jsx';
import { features } from '../src/config/features.js';

describe('WalletView (features.payments off — default)', () => {
  it('the client flag really is off in the test environment', () => {
    expect(features.payments).toBe(false);
  });

  it("keeps today's honest message and renders no Razorpay UI", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WalletView, {
        balance: 0,
        userId: 'user-1',
        displayName: 'Player One',
        onProfileUpdate: () => {}
      })
    );

    expect(markup).toContain('Online payments are coming soon. Buttons are disabled until then.');
    expect(markup).toContain('aria-label="Add money — coming soon"');
    expect(markup).not.toContain('topup-amount');
    expect(markup).not.toContain('aria-label="Payments"');
    expect(markup).not.toContain('Razorpay');
    expect(markup).not.toContain('TEST MODE');
  });
});
