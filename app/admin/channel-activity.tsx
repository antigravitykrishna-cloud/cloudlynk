import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/theme';

interface ChannelActivity {
  id: string;
  name: string;
  owner_name: string;
  member_count: number;
  total_content_count: number;
  pending_content_count: number;
  last_upload_at: string | null;
  status: string;
}

export default function ChannelActivityScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [channels, setChannels] = useState<ChannelActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_list_channel_activity');
      if (error) throw error;
      setChannels(data ?? []);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load channel activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) fetchActivity();
    }, [isAdmin, fetchActivity])
  );

  const handleSuspend = (channelId: string, channelName: string) => {
    Alert.alert(
      'Suspend Channel',
      `Are you sure you want to suspend "${channelName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('channels')
                .update({ status: 'suspended' })
                .eq('id', channelId);
              if (error) throw error;
              Alert.alert('Done', `"${channelName}" has been suspended.`);
              fetchActivity();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to suspend channel');
            }
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'pending': return '#FF6B00';
      case 'suspended': return '#FF4D6D';
      default: return '#6E6E6E';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>{'<'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Channel Activity</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B00" />
          <Text style={styles.loadingText}>Loading channels...</Text>
        </View>
      ) : channels.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No channels</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {channels.map((channel) => (
            <View key={channel.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {channel.name}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(channel.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(channel.status) }]}>
                    {channel.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.ownerText}>Owner: {channel.owner_name}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{channel.member_count}</Text>
                  <Text style={styles.statLabel}>Members</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{channel.total_content_count}</Text>
                  <Text style={styles.statLabel}>Content</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[
                    styles.statValue,
                    channel.pending_content_count > 0 && styles.pendingHighlight,
                  ]}>
                    {channel.pending_content_count}
                  </Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
              </View>

              <Text style={styles.lastUpload}>
                Last upload: {formatDate(channel.last_upload_at)}
              </Text>

              {channel.status !== 'suspended' && (
                <TouchableOpacity
                  style={styles.suspendButton}
                  onPress={() => handleSuspend(channel.id, channel.name)}
                >
                  <Text style={styles.suspendButtonText}>Suspend</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDenied: {
    color: '#FF4D6D',
    fontSize: 18,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backText: {
    color: '#FF6B00',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 60,
  },
  loadingText: {
    color: '#A8A8A8',
    fontSize: 14,
    marginTop: 12,
  },
  emptyText: {
    color: '#6E6E6E',
    fontSize: 16,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1C1C1C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ownerText: {
    color: '#A8A8A8',
    fontSize: 13,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#6E6E6E',
    fontSize: 11,
    marginTop: 2,
  },
  pendingHighlight: {
    color: '#FF6B00',
  },
  lastUpload: {
    color: '#6E6E6E',
    fontSize: 12,
    marginBottom: 12,
  },
  suspendButton: {
    backgroundColor: '#FF4D6D20',
    borderWidth: 1,
    borderColor: '#FF4D6D',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  suspendButtonText: {
    color: '#FF4D6D',
    fontSize: 14,
    fontWeight: '600',
  },
});
