import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  ToastAndroid,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentListItem } from '@/components/document-list-item';
import { TemplateSheet } from '@/components/template-sheet';
import { TrashSheet } from '@/components/trash-sheet';
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
  duplicateDocument,
  emptyTrash,
  exportCopyToDirectory,
  importDocument as importDocIntoLibrary,
  exportTextToCache,
  listDocuments,
  listTrash,
  recentDocuments,
  renameDocument,
  restoreDocument,
  shareDocument,
  trashDocument,
  type DocumentItem,
} from '@/lib/documents';
import { countWords, extractDocxText } from '@/lib/docx-text';
import { docxBytesToPrintHtml, printHtml } from '@/lib/print';
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
  const [trashItems, setTrashItems] = useState<DocumentItem[]>([]);
  const [templateSheetVisible, setTemplateSheetVisible] = useState(false);
  const [trashVisible, setTrashVisible] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [selecting, setSelecting] = useState(false);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  // Word counts keyed by uri+mtime+size; unzip is sync so results are cached
  // per reload instead of recomputed on every render.
  const statsCache = useRef(new Map<string, string | null>());

  function statsFor(item: DocumentItem): string | null {
    const key = `${item.uri}|${item.lastModified}|${item.size}`;
    const cached = statsCache.current.get(key);
    if (cached !== undefined) return cached;
    let stats: string | null = null;
    try {
      const text = extractDocxText(new File(item.uri).bytesSync());
      if (text !== null) {
        const words = countWords(text);
        stats = `${words} word${words === 1 ? '' : 's'} · ${Math.max(1, Math.ceil(words / 200))} min`;
      }
    } catch {
      stats = null; // unreadable -> no stats, never wrong numbers
    }
    statsCache.current.set(key, stats);
    return stats;
  }

  type Row = { kind: 'header'; key: string; title: string } | { kind: 'doc'; item: DocumentItem };

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered =
      q.length === 0 ? documents : documents.filter((d) => d.name.toLowerCase().includes(q));
    const sorted = [...filtered];
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'size') sorted.sort((a, b) => b.size - a.size);
    else sorted.sort((a, b) => b.lastModified - a.lastModified);
    // Recent section only for the default date-sorted, unfiltered library.
    if (q.length === 0 && sortBy === 'date' && sorted.length > 3) {
      const recent = recentDocuments(sorted, 3);
      const recentUris = new Set(recent.map((d) => d.uri));
      const out: Row[] = [{ kind: 'header', key: 'h-recent', title: 'Recent' }];
      for (const item of recent) out.push({ kind: 'doc', item });
      out.push({ kind: 'header', key: 'h-all', title: 'All documents' });
      for (const item of sorted.filter((d) => !recentUris.has(d.uri))) out.push({ kind: 'doc', item });
      return out;
    }
    return sorted.map((item) => ({ kind: 'doc', item }));
  }, [documents, query, sortBy]);

  useEffect(() => {
    if (__DEV__) return; // dev builds carry a placeholder version; the banner would always show
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
    try {
      setDocuments(listDocuments());
      setTrashItems(listTrash());
      statsCache.current.clear();
    } catch {
      toast('Could not read the document library');
    }
  }, []);

  // Latch navigation so a double-tap cannot open two editors on one document.
  const navigatingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
      reload();
    }, [reload]),
  );

  function openTemplateSheet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTemplateSheetVisible(true);
  }

  function openEditor(item: DocumentItem) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push({ pathname: '/editor', params: { uri: item.uri, name: item.name } });
  }

  function createFromTemplate(template: TemplateDef) {
    setTemplateSheetVisible(false);
    try {
      openEditor(createDocumentFromTemplate(template));
    } catch {
      toast('Could not create the document');
    }
  }

  async function importFromDevice() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCX_MIME,
      multiple: true,
    });
    if (result.canceled) return;
    const imported: DocumentItem[] = [];
    let failed = 0;
    for (const asset of result.assets) {
      try {
        imported.push(importDocIntoLibrary(asset.uri, asset.name));
      } catch {
        failed += 1;
      }
    }
    if (imported.length === 0) {
      toast(failed > 0 ? `Could not import ${failed} file${failed === 1 ? '' : 's'}` : 'Nothing imported');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reload(true);
    if (failed > 0) toast(`Imported ${imported.length}, failed ${failed}`);
    if (imported.length === 1) {
      openEditor(imported[0]);
    }
  }

  function openDoc(item: DocumentItem) {
    openEditor(item);
  }

  function doRename(item: DocumentItem, newName: string) {
    try {
      renameDocument(item, newName);
      reload(true);
    } catch {
      toast('Rename failed');
    }
  }

  function doShare(item: DocumentItem) {
    shareDocument(item)
      .then((shared) => {
        if (!shared) toast('Sharing is not available on this device');
      })
      .catch(() => toast('Sharing failed'));
  }

  async function doSaveCopy(item: DocumentItem) {
    let dest: Directory;
    try {
      dest = await Directory.pickDirectoryAsync();
    } catch {
      return; // picker dismissed — no-op, never an error toast
    }
    try {
      const out = exportCopyToDirectory(item, dest);
      toast(`Saved copy as ${out.name}`);
    } catch {
      toast('Export failed');
    }
  }

  function doExportText(item: DocumentItem) {    let txt: { uri: string; name: string };
    try {
      txt = exportTextToCache(item);
    } catch {
      toast('Could not read the document text');
      return;
    }
    shareDocument({ uri: txt.uri, name: txt.name, size: 0, lastModified: 0 }, 'text/plain')
      .then((shared) => {
        if (!shared) toast('Sharing is not available on this device');
      })
      .catch(() => toast('Sharing failed'));
  }

  function doPrint(item: DocumentItem) {
    void (async () => {
      try {
        const bytes = new File(item.uri).bytesSync();
        await printHtml(docxBytesToPrintHtml(bytes, item.name));
      } catch {
        toast('Print failed');
      }
    })();
  }

  function doDelete(item: DocumentItem) {
    Alert.alert(
      'Delete permanently',
      `Delete “${item.name}” forever? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              deleteDocument(item);
              reload(true);
            } catch {
              toast('Delete failed');
            }
          },
        },
      ],
    );
  }

  function doTrash(item: DocumentItem) {
    try {
      trashDocument(item);
      reload(true);
    } catch {
      toast('Could not move to trash');
    }
  }

  function doDuplicate(item: DocumentItem) {
    try {
      openEditor(duplicateDocument(item));
      reload();
    } catch {
      toast('Could not duplicate');
    }
  }

  function doRestore(item: DocumentItem) {
    try {
      restoreDocument(item);
      reload(true);
    } catch {
      toast('Restore failed');
    }
  }

  function doEmptyTrash() {
    try {
      emptyTrash();
      reload(true);
    } catch {
      toast('Could not empty trash');
    }
  }

  function toggleSelect(item: DocumentItem) {
    setSelectedUris((prev) =>
      prev.includes(item.uri) ? prev.filter((uri) => uri !== item.uri) : [...prev, item.uri],
    );
  }

  function exitSelection() {
    setSelecting(false);
    setSelectedUris([]);
  }

  function selectedItems(): DocumentItem[] {
    const byUri = new Map(documents.map((d) => [d.uri, d]));
    return selectedUris.map((uri) => byUri.get(uri)).filter((d) => d !== undefined);
  }

  function doTrashSelected() {
    const items = selectedItems();
    let failed = 0;
    for (const item of items) {
      try {
        trashDocument(item);
      } catch {
        failed += 1;
      }
    }
    exitSelection();
    reload(true);
    if (failed > 0) toast(`Could not trash ${failed} file${failed === 1 ? '' : 's'}`);
  }

  async function doSaveCopySelected() {
    const items = selectedItems();
    if (items.length === 0) return;
    let dest: Directory;
    try {
      dest = await Directory.pickDirectoryAsync();
    } catch {
      return;
    }
    let failed = 0;
    for (const item of items) {
      try {
        exportCopyToDirectory(item, dest);
      } catch {
        failed += 1;
      }
    }
    exitSelection();
    if (failed > 0) toast(`Export failed for ${failed} file${failed === 1 ? '' : 's'}`);
    else toast(`Saved ${items.length} ${items.length === 1 ? 'copy' : 'copies'}`);
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
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => (selecting ? exitSelection() : setSelecting(true))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={selecting ? 'Cancel selection' : 'Select documents'}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor: selecting ? theme.accent : theme.backgroundElement,
                },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={selecting ? 'close' : 'format-list-checks'}
                size={22}
                color={selecting ? theme.accentText : theme.text}
              />
            </Pressable>
            <Pressable
              onPress={() => setTrashVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Open trash, ${trashItems.length} documents`}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.text} />
              {trashItems.length > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <ThemedText style={[styles.badgeText, { color: theme.accentText }]}>
                    {trashItems.length > 9 ? '9+' : `${trashItems.length}`}
                  </ThemedText>
                </View>
              )}
            </Pressable>
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
        </View>

        {selecting && (
          <View style={[styles.selectionBar, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">
              {selectedUris.length === 0
                ? 'Select documents'
                : `${selectedUris.length} selected`}
            </ThemedText>
            <View style={styles.selectionActions}>
              <Pressable
                onPress={doTrashSelected}
                disabled={selectedUris.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Move selected to trash"
                style={({ pressed }) => [styles.selectionButton, pressed && styles.pressed]}
              >
                <ThemedText type="smallBold" style={{ color: '#ff3b30' }}>
                  Trash
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void doSaveCopySelected()}
                disabled={selectedUris.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Save copies of selected"
                style={({ pressed }) => [styles.selectionButton, pressed && styles.pressed]}
              >
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Save copy
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

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

        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search documents"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Search documents"
            style={[
              styles.searchInput,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />
          <Pressable
            onPress={() =>
              setSortBy((s) => (s === 'date' ? 'name' : s === 'name' ? 'size' : 'date'))
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Sort documents, currently by ${sortBy}`}
            style={({ pressed }) => [
              styles.sortButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold">
              {sortBy === 'date' ? 'Date' : sortBy === 'name' ? 'Name' : 'Size'}
            </ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(row) => (row.kind === 'header' ? row.key : row.item.uri)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
                {row.title}
              </ThemedText>
            ) : (
              <DocumentListItem
                item={row.item}
                stats={statsFor(row.item)}
                selectionMode={selecting}
                selected={selectedUris.includes(row.item.uri)}
                onPress={openDoc}
                onToggleSelect={toggleSelect}
                onRename={doRename}
                onShare={doShare}
                onSaveCopy={(target) => void doSaveCopy(target)}
                onExportText={doExportText}
                onPrint={doPrint}
                onDuplicate={doDuplicate}
                onTrash={doTrash}
              />
            )
          }
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
          { backgroundColor: theme.accent },
          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
        ]}
      >
        <Ionicons name="add" size={30} color={theme.accentText} />
      </Pressable>

      <TemplateSheet
        visible={templateSheetVisible}
        onSelect={createFromTemplate}
        onClose={() => setTemplateSheetVisible(false)}
      />
      <TrashSheet
        visible={trashVisible}
        items={trashItems}
        onRestore={doRestore}
        onDelete={doDelete}
        onEmpty={doEmptyTrash}
        onClose={() => setTrashVisible(false)}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  selectionButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  sortButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    minWidth: 64,
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
