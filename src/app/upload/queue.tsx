/**
 * v0.7.0 Upload Queue screen.
 * Lists queued items, shows upload progress per-item, and provides
 * controls to start/pause/resume the queue. Persisted in AsyncStorage.
 */

import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { showAlert } from '../../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useUploadQueue, QueueItem } from '../../hooks/useUploadQueue';
import { StreamService, STREAM_MAX_MB } from '../../lib/stream';
import { Icon } from '../../components/Icon';

export default function QueueScreen() {
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const {
    items, isUploading, completedCount, failedCount, queuedCount, maxItems,
    addToQueue, removeFromQueue, startUpload, pauseUpload, resumeUpload,
    retryItem, clearCompleted,
  } = useUploadQueue(channelId);

  const [adding, setAdding] = useState(false);

  const handleAddMore = useCallback(async () => {
    setAdding(true);
    try {
      const videos = await StreamService.pickVideos();
      if (videos.length === 0) return;

      const oversized = videos.filter(v => v.size > STREAM_MAX_MB * 1024 * 1024);
      if (oversized.length > 0) {
        showAlert(
          'Files too large',
          `${oversized.length} file(s) exceed the ${STREAM_MAX_MB}MB upload limit and will be skipped.`,
        );
      }

      const added = await addToQueue(videos.map(v => ({ video: v })));
      if (added === 0 && videos.length > 0) {
        showAlert(
          'Queue full',
          // "unlimited uploads" read as a storage claim, which is false —
          // storage_limit is pinned to 15 GB for every account by
          // protect_profile_privileged_fields, Premium included. The limit
          // here is how many files can sit in one batch.
          `You can queue ${maxItems} files at a time. Remove some, or go Premium to queue as many as you like — storage stays 15 GB on every plan.`,
        );
      }
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Could not add videos');
    } finally {
      setAdding(false);
    }
  }, [addToQueue, maxItems]);

  const handleRemove = useCallback((itemId: string, title: string) => {
    showAlert('Remove', `Remove "${title || 'Untitled'}" from the queue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFromQueue(itemId) },
    ]);
  }, [removeFromQueue]);

  const handleRetry = useCallback(async (itemId: string) => {
    await retryItem(itemId);
  }, [retryItem]);

  const handleEdit = useCallback((itemId: string) => {
    router.push({ pathname: '/upload/form/[id]', params: { id: itemId } });
  }, [router]);

  const getStatusBadge = (status: string, progress: number) => {
    switch (status) {
      case 'done':
        return { label: 'Done', color: Colors.success, bg: Colors.successDim };
      case 'uploading':
        return { label: `${Math.round(progress * 100)}%`, color: Colors.accentOrange, bg: Colors.accentOrangeDim };
      case 'failed':
        return { label: 'Failed', color: Colors.danger, bg: Colors.dangerDim };
      case 'paused':
        return { label: 'Paused', color: Colors.warning, bg: Colors.warningDim };
      case 'over_limit':
        return { label: 'Too large', color: Colors.danger, bg: Colors.dangerDim };
      default:
        return { label: 'Queued', color: Colors.textMuted, bg: Colors.surfaceHover };
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
          <Text style={styles.backTxt}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload Queue</Text>
        <TouchableOpacity
          onPress={handleAddMore}
          disabled={adding}
          style={styles.addBtn}
          activeOpacity={0.7}
        >
          {adding ? <ActivityIndicator color={Colors.brand} size="small" /> : <Text style={styles.addBtnTxt}>+ Add</Text>}
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{queuedCount}</Text>
          <Text style={styles.statLabel}>Queued</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{completedCount}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, failedCount > 0 && { color: Colors.danger }]}>{failedCount}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{maxItems === Infinity ? '∞' : maxItems}</Text>
          <Text style={styles.statLabel}>Limit</Text>
        </View>
      </View>

      {/* Queue controls */}
      {items.length > 0 && (
        <View style={styles.controls}>
          {isUploading ? (
            <TouchableOpacity style={styles.controlBtn} onPress={pauseUpload} activeOpacity={0.7}>
              <Text style={styles.controlBtnTxt}>{'⏸ Pause'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.controlBtn, styles.controlBtnPrimary]}
              onPress={startUpload}
              disabled={queuedCount === 0}
              activeOpacity={0.7}
            >
              <Text style={[styles.controlBtnTxt, styles.controlBtnTxtPrimary]}>
                {queuedCount > 0 ? '▶ Start Upload' : 'No queued items'}
              </Text>
            </TouchableOpacity>
          )}
          {(completedCount > 0 || failedCount > 0) && (
            <TouchableOpacity style={styles.controlBtn} onPress={clearCompleted} activeOpacity={0.7}>
              <Text style={styles.controlBtnTxt}>Clear done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Uploading banner */}
      {isUploading && (
        <View style={styles.banner}>
          <ActivityIndicator color={Colors.accentOrange} size="small" style={{ marginRight: 8 }} />
          <Text style={styles.bannerText}>
            {`Uploading ${completedCount + 1} of ${items.length}…`}
          </Text>
        </View>
      )}

      {/* Queue list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="folder" size={16} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No uploads queued</Text>
            <Text style={styles.emptyDesc}>
              Tap "+ Add" to pick videos from your device. You can queue{' '}
              {maxItems === Infinity ? 'as many files as you like' : `${maxItems} files`} at once.
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={handleAddMore} activeOpacity={0.7}>
              <Text style={styles.emptyAddTxt}>Pick Videos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((item: QueueItem) => {
            const badge = getStatusBadge(item.status, item.progress);
            const isOversize = item.status === 'over_limit';
            const canEdit = item.status === 'queued' || item.status === 'over_limit';
            const canRetry = item.status === 'failed';
            const canRemove = item.status !== 'uploading';

            return (
              <View key={item.id} style={styles.itemCard}>
                {/* Progress bar */}
                {item.status === 'uploading' && (
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.round(item.progress * 100)}%` }]} />
                  </View>
                )}

                <View style={styles.itemBody}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.title || item.video.name}
                    </Text>
                    <Text style={styles.itemSize}>
                      {(item.video.size / (1024 * 1024)).toFixed(0)} MB
                    </Text>
                  </View>

                  {/* Status badge */}
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>

                {/* Error message */}
                {item.status === 'failed' && item.error && (
                  <Text style={styles.errorText} numberOfLines={2}>{item.error}</Text>
                )}
                {isOversize && (
                  <Text style={styles.errorText} numberOfLines={2}>
                    {`This file is ${(item.video.size / 1024 / 1024).toFixed(0)}MB — the limit is ${STREAM_MAX_MB}MB. Pick a smaller file.`}
                  </Text>
                )}

                {/* Action row */}
                <View style={styles.itemActions}>
                  {canEdit && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item.id)} activeOpacity={0.7}>
                      <Text style={styles.actionBtnTxt}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {canRetry && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleRetry(item.id)} activeOpacity={0.7}>
                      <Text style={[styles.actionBtnTxt, { color: Colors.success }]}>Retry</Text>
                    </TouchableOpacity>
                  )}
                  {canRemove && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleRemove(item.id, item.title || item.video.name)} activeOpacity={0.7}>
                      <Text style={[styles.actionBtnTxt, { color: Colors.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  addBtn: { width: 70, alignItems: 'flex-end' },
  addBtnTxt: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  controlBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  controlBtnPrimary: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  controlBtnTxt: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  controlBtnTxtPrimary: { color: '#ffffff' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.accentOrangeDim,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accentOrange,
  },
  bannerText: { fontSize: 12, fontWeight: '700', color: Colors.accentOrange },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressBar: { height: 3, backgroundColor: Colors.surfaceHover, marginBottom: 10, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accentOrange, borderRadius: 4 },
  itemBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemMain: { flex: 1, marginRight: 10 },
  itemName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  itemSize: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  errorText: { fontSize: 11, color: Colors.danger, fontWeight: '600', lineHeight: 16, marginBottom: 8 },
  itemActions: { flexDirection: 'row', gap: 12, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: Colors.border },
  actionBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  actionBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyAddBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.sm,
  },
  emptyAddTxt: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
