import { MaterialCommunityIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocxBridgeView, type DocxBridgeHandle } from '@/components/docx-bridge-view';
import { useTheme } from '@/hooks/use-theme';
import {
  shareDocument,
  type DocumentItem,
} from '@/lib/documents';

const SAVED_TOAST_MS = 1_600;
const AUTOSAVE_DEBOUNCE_MS = 4_000;
const EXPORT_PENDING_TIMEOUT_MS = 10_000;

export default function EditorScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const uri = typeof params.uri === 'string' ? params.uri : undefined;
  const initialName =
    typeof params.name === 'string' && params.name.length > 0 ? params.name : 'Untitled.docx';

  const fileName = initialName;
  const bridgeRef = useRef<DocxBridgeHandle>(null);
  const [docBase64, setDocBase64] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pillText, setPillText] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const pendingExitRef = useRef(false);
  const pendingShareRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveActiveRef = useRef(false);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      if (!dirtyRef.current || pendingShareRef.current || pendingExitRef.current) return;
      autosaveActiveRef.current = true;
      bridgeRef.current?.requestExport();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [clearAutosaveTimer]);

  const showPill = useCallback((text: string) => {
    setPillText(text);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => setPillText(null), SAVED_TOAST_MS);
  }, []);

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  // If the editor never answers an export request (not ready yet, or a dropped
  // injection), release the pending flags so autosave isn't disabled forever.
  const armPendingTimer = useCallback(() => {
    clearPendingTimer();
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      if (!pendingShareRef.current && !pendingExitRef.current) return;
      pendingShareRef.current = false;
      pendingExitRef.current = false;
      showPill('Editor not ready — try again');
    }, EXPORT_PENDING_TIMEOUT_MS);
  }, [clearPendingTimer, showPill]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!uri) {
        setLoadError(true);
        return;
      }
      try {
        const file = new File(uri);
        const base64 = await file.base64();
        if (!cancelled) setDocBase64(base64);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  // Flush pending edits when leaving the foreground: Android may kill the app
  // at any time, and the 4s debounce would otherwise lose the last keystrokes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      if (!dirtyRef.current || pendingShareRef.current || pendingExitRef.current) return;
      clearAutosaveTimer();
      autosaveActiveRef.current = true;
      bridgeRef.current?.requestExport();
    });
    return () => sub.remove();
  }, [clearAutosaveTimer]);

  const writeInPlace = useCallback(
    async (base64: string): Promise<boolean> => {
      if (!uri) return false;
      try {
        // Write to a sibling temp file and move it into place, so a kill or
        // disk-full mid-write can never leave a truncated .docx at the real path.
        const outFile = new File(uri);
        const tmp = new File(`${uri}.tmp`);
        if (tmp.exists) tmp.delete();
        tmp.write(base64, { encoding: 'base64' });
        tmp.moveSync(outFile, { overwrite: true });
        return true;
      } catch {
        Alert.alert('Save failed', 'The document was not saved. Your edits are still open.');
        return false;
      }
    },
    [uri],
  );

  const handleSaveRequested = useCallback(
    (base64: string) => {
      void (async () => {
        clearPendingTimer();
        if (cancelledRef.current) return; // user discarded; late bytes must not write
        const saved = await writeInPlace(base64);
        if (!saved) {
          pendingShareRef.current = false;
          pendingExitRef.current = false;
          autosaveActiveRef.current = false;
          return;
        }
        // dirtyRef is driven by the web's DIRTY message (it re-states its state
        // after every save), never cleared optimistically here.

        if (pendingShareRef.current) {
          pendingShareRef.current = false;
          const item: DocumentItem = { uri: uri!, name: fileName, size: 0, lastModified: 0 };
          try {
            await shareDocument(item);
          } catch {
            showPill('Sharing failed');
          }
        }
        if (pendingExitRef.current) {
          pendingExitRef.current = false;
          router.back();
          return;
        }
        if (autosaveActiveRef.current) {
          autosaveActiveRef.current = false;
          return; // Autosaves are silent; only manual saves toast.
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showPill('Saved ✓');
      })();
    },
    [writeInPlace, uri, fileName, router, showPill, clearPendingTimer],
  );

  const handleBridgeError = useCallback(
    (message: string, fatal: boolean) => {
      if (!fatal) {
        // Benign runtime noise (e.g. ResizeObserver loop) must not eject the
        // user from an unsaved document.
        console.warn('[editor]', message);
        return;
      }
      Alert.alert(
        'Could not open document',
        message === 'not-a-docx'
          ? 'That file is not a valid Word document.'
          : 'Something went wrong while loading the document.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    [router],
  );

  const requestExit = useCallback(() => {
    if (!dirtyRef.current) {
      router.back();
      return;
    }
    Alert.alert('Unsaved changes', `Save changes to ${fileName} before leaving?`, [
      {
        text: 'Save',
        onPress: () => {
          pendingExitRef.current = true;
          armPendingTimer();
          bridgeRef.current?.requestExport();
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          cancelledRef.current = true;
          router.back();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [fileName, router, armPendingTimer]);

  const requestShare = useCallback(() => {
    pendingShareRef.current = true;
    armPendingTimer();
    bridgeRef.current?.requestExport();
  }, [armPendingTimer]);

  const requestSpellCheck = useCallback(() => {
    bridgeRef.current?.requestSpellCheck();
  }, []);

  const handleSpellCheckResult = useCallback(
    (fixed: number, remaining: number) => {
      if (fixed > 0) {
        showPill(`Fixed ${fixed} word${fixed === 1 ? '' : 's'}`);
      } else if (remaining === 0) {
        showPill('No spelling issues');
      }
    },
    [showPill],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dirtyRef.current) return false;
      requestExit();
      return true;
    });
    return () => sub.remove();
  }, [requestExit]);

  if (loadError || !uri) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>Could not open that file.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      {docBase64 === null ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.topBarWrap}>
            <View style={[styles.topBar, { backgroundColor: theme.background }]}>
              <Pressable
                onPress={requestExit}
                hitSlop={12}
                style={({ pressed }) => [styles.topBarAction, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="Back to documents"
              >
                <Text style={[styles.topBarBack, { color: '#2b579a' }]}>{'←'}</Text>
              </Pressable>

              <View style={styles.topBarCenter}>
                <Text
                  numberOfLines={1}
                  style={[styles.topBarTitle, { color: theme.text }]}
                  accessibilityLabel={`Editing ${fileName}`}
                >
                  {fileName}
                </Text>
              </View>

              <Pressable
                onPress={requestSpellCheck}
                hitSlop={12}
                style={({ pressed }) => [styles.topBarAction, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="Check spelling"
              >
                <MaterialCommunityIcons name="spellcheck" size={24} color="#2b579a" />
              </Pressable>

              <Pressable
                onPress={requestShare}
                hitSlop={12}
                style={({ pressed }) => [styles.topBarAction, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`Share ${fileName}`}
              >
                <MaterialCommunityIcons name="share-variant" size={22} color="#2b579a" />
              </Pressable>
            </View>
          </SafeAreaView>

          <DocxBridgeView
            ref={bridgeRef}
            initialDocBase64={docBase64}
            onSaveRequested={handleSaveRequested}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
              if (dirty) scheduleAutosave();
              else clearAutosaveTimer();
            }}
            onError={handleBridgeError}
            onSpellCheckResult={handleSpellCheckResult}
          />
        </>
      )}

      {pillText !== null && (
        <View style={styles.savedPill} pointerEvents="none">
          <View style={[styles.savedPillInner, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.savedPillText, { color: theme.text }]}>{pillText}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16 },
  topBarWrap: {},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 8,
    gap: 4,
  },
  topBarAction: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  topBarBack: {
    fontSize: 24,
    lineHeight: 28,
  },
  topBarShare: {
    fontSize: 16,
    fontWeight: '600',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  savedPill: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  savedPillInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  savedPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
});