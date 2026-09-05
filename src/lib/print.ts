import * as Print from 'expo-print';

import { extractDocxText } from '@/lib/docx-text';

export const PDF_MIME = 'application/pdf';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders extracted document text as a minimal printable HTML page:
 * title header plus one paragraph per line. Blank lines are preserved
 * as spacing. This is a text-fidelity print, not a WYSIWYG page render —
 * callers must label it honestly in the UI.
 */
export function buildPrintHtml(title: string, text: string): string {
  const paras = text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) === '' ? '&nbsp;' : escapeHtml(line)}</p>`)
    .join('');
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>body{font-family:sans-serif;line-height:1.5;margin:24px}h1{font-size:20px}p{margin:0 0 8px}</style>' +
    `</head><body><h1>${escapeHtml(title)}</h1>${paras}</body></html>`
  );
}

/** DOCX bytes -> printable HTML. Throws for unreadable packages. */
export function docxBytesToPrintHtml(docxBytes: Uint8Array, name: string): string {
  const text = extractDocxText(docxBytes);
  if (text === null) throw new Error('unreadable document');
  return buildPrintHtml(name, text);
}

/** Opens the OS print dialog for the given HTML. Resolves when dismissed. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}
