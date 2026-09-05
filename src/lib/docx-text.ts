import { strFromU8, unzipSync } from 'fflate';

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_entity, name: string) => XML_ENTITIES[name]);
}

// document.xml plus the story parts Word spell-checks; text export stays body-scoped.
const TEXT_PART_RE = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

// Runs of text interleaved with tabs/breaks; separators become spaces so
// adjacent words never fuse ("Hello<tab>World" -> "Hello World").
const TEXT_OR_SEP_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|noBreakHyphen)(?:\s[^>]*)?\/>/g;

function extractParagraphText(part: string): string {
  let text = '';
  let match: RegExpExecArray | null;
  TEXT_OR_SEP_RE.lastIndex = 0;
  while ((match = TEXT_OR_SEP_RE.exec(part)) !== null) {
    text += match[1] !== undefined ? match[1] : ' ';
  }
  return text;
}

/**
 * Extracts readable text from .docx bytes, one paragraph per line, across the
 * body, headers, footers, footnotes, and endnotes. Returns null when the
 * package cannot be read — callers must treat null as failure, never as empty.
 * (Native-side port of the editor-web extractor used for spellcheck.)
 */
export function extractDocxText(docxBytes: Uint8Array): string | null {
  let entries: Record<string, Uint8Array>;
  try {
    // Only inflate the XML parts we read; embedded images can dwarf them.
    entries = unzipSync(docxBytes, { filter: (file) => TEXT_PART_RE.test(file.name) });
  } catch {
    return null;
  }
  const names = Object.keys(entries).sort();
  if (names.length === 0) return null;
  const paragraphs: string[] = [];
  for (const name of names) {
    for (const part of strFromU8(entries[name]).split('</w:p>')) {
      const text = decodeXmlEntities(extractParagraphText(part));
      if (text) paragraphs.push(text);
    }
  }
  return paragraphs.join('\n');
}
