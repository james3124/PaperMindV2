import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentListItem } from '@/components/document-list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DOCX_MIME } from '@/lib/docx-bridge';
import {
  createBlankDocument,
  deleteDocument,
  importDocument as importDocIntoLibrary,
  listDocuments,
  renameDocument,
  shareDocument,
  type DocumentItem,
} from '@/lib/documents';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const reload = useCallback(() => {
    setDocuments(listDocuments());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function createNew() {
    const item = createBlankDocument();
    reload();
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  async function importFromDevice() {
    const result = await DocumentPicker.getDocumentAsync({ type: DOCX_MIME });
    if (result.canceled) return;
    const asset = result.assets[0];
    const item = importDocIntoLibrary(asset.uri, asset.name);
    reload();
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  function openDoc(item: DocumentItem) {
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  function doRename(item: DocumentItem, newName: string) {
    renameDocument(item, newName);
    reload();
  }

  function doShare(item: DocumentItem) {
    void shareDocument(item);
  }

  function doDelete(item: DocumentItem) {
    deleteDocument(item);
    reload();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Documents
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {documents.length === 0
              ? 'No documents yet'
              : `${documents.length} document${documents.length === 1 ? '' : 's'}`}
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void createNew()}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: '#2b579a' },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" style={styles.actionPrimaryText}>
              + New
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => void importFromDevice()}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold">Import</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={documents}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <DocumentListItem
              item={item}
              onPress={openDoc}
              onRename={doRename}
              onShare={doShare}
              onDelete={doDelete}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Tap + New to start a blank document,{'\n'}or Import to open a .docx from your device.
              </ThemedText>
            </View>
          }
        />

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  actionPrimaryText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  listContent: {
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});