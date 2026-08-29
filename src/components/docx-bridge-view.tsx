import { File, Paths } from 'expo-file-system';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { EDITOR_HTML } from '@/generated/editor-html';
import { encodeNativeMessage, parseWebMessage } from '@/lib/docx-bridge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const READY_TIMEOUT_MS = 10_000;

/**
 * Writes the (large) editor HTML to the cache directory once and returns its
 * file URI, so the WebView loads from disk instead of parsing an inline
 * string on every open. Returns null to fall back to inline loading.
 * The file name carries the bundle length, and the cached copy is validated
 * against the UTF-8 byte length, so app updates and truncated writes both
 * invalidate it. The write goes to a temp file first and is moved into place,
 * so a kill mid-write can never leave a half-written cache file.
 */
function ensureEditorHtmlFile(): string | null {
  try {
    const expectedBytes = new TextEncoder().encode(EDITOR_HTML).length;
    const name = `papermind-editor-${EDITOR_HTML.length}.html`;
    const file = new File(Paths.cache, name);
    if (file.exists && file.size === expectedBytes) return file.uri;
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith('papermind-editor-')) {
        entry.delete();
      }
    }
    const tmp = new File(Paths.cache, `${name}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.write(EDITOR_HTML);
    if (tmp.size !== expectedBytes) {
      tmp.delete();
      return null;
    }
    tmp.moveSync(file, { overwrite: true });
    return file.uri;
  } catch {
    return null;
  }
}

export type DocxBridgeHandle = {
  /** Ask the embedded editor to serialize and post SAVE_REQUEST. */
  requestExport: () => void;
  /** Ask the embedded editor to run its spell check panel. */
  requestSpellCheck: () => void;
};

type DocxBridgeViewProps = {
  initialDocBase64: string;
  onSaveRequested: (base64: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onError: (message: string, fatal: boolean) => void;
  onSpellCheckResult?: (fixed: number, remaining: number) => void;
};

function injectMessage(messageJson: string): string {
  // Double stringify: inject a JS string literal whose CONTENT is the JSON text
  // our web-side parser expects.
  return `window.postMessage(${JSON.stringify(messageJson)}); true;`;
}

export const DocxBridgeView = forwardRef<DocxBridgeHandle, DocxBridgeViewProps>(
  function DocxBridgeView(
    { initialDocBase64, onSaveRequested, onDirtyChange, onError, onSpellCheckResult },
    ref,
  ) {
    const webRef = useRef<WebView>(null);
    const theme = useTheme();
    const scheme = useColorScheme();
    const themeValue = scheme === 'dark' ? 'dark' : 'light';
    const [htmlFileUri] = useState(ensureEditorHtmlFile);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    const saveRequestedRef = useRef(onSaveRequested);
    saveRequestedRef.current = onSaveRequested;
    const dirtyChangeRef = useRef(onDirtyChange);
    dirtyChangeRef.current = onDirtyChange;
    const errorRef = useRef(onError);
    errorRef.current = onError;
    const spellResultRef = useRef(onSpellCheckResult);
    spellResultRef.current = onSpellCheckResult;
    // The editor fires READY on every instance mount; re-sending LOAD_DOC each
    // time makes the web editor remount in a loop (new document identity per
    // load), which resets scroll and closes the keyboard mid-type. Send once.
    const docSentRef = useRef(false);

    useEffect(() => {
      docSentRef.current = false;
    }, [initialDocBase64, attempt]);

    useImperativeHandle(
      ref,
      () => ({
        requestExport: () => {
          webRef.current?.injectJavaScript(injectMessage(encodeNativeMessage({
            type: 'EXPORT_REQUEST',
          })));
        },
        requestSpellCheck: () => {
          webRef.current?.injectJavaScript(injectMessage(encodeNativeMessage({
            type: 'SPELL_CHECK_REQUEST',
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

    // Keep the embedded editor's chrome in sync with the app color scheme.
    useEffect(() => {
      if (!ready) return;
      webRef.current?.injectJavaScript(
        injectMessage(encodeNativeMessage({ type: 'SET_THEME', value: themeValue })),
      );
    }, [ready, themeValue]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const msg = parseWebMessage(event.nativeEvent.data);
        if (!msg) return;
        switch (msg.type) {
          case 'READY':
            // No SET_THEME here: setReady(true) re-renders and the theme
            // useEffect below sends it exactly once.
            setReady(true);
            if (!docSentRef.current) {
              docSentRef.current = true;
              webRef.current?.injectJavaScript(
                injectMessage(encodeNativeMessage({ type: 'LOAD_DOC', base64: initialDocBase64 })),
              );
            }
            break;
          case 'DIRTY':
            dirtyChangeRef.current(msg.value);
            break;
          case 'SAVE_REQUEST':
            saveRequestedRef.current(msg.base64);
            break;
          case 'ERROR':
            errorRef.current(msg.message, msg.fatal);
            break;
          case 'SPELL_CHECK_RESULT':
            spellResultRef.current?.(msg.fixed, msg.remaining);
            break;
        }
      },
      [initialDocBase64],
    );

    if (failed) {
      return (
        <View style={[styles.centered, { backgroundColor: theme.background }]}>
          <Text style={[styles.title, { color: theme.text }]}>Editor failed to load</Text>
          <Pressable
            style={({ pressed }) => [
              styles.retry,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              setFailed(false);
              setReady(false);
              setAttempt((a) => a + 1);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <WebView
          key={attempt}
          ref={webRef}
          source={htmlFileUri ? { uri: htmlFileUri } : { html: EDITOR_HTML }}
          // The editor page is local; anything else (a hyperlink inside an
          // imported document) must leave the app via the browser, never
          // navigate the in-app WebView.
          originWhitelist={['file://*']}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.startsWith('file://')) return true;
            void Linking.openURL(request.url).catch(() => {});
            return false;
          }}
          allowFileAccess
          domStorageEnabled
          javaScriptEnabled
          onMessage={handleMessage}
          onError={() => setFailed(true)}
          // Android kills the renderer under memory pressure; surface it as the
          // retryable failure state instead of a permanently blank editor.
          onRenderProcessGone={() => setFailed(true)}
          // Android: never inflate text to match the system font scale — it reads
          // as the page zooming whenever an input is focused, and breaks layout.
          textZoom={100}
          scalesPageToFit={false}
          overScrollMode="never"
          style={{ backgroundColor: theme.background }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
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