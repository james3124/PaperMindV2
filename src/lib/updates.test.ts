import { describe, expect, it } from 'vitest';

import { isNewerVersion } from './updates';

describe('isNewerVersion', () => {
  it('detects newer patch versions', () => {
    expect(isNewerVersion('1.0.5', '1.0.4')).toBe(true);
  });

  it('compares numerically, not lexically', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false);
  });

  it('returns false for equal versions', () => {
    expect(isNewerVersion('1.0.4', '1.0.4')).toBe(false);
  });

  it('handles differing segment counts', () => {
    expect(isNewerVersion('1.1', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0')).toBe(true);
  });

  it('handles major and minor bumps', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true);
  });
});
