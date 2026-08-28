import { strFromU8, unzipSync } from 'fflate';
import NSpell from 'nspell';

import enAff from '../dict/en.aff?raw';
import enDic from '../dict/en.dic?raw';

let instance: NSpell | null = null;

function checker(): NSpell {
  if (!instance) instance = new NSpell({ aff: enAff, dic: enDic });
  return instance;
}

const WT_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);
}

/**
 * Extracts the readable text of the main document part from .docx bytes,
 * one paragraph per line. Returns '' when the package cannot be read.
 */
export function extractDocumentText(docxBytes: Uint8Array): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(docxBytes);
  } catch {
    return '';
  }
  const xml = entries['word/document.xml'];
  if (!xml) return '';
  const source = strFromU8(xml);
  const paragraphs: string[] = [];
  for (const part of source.split('</w:p>')) {
    let text = '';
    let match: RegExpExecArray | null;
    WT_RE.lastIndex = 0;
    while ((match = WT_RE.exec(part))) text += match[1];
    if (text) paragraphs.push(decodeXmlEntities(text));
  }
  return paragraphs.join('\n');
}

export type Misspelling = {
  word: string;
  suggestions: string[];
};

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

/**
 * Unique misspelled words in document order, deduplicated case-insensitively.
 * Skips single letters, ALL-CAPS acronyms, and words the user ignored.
 */
export function findMisspellings(
  text: string,
  ignored: ReadonlySet<string>,
  limit = 200,
): Misspelling[] {
  const spell = checker();
  const seen = new Set<string>();
  for (const word of ignored) seen.add(word.toLowerCase());
  const results: Misspelling[] = [];
  let match: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(text)) !== null && results.length < limit) {
    const word = match[0].replace(/’/g, "'");
    if (word.length < 2 || word === word.toUpperCase()) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (spell.correct(word)) continue;
    results.push({ word, suggestions: spell.suggest(word).slice(0, 5) });
  }
  return results;
}
