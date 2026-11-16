// Must be set before any Date use so local-time logic would differ from UTC.
process.env.TZ = 'America/Los_Angeles';

import { describe, it, expect } from 'vitest';
import {
  utcDateKey,
  isSameDeadlineDay,
  utcDayRange,
  filterGoalsByDeadlineDay,
} from '@/lib/deadlines';

describe('utcDateKey', () => {
  it('splits at UTC midnight', () => {
    expect(utcDateKey('2025-11-02T23:59:59Z')).toBe('2025-11-02');
    expect(utcDateKey('2025-11-03T00:00:00Z')).toBe('2025-11-03');
  });
  it('normalizes offsets to UTC', () => {
    expect(utcDateKey('2025-11-02T23:30:00-05:00')).toBe('2025-11-03');
  });
  it('accepts Date and bare date keys', () => {
    expect(utcDateKey(new Date('2025-11-03T00:00:00Z'))).toBe('2025-11-03');
    expect(utcDateKey('2025-11-03')).toBe('2025-11-03');
  });
  it('throws on invalid input', () => {
    expect(() => utcDateKey('nope')).toThrow(RangeError);
  });
  it('does not depend on local timezone', () => {
    expect(process.env.TZ).toBe('America/Los_Angeles');
    // Local getDate() here would be 2 in LA; UTC key must be 11-03.
    const d = new Date('2025-11-03T03:00:00Z');
    expect(d.getDate()).toBe(2);
    expect(utcDateKey(d)).toBe('2025-11-03');
  });
});

describe('isSameDeadlineDay', () => {
  it('compares UTC dates', () => {
    expect(isSameDeadlineDay('2025-11-02T23:59:59Z', '2025-11-03T00:00:00Z')).toBe(false);
    expect(isSameDeadlineDay('2025-11-02T23:30:00-05:00', '2025-11-03')).toBe(true);
  });
  it('is false for invalid input', () => {
    expect(isSameDeadlineDay('bad', 'bad')).toBe(false);
  });
});

describe('utcDayRange', () => {
  it('returns start inclusive / end exclusive', () => {
    expect(utcDayRange('2025-11-03')).toEqual({
      start: '2025-11-03T00:00:00.000Z',
      end: '2025-11-04T00:00:00.000Z',
    });
  });
  it('rolls over month ends', () => {
    expect(utcDayRange('2025-12-31').end).toBe('2026-01-01T00:00:00.000Z');
  });
  it('throws on malformed keys', () => {
    expect(() => utcDayRange('2025-11-3')).toThrow(RangeError);
    expect(() => utcDayRange('2025-13-40')).toThrow(RangeError);
  });
});

describe('filterGoalsByDeadlineDay', () => {
  const goals = [
    { id: 1, deadline: '2025-11-02T23:59:59Z' },
    { id: 2, deadline: '2025-11-03T00:00:00Z' },
    { id: 3, deadline: '2025-11-02T23:30:00-05:00' },
    { id: 4, deadline: 'garbage' },
  ];
  it('matches by UTC day', () => {
    expect(filterGoalsByDeadlineDay(goals, '2025-11-03').map(g => g.id)).toEqual([2, 3]);
    expect(filterGoalsByDeadlineDay(goals, '2025-11-02').map(g => g.id)).toEqual([1]);
  });
  it('returns [] for an invalid date key', () => {
    expect(filterGoalsByDeadlineDay(goals, 'bad')).toEqual([]);
  });
  it('local-time logic would disagree (guards against regression)', () => {
    const local = goals.filter(g => {
      const a = new Date(g.deadline);
      const b = new Date('2025-11-03');
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    });
    expect(local.map(g => g.id)).not.toEqual(
      filterGoalsByDeadlineDay(goals, '2025-11-03').map(g => g.id)
    );
  });
});
