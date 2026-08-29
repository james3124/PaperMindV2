import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { TEMPLATES, type TemplateDef } from '@/generated/templates';
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

export async function shareDocument(item: DocumentItem): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(item.uri, { mimeType: DOCX_MIME });
}