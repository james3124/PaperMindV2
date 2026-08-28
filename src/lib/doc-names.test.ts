import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLANK_BASE,
  DOCX_EXT,
  formatRelativeDate,
  formatSize,
  sanitizeBaseName,
  uniqueName,
} from './doc-names';

describe('sanitizeBaseName', () => {
  it('trims and strips path-hostile characters', () => {
    expect(sanitizeBaseName('  My: Report?  ')).toBe('My Report');
  });

  it('strips a trailing .docx extension (case-insensitive)', () => {
    expect(sanitizeBaseName('Report.docx')).toBe('Report');
    expect(sanitizeBaseName('Report.DOCX')).toBe('Report');
  });

  it('strips other extensions', () => {
    expect(sanitizeBaseName('notes.txt')).toBe('notes');
  });

  it('falls back to the blank base when nothing remains', () => {
    expect(sanitizeBaseName('')).toBe(BLANK_BASE);
    expect(sanitizeBaseName('???')).toBe(BLANK_BASE);
    expect(sanitizeBaseName('.docx')).toBe(BLANK_BASE);
  });
});

describe('uniqueName', () => {
  it('returns the name unchanged when free', () => {
    expect(uniqueName('Report', DOCX_EXT, new Set())).toBe('Report.docx');
  });

  it('appends a counter on collision', () => {
    const taken = new Set(['report.docx']);
    expect(uniqueName('Report', DOCX_EXT, taken)).toBe('Report 2.docx');
  });

  it('skips counters that are also taken', () => {
    const taken = new Set(['report.docx', 'report 2.docx', 'report 3.docx']);
    expect(uniqueName('Report', DOCX_EXT, taken)).toBe('Report 4.docx');
  });

  it('compares case-insensitively', () => {
    const taken = new Set(['report.docx']);
    expect(uniqueName('REPORT', DOCX_EXT, taken)).toBe('REPORT 2.docx');
  });
});

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty for a missing timestamp', () => {
    expect(formatRelativeDate(0)).toBe('');
  });

  it('buckets by age', () => {
    const now = Date.now();
    expect(formatRelativeDate(now - 30_000)).toBe('just now');
    expect(formatRelativeDate(now - 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeDate(now - 3 * 3_600_000)).toBe('3h ago');
  });

  it('renders a locale date for older documents', () => {
    const old = Date.now() - 30 * 86_400_000;
    expect(formatRelativeDate(old).length).toBeGreaterThan(0);
  });
});

describe('formatSize', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(formatSize(0)).toBe('0 KB');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(2_621_440)).toBe('2.5 MB');
  });
});
