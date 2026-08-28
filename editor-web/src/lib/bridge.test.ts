import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64, looksLikeDocx, parseNativeMessage } from './bridge';

describe('base64 codecs', () => {
  it('round-trips bytes of all 256 values', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('round-trips an empty payload', () => {
    const empty = new Uint8Array(0);
    expect(base64ToBytes(bytesToBase64(empty))).toEqual(empty);
  });

  it('handles a multi-chunk (~1.25 MB) buffer', () => {
    const bytes = new Uint8Array(1_250_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  }, 30000);

  it('decodes URL-safe base64', () => {
    // Standard '+/' pair in URL-safe form is '-_'.
    const standard = base64ToBytes('+/8=');
    const urlSafe = base64ToBytes('-_8=');
    expect(urlSafe).toEqual(standard);
  });
});

describe('parseNativeMessage', () => {
  it('accepts LOAD_DOC with a valid base64 string', () => {
    expect(parseNativeMessage('{"type":"LOAD_DOC","base64":"aGk="}')).toEqual({
      type: 'LOAD_DOC',
      base64: 'aGk=',
    });
  });

  it('accepts EXPORT_REQUEST', () => {
    expect(parseNativeMessage('{"type":"EXPORT_REQUEST"}')).toEqual({ type: 'EXPORT_REQUEST' });
  });

  it('accepts SET_THEME with a valid value', () => {
    expect(parseNativeMessage('{"type":"SET_THEME","value":"dark"}')).toEqual({
      type: 'SET_THEME',
      value: 'dark',
    });
    expect(parseNativeMessage('{"type":"SET_THEME","value":"light"}')).toEqual({
      type: 'SET_THEME',
      value: 'light',
    });
  });

  it('rejects malformed JSON, unknown types, and invalid base64', () => {
    expect(parseNativeMessage('not json')).toBeNull();
    expect(parseNativeMessage(42)).toBeNull();
    expect(parseNativeMessage('{"type":"NOPE"}')).toBeNull();
    expect(parseNativeMessage('{"type":"LOAD_DOC","base64":"!!!"}')).toBeNull();
    expect(parseNativeMessage('{"type":"LOAD_DOC"}')).toBeNull();
    expect(parseNativeMessage('{"type":"SET_THEME","value":"blue"}')).toBeNull();
  });
});

describe('looksLikeDocx', () => {
  function base64Of(bytes: Uint8Array): string {
    return bytesToBase64(bytes);
  }

  it('accepts a ZIP-shaped payload', () => {
    const bytes = new Uint8Array(200);
    bytes[0] = 0x50; // 'P'
    bytes[1] = 0x4b; // 'K'
    expect(looksLikeDocx(base64Of(bytes))).toBe(true);
  });

  it('rejects non-ZIP payloads, tiny payloads, and invalid base64', () => {
    const notZip = new Uint8Array(200);
    expect(looksLikeDocx(base64Of(notZip))).toBe(false);

    const tiny = new Uint8Array(10);
    tiny[0] = 0x50;
    tiny[1] = 0x4b;
    expect(looksLikeDocx(base64Of(tiny))).toBe(false);

    expect(looksLikeDocx('!!!')).toBe(false);
  });
});
