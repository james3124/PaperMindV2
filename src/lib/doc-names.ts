export const DOCX_EXT = '.docx';
export const BLANK_BASE = 'Untitled';

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
const CONTROL_AND_BIDI_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f]/g;

/**
 * Turns arbitrary user input into a safe file-name base (no extension,
 * no path-hostile characters, never empty). NFC-normalized so "café" in
 * two Unicode encodings cannot produce two visually identical files.
 */
export function sanitizeBaseName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(CONTROL_AND_BIDI_CHARS, '')
    .trim()
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const withoutExt = cleaned.toLowerCase().endsWith(DOCX_EXT)
    ? cleaned.slice(0, -DOCX_EXT.length)
    : cleaned.replace(/\.[^.]+$/, '');
  return (withoutExt || BLANK_BASE).trim();
}

/**
 * "Report.docx", then "Report 2.docx", "Report 3.docx", …
 * `taken` must contain lower-cased file names.
 */
export function uniqueName(base: string, ext: string, taken: Set<string>): string {
  const normalize = (n: string) => n.toLowerCase();
  if (!taken.has(normalize(`${base}${ext}`))) return `${base}${ext}`;
  let i = 2;
  while (taken.has(normalize(`${base} ${i}${ext}`))) i += 1;
  return `${base} ${i}${ext}`;
}

export function formatRelativeDate(ms: number): string {
  if (!ms) return '';
  const now = Date.now();
  const diff = now - ms;
  const day = 86_400_000;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = diff < 7 * day
    ? { weekday: 'short' }
    : { month: 'short', day: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
