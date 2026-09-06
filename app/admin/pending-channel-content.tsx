import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';

interface PendingContentItem {
  id: string;
  channel_name: string;
  owner_name: string;
  title: string;
  content_type: string;
  created_at: string;
}

export default function PendingChannelContentScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [items, setItems] = useState<PendingContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadPendingContent = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_list_pending_content');
      if (error) throw error;
      setItems(data ?? []);
    } catch (err) {
      if (__DEV__) console.error('loadPendingContent error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadPendingContent();
    }, [loadPendingContent])
  );

  const handleApprove = async (item: PendingContentItem) => {
    try {
      const { error } = await supabase.rpc('approve_channel_content', { content_id: item.id });
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      Alert.alert('Approved', `"${item.title}" has been approved.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleReject = async (item: PendingContentItem) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Please enter a reason for rejection.');
      return;
    }
    try {
      const { error } = await supabase.rpc('reject_channel_content', {
        content_id: item.id,
        reason: rejectReason.trim(),
      });
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      setRejectingId(null);
      setRejectReason('');
      Alert.alert('Rejected', `"${item.title}" has been rejected.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Reject failed');
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pending Content</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pending Content</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#2E7DFF" size="large" style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No pending content</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {items.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.channel_name} · {item.owner_name}
                </Text>
                <View style={styles.cardRow}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{item.content_type.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cardDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              {rejectingId === item.id ? (
                <View style={styles.rejectForm}>
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Reason for rejection..."
                    placeholderTextColor="#6B7C97"
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    multiline
                  />
                  <View style={styles.rejectFormActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => { setRejectingId(null); setRejectReason(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmRejectBtn}
                      onPress={() => handleReject(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.confirmRejectBtnText}>Confirm Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApprove(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => setRejectingId(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  header: {
    backgroundColor: '#0B1220',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22304A',
  },
  headerBack: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackTxt: {
    color: '#2E7DFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 28,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  list: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#182437',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22304A',
    padding: 16,
    marginBottom: 12,
  },
  cardInfo: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: '#9FB0C9',
    fontWeight: '500',
    marginBottom: 6,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    backgroundColor: '#22304A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2E7DFF',
    letterSpacing: 0.3,
  },
  cardDate: {
    fontSize: 12,
    color: '#6B7C97',
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  approveBtn: {
    backgroundColor: '#00D4FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  approveBtnText: {
    color: '#0B1220',
    fontSize: 13,
    fontWeight: '800',
  },
  rejectBtn: {
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  rejectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  rejectForm: {
    marginTop: 4,
  },
  rejectInput: {
    backgroundColor: '#22304A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF4D6D',
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  rejectFormActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    backgroundColor: '#22304A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmRejectBtn: {
    backgroundColor: '#FF4D6D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmRejectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#9FB0C9',
    fontWeight: '600',
  },
});
