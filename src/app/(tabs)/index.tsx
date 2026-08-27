import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { DOCX_MIME } from '@/lib/docx-bridge';

export default function HomeScreen() {
  const router = useRouter();

  async function openDocx() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCX_MIME,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    router.push({ pathname: '/editor', params: { uri: asset.uri, name: asset.name } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            PaperMind
          </ThemedText>
        </ThemedView>

        <Pressable onPress={() => void openDocx()} style={styles.openButton}>
          <ThemedView type="backgroundElement" style={styles.stepContainer}>
            <ThemedText type="linkPrimary">Open a .docx</ThemedText>
            <ThemedText type="small">edit it like Word, then save or share</ThemedText>
          </ThemedView>
        </Pressable>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  openButton: {
    alignSelf: 'stretch',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});
