import { CloudlynkLogo } from '../../components/CloudlynkLogo';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../hooks/useAuth';
import { useFiles } from '../../hooks/useFiles';
import { Colors } from '../../constants/theme';
import { formatBytes, formatTimeAgo, CATEGORY_ICONS, CATEGORY_DIM } from '../../lib/storage';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: '📁' },
  { key: 'photo', label: 'Photos', icon: '🖼️' },
  { key: 'video', label: 'Videos', icon: '🎬' },
  { key: 'document', label: 'Docs', icon: '📄' },
  { key: 'audio', label: 'Audio', icon: '🎵' },
];

export default function CloudScreen() {
  const { user } = useAuth();
  const { files, activeTransfers, loadFiles, uploadImage, uploadDocument, deleteFile, createShareableLink } = useFiles(user?.id);
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      loadFiles();
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id, loadFiles]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const filteredFiles = files.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'all' || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleShare = useCallback(async (file: typeof files[0]) => {
    try {
      const url = await createShareableLink(file.storage_path);
      if (!url) { Alert.alert('Error', 'Could not generate share link.'); return; }
      await Share.share({ message: `${file.name}\n${url}`, url });
    } catch (err) {
      if ((err as Error).message !== 'User did not share') {
        Alert.alert('Share Error', (err as Error).message);
      }
    }
  }, [createShareableLink]);

  const handleCopyLink = useCallback(async (file: typeof files[0]) => {
    try {
      const url = await createShareableLink(file.storage_path);
      if (!url) { Alert.alert('Error', 'Could not generate link.'); return; }
      await Clipboard.setStringAsync(url);
      Alert.alert('Copied', 'Link copied to clipboard.');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  }, [createShareableLink]);

  const handleFileOptions = useCallback((file: typeof files[0]) => {
    Alert.alert(file.name, `${formatBytes(file.size)} · ${formatTimeAgo(file.created_at)}`, [
      { text: 'Share', onPress: () => handleShare(file) },
      { text: 'Copy Link', onPress: () => handleCopyLink(file) },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          Alert.alert('Delete File', `Are you sure you want to delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteFile(file.id, file.storage_path, file.size) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleShare, handleCopyLink, deleteFile]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Red Header */}
      <View style={styles.redHeader}>
        <Text style={styles.redHeaderTitle}>Cloud Storage</Text>
        <CloudlynkLogo size={28} />
      </View>

      <View style={styles.body}>
        {files.length === 0 ? (
          <View style={styles.emptyState}>
            <CloudlynkLogo size={48} />
            <Text style={styles.emptyText}>No Record Found</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Search bar */}
            <View style={styles.searchBar}>
              <Text style={{ fontSize: 16 }}>{'🔍'}</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search files..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Text style={{ fontSize: 16, color: Colors.textMuted }}>{'✕'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.categoryChip, activeCategory === cat.key && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(cat.key)}
                >
                  <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                  <Text style={[styles.categoryLabel, activeCategory === cat.key && styles.categoryLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* File rows */}
            {filteredFiles.map((file) => (
              <TouchableOpacity key={file.id} style={styles.fileRow} activeOpacity={0.7}
                onPress={() => handleFileOptions(file)}>
                <View style={[styles.fileIcon, { backgroundColor: CATEGORY_DIM[file.category] ?? Colors.card }]}>
                  <Text style={{ fontSize: 22 }}>{CATEGORY_ICONS[file.category] ?? '📦'}</Text>
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileMeta}>
                    {formatBytes(file.size)} · {formatTimeAgo(file.created_at)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.moreBtn} onPress={() => handleFileOptions(file)}>
                  <Text style={styles.moreDots}>{'⋯'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            {filteredFiles.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>{'📭'}</Text>
                <Text style={styles.emptyText}>{`No files matching "${search}"`}</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Active transfers banner */}
        {activeTransfers.length > 0 && (
          <View style={styles.transferBanner}>
            <Text style={{ fontSize: 14 }}>{'📤'}</Text>
            <Text style={styles.transferBannerText}>
              {activeTransfers.length} upload{activeTransfers.length > 1 ? 's' : ''} in progress
            </Text>
            <Text style={styles.transferBannerPct}>
              {Math.round(activeTransfers.reduce((a, t) => a + t.progress.percentage, 0) / activeTransfers.length)}%
            </Text>
          </View>
        )}
      </View>

      {/* FAB — upload to personal cloud storage */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Alert.alert('Upload', 'What would you like to upload?', [
            { text: 'Photo / Video', onPress: () => uploadImage() },
            { text: 'Document', onPress: () => uploadDocument() },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  redHeader: { backgroundColor: Colors.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  redHeaderTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  crownBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
  crownText: { fontSize: 18, color: Colors.brand, fontWeight: '900' },
  body: { flex: 1, backgroundColor: Colors.bg },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    backgroundColor: Colors.bg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  categoryRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
  },
  categoryChipActive: { backgroundColor: Colors.brandLight, borderColor: Colors.brand },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  categoryLabelActive: { color: Colors.brand },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  fileIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  fileMeta: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', marginTop: 2 },
  moreBtn: { padding: 8 },
  moreDots: { fontSize: 20, color: Colors.textMuted, fontWeight: '700' },
  transferBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.brandLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  transferBannerText: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.brand },
  transferBannerPct: { fontSize: 12, fontWeight: '800', color: Colors.brand },
  fab: { position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: Colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabText: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginTop: -2 },
});
