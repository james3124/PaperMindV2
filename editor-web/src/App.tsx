import { DocxEditor, type Editor } from '@docx-editor.dev/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@docx-editor.dev/react/styles.css';
import './styles/ribbon.css';
import { Ribbon } from './components/ribbon';
import { SpellCheckPanel } from './components/spell-check-panel';
import {
  base64ToBytes,
  bytesToBase64,
  looksLikeDocx,
  parseNativeMessage,
  postToNative,
} from './lib/bridge';
import { extractDocumentText, findMisspellings, type Misspelling } from './lib/spellcheck';

const ERROR_POST_INTERVAL_MS = 2_000;

type SpellPanelState = {
  open: boolean;
  checking: boolean;
  items: Misspelling[];
  fixed: number;
};

const SPELL_PANEL_CLOSED: SpellPanelState = { open: false, checking: false, items: [], fixed: 0 };

export default function App() {
  const editorRef = useRef<Editor | null>(null);
  const [document, setDocument] = useState<ArrayBuffer | undefined>();
  const [title, setTitle] = useState('Untitled');
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  const [spellPanel, setSpellPanel] = useState<SpellPanelState>(SPELL_PANEL_CLOSED);
  // Revision of the last save we handed to the host; used to derive DIRTY.
  const savedRevision = useRef<number | null>(null);
  const reportedDirty = useRef(false);
  const lastErrorPost = useRef(0);
  const ignoredWords = useRef<Set<string>>(new Set());
  const spellPanelRef = useRef(spellPanel);
  spellPanelRef.current = spellPanel;

  const reportError = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastErrorPost.current < ERROR_POST_INTERVAL_MS) return;
    lastErrorPost.current = now;
    postToNative({ type: 'ERROR', message: message.slice(0, 200) });
  }, []);

  const reportDirty = useCallback((dirty: boolean) => {
    if (reportedDirty.current === dirty) return;
    reportedDirty.current = dirty;
    postToNative({ type: 'DIRTY', value: dirty });
  }, []);

  const exportDoc = useCallback(async () => {
    const saved = await editorRef.current?.save();
    if (!saved) return;
    postToNative({
      type: 'SAVE_REQUEST',
      base64: bytesToBase64(new Uint8Array(saved)),
      title,
    });
    savedRevision.current = editorRef.current?.getDocumentHandle()?.revision ?? null;
    reportDirty(false);
  }, [reportDirty, title]);

  const openSpellCheck = useCallback(async () => {
    setSpellPanel({ open: true, checking: true, items: [], fixed: 0 });
    try {
      const saved = await editorRef.current?.save();
      if (!saved) {
        setSpellPanel((panel) => ({ ...panel, checking: false }));
        return;
      }
      const text = extractDocumentText(new Uint8Array(saved));
      const items = findMisspellings(text, ignoredWords.current);
      setSpellPanel((panel) => ({ ...panel, checking: false, items }));
    } catch {
      setSpellPanel((panel) => ({ ...panel, checking: false }));
    }
  }, []);

  const fixWord = useCallback((word: string, replacement: string) => {
    const result = editorRef.current?.exec({
      type: 'replaceAllMatches',
      query: word,
      text: replacement,
      wholeWord: true,
    });
    if (!result?.ok) return;
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
          reportError('not-a-docx');
          return;
        }
        savedRevision.current = null;
        reportedDirty.current = false;
        setTitle(new URLSearchParams(window.location.search).get('title') ?? 'Untitled');
        setDocument(base64ToBytes(msg.base64).buffer as ArrayBuffer);
      } else if (msg.type === 'EXPORT_REQUEST') {
        void exportDoc();
      } else if (msg.type === 'SPELL_CHECK_REQUEST') {
        void openSpellCheck();
      } else if (msg.type === 'SET_THEME') {
        setColorMode(msg.value);
      }
    }
    window.addEventListener('message', onMessage);

    // Parse/async failures inside the editor surface here; report them to the host.
    function onErrorEvent(event: ErrorEvent) {
      if (event.message) reportError(event.message);
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (reason) reportError(reason);
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
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <DocxEditor.Root
        document={document}
        mode="edit"
        onReady={(editor) => {
          editorRef.current = editor;
          postToNative({ type: 'READY' });
          if (!('ReactNativeWebView' in globalThis)) {
            // Browser dev fallback without the host app — editor mounts empty.
            editor.load('blank');
          }
        }}
        onChange={() => {
          const revision = editorRef.current?.getDocumentHandle()?.revision ?? null;
          if (revision !== null && revision !== savedRevision.current) {
            reportDirty(true);
          }
        }}
      >
        <Ribbon />
        <DocxEditor.Viewport style={{ flex: 1, minHeight: 0 }}>
          <DocxEditor.Content />
        </DocxEditor.Viewport>
      </DocxEditor.Root>

      {spellPanel.open && (
        <SpellCheckPanel
          colorMode={colorMode}
          checking={spellPanel.checking}
          items={spellPanel.items}
          fixedCount={spellPanel.fixed}
          onFix={fixWord}
          onIgnore={ignoreWord}
          onClose={closeSpellCheck}
        />
      )}
    </div>
  );
}