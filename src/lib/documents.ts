import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { TEMPLATES, type TemplateDef } from '@/generated/templates';
import { DOCX_MIME } from '@/lib/docx-bridge';
import { extractDocxText } from '@/lib/docx-text';
import {
  BLANK_BASE,
  DOCX_EXT,
  formatRelativeDate,
  formatSize,
  sanitizeBaseName,
  uniqueName as uniqueNamePure,
} from '@/lib/doc-names';

export { formatRelativeDate, formatSize };

export type DocumentItem = {
  uri: string;
  name: string;
  size: number;
  lastModified: number;
};

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
function uniqueName(base = BLANK_BASE, ext = DOCX_EXT, taken?: Set<string>): string {
  return uniqueNamePure(base, ext, taken ?? existingNames());
}

export function createBlankDocument(): DocumentItem {
  const blank = TEMPLATES.find((template) => template.id === 'blank');
  if (!blank) throw new Error('blank template missing');
  return createDocumentFromTemplate(blank);
}

/**
 * Creates a new document in the library from a template. The file is named
 * after the template ("Report.docx", "Report 2.docx", …); blank documents
 * keep the classic "Untitled" naming. Written via a temp file so a failure
 * mid-write never leaves a truncated .docx in the library.
 */
export function createDocumentFromTemplate(template: TemplateDef): DocumentItem {
  const base = template.id === 'blank' ? BLANK_BASE : sanitizeBaseName(template.name);
  const name = uniqueName(base);
  const file = new File(library(), name);
  const tmp = new File(library(), `${name}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.write(template.base64, { encoding: 'base64' });
  tmp.moveSync(file, { overwrite: true });
  return toItem(file);
}

export function importDocument(sourceUri: string, sourceName: string): DocumentItem {
  const base = sanitizeBaseName(sourceName);
  const name = uniqueName(base, DOCX_EXT);
  const dest = new File(library(), name);
  const tmp = new File(library(), `${name}.tmp`);
  if (tmp.exists) tmp.delete();
  try {
    new File(sourceUri).copySync(tmp);
    tmp.moveSync(dest, { overwrite: true });
  } catch (error) {
    if (tmp.exists) tmp.delete();
    throw error;
  }
  return toItem(dest);
}

export function renameDocument(item: DocumentItem, newBase: string): DocumentItem {
  const base = sanitizeBaseName(newBase);
  const nextName = `${base}${DOCX_EXT}`;
  if (nextName.toLowerCase() === item.name.toLowerCase()) return item;
  const taken = existingNames();
  taken.delete(item.name.toLowerCase());
  const name = uniqueName(base, DOCX_EXT, taken);
  const moved = new File(library(), name);
  new File(item.uri).moveSync(moved);
  // Describe the destination handle, not the pre-move one (stale name/uri).
  return toItem(moved);
}

export function deleteDocument(item: DocumentItem): void {
  const file = new File(item.uri);
  if (file.exists) file.delete();
}

const TRASH_DIR_NAME = '.trash';

function trashDir(): Directory {
  const dir = new Directory(Paths.document, TRASH_DIR_NAME);
  if (!dir.exists) dir.create();
  return dir;
}

/** Soft-delete: moves the file into the trash dir, out of library listings. */
export function trashDocument(item: DocumentItem): DocumentItem {
  const dest = new File(trashDir(), item.name);
  new File(item.uri).moveSync(dest, { overwrite: true });
  return toItem(dest);
}

/** Documents currently in the trash, newest first. */
export function listTrash(): DocumentItem[] {
  const dir = new Directory(Paths.document, TRASH_DIR_NAME);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter(isDocxFile)
    .map(toItem)
    .sort((a, b) => b.lastModified - a.lastModified);
}

/** Restores a trashed document to the library, unique-ifying on collision. */
export function restoreDocument(trashed: DocumentItem): DocumentItem {
  const taken = existingNames();
  const base = trashed.name.toLowerCase().endsWith(DOCX_EXT)
    ? trashed.name.slice(0, -DOCX_EXT.length)
    : trashed.name;
  const name = uniqueNamePure(base, DOCX_EXT, taken);
  const dest = new File(library(), name);
  new File(trashed.uri).moveSync(dest);
  return toItem(dest);
}

/** Permanently deletes everything in the trash. */
export function emptyTrash(): void {
  const dir = new Directory(Paths.document, TRASH_DIR_NAME);
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.exists) entry.delete();
  }
}

/** Duplicates a library document as "<base> copy.docx", unique-ified. */
export function duplicateDocument(item: DocumentItem): DocumentItem {
  const base = item.name.toLowerCase().endsWith(DOCX_EXT)
    ? item.name.slice(0, -DOCX_EXT.length)
    : item.name;
  const name = uniqueNamePure(`${base} copy`, DOCX_EXT, existingNames());
  const dest = new File(library(), name);
  new File(item.uri).copySync(dest);
  return toItem(dest);
}

/** Newest-first slice of the library for a "Recent" section. Input is assumed sorted. */
export function recentDocuments(docs: DocumentItem[], limit = 5): DocumentItem[] {
  return docs.slice(0, Math.max(0, limit));
}

/**
 * Copies a library document into an arbitrary destination directory
 * (e.g. a user-picked folder via the system picker). Uniqueness is
 * scoped to the destination, never the library; the source is untouched.
 * Throws on failure without leaving a partial file behind.
 */
export function exportCopyToDirectory(
  item: DocumentItem,
  dest: Directory,
): { uri: string; name: string } {
  const taken = new Set<string>();
  for (const entry of dest.list()) {
    if (entry instanceof File) taken.add(entry.name.toLowerCase());
  }
  const base = item.name.toLowerCase().endsWith(DOCX_EXT)
    ? item.name.slice(0, -DOCX_EXT.length)
    : item.name;
  const name = uniqueNamePure(base, DOCX_EXT, taken);
  const out = new File(dest, name);
  try {
    new File(item.uri).copySync(out);
  } catch (error) {
    if (out.exists) out.delete();
    throw error;
  }
  return { uri: out.uri, name: out.name };
}

export async function shareDocument(
  item: DocumentItem,
  mimeType: string = DOCX_MIME,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(item.uri, { mimeType });
  return true;
}

/**
 * Extracts a document's readable text and writes it as a .txt file to the
 * cache directory (temp-file + move, like all other writes). Returns the
 * cache file for sharing. Throws for unreadable packages without writing.
 */
export function exportTextToCache(item: DocumentItem): { uri: string; name: string } {
  const bytes = new File(item.uri).bytesSync();
  const text = extractDocxText(bytes);
  if (text === null) throw new Error('unreadable document');
  const base = item.name.toLowerCase().endsWith(DOCX_EXT)
    ? item.name.slice(0, -DOCX_EXT.length)
    : item.name;
  const name = `${base}.txt`;
  const file = new File(Paths.cache, name);
  const tmp = new File(Paths.cache, `${name}.tmp`);
  if (tmp.exists) tmp.delete();
  try {
    tmp.write(text);
    tmp.moveSync(file, { overwrite: true });
  } catch (error) {
    if (tmp.exists) tmp.delete();
    throw error;
  }
  return { uri: file.uri, name: file.name };
}