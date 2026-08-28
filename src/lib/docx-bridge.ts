export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type NativeToWebMessage =
  | { type: 'LOAD_DOC'; base64: string }
  | { type: 'EXPORT_REQUEST' }
  | { type: 'SPELL_CHECK_REQUEST' }
  | { type: 'SET_THEME'; value: 'light' | 'dark' };

export type WebToNativeMessage =
  | { type: 'READY' }
  | { type: 'DIRTY'; value: boolean }
  | { type: 'SAVE_REQUEST'; base64: string; title?: string }
  | { type: 'SPELL_CHECK_RESULT'; fixed: number; remaining: number }
  | { type: 'ERROR'; message: string };

export function encodeNativeMessage(message: NativeToWebMessage): string {
  return JSON.stringify(message);
}

export function parseWebMessage(raw: string): WebToNativeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  const msg = parsed as Record<string, unknown>;
  switch (msg.type) {
    case 'READY':
      return { type: 'READY' };
    case 'DIRTY':
      return typeof msg.value === 'boolean' ? { type: 'DIRTY', value: msg.value } : null;
    case 'SAVE_REQUEST': {
      if (typeof msg.base64 !== 'string') return null;
      const title = typeof msg.title === 'string' ? msg.title : undefined;
      return title === undefined
        ? { type: 'SAVE_REQUEST', base64: msg.base64 }
        : { type: 'SAVE_REQUEST', base64: msg.base64, title };
    }
    case 'SPELL_CHECK_RESULT':
      return typeof msg.fixed === 'number' && typeof msg.remaining === 'number'
        ? { type: 'SPELL_CHECK_RESULT', fixed: msg.fixed, remaining: msg.remaining }
        : null;
    case 'ERROR':
      return typeof msg.message === 'string' ? { type: 'ERROR', message: msg.message } : null;
    default:
      return null;
  }
}