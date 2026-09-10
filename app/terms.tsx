import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Colors, FontSize, FontWeight, Spacing } from '../constants/theme';
import { config } from '../lib/config';

// This screen used to carry its own hardcoded, much shorter copy of the
// Terms of Service — which meant the app could show one set of terms while
// supabase/functions/legal-pages/terms.ts (the document actually maintained
// and versioned via current_policy_versions()) said something else. There is
// now exactly one source of truth: this screen just opens that same hosted
// page in an in-app browser.
export default function TermsOfServiceScreen() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const openedRef = useRef(false);

  const open = async () => {
    if (!config.termsUrl) return;
    setOpening(true);
    openedRef.current = true;
    try {
      await WebBrowser.openBrowserAsync(config.termsUrl);
    } finally {
      setOpening(false);
      router.back();
    }
  };

  useFocusEffect(() => {
    if (!openedRef.current) open();
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        {config.termsUrl ? (
          <>
            {opening && <ActivityIndicator color={Colors.accent} size="large" style={{ marginBottom: Spacing.lg }} />}
            <Text style={styles.body}>Opening the Terms of Service…</Text>
            <TouchableOpacity onPress={open} style={styles.retryBtn} activeOpacity={0.7}>
              <Text style={styles.retryTxt}>Tap here if it didn't open</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.body}>The Terms of Service aren't configured yet. Contact support for a copy.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 60 },
  backTxt: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  body: { fontSize: FontSize.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  retryBtn: { marginTop: Spacing.lg },
  retryTxt: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
