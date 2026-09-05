import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Directory } from 'expo-file-system';

import { TEMPLATES } from '@/generated/templates';
import {
  createDocumentFromTemplate,
  deleteDocument,
  exportCopyToDirectory,
  exportTextToCache,
  importDocument,
  listDocuments,
  renameDocument,
} from '@/lib/documents';

const { MemFile, MemDir, resetFs } = vi.hoisted(() => {
  const store = new Map<string, { data: Uint8Array; mtime: number }>();
  class MemFile {
    static store = store;
    path: string;
    constructor(dirOrUri: unknown, name?: string) {
      if (typeof dirOrUri === 'string') this.path = dirOrUri;
      else this.path = `${(dirOrUri as { uri: string }).uri}${name ?? ''}`;
    }
    get uri() {
      return this.path;
    }
    get name() {
      return this.path.split('/').pop() ?? '';
    }
    get extension() {
      const i = this.name.lastIndexOf('.');
      return i < 0 ? '' : this.name.slice(i);
    }
    get exists() {
      return store.has(this.path);
    }
    get size() {
      return store.get(this.path)?.data.length ?? 0;
    }
    get lastModified() {
      return store.get(this.path)?.mtime ?? null;
    }
    write(data: string, opts?: { encoding?: string }) {
      const bytes =
        opts?.encoding === 'base64'
          ? new Uint8Array(Buffer.from(data, 'base64'))
          : new TextEncoder().encode(data);
      store.set(this.path, { data: bytes, mtime: Date.now() });
    }
    bytesSync() {
      const entry = store.get(this.path);
      if (!entry) throw new Error(`missing: ${this.path}`);
      return entry.data.slice();
    }
    textSync() {
      return new TextDecoder().decode(this.bytesSync());
    }
    copySync(dest: MemFile) {
      const entry = store.get(this.path);
      if (!entry) throw new Error(`source missing: ${this.path}`);
      store.set(dest.path, { data: entry.data.slice(), mtime: Date.now() });
    }
    moveSync(dest: MemFile, opts?: { overwrite?: boolean }) {
      if (dest.exists && !opts?.overwrite) throw new Error('destination exists');
      this.copySync(dest);
      store.delete(this.path);
    }
    delete() {
      store.delete(this.path);
    }
  }
  class MemDir {
    uri: string;
    constructor(uri: string) {
      this.uri = uri.endsWith('/') ? uri : `${uri}/`;
    }
    list() {
      const out: MemFile[] = [];
      for (const p of store.keys()) {
        if (p.startsWith(this.uri) && !p.slice(this.uri.length).includes('/')) {
          out.push(new MemFile(p));
        }
      }
      return out;
    }
  }
  return {
    MemFile,
    MemDir,
    resetFs: () => {
      store.clear();
    },
  };
});

vi.mock('expo-file-system', () => ({
  File: MemFile,
  Directory: MemDir,
  Paths: { document: new MemDir('file:///library'), cache: new MemDir('file:///cache') },
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => {},
}));


const blank = TEMPLATES.find((t) => t.id === 'blank')!;
const report = TEMPLATES.find((t) => t.id === 'report')!;

function libraryNames(): string[] {
  return MemFile.store
    ? [...Array.from(MemFile.store.keys())].map((p) => p.replace('file:///library/', ''))
    : [];
}

beforeEach(() => {
  resetFs();
});

describe('createDocumentFromTemplate', () => {
  it('names blank documents Untitled with collision numbering', () => {
    expect(createDocumentFromTemplate(blank).name).toBe('Untitled.docx');
    expect(createDocumentFromTemplate(blank).name).toBe('Untitled 2.docx');
  });

  it('names template documents after the template', () => {
    expect(createDocumentFromTemplate(report).name).toBe('Report.docx');
    expect(createDocumentFromTemplate(report).name).toBe('Report 2.docx');
  });

  it('leaves no temp files behind', () => {
    createDocumentFromTemplate(report);
    expect(libraryNames().filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('importDocument', () => {
  it('copies the source into the library', () => {
    const source = new MemFile('file:///source/notes.docx');
    source.write('hello');
    const item = importDocument(source.uri, 'notes.docx');
    expect(item.name).toBe('notes.docx');
    expect(item.size).toBe(5);
  });

  it('throws and leaves no temp file when the copy fails', () => {
    expect(() => importDocument('file:///source/missing.docx', 'missing.docx')).toThrow();
    expect(libraryNames().filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('renameDocument', () => {
  it('returns the moved handle, not the stale pre-move one', () => {
    const item = createDocumentFromTemplate(blank);
    const renamed = renameDocument(item, 'Thesis');
    expect(renamed.name).toBe('Thesis.docx');
    expect(renamed.uri).toBe('file:///library/Thesis.docx');
    expect(listDocuments().map((d) => d.name)).toEqual(['Thesis.docx']);
  });

  it('is a no-op for the same name (case-insensitive)', () => {
    const item = createDocumentFromTemplate(blank);
    expect(renameDocument(item, 'Untitled').uri).toBe(item.uri);
  });
});

describe('deleteDocument / listDocuments', () => {
  it('deletes and lists only .docx sorted by recency', () => {
    const a = createDocumentFromTemplate(blank);
    const b = createDocumentFromTemplate(report);
    new MemFile('file:///library/readme.txt').write('x');
    const names = listDocuments().map((d) => d.name);
    expect(names).toHaveLength(2);
    expect(names).toContain(b.name);
    deleteDocument(a);
    expect(listDocuments().map((d) => d.name)).toEqual([b.name]);
  });
});

describe('exportCopyToDirectory', () => {
  it('copies bytes to the destination, leaving the source untouched', () => {
    const item = createDocumentFromTemplate(report);
    const dest = new MemDir('file:///downloads');
    const out = exportCopyToDirectory(item, dest as unknown as Directory);
    expect(out.name).toBe('Report.docx');
    expect(new MemFile(out.uri).exists).toBe(true);
    expect(new MemFile(item.uri).exists).toBe(true);
    expect(listDocuments().map((d) => d.name)).toEqual(['Report.docx']);
  });

  it('unique-ifies against destination contents, not the library', () => {
    const item = createDocumentFromTemplate(report);
    const dest = new MemDir('file:///downloads');
    new MemFile('file:///downloads/Report.docx').write('existing');
    const out = exportCopyToDirectory(item, dest as unknown as Directory);
    expect(out.name).toBe('Report 2.docx');
  });
});

describe('exportTextToCache', () => {
  it('writes extracted document text as .txt to cache', () => {
    const item = createDocumentFromTemplate(report);
    const out = exportTextToCache(item);
    expect(out.name).toBe('Report.txt');
    const text = new MemFile(out.uri).textSync();
    expect(text.length).toBeGreaterThan(0);
    // source library untouched
    expect(listDocuments().map((d) => d.name)).toEqual(['Report.docx']);
  });

  it('throws for an unreadable package without writing a file', () => {
    new MemFile('file:///library/broken.docx').write('not a zip');
    const item = { uri: 'file:///library/broken.docx', name: 'broken.docx', size: 9, lastModified: 0 };
    expect(() => exportTextToCache(item)).toThrow();
    expect(new MemFile('file:///cache/broken.txt').exists).toBe(false);
  });
});
