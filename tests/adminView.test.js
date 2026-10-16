import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/apiClient', () => ({ api: {} }));

import {
  applyDateTimeDraftUpdate,
  emptyDateTimeParts,
  getDateTimeParts,
  parsePrize
} from '../src/pages/AdminView.jsx';

describe('admin tournament form helpers', () => {
  it('parses a saved formatted prize into a number for the edit form', () => {
    expect(parsePrize('₹1,20,000.50')).toBe(120000.5);
    expect(parsePrize('Prize: 750')).toBe(750);
    expect(parsePrize(2500)).toBe(2500);
    expect(parsePrize('not a number')).toBe(0);
  });

  it('keeps a locally selected time without emitting an ISO value until a date is selected', () => {
    const hourDraft = applyDateTimeDraftUpdate(emptyDateTimeParts(), { hour: '9' });
    const minuteDraft = applyDateTimeDraftUpdate(hourDraft.nextParts, { minute: '05' });
    const periodDraft = applyDateTimeDraftUpdate(minuteDraft.nextParts, { period: 'PM' });

    expect(periodDraft.nextParts).toEqual({ date: '', hour: '9', minute: '05', period: 'PM' });
    expect(hourDraft.emittedValue).toBeNull();
    expect(minuteDraft.emittedValue).toBeNull();
    expect(periodDraft.emittedValue).toBeNull();

    const datedDraft = applyDateTimeDraftUpdate(periodDraft.nextParts, { date: '2030-05-15' });
    const emitted = new Date(datedDraft.emittedValue);
    expect(emitted.getFullYear()).toBe(2030);
    expect(emitted.getMonth()).toBe(4);
    expect(emitted.getDate()).toBe(15);
    expect(emitted.getHours()).toBe(21);
    expect(emitted.getMinutes()).toBe(5);
  });

  it('loads the local date and AM/PM controls for an existing saved time', () => {
    const saved = new Date(2030, 4, 15, 21, 7, 0, 0).toISOString();
    expect(getDateTimeParts(saved)).toEqual({
      date: '2030-05-15',
      hour: '9',
      minute: '07',
      period: 'PM'
    });
  });
});
