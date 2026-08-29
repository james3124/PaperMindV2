import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchLatestRelease, isNewerVersion } from './updates';

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

function mockFetch(response: { ok: boolean; status?: number; json?: unknown }) {
  const spy = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 404),
    json: async () => response.json,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchLatestRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the PaperMind.apk asset url', async () => {
    mockFetch({
      ok: true,
      json: {
        tag_name: 'v1.0.9',
        html_url: 'https://github.com/x/releases/tag/v1.0.9',
        assets: [
          { name: 'other.bin', browser_download_url: 'https://example.com/other.bin' },
          { name: 'PaperMind.apk', browser_download_url: 'https://example.com/pm.apk' },
        ],
      },
    });
    await expect(fetchLatestRelease()).resolves.toEqual({
      version: '1.0.9',
      url: 'https://example.com/pm.apk',
    });
  });

  it('falls back to the release page when no APK asset exists', async () => {
    mockFetch({
      ok: true,
      json: { tag_name: 'v1.0.9', html_url: 'https://example.com/release', assets: [] },
    });
    await expect(fetchLatestRelease()).resolves.toEqual({
      version: '1.0.9',
      url: 'https://example.com/release',
    });
  });

  it('returns null on non-ok responses', async () => {
    mockFetch({ ok: false });
    await expect(fetchLatestRelease()).resolves.toBeNull();
  });

  it('returns null on malformed payloads', async () => {
    mockFetch({ ok: true, json: { message: 'not a release' } });
    await expect(fetchLatestRelease()).resolves.toBeNull();
  });

  it('returns null when fetch rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLatestRelease()).resolves.toBeNull();
  });
});
