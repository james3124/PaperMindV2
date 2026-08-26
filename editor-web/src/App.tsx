import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@docx-editor.dev/react/styles.css';
import {
  base64ToBytes,
  bytesToBase64,
  parseNativeMessage,
  postToNative,
} from './lib/bridge';

export default function App() {
  const editorRef = useRef<DocxEditorRef>(null);
  const [document, setDocument] = useState<ArrayBuffer | undefined>();
  const [title, setTitle] = useState('Untitled');
  // Revision of the last save we handed to the host; used to derive DIRTY.
  const savedRevision = useRef<number | null>(null);
  const reportedDirty = useRef(false);
  const editorReady = useRef(false);

  const reportDirty = useCallback((dirty: boolean) => {
    if (reportedDirty.current === dirty) return;
    reportedDirty.current = dirty;
    postToNative({ type: 'DIRTY', value: dirty });
  }, []);

  const exportDoc = useCallback(async () => {
    const saved = await editorRef.current?.save();
    if (!saved) return;
    postToNative({ type: 'SAVE_REQUEST', base64: bytesToBase64(new Uint8Array(saved)) });
    savedRevision.current = editorRef.current?.getDocumentHandle()?.revision ?? null;
    reportDirty(false);
  }, [reportDirty]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = parseNativeMessage(event.data);
      if (!msg) return;
      if (msg.type === 'LOAD_DOC') {
        savedRevision.current = null;
        reportedDirty.current = false;
        setTitle(new URLSearchParams(window.location.search).get('title') ?? 'Untitled');
        setDocument(base64ToBytes(msg.base64).buffer as ArrayBuffer);
      } else if (msg.type === 'EXPORT_REQUEST') {
        void exportDoc();
      }
    }
    window.addEventListener('message', onMessage);

    if (editorReady.current === false && !('ReactNativeWebView' in globalThis)) {
      // Browser dev fallback without the host app — editor mounts empty.
      void editorRef.current?.load('blank');
    }
    return () => window.removeEventListener('message', onMessage);
  }, [exportDoc]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <DocxEditor
        ref={editorRef}
        colorMode="light"
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
