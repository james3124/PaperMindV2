import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BLANK_DOCX_BASE64 } from '@/generated/blank-docx';
import { DOCX_MIME } from '@/lib/docx-bridge';

export type DocumentItem = {
  uri: string;
  name: string;
  size: number;
  lastModified: number;
};

const DOCX_EXT = '.docx';
const BLANK_BASE = 'Untitled';

function library(): Directory {
  return Paths.document;
}

function isDocxFile(entry: File | Directory): entry is File {
  return entry instanceof File && entry.extension.toLowerCase() === DOCX_EXT;
}

export function listDocuments(): DocumentItem[] {
  const entries = library().list();
  return entries
    .filter(isDocxFile)
    .map(toItem)
    .sort((a, b) => b.lastModified - a.lastModified);
}

function toItem(file: File): DocumentItem {
  return {
    uri: file.uri,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified ?? 0,
  };
}

function existingNames(): Set<string> {
  const names = new Set<string>();
  for (const file of library().list()) {
    if (isDocxFile(file)) names.add(file.name.toLowerCase());
  }
  return names;
}

/**
 * "Untitled.docx", then "Untitled 2.docx", "Untitled 3.docx", …
 */
export function uniqueName(base = BLANK_BASE, ext = DOCX_EXT, taken?: Set<string>): string {
  const names = taken ?? existingNames();
  const normalize = (n: string) => n.toLowerCase();
  if (!names.has(normalize(`${base}${ext}`))) return `${base}${ext}`;
  let i = 2;
  while (names.has(normalize(`${base} ${i}${ext}`))) i += 1;
  return `${base} ${i}${ext}`;
}

export function createBlankDocument(): DocumentItem {
  const name = uniqueName();
  const file = new File(library(), name);
  file.write(BLANK_DOCX_BASE64, { encoding: 'base64' });
  return toItem(file);
}

function sanitizeBaseName(raw: string): string {
  const cleaned = raw.trim().replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const withoutExt = cleaned.toLowerCase().endsWith(DOCX_EXT)
    ? cleaned.slice(0, -DOCX_EXT.length)
    : cleaned.replace(/\.[^.]+$/, '');
  return (withoutExt || BLANK_BASE).trim();
}

export function importDocument(sourceUri: string, sourceName: string): DocumentItem {
  const base = sanitizeBaseName(sourceName);
  const name = uniqueName(base, DOCX_EXT);
  const dest = new File(library(), name);
  new File(sourceUri).copySync(dest);
  return toItem(dest);
}

export function renameDocument(item: DocumentItem, newBase: string): DocumentItem {
  const base = sanitizeBaseName(newBase);
  const nextName = `${base}${DOCX_EXT}`;
  if (nextName.toLowerCase() === item.name.toLowerCase()) return item;
  const taken = existingNames();
  taken.delete(item.name.toLowerCase());
  const name = uniqueName(base, DOCX_EXT, taken);
  const file = new File(item.uri);
  file.moveSync(new File(library(), name));
  return toItem(file);
}

/**
 * Renames the file to match the in-editor title (if changed). Returns the final name.
 */
export function syncDocumentTitle(uri: string, currentName: string, rawTitle: string): string {
  const base = sanitizeBaseName(rawTitle);
  const nextName = `${base}${DOCX_EXT}`;
  if (nextName.toLowerCase() === currentName.toLowerCase()) return currentName;
  const taken = existingNames();
  taken.delete(currentName.toLowerCase());
  const name = uniqueName(base, DOCX_EXT, taken);
  const file = new File(uri);
  file.moveSync(new File(library(), name));
  return name;
}

export function deleteDocument(item: DocumentItem): void {
  const file = new File(item.uri);
  if (file.exists) file.delete();
}

export async function shareDocument(item: DocumentItem): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(item.uri, { mimeType: DOCX_MIME });
}

export function formatRelativeDate(ms: number): string {
  if (!ms) return '';
  const now = Date.now();
  const diff = now - ms;
  const day = 86_400_000;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = diff < 7 * day
    ? { weekday: 'short' }
    : { month: 'short', day: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}