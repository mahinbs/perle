import { describe, it, expect } from 'vitest';
import { normalizeInlineAnswerStructure } from '../normalizeAnswerStructure';

describe('normalizeInlineAnswerStructure', () => {
  it('splits inline bullets after sentence end', () => {
    const input =
      'First point done.• Second bullet here.• Third bullet with detail.';
    const out = normalizeInlineAnswerStructure(input);
    expect(out).toContain('First point done.\n• Second bullet');
    expect(out).toContain('\n• Third bullet');
  });

  it('splits heading colon from first bullet', () => {
    const input = '📰 Economy & Growth Outlook:• RBI held rates steady.• GDP forecast revised.';
    const out = normalizeInlineAnswerStructure(input);
    expect(out).toMatch(/Outlook:\n• RBI/);
  });

  it('splits emoji section mid-paragraph', () => {
    const input =
      'Updates ended.📰 Economy, RBI Policy & Growth Outlook:\n• First item';
    const out = normalizeInlineAnswerStructure(input);
    expect(out).toContain('ended.\n📰 Economy');
  });

  it('preserves markdown tables', () => {
    const input = `Intro here.

| Name | Brand |
|------|-------|
| Chip A | Co 1 |

Done.• Bullet after table`;
    const out = normalizeInlineAnswerStructure(input);
    expect(out).toContain('| Name | Brand |');
    expect(out).toContain('Done.\n• Bullet after table');
  });
});
