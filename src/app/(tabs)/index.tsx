import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
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
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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
            onPress={openTemplateSheet}
            accessibilityRole="button"
            accessibilityLabel="Create a new document from a template"
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
            accessibilityRole="button"
            accessibilityLabel="Import Word documents from your device"
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
                Start a blank document, or import{'\n'}a .docx from your device.
              </ThemedText>
              <View style={styles.emptyActions}>
                <Pressable
                  onPress={openTemplateSheet}
                  accessibilityRole="button"
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
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="smallBold">Import</ThemedText>
                </Pressable>
              </View>
            </View>
          }
        />

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>

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
    gap: Spacing.four,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
});
