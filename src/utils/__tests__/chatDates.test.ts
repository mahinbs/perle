import { describe, it, expect } from 'vitest';
import {
  getChatDayDiff,
  getChatDateLabel,
  formatChatMessageTime,
  isDifferentChatDay,
} from '../chatDates';

describe('chatDates (IST)', () => {
  const now = new Date('2026-06-23T12:00:00+05:30');

  it('labels today and yesterday', () => {
    const todayMsg = new Date('2026-06-23T16:25:00+05:30');
    const yesterdayMsg = new Date('2026-06-22T13:57:00+05:30');
    expect(getChatDateLabel(todayMsg, now)).toBe('Today');
    expect(getChatDateLabel(yesterdayMsg, now)).toBe('Yesterday');
    expect(formatChatMessageTime(todayMsg, now)).toMatch(/pm/i);
    expect(formatChatMessageTime(yesterdayMsg, now)).toBe('Yesterday');
  });

  it('shows relative days for older messages', () => {
    const twoDays = new Date('2026-06-21T10:00:00+05:30');
    expect(getChatDayDiff(twoDays, now)).toBe(2);
    expect(formatChatMessageTime(twoDays, now)).toBe('2 days ago');
    expect(getChatDateLabel(twoDays, now)).toContain('June');
  });

  it('detects different calendar days in IST', () => {
    const a = new Date('2026-06-23T00:30:00+05:30');
    const b = new Date('2026-06-22T23:30:00+05:30');
    expect(isDifferentChatDay(a, b)).toBe(true);
  });
});
