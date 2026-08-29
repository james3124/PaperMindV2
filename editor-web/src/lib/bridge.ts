export type NativeToWebMessage =
  | { type: 'LOAD_DOC'; base64: string }
  | { type: 'EXPORT_REQUEST' }
  | { type: 'SPELL_CHECK_REQUEST' }
  | { type: 'SET_THEME'; value: 'light' | 'dark' };

export type WebToNativeMessage =
  | { type: 'READY' }
  | { type: 'DIRTY'; value: boolean }
  | { type: 'SAVE_REQUEST'; base64: string }
  | { type: 'SPELL_CHECK_RESULT'; fixed: number; remaining: number }
  | { type: 'ERROR'; message: string; fatal: boolean };

export function postToNative(message: WebToNativeMessage): void {
  const bridge = (globalThis as unknown as {
    ReactNativeWebView?: { postMessage(data: string): void };
  }).ReactNativeWebView;
  if (bridge) {
    bridge.postMessage(JSON.stringify(message));
  } else {
    // Browser dev fallback (vite dev / smoke testing without the host app).
    console.log('[docx-bridge]', message);
  }
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Accepts standard, URL-safe, and line-wrapped (Android Base64.DEFAULT) payloads. */
function normalizeBase64(base64: string): string {
  return base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
}

export function parseNativeMessage(raw: unknown): NativeToWebMessage | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  const msg = parsed as Record<string, unknown>;
  if (msg.type === 'LOAD_DOC' && typeof msg.base64 === 'string') {
    const compact = normalizeBase64(msg.base64);
    if (BASE64_RE.test(compact)) return { type: 'LOAD_DOC', base64: compact };
    return null;
  }
  if (msg.type === 'EXPORT_REQUEST') return { type: 'EXPORT_REQUEST' };
  if (msg.type === 'SPELL_CHECK_REQUEST') return { type: 'SPELL_CHECK_REQUEST' };
  if (msg.type === 'SET_THEME' && (msg.value === 'light' || msg.value === 'dark')) {
    return { type: 'SET_THEME', value: msg.value };
  }
  return null;
}

/** Base64 -> Uint8Array. Handles standard, URL-safe, and line-wrapped alphabets. */
export function base64ToBytes(base64: string): Uint8Array {
  const normalized = normalizeBase64(base64);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uint8Array -> base64, chunked to avoid call-stack limits on large documents. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * A docx is an OPC package: a ZIP whose first entry is `[Content_Types].xml`.
 * Checked on the base64 text ("UEsD" = PK\x03\x04) to avoid decoding the whole
 * payload just to inspect three magic bytes.
 */
export function looksLikeDocx(base64: string): boolean {
  const compact = normalizeBase64(base64);
  return compact.length > 134 && compact.startsWith('UEsD');
}