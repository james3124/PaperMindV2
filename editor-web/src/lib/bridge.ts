export type NativeToWebMessage =
  | { type: 'LOAD_DOC'; base64: string }
  | { type: 'EXPORT_REQUEST' }
  | { type: 'SET_THEME'; value: 'light' | 'dark' };

export type WebToNativeMessage =
  | { type: 'READY' }
  | { type: 'DIRTY'; value: boolean }
  | { type: 'SAVE_REQUEST'; base64: string; title?: string }
  | { type: 'ERROR'; message: string };

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
  if (msg.type === 'LOAD_DOC' && typeof msg.base64 === 'string' && BASE64_RE.test(msg.base64)) {
    return { type: 'LOAD_DOC', base64: msg.base64 };
  }
  if (msg.type === 'EXPORT_REQUEST') return { type: 'EXPORT_REQUEST' };
  if (msg.type === 'SET_THEME' && (msg.value === 'light' || msg.value === 'dark')) {
    return { type: 'SET_THEME', value: msg.value };
  }
  return null;
}

/** Base64 -> Uint8Array. Handles both standard and URL-safe alphabets. */
export function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
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

/** A docx is an OPC package: a ZIP whose first entry is `[Content_Types].xml`. */
export function looksLikeDocx(base64: string): boolean {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return false;
  }
  return bytes.length > 100 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}