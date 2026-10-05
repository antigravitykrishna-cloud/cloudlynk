import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { SearchBar } from '@/components/ui/SearchBar';
import { TabHeader } from '@/components/ui/TabHeader';
import { Colors, FontSize, FontWeight, Shadows, Spacing } from '@/theme';
import { formatBytes, formatTimeAgo } from '@/utils/format';
import { GuestPrompt } from '@/features/auth/components/GuestPrompt';
import { promptSaveAccount } from '@/features/auth/guestPrompts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { StoredFile } from '@/features/files/api/filesApi';
import { CategoryFilter } from '@/features/files/components/CategoryFilter';
import { FileRow } from '@/features/files/components/FileRow';
import { TransferBanner } from '@/features/files/components/TransferBanner';
import type { FileCategory } from '@/features/files/fileCategories';
import { useFiles } from '@/features/files/hooks/useFiles';

// The Cloud tab: the person's private 15 GB drive. Files are visible to their owner only, so there
// is deliberately no share link (one would be a public URL to the file).

export default function CloudScreen() {
  const router = useRouter();
  const { user, isGuest } = useAuth();
  const { files, transfers, load, uploadFromGallery, uploadDocument, remove } = useFiles(user?.id);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FileCategory | 'all'>('all');

  // Reloads for every account change too, since `load` depends on the user id.
  useEffect(() => {
    load();
  }, [load]);

  const visible = files.filter(
    file =>
      file.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'all' || file.category === category),
  );

  const showOptions = (file: StoredFile) =>
    showAlert(file.name, `${formatBytes(file.size)} · ${formatTimeAgo(file.created_at)}`, [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          showAlert('Delete File', `Are you sure you want to delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => remove(file) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const chooseUpload = () => {
    if (isGuest) {
      promptSaveAccount(router);
      return;
    }
    showAlert('Upload', 'What would you like to upload?', [
      { text: 'Photo / Video', onPress: uploadFromGallery },
      { text: 'Document', onPress: uploadDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Signed out, nothing here would load; say what the tab is for instead of showing a blank screen.
  if (!user) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <GuestPrompt
          icon="cloud"
          title="Your 15 GB cloud drive"
          message="Back up photos, videos and documents, and stream them from anywhere. Every account gets 15 GB, free."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <TabHeader title="Cloud Storage" />

      <View style={styles.page}>
        {files.length === 0 ? (
          <EmptyState
            artwork={<CloudlynkLogo size={48} />}
            title="Nothing here yet"
            message="Tap + to upload photos, videos and documents. You have 15 GB free."
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.search}>
              <SearchBar value={query} onChange={setQuery} placeholder="Search files..." />
            </View>
            <CategoryFilter selected={category} onSelect={setCategory} />
            {visible.map(file => (
              <FileRow key={file.id} file={file} onPress={() => showOptions(file)} />
            ))}
            {visible.length === 0 ? (
              <EmptyState icon="folder" title={`No files matching "${query}"`} />
            ) : null}
          </ScrollView>
        )}
        <TransferBanner transfers={transfers} />
      </View>

      <TouchableOpacity
        style={styles.uploadButton}
        onPress={chooseUpload}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Upload"
      >
        <Text style={styles.uploadButtonText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  search: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },
  uploadButton: {
    position: 'absolute',
    bottom: 80,
    right: Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.brand,
  },
  uploadButtonText: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginTop: -2,
  },
});
