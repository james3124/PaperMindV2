import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatRelativeDate,
  formatSize,
  type DocumentItem,
} from '@/lib/documents';

type DocumentListItemProps = {
  item: DocumentItem;
  onPress: (item: DocumentItem) => void;
  onRename: (item: DocumentItem, newName: string) => void;
  onShare: (item: DocumentItem) => void;
  onDelete: (item: DocumentItem) => void;
  style?: StyleProp<ViewStyle>;
};

export function DocumentListItem({
  item,
  onPress,
  onRename,
  onShare,
  onDelete,
  style,
}: DocumentListItemProps) {
  const theme = useTheme();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.name);

  function openSheet() {
    setDraft(item.name);
    setRenaming(false);
    setSheetVisible(true);
  }

  function closeSheet() {
    setSheetVisible(false);
    setRenaming(false);
  }

  function commitRename() {
    const next = draft.trim();
    if (next.length === 0) {
      closeSheet();
      return;
    }
    onRename(item, next);
    closeSheet();
  }

  function confirmDelete() {
    closeSheet();
    Alert.alert('Delete document', `Delete “${item.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(item) },
    ]);
  }

  return (
    <>
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={openSheet}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }, style]}
      >
        <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={styles.iconLetter}>
            W
          </ThemedText>
        </View>

        <View style={styles.body}>
          <ThemedText numberOfLines={1} style={styles.name}>
            {item.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatSize(item.size)} · {formatRelativeDate(item.lastModified)}
          </ThemedText>
        </View>

        <Pressable
          onPress={openSheet}
          hitSlop={12}
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}
        >
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Pressable>
      </Pressable>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.backdrop} onPress={closeSheet}>
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.sheetTitle}>
              {item.name}
            </ThemedText>

            {renaming ? (
              <View style={styles.renameRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={commitRename}
                  autoFocus
                  selectTextOnFocus
                  placeholder="Document name"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />
                <View style={styles.renameActions}>
                  <SheetButton label="Cancel" onPress={closeSheet} />
                  <SheetButton label="Save" onPress={commitRename} primary />
                </View>
              </View>
            ) : (
              <>
                <SheetButton label="Rename" onPress={() => setRenaming(true)} />
                <SheetButton label="Share" onPress={() => { closeSheet(); onShare(item); }} />
                <SheetButton label="Delete" onPress={confirmDelete} destructive />
                <SheetButton label="Cancel" onPress={closeSheet} />
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function SheetButton({
  label,
  onPress,
  primary,
  destructive,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();
  const color = destructive ? '#ff3b30' : primary ? '#2b579a' : theme.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetButton,
        { backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.6 },
      ]}
    >
      <ThemedText
        type="default"
        style={[styles.sheetButtonText, { color }, primary && { fontWeight: '700' }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  icon: {
    width: 44,
    height: 54,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: {
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  more: {
    flexDirection: 'row',
    gap: 3,
    paddingVertical: 12,
    paddingLeft: 12,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8a8f98',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four + 16,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  sheetTitle: {
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.one,
  },
  sheetButton: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  sheetButtonText: {
    fontSize: 16,
  },
  renameRow: {
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  renameActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});