import { defaultFonts } from '@docx-editor.dev/fonts';
import { DocxEditor, ImageInsertProvider, type Editor } from '@docx-editor.dev/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@docx-editor.dev/react/styles.css';
import './styles/ribbon.css';
import { FindBar } from './components/find-bar';
import { Ribbon } from './components/ribbon';
import { SpellCheckPanel } from './components/spell-check-panel';
import {
  base64ToBytes,
  bytesToBase64,
  looksLikeDocx,
  parseNativeMessage,
  postToNative,
} from './lib/bridge';
import { extractDocumentText, findMisspellingsDetailed, warmSpellchecker, type Misspelling } from './lib/spellcheck';

const ERROR_POST_INTERVAL_MS = 2_000;

type SpellPanelState = {
  open: boolean;
  checking: boolean;
  items: Misspelling[];
  fixed: number;
  truncated: boolean;
};

const SPELL_PANEL_CLOSED: SpellPanelState = { open: false, checking: false, items: [], fixed: 0, truncated: false };

export default function App() {
  const editorRef = useRef<Editor | null>(null);
  const [document, setDocument] = useState<ArrayBuffer | undefined>();
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  const [findOpen, setFindOpen] = useState(false);
  const [spellPanel, setSpellPanel] = useState<SpellPanelState>(SPELL_PANEL_CLOSED);
  // Revision of the last save we handed to the host; used to derive DIRTY.
  const savedRevision = useRef<number | null>(null);
  const reportedDirty = useRef(false);
  const lastErrorPost = useRef(0);
  const ignoredWords = useRef<Set<string>>(new Set());
  const spellPanelRef = useRef(spellPanel);
  spellPanelRef.current = spellPanel;
  // Base64 of the document already loaded into the editor. The host re-sends
  // LOAD_DOC on every READY; loading the same bytes again would remount the
  // editor (new document identity), resetting scroll and closing the keyboard.
  const loadedBase64 = useRef<string | null>(null);
  const readyRef = useRef(false);
  // Host requests that arrived before the editor instance existed; flushed on ready.
  const pendingActionRef = useRef<'export' | 'spell' | null>(null);
  // Word-metric fonts (Carlito/Caladea/Liberation) make the engine's layout
  // match what the browser renders; without them the painted caret lands in
  // the middle of words and pagination drifts. Documents wait for them.
  const [fonts, setFonts] = useState<Awaited<ReturnType<typeof defaultFonts>> | undefined>();
  const fontsRef = useRef<typeof fonts>(undefined);
  const pendingDocRef = useRef<ArrayBuffer | null>(null);
  // Keep the editor inside the visible area while the soft keyboard is up:
  // the visual viewport shrinks even when the WebView itself does not.
  const [viewportHeight, setViewportHeight] = useState<number | undefined>();
  const ribbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    defaultFonts()
      .then((loaded) => {
        if (!alive) return;
        fontsRef.current = loaded;
        setFonts(loaded);
        if (pendingDocRef.current) {
          setDocument(pendingDocRef.current);
          pendingDocRef.current = null;
        }
      })
      .catch(() => {
        // Degrade to the engine's fixed-width measurement rather than block editing.
        if (!alive) return;
        if (pendingDocRef.current) {
          setDocument(pendingDocRef.current);
          pendingDocRef.current = null;
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      // The ribbon lives inside the same fixed-height container; the editor
      // must only see the height that is actually left for the page area.
      const ribbonH = ribbonRef.current?.offsetHeight ?? 0;
      setViewportHeight(vv.height - ribbonH);
    };
    apply();
    vv.addEventListener('resize', apply);
    return () => vv.removeEventListener('resize', apply);
  }, []);

  const reportError = useCallback((message: string, fatal: boolean) => {
    // Rate-limit only benign noise; a fatal error must always reach the host.
    if (!fatal) {
      const now = Date.now();
      if (now - lastErrorPost.current < ERROR_POST_INTERVAL_MS) return;
      lastErrorPost.current = now;
    }
    postToNative({ type: 'ERROR', message: message.slice(0, 200), fatal });
  }, []);

  const reportDirty = useCallback((dirty: boolean) => {
    if (reportedDirty.current === dirty) return;
    reportedDirty.current = dirty;
    postToNative({ type: 'DIRTY', value: dirty });
  }, []);

  const exportDoc = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) {
      pendingActionRef.current = 'export';
      return;
    }
    // Capture the revision BEFORE serializing: edits typed during save() must
    // keep the document dirty, or they would be marked clean and lost on exit.
    const revisionBefore = editor.getDocumentHandle()?.revision ?? null;
    const saved = await editor.save();
    postToNative({
      type: 'SAVE_REQUEST',
      base64: bytesToBase64(new Uint8Array(saved)),
    });
    savedRevision.current = revisionBefore;
    const revisionNow = editor.getDocumentHandle()?.revision ?? null;
    const dirtyNow = revisionNow !== revisionBefore;
    // Always post after a save so the host can reschedule autosave if still dirty.
    reportedDirty.current = dirtyNow;
    postToNative({ type: 'DIRTY', value: dirtyNow });
  }, []);

  const openSpellCheck = useCallback(async () => {
    if (!editorRef.current) {
      pendingActionRef.current = 'spell';
      return;
    }
    setSpellPanel({ open: true, checking: true, items: [], fixed: 0, truncated: false });
    try {
      const saved = await editorRef.current.save();
      const text = extractDocumentText(new Uint8Array(saved));
      if (text === null) throw new Error('unreadable document');
      const { items, truncated } = findMisspellingsDetailed(text, ignoredWords.current);
      setSpellPanel((panel) => (panel.open ? { ...panel, checking: false, items, truncated } : panel));
    } catch {
      setSpellPanel((panel) => (panel.open ? { ...panel, checking: false, items: [] } : panel));
    }
  }, []);

  const fixWord = useCallback((word: string, replacement: string) => {
    const result = editorRef.current?.exec({
      type: 'replaceAllMatches',
      query: word,
      text: replacement,
      wholeWord: true,
      matchCase: true,
    });
    // `changed` distinguishes a real fix from a no-op (e.g. the word only
    // exists in a header, which the body-scoped replace cannot touch).
    if (!result?.ok || !result.changed) return;
    const key = word.toLowerCase();
    setSpellPanel((panel) => ({
      ...panel,
      fixed: panel.fixed + 1,
      items: panel.items.filter((item) => item.word.toLowerCase() !== key),
    }));
  }, []);

  const ignoreWord = useCallback((word: string) => {
    const key = word.toLowerCase();
    ignoredWords.current.add(key);
    setSpellPanel((panel) => ({
      ...panel,
      items: panel.items.filter((item) => item.word.toLowerCase() !== key),
    }));
  }, []);

  const closeSpellCheck = useCallback(() => {
    const panel = spellPanelRef.current;
    if (panel.checking) return; // don't race the in-flight check
    postToNative({
      type: 'SPELL_CHECK_RESULT',
      fixed: panel.fixed,
      remaining: panel.items.length,
    });
    setSpellPanel((current) => ({ ...current, open: false }));
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = parseNativeMessage(event.data);
      if (!msg) return;
      if (msg.type === 'LOAD_DOC') {
        if (!looksLikeDocx(msg.base64)) {
          reportError('not-a-docx', true);
          return;
        }
        if (loadedBase64.current === msg.base64) return;
        loadedBase64.current = msg.base64;
        savedRevision.current = null;
        reportedDirty.current = false;
        ignoredWords.current = new Set();
        const bytes = base64ToBytes(msg.base64).buffer as ArrayBuffer;
        if (fontsRef.current) setDocument(bytes);
        else pendingDocRef.current = bytes;
      } else if (msg.type === 'EXPORT_REQUEST') {
        void exportDoc();
      } else if (msg.type === 'SPELL_CHECK_REQUEST') {
        void openSpellCheck();
      } else if (msg.type === 'SET_THEME') {
        setColorMode(msg.value);
      }
    }
    window.addEventListener('message', onMessage);

    // Errors before READY mean the document never opened (fatal to the session);
    // after READY they are benign runtime noise (e.g. ResizeObserver loop) that
    // must not eject the user from their unsaved document.
    function onErrorEvent(event: ErrorEvent) {
      if (event.message) reportError(event.message, !readyRef.current);
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (reason) reportError(reason, !readyRef.current);
    }
    window.addEventListener('error', onErrorEvent);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('error', onErrorEvent);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [exportDoc, openSpellCheck, reportError]);

  return (
    <div
      className={`docx-editor${colorMode === 'dark' ? ' dark' : ''}`}
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ImageInsertProvider>
      <DocxEditor.Root
        document={document}
        fonts={fonts}
        mode="edit"
        onReady={(editor) => {
          editorRef.current = editor;
          readyRef.current = true;
          warmSpellchecker();
          postToNative({ type: 'READY' });
          if (!('ReactNativeWebView' in globalThis)) {
            // Browser dev fallback without the host app — editor mounts empty.
            editor.load('blank');
          }
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          if (pending === 'export') void exportDoc();
          else if (pending === 'spell') void openSpellCheck();
        }}
        onChange={() => {
          const revision = editorRef.current?.getDocumentHandle()?.revision ?? null;
          if (revision !== null && revision !== savedRevision.current) {
            reportDirty(true);
          }
        }}
      >
        <div ref={ribbonRef}>
          <Ribbon onFindToggle={() => setFindOpen((open) => !open)} />
        </div>
        {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
        <DocxEditor.Viewport style={{ flex: 1, minHeight: 0 }}>
          <DocxEditor.Content />
        </DocxEditor.Viewport>
      </DocxEditor.Root>
      </ImageInsertProvider>

      {spellPanel.open && (
        <SpellCheckPanel
          colorMode={colorMode}
          checking={spellPanel.checking}
          items={spellPanel.items}
          fixedCount={spellPanel.fixed}
          truncated={spellPanel.truncated}
          onFix={fixWord}
          onIgnore={ignoreWord}
          onClose={closeSpellCheck}
        />
      )}
    </div>
  );
}