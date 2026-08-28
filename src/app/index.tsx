import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  ToastAndroid,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentListItem } from '@/components/document-list-item';
import { TemplateSheet } from '@/components/template-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { TemplateDef } from '@/generated/templates';
import { useTheme } from '@/hooks/use-theme';
import { DOCX_MIME } from '@/lib/docx-bridge';
import {
  createDocumentFromTemplate,
  deleteDocument,
  importDocument as importDocIntoLibrary,
  listDocuments,
  renameDocument,
  shareDocument,
  type DocumentItem,
} from '@/lib/documents';
import { fetchLatestRelease, isNewerVersion, type UpdateInfo } from '@/lib/updates';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templateSheetVisible, setTemplateSheetVisible] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const current = Constants.expoConfig?.version;
    if (!current || Platform.OS === 'web') return;
    const controller = new AbortController();
    void (async () => {
      const latest = await fetchLatestRelease(controller.signal);
      if (latest && isNewerVersion(latest.version, current)) setUpdate(latest);
    })();
    return () => controller.abort();
  }, []);

  const reload = useCallback((animate = false) => {
    if (animate) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDocuments(listDocuments());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut), []);

  function openTemplateSheet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTemplateSheetVisible(true);
  }

  function createFromTemplate(template: TemplateDef) {
    setTemplateSheetVisible(false);
    const item = createDocumentFromTemplate(template);
    reload(true);
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  async function importFromDevice() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCX_MIME,
      multiple: true,
    });
    if (result.canceled) return;
    const imported: DocumentItem[] = [];
    for (const asset of result.assets) {
      try {
        imported.push(importDocIntoLibrary(asset.uri, asset.name));
      } catch {
        // Skip files that cannot be read; keep importing the rest.
      }
    }
    if (imported.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reload(true);
    if (imported.length === 1) {
      const item = imported[0];
      router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
    } else {
      toast(`Imported ${imported.length} documents`);
    }
  }

  function openDoc(item: DocumentItem) {
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  function doRename(item: DocumentItem, newName: string) {
    renameDocument(item, newName);
    reload(true);
  }

  function doShare(item: DocumentItem) {
    void shareDocument(item);
  }

  function doDelete(item: DocumentItem) {
    deleteDocument(item);
    reload(true);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle" style={styles.title}>
              Documents
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {documents.length === 0
                ? 'No documents yet'
                : `${documents.length} document${documents.length === 1 ? '' : 's'}`}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => void importFromDevice()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Import Word documents from your device"
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="file-import" size={22} color={theme.text} />
          </Pressable>
        </View>

        {update !== null && (
          <Pressable
            onPress={() => void Linking.openURL(update.url)}
            accessibilityRole="button"
            accessibilityLabel={`Download update ${update.version}`}
            style={({ pressed }) => [
              styles.updateBanner,
              { backgroundColor: theme.backgroundElement },
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThemedText type="smallBold">Update available — v{update.version}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tap to download
            </ThemedText>
            <Pressable
              onPress={() => setUpdate(null)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notice"
              style={styles.updateDismiss}
            >
              <ThemedText type="small" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          </Pressable>
        )}

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
                Tap + to start a new document,{'\n'}or the import icon to open a .docx.
              </ThemedText>
            </View>
          }
        />

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>

      <Pressable
        onPress={openTemplateSheet}
        accessibilityRole="button"
        accessibilityLabel="Create a new document from a template"
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
        ]}
      >
        <Ionicons name="add" size={30} color="#ffffff" />
      </Pressable>

      <TemplateSheet
        visible={templateSheetVisible}
        onSelect={createFromTemplate}
        onClose={() => setTemplateSheetVisible(false)}
      />
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
    paddingBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  updateDismiss: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  listContent: {
    gap: Spacing.one,
    paddingBottom: 100,
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
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.five,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2b579a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
