import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, View } from 'react-native';

import { DocxBridgeView, type DocxBridgeHandle } from '@/components/docx-bridge-view';

export default function EditorScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const router = useRouter();
  const uri = typeof params.uri === 'string' ? params.uri : undefined;
  const fileName =
    typeof params.name === 'string' && params.name.length > 0 ? params.name : 'Untitled.docx';

  const bridgeRef = useRef<DocxBridgeHandle>(null);
  const [docBase64, setDocBase64] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dirtyRef = useRef(false);
  const pendingExitRef = useRef(false);

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

  const writeInPlace = useCallback(
    async (base64: string): Promise<boolean> => {
      try {
        const outFile = uri ? new File(uri) : new File(Paths.document, fileName);
        outFile.write(base64, { encoding: 'base64' });
        dirtyRef.current = false;
        return true;
      } catch {
        Alert.alert('Save failed', 'The document was not saved. Your edits are still open.');
        return false;
      }
    },
    [uri, fileName],
  );

  const handleSaveRequested = useCallback(
    (base64: string) => {
      void (async () => {
        const saved = await writeInPlace(base64);
        if (saved && pendingExitRef.current) {
          pendingExitRef.current = false;
          router.back();
        }
      })();
    },
    [writeInPlace, router],
  );

  const confirmDiscard = useCallback(() => {
    Alert.alert('Unsaved changes', `Save changes to ${fileName} before leaving?`, [
      {
        text: 'Save',
        onPress: () => {
          pendingExitRef.current = true;
          bridgeRef.current?.requestExport();
        },
      },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [fileName, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dirtyRef.current) return false;
      confirmDiscard();
      return true;
    });
    return () => sub.remove();
  }, [confirmDiscard]);

  if (loadError) {
    return (
      <View style={[styles.fill, styles.centered]}>
        <Text style={styles.errorText}>Could not open that file.</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {docBase64 === null ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <DocxBridgeView
          ref={bridgeRef}
          initialDocBase64={docBase64}
          onSaveRequested={handleSaveRequested}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#ffffff' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: '#1f1f1f' },
});
