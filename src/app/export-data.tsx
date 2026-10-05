import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/theme';
import { Icon } from '../components/Icon';

type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

export default function ExportDataScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [fileSize, setFileSize] = useState<string>('');
  const [recordCount, setRecordCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setStatus('idle');
        setFileSize('');
        setRecordCount(0);
      };
    }, [])
  );

  const countRecords = (data: Record<string, unknown>): number => {
    let count = 0;
    if (data.profile) count += 1;
    const arrayKeys = ['channel_memberships', 'channels_owned', 'channel_posts_authored', 'subscription_requests', 'uploaded_videos'];
    for (const key of arrayKeys) {
      const arr = data[key];
      if (Array.isArray(arr)) count += arr.length;
    }
    return count;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleExport = async () => {
    setStatus('loading');
    try {
      const { data, error } = await supabase.rpc('export_my_data');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No data returned');

      const jsonString = JSON.stringify(data, null, 2);
      const fileName = `cloudlynk-data-export-${Date.now()}.json`;
      const file = new File(Paths.cache, fileName);

      file.write(jsonString);

      const size = file.size ?? jsonString.length;
      setFileSize(formatFileSize(size));
      setRecordCount(countRecords(data as Record<string, unknown>));

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export My Data',
          UTI: 'public.json',
        });
      } else {
        showAlert('Saved', `Data exported to:\n${file.uri}`);
      }

      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      showAlert('Export Failed', err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Export My Data</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.card}>
          <Icon name="package" size={30} color={Colors.brandBlue} />
          <Text style={styles.cardTitle}>Download Your Data</Text>
          <Text style={styles.cardDesc}>
            Download a copy of all your data in JSON format. Includes your profile, channel memberships, posts, subscription history, and uploaded videos.
          </Text>
        </View>

        {status === 'success' && (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>{'✓'}</Text>
            <Text style={styles.successText}>Download started</Text>
            {fileSize ? <Text style={styles.successMeta}>File size: {fileSize}</Text> : null}
            {recordCount > 0 ? <Text style={styles.successMeta}>{recordCount} records exported</Text> : null}
          </View>
        )}

        <TouchableOpacity
          style={[styles.exportBtn, status === 'loading' && styles.exportBtnDisabled]}
          onPress={handleExport}
          activeOpacity={0.7}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.exportBtnText}>Download My Data</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Your data is exported as a JSON file that you can open with any text editor. No data is sent to third parties during this process.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.brand, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: -2 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  body: { flex: 1, padding: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  cardIcon: { fontSize: 48, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  cardDesc: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  successCard: {
    backgroundColor: '#12261C', borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 20,
  },
  successIcon: { fontSize: 24, color: '#2ED47A', fontWeight: '800', marginBottom: 4 },
  successText: { fontSize: 15, fontWeight: '700', color: '#2ED47A', marginBottom: 4 },
  successMeta: { fontSize: 13, color: '#6B7C97', marginTop: 2 },
  exportBtn: {
    backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginBottom: 20,
  },
  exportBtnDisabled: { opacity: 0.7 },
  exportBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
