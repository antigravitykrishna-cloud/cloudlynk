import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { TextButton } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, FontSize, Spacing } from '@/theme';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/features/legal/legalDocuments';

/**
 * A thin launcher for one hosted legal page: opens it in an in-app browser as soon as the screen
 * shows, and goes back when the browser closes.
 */
export function LegalDocumentScreen({ document }: { document: LegalDocumentId }) {
  const router = useRouter();
  const { title, url, missingMessage } = LEGAL_DOCUMENTS[document];
  const [opening, setOpening] = useState(false);
  const opened = useRef(false);

  const open = async () => {
    if (!url) return;
    opened.current = true;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(url);
    } finally {
      setOpening(false);
      router.back();
    }
  };

  useFocusEffect(() => {
    if (!opened.current) open();
  });

  return (
    <SafeAreaView style={styles.page}>
      <ScreenHeader title={title} />
      <View style={styles.content}>
        {url ? (
          <>
            {opening ? (
              <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.spinner} />
            ) : null}
            <Text style={styles.body}>Opening the {title}…</Text>
            <TextButton label="Tap here if it didn't open" onPress={open} />
          </>
        ) : (
          <Text style={styles.body}>{missingMessage}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  spinner: { marginBottom: Spacing.lg },
  body: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
