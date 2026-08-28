import { describe, expect, it } from 'vitest';

import { extractDocumentText, findMisspellings } from './spellcheck';

function docxWithText(text: string): Uint8Array {
  // Build a minimal docx (zip) in-memory is heavy; instead test the XML
  // extraction via a stored-entry zip produced by the same code path the
  // editor exports. For unit purposes we craft the zip manually.
  const xml =
    '<?xml version="1.0"?><w:document><w:body>' +
    `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` +
    '</w:body></w:document>';
  return makeZip('word/document.xml', xml);
}

/** Minimal ZIP (stored, no compression) writer for tests. */
function makeZip(entryName: string, content: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(entryName);
  const data = new TextEncoder().encode(content);
  const crc = crc32(data);

  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(6, 0, true);
  lv.setUint16(8, 0, true); // stored
  lv.setUint16(10, 0, true);
  lv.setUint16(12, 0, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, nameBytes.length, true);
  lv.setUint16(28, 0, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(8, 0, true);
  cv.setUint16(10, 0, true);
  cv.setUint16(12, 0, true);
  cv.setUint16(14, 0, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('extractDocumentText', () => {
  it('extracts paragraph text and decodes entities', () => {
    const text = extractDocumentText(docxWithText('Hello &amp; welcome'));
    expect(text).toBe('Hello & welcome');
  });

  it('returns empty for non-zip input', () => {
    expect(extractDocumentText(new Uint8Array([1, 2, 3]))).toBe('');
  });
});

describe('findMisspellings', () => {
  it('flags misspelled words with suggestions', () => {
    const results = findMisspellings('This is definately wrong', new Set());
    expect(results).toHaveLength(1);
    expect(results[0].word).toBe('definately');
    expect(results[0].suggestions).toContain('definitely');
  });

  it('deduplicates case-insensitively and skips acronyms', () => {
    const results = findMisspellings('teh Teh NASA', new Set());
    expect(results).toHaveLength(1);
    expect(results[0].word).toBe('teh');
  });

  it('respects the ignored set', () => {
    const results = findMisspellings('teh', new Set(['teh']));
    expect(results).toHaveLength(0);
  });

  it('accepts contractions', () => {
    const results = findMisspellings("don't can't", new Set());
    expect(results).toHaveLength(0);
  });
});
