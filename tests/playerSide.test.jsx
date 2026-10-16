// tests/playerSide.test.jsx
// Player-side helpers keep navigation and profile-prefill behavior testable in
// Vitest's node environment without introducing a browser-only test harness.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabaseClient', () => ({ default: { auth: {} } }));
vi.mock('../src/lib/apiClient', () => ({
  api: {},
  ApiError: class ApiError extends Error {}
}));

import {
  PLAYER_PROFILE_COLUMNS,
  getJoinPrefill,
  getTournamentForMyMatch,
  selectMyMatchTournament,
  MyMatchCard
} from '../src/App.jsx';

const tournament = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Friday Clash',
  prize: 1000,
  entry_fee: 50,
  current_players: 5,
  max_players: 48,
  status: 'registration',
  match_time: '2026-10-20T13:00:00.000Z'
};

describe('player match details', () => {
  it('keeps phone fields out of ordinary player-facing profile data', () => {
    expect(PLAYER_PROFILE_COLUMNS).not.toMatch(/phone/i);
  });

  it('prefills the join form from the latest saved Free Fire UID and nickname', () => {
    expect(getJoinPrefill({ ff_id: ' 123456789 ', nickname: ' ShadowSlayer ' })).toEqual({
      ff_uid: '123456789',
      ign: 'ShadowSlayer',
      hasSavedGameDetails: true
    });
    expect(getJoinPrefill({ ff_id: '123456789', nickname: null })).toEqual({
      ff_uid: '123456789',
      ign: '',
      hasSavedGameDetails: false
    });
  });

  it('selects a My Matches tournament for detail navigation, including an ID-only registration', () => {
    const onSelect = vi.fn();
    const registration = { id: 'registration-1', tournament_id: tournament.id, tournaments: tournament };

    const selected = selectMyMatchTournament(registration, onSelect);
    expect(selected).toBe(tournament);
    expect(onSelect).toHaveBeenCalledWith(tournament);

    expect(getTournamentForMyMatch({ tournament_id: tournament.id, tournaments: null })).toEqual({ id: tournament.id });
  });

  it('renders each My Match as a native labeled button with the card focus class', () => {
    const markup = renderToStaticMarkup(
      React.createElement(MyMatchCard, { registration: { id: 'registration-1', tournaments: tournament }, onSelect: vi.fn() })
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('class="t-card"');
    expect(markup).toContain('aria-label="Open details for Friday Clash"');
    expect(markup).not.toContain('<article');
  });
});
