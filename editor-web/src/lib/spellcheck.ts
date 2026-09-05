import { strFromU8, unzipSync } from 'fflate';
import NSpell from 'nspell';

import enAff from '../dict/en.aff?raw';
import enDic from '../dict/en.dic?raw';

let instance: NSpell | null = null;

function checker(): NSpell {
  if (!instance) instance = new NSpell({ aff: enAff, dic: enDic });
  return instance;
}

/** Parse the dictionary during idle time so the first check doesn't jank. */
export function warmSpellchecker(): void {
  if (instance) return;
  const g = globalThis as { requestIdleCallback?: (cb: () => void) => void };
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(() => void checker());
  else setTimeout(() => void checker(), 300);
}

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

// document.xml plus the story parts Word spell-checks; fixes stay body-scoped.
const TEXT_PART_RE = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

// Runs of text interleaved with tabs/breaks; separators become spaces so
// adjacent words never fuse into a false positive ("Hello<tab>World").
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
 * package cannot be read — callers must treat null as failure, not "clean".
 */
export function extractDocumentText(docxBytes: Uint8Array): string | null {
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

export type Misspelling = {
  word: string;
  suggestions: string[];
};

const URLISH_RE = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/gi;
const WORD_RE = /\p{L}+(?:['’]\p{L}+)*/gu;

/**
 * Unique misspelled words in document order, deduplicated case-insensitively.
 * Skips URLs/emails, single letters, ALL-CAPS acronyms, and ignored words.
 */
export function findMisspellings(
  text: string,
  ignored: ReadonlySet<string>,
  limit = 200,
): Misspelling[] {
  return findMisspellingsDetailed(text, ignored, limit).items;
}

/**
 * Same as findMisspellings, but also reports whether more misspellings
 * exist beyond `limit` so the UI can label a capped list.
 */
export function findMisspellingsDetailed(
  text: string,
  ignored: ReadonlySet<string>,
  limit = 200,
): { items: Misspelling[]; truncated: boolean } {
  const spell = checker();
  const seen = new Set<string>();
  for (const word of ignored) seen.add(word.toLowerCase());
  const results: Misspelling[] = [];
  const clean = text.replace(URLISH_RE, ' ');
  let match: RegExpExecArray | null;
  let truncated = false;
  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(clean)) !== null) {
    const word = match[0].replace(/’/g, "'");
    if (word.length < 2 || word === word.toUpperCase()) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (spell.correct(word)) continue;
    if (results.length >= limit) {
      truncated = true;
      break;
    }
    results.push({ word, suggestions: spell.suggest(word).slice(0, 5) });
  }
  return { items: results, truncated };
}
