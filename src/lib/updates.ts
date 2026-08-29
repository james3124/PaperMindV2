import { GITHUB_RELEASES_LATEST_URL } from './config';

export type UpdateInfo = {
  version: string;
  url: string;
};

/** True when `candidate` is a higher dotted-numeric version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Latest release info, or null when offline / malformed. Never throws. */
export async function fetchLatestRelease(signal?: AbortSignal): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
      assets?: { name?: unknown; browser_download_url?: unknown }[];
    };
    if (typeof data.tag_name !== 'string') return null;
    const version = data.tag_name.replace(/^v/, '');
    const apk = data.assets?.find(
      (asset) =>
        asset.name === 'PaperMind.apk' && typeof asset.browser_download_url === 'string',
    );
    const url =
      typeof apk?.browser_download_url === 'string'
        ? apk.browser_download_url
        : typeof data.html_url === 'string'
          ? data.html_url
          : null;
    if (!url) return null;
    return { version, url };
  } catch {
    return null;
  }
}
