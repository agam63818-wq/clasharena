import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/apiClient', () => ({ api: {} }));

import { parsePrize } from '../src/pages/AdminView.jsx';

describe('admin tournament form helpers', () => {
  it('parses a saved formatted prize into a number for the edit form', () => {
    expect(parsePrize('₹1,20,000.50')).toBe(120000.5);
    expect(parsePrize('Prize: 750')).toBe(750);
    expect(parsePrize(2500)).toBe(2500);
    expect(parsePrize('not a number')).toBe(0);
  });
});
