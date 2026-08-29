import { MaterialCommunityIcons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocxBridgeView, type DocxBridgeHandle } from '@/components/docx-bridge-view';
import { useTheme } from '@/hooks/use-theme';
import {
  shareDocument,
  renameDocument,
  type DocumentItem,
} from '@/lib/documents';

const SAVED_TOAST_MS = 1_600;
const AUTOSAVE_DEBOUNCE_MS = 4_000;
const EXPORT_PENDING_TIMEOUT_MS = 10_000;

export default function EditorScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const paramUri = typeof params.uri === 'string' ? params.uri : undefined;
  const initialName =
    typeof params.name === 'string' && params.name.length > 0 ? params.name : 'Untitled.docx';

  // Current on-disk location; changes when the document is renamed in-editor
  // so saves never write back to a stale path.
  const [uri, setUri] = useState(paramUri);
  const [fileName, setFileName] = useState(initialName);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const bridgeRef = useRef<DocxBridgeHandle>(null);
  const [docBase64, setDocBase64] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pillText, setPillText] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
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
      if (!paramUri) {
        setLoadError(true);
        return;
      }
      try {
        const file = new File(paramUri);
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
  }, [paramUri]);

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

  const openRename = useCallback(() => {
    setRenameText(fileName.replace(/\.docx$/i, ''));
    setRenameVisible(true);
  }, [fileName]);

  const confirmRename = useCallback(() => {
    if (!uri) return;
    try {
      const item: DocumentItem = { uri, name: fileName, size: 0, lastModified: 0 };
      const renamed = renameDocument(item, renameText);
      setUri(renamed.uri);
      setFileName(renamed.name);
      setRenameVisible(false);
      showPill('Renamed');
    } catch {
      showPill('Rename failed');
    }
  }, [uri, fileName, renameText, showPill]);

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
                <Text style={[styles.topBarBack, { color: theme.accent }]}>{'←'}</Text>
              </Pressable>

              <View style={styles.topBarCenter}>
                <Pressable
                  onPress={openRename}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${fileName}. Unsaved changes indicator ${dirty ? 'shown' : 'hidden'}`}
                  style={({ pressed }) => [styles.topBarTitleWrap, pressed && { opacity: 0.6 }]}
                >
                  <Text numberOfLines={1} style={[styles.topBarTitle, { color: theme.text }]}>
                    {fileName}
                  </Text>
                  {dirty && (
                    <View
                      style={[styles.dirtyDot, { backgroundColor: theme.accent }]}
                      accessibilityLabel="Unsaved changes"
                    />
                  )}
                </Pressable>
              </View>

              <Pressable
                onPress={requestSpellCheck}
                hitSlop={12}
                style={({ pressed }) => [styles.topBarAction, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="Check spelling"
              >
                <MaterialCommunityIcons name="spellcheck" size={24} color={theme.accent} />
              </Pressable>

              <Pressable
                onPress={requestShare}
                hitSlop={12}
                style={({ pressed }) => [styles.topBarAction, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`Share ${fileName}`}
              >
                <MaterialCommunityIcons name="share-variant" size={22} color={theme.accent} />
              </Pressable>
            </View>
          </SafeAreaView>

          <DocxBridgeView
            ref={bridgeRef}
            initialDocBase64={docBase64}
            onSaveRequested={handleSaveRequested}
            onDirtyChange={(next) => {
              dirtyRef.current = next;
              setDirty(next);
              if (next) scheduleAutosave();
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

      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.renameBackdrop}>
          <View style={[styles.renameCard, { backgroundColor: theme.background }]}>
            <Text style={[styles.renameTitle, { color: theme.text }]}>Rename document</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              autoCorrect={false}
              style={[styles.renameInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              accessibilityLabel="New file name"
            />
            <View style={styles.renameActions}>
              <Pressable
                onPress={() => setRenameVisible(false)}
                style={({ pressed }) => [styles.renameButton, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.6 }]}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmRename}
                style={({ pressed }) => [styles.renameButton, { backgroundColor: theme.accent }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ color: theme.accentText }}>Rename</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'center',
  },
  topBarTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  dirtyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  renameBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    padding: 20,
    gap: 14,
  },
  renameTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  renameInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  renameButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
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