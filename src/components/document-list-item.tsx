import { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatRelativeDate,
  formatSize,
  type DocumentItem,
} from '@/lib/documents';

type AnimatedInterpolation = ReturnType<Animated.Value['interpolate']>;

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
  const swipeRef = useRef<Swipeable>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.name);

  function openSheet() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    swipeRef.current?.close();
    closeSheet();
    Alert.alert('Delete document', `Delete “${item.name}”? This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onDelete(item);
        },
      },
    ]);
  }

  function swipeShare() {
    swipeRef.current?.close();
    onShare(item);
  }

  function renderRightActions(
    progress: AnimatedInterpolation,
    _drag: AnimatedInterpolation,
  ) {
    const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
    return (
      <View style={styles.swipeActions}>
        <Animated.View style={[styles.swipeButtonWrap, { opacity }]}>
          <Pressable
            onPress={swipeShare}
            accessibilityRole="button"
            accessibilityLabel={`Share ${item.name}`}
            style={[styles.swipeButton, { backgroundColor: theme.accent }]}
          >
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              Share
            </ThemedText>
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.swipeButtonWrap, { opacity }]}>
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
            style={[styles.swipeButton, { backgroundColor: '#ff3b30' }]}
          >
            <ThemedText type="smallBold" style={styles.swipeButtonText}>
              Delete
            </ThemedText>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootFriction={6}
        containerStyle={[styles.swipeContainer, style]}
      >
        <View style={[styles.row, { backgroundColor: theme.background }]}>
          <Pressable
            onPress={() => onPress(item)}
            onLongPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${formatSize(item.size)}, ${formatRelativeDate(item.lastModified)}`}
            accessibilityHint="Opens the document. Long press or swipe left for more actions."
            style={({ pressed }) => [
              styles.rowBody,
              pressed && { opacity: 0.6, transform: [{ scale: 0.98 }] },
            ]}
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
          </Pressable>

          <Pressable
            onPress={openSheet}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${item.name}`}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}
          >
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </Pressable>
        </View>
      </Swipeable>

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
  const color = destructive ? '#ff3b30' : primary ? theme.accent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
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
  swipeContainer: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  swipeActions: {
    flexDirection: 'row',
  },
  swipeButtonWrap: {
    width: 76,
  },
  swipeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeButtonText: {
    color: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minWidth: 0,
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
