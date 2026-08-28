import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BLANK_DOCX_BASE64 } from '@/generated/blank-docx';
import { DOCX_MIME } from '@/lib/docx-bridge';
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
  const name = uniqueName();
  const file = new File(library(), name);
  file.write(BLANK_DOCX_BASE64, { encoding: 'base64' });
  return toItem(file);
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