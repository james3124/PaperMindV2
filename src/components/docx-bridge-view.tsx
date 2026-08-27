import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { EDITOR_HTML } from '@/generated/editor-html';
import { encodeNativeMessage, parseWebMessage } from '@/lib/docx-bridge';

const READY_TIMEOUT_MS = 10_000;

export type DocxBridgeHandle = {
  /** Ask the embedded editor to serialize and post SAVE_REQUEST. */
  requestExport: () => void;
};

type DocxBridgeViewProps = {
  initialDocBase64: string;
  onSaveRequested: (base64: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function injectMessage(messageJson: string): string {
  // Double stringify: inject a JS string literal whose CONTENT is the JSON text
  // our web-side parser expects.
  return `window.postMessage(${JSON.stringify(messageJson)}); true;`;
}

export const DocxBridgeView = forwardRef<DocxBridgeHandle, DocxBridgeViewProps>(
  function DocxBridgeView({ initialDocBase64, onSaveRequested, onDirtyChange }, ref) {
    const webRef = useRef<WebView>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const saveRequestedRef = useRef(onSaveRequested);
    saveRequestedRef.current = onSaveRequested;
    const dirtyChangeRef = useRef(onDirtyChange);
    dirtyChangeRef.current = onDirtyChange;

    useImperativeHandle(
      ref,
      () => ({
        requestExport: () => {
          webRef.current?.injectJavaScript(injectMessage(encodeNativeMessage({
            type: 'EXPORT_REQUEST',
          })));
        },
      }),
      [],
    );

    useEffect(() => {
      if (!ready && !failed) {
        const timer = setTimeout(() => setFailed(true), READY_TIMEOUT_MS);
        return () => clearTimeout(timer);
      }
    }, [ready, failed]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const msg = parseWebMessage(event.nativeEvent.data);
        if (!msg) return;
        switch (msg.type) {
          case 'READY':
            setReady(true);
            webRef.current?.injectJavaScript(
              injectMessage(encodeNativeMessage({ type: 'LOAD_DOC', base64: initialDocBase64 })),
            );
            break;
          case 'DIRTY':
            dirtyChangeRef.current(msg.value);
            break;
          case 'SAVE_REQUEST':
            saveRequestedRef.current(msg.base64);
            break;
        }
      },
      [initialDocBase64],
    );

    if (failed) {
      return (
        <View style={styles.centered}>
          <Text style={styles.title}>Editor failed to load</Text>
          <Pressable style={styles.retry} onPress={() => setAttempt((a) => a + 1)}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.fill}>
        <WebView
          key={attempt}
          ref={webRef}
          source={{ html: EDITOR_HTML }}
          originWhitelist={['*']}
          domStorageEnabled
          javaScriptEnabled
          onMessage={handleMessage}
          onError={() => setFailed(true)}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  retry: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2b579a',
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
