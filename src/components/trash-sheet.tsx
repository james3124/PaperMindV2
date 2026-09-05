import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeDate, type DocumentItem } from '@/lib/documents';

type TrashSheetProps = {
  visible: boolean;
  items: DocumentItem[];
  onRestore: (item: DocumentItem) => void;
  onDelete: (item: DocumentItem) => void;
  onEmpty: () => void;
  onClose: () => void;
};

export function TrashSheet({ visible, items, onRestore, onDelete, onEmpty, onClose }: TrashSheetProps) {
  const theme = useTheme();

  function confirmEmpty() {
    if (items.length === 0) return;
    Alert.alert(
      'Empty trash',
      `Permanently delete ${items.length} document${items.length === 1 ? '' : 's'}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onEmpty },
      ],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" style={styles.title}>
            Trash
          </ThemedText>
          {items.map((item) => (
            <View
              key={item.uri}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.body}>
                <ThemedText numberOfLines={1} style={styles.name}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatRelativeDate(item.lastModified)}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => onRestore(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              >
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Restore
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => onDelete(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name} permanently`}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              >
                <ThemedText type="smallBold" style={{ color: '#ff3b30' }}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          ))}
          {items.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Trash is empty.
            </ThemedText>
          )}
          {items.length > 0 && (
            <Pressable
              onPress={confirmEmpty}
              accessibilityRole="button"
              accessibilityLabel="Empty trash"
              style={({ pressed }) => [
                styles.emptyButton,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: '#ff3b30' }}>
                Empty trash
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close trash"
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: theme.backgroundElement },
              pressed && { opacity: 0.6 },
            ]}
          >
            <ThemedText>Close</ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '80%',
  },
  title: {
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  action: {
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  emptyButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  cancel: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
