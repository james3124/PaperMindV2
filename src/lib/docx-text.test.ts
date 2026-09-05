import { describe, expect, it } from 'vitest';

import { extractDocxText } from './docx-text';

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

function docxWithParts(parts: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = Object.entries(parts).map(([name, xml]) => ({
    name: encoder.encode(name),
    data: encoder.encode(xml),
  }));
  const locals = encoded.map(({ name, data }) => {
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    return { local, name, data };
  });
  let centralLen = 0;
  let localOffset = 0;
  const centrals = locals.map(({ local, name, data }) => {
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc32(data), true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralLen += central.length;
    localOffset += local.length;
    return central;
  });
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, locals.length, true);
  ev.setUint16(10, locals.length, true);
  ev.setUint32(12, centralLen, true);
  ev.setUint32(16, localOffset, true);
  const out = new Uint8Array(localOffset + centralLen + 22);
  let pos = 0;
  for (const { local } of locals) {
    out.set(local, pos);
    pos += local.length;
  }
  for (const central of centrals) {
    out.set(central, pos);
    pos += central.length;
  }
  out.set(end, pos);
  return out;
}

function docxWithText(text: string): Uint8Array {
  return docxWithParts({
    'word/document.xml':
      '<?xml version="1.0"?><w:document><w:body>' +
      `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` +
      '</w:body></w:document>',
  });
}

describe('extractDocxText', () => {
  it('extracts paragraph text and decodes entities', () => {
    expect(extractDocxText(docxWithText('Hello &amp; welcome'))).toBe('Hello & welcome');
  });

  it('joins paragraphs one per line across body and headers', () => {
    const bytes = docxWithParts({
      'word/document.xml':
        '<w:document><w:body><w:p><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>',
      'word/header1.xml':
        '<w:hdr><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>',
    });
    const text = extractDocxText(bytes);
    expect(text).toContain('First');
    expect(text).toContain('Second');
    expect(text).toContain('Header');
  });

  it('returns null for non-zip input', () => {
    expect(extractDocxText(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
