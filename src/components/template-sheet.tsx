import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TEMPLATES, type TemplateDef } from '@/generated/templates';
import { useTheme } from '@/hooks/use-theme';

type TemplateSheetProps = {
  visible: boolean;
  onSelect: (template: TemplateDef) => void;
  onClose: () => void;
};

export function TemplateSheet({ visible, onSelect, onClose }: TemplateSheetProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" style={styles.title}>
            New document
          </ThemedText>
          {TEMPLATES.map((template) => (
            <Pressable
              key={template.id}
              onPress={() => onSelect(template)}
              accessibilityRole="button"
              accessibilityLabel={`Create ${template.name}`}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold" style={styles.iconLetter}>
                  {template.name.charAt(0)}
                </ThemedText>
              </View>
              <View style={styles.body}>
                <ThemedText numberOfLines={1} style={styles.name}>
                  {template.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {template.description}
                </ThemedText>
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: theme.backgroundElement },
              pressed && { opacity: 0.6 },
            ]}
          >
            <ThemedText>Cancel</ThemedText>
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
  },
  title: {
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  icon: {
    width: 36,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: {
    fontSize: 16,
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
  cancel: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
