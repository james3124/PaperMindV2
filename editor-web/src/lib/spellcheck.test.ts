import { describe, expect, it } from 'vitest';

import { extractDocumentText, findMisspellings } from './spellcheck';

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

function docxWithBodyText(inner: string): Uint8Array {
  return docxWithParts({
    'word/document.xml':
      '<?xml version="1.0"?><w:document><w:body>' +
      `<w:p><w:r>${inner}</w:r></w:p>` +
      '</w:body></w:document>',
  });
}

function docxWithText(text: string): Uint8Array {
  return docxWithBodyText(`<w:t xml:space="preserve">${text}</w:t>`);
}

describe('extractDocumentText', () => {
  it('extracts paragraph text and decodes entities', () => {
    const text = extractDocumentText(docxWithText('Hello &amp; welcome'));
    expect(text).toBe('Hello & welcome');
  });

  it('separates words joined by tabs and breaks', () => {
    const text = extractDocumentText(
      docxWithBodyText('<w:t>Hello</w:t><w:tab/><w:t>World</w:t>'),
    );
    expect(text).toBe('Hello World');
  });

  it('includes header and footnote parts', () => {
    const text = extractDocumentText(
      docxWithParts({
        'word/document.xml':
          '<w:document><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body></w:document>',
        'word/header1.xml':
          '<w:hdr><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>',
        'word/footnotes.xml':
          '<w:footnotes><w:p><w:r><w:t>Footnote</w:t></w:r></w:p></w:footnotes>',
      }),
    );
    expect(text).toContain('Body');
    expect(text).toContain('Header');
    expect(text).toContain('Footnote');
  });

  it('returns null for non-zip input', () => {
    expect(extractDocumentText(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

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

  it('skips URLs and email addresses', () => {
    const results = findMisspellings(
      'visit https://example.com/foo or www.example.com or bob@example.com',
      new Set(),
    );
    expect(results).toHaveLength(0);
  });

  it('keeps accented words whole', () => {
    const results = findMisspellings('café naïve résumé', new Set());
    // The tokens must be the full accented words, never fragments like "caf".
    for (const item of results) expect(item.word).toMatch(/\p{L}+/u);
    expect(results.map((item) => item.word)).not.toContain('caf');
  });
});
