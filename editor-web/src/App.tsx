import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@docx-editor.dev/react/styles.css';
import {
  base64ToBytes,
  bytesToBase64,
  looksLikeDocx,
  parseNativeMessage,
  postToNative,
} from './lib/bridge';

const ERROR_POST_INTERVAL_MS = 2_000;

export default function App() {
  const editorRef = useRef<DocxEditorRef>(null);
  const [document, setDocument] = useState<ArrayBuffer | undefined>();
  const [title, setTitle] = useState('Untitled');
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  // Revision of the last save we handed to the host; used to derive DIRTY.
  const savedRevision = useRef<number | null>(null);
  const reportedDirty = useRef(false);
  const editorReady = useRef(false);
  const lastErrorPost = useRef(0);

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

    if (editorReady.current === false && !('ReactNativeWebView' in globalThis)) {
      // Browser dev fallback without the host app — editor mounts empty.
      void editorRef.current?.load('blank');
    }
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('error', onErrorEvent);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [exportDoc, reportError]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <DocxEditor
        ref={editorRef}
        colorMode={colorMode}
        mode="edit"
        title={title}
        onTitleChange={setTitle}
        document={document}
        onSave={() => void exportDoc()}
        onChange={() => {
          const revision = editorRef.current?.getDocumentHandle()?.revision ?? null;
          if (revision !== null && revision !== savedRevision.current) {
            reportDirty(true);
          }
        }}
        onReady={(editor) => {
          editorReady.current = true;
          postToNative({ type: 'READY' });
          // Keep a reference alive for dev-mode blank loads after mount.
          void editor;
        }}
      />
    </div>
  );
}