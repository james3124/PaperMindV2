export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type NativeToWebMessage =
  | { type: 'LOAD_DOC'; base64: string }
  | { type: 'EXPORT_REQUEST' };

export type WebToNativeMessage =
  | { type: 'READY' }
  | { type: 'DIRTY'; value: boolean }
  | { type: 'SAVE_REQUEST'; base64: string };

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
    case 'SAVE_REQUEST':
      return typeof msg.base64 === 'string' ? { type: 'SAVE_REQUEST', base64: msg.base64 } : null;
    default:
      return null;
  }
}
