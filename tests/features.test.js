// tests/features.test.js
// Permanent rule 7: feature flags must default to the safe value — a flag is
// ON only when its backend demonstrably exists.

import { describe, it, expect } from 'vitest';
import { features } from '../src/config/features.js';

describe('src/config/features.js — safe defaults', () => {
  it('walletTransactions defaults ON (feature runs against the existing transactions table)', () => {
    expect(features.walletTransactions).toBe(true);
  });

  it('payments defaults OFF — Razorpay top-up stays off until the owner enables both flags (rule 4/7)', () => {
    expect(features.payments).toBe(false);
  });

  it('roomDetailsRpc defaults OFF — get_room_details() is not applied yet (DB phase)', () => {
    expect(features.roomDetailsRpc).toBe(false);
  });

  it('walletRequests defaults OFF — wallet_requests table + RPCs are not applied yet (DB phase)', () => {
    expect(features.walletRequests).toBe(false);
  });

  it('tournamentResults defaults ON because the deployed results table is available', () => {
    expect(features.tournamentResults).toBe(true);
  });
});
