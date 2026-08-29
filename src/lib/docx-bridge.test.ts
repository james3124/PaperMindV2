import { describe, expect, it } from 'vitest';

import { encodeNativeMessage, parseWebMessage } from './docx-bridge';

describe('parseWebMessage', () => {
  it('accepts READY', () => {
    expect(parseWebMessage('{"type":"READY"}')).toEqual({ type: 'READY' });
  });

  it('accepts DIRTY with a boolean value', () => {
    expect(parseWebMessage('{"type":"DIRTY","value":true}')).toEqual({
      type: 'DIRTY',
      value: true,
    });
    expect(parseWebMessage('{"type":"DIRTY","value":"yes"}')).toBeNull();
  });

  it('accepts SAVE_REQUEST with base64', () => {
    expect(parseWebMessage('{"type":"SAVE_REQUEST","base64":"aGk="}')).toEqual({
      type: 'SAVE_REQUEST',
      base64: 'aGk=',
    });
    expect(parseWebMessage('{"type":"SAVE_REQUEST"}')).toBeNull();
  });

  it('accepts ERROR with a message', () => {
    expect(parseWebMessage('{"type":"ERROR","message":"not-a-docx"}')).toEqual({
      type: 'ERROR',
      message: 'not-a-docx',
      fatal: true,
    });
    expect(
      parseWebMessage('{"type":"ERROR","message":"ResizeObserver loop","fatal":false}'),
    ).toEqual({ type: 'ERROR', message: 'ResizeObserver loop', fatal: false });
    expect(parseWebMessage('{"type":"ERROR"}')).toBeNull();
  });

  it('rejects malformed JSON and unknown types', () => {
    expect(parseWebMessage('not json')).toBeNull();
    expect(parseWebMessage('{"type":"NOPE"}')).toBeNull();
    expect(parseWebMessage('{}')).toBeNull();
  });
});

describe('encodeNativeMessage', () => {
  it('produces JSON that round-trips through JSON.parse', () => {
    const encoded = encodeNativeMessage({ type: 'SET_THEME', value: 'dark' });
    expect(JSON.parse(encoded)).toEqual({ type: 'SET_THEME', value: 'dark' });
  });
});
