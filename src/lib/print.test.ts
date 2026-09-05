import { describe, expect, it, vi } from 'vitest';

import { TEMPLATES } from '@/generated/templates';

import { buildPrintHtml, docxBytesToPrintHtml, printHtml } from './print';

vi.mock('expo-print', () => ({
  printAsync: async (options: { html: string }) => {
    if (!options.html.includes('<html')) throw new Error('expected full html document');
  },
}));

function templateBytes(id: string): Uint8Array {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`template missing: ${id}`);
  return new Uint8Array(Buffer.from(found.base64, 'base64'));
}

describe('buildPrintHtml', () => {
  it('escapes markup and keeps one paragraph per line', () => {
    const html = buildPrintHtml('Report.docx', 'Hello <b>World</b>\nSecond & final');
    expect(html).toContain('&lt;b&gt;World&lt;/b&gt;');
    expect(html).toContain('Second &amp; final');
    expect(html).toContain('<h1>Report.docx</h1>');
    expect(html).not.toContain('<b>World</b>');
  });

  it('keeps blank lines as spacing, not collapsed away', () => {
    const html = buildPrintHtml('a.docx', 'First\n\nThird');
    expect(html.match(/<p>/g)).toHaveLength(3);
  });
});

describe('docxBytesToPrintHtml', () => {
  it('converts real template bytes to a printable document', () => {
    const html = docxBytesToPrintHtml(templateBytes('report'), 'Report.docx');
    expect(html).toContain('<html');
    expect(html).toContain('Report.docx');
  });

  it('throws for an unreadable package', () => {
    expect(() => docxBytesToPrintHtml(new Uint8Array([1, 2, 3]), 'x.docx')).toThrow();
  });
});

describe('printHtml', () => {
  it('sends a full html document to the OS print dialog', async () => {
    await expect(printHtml('<html><body>hi</body></html>')).resolves.toBeUndefined();
    await expect(printHtml('not html')).rejects.toThrow('expected full html document');
  });
});
