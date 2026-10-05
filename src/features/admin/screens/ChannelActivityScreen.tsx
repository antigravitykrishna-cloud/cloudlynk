import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import { adminChannelsApi, type ChannelActivity } from '@/features/admin/api/adminChannelsApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { useAdminAction } from '@/features/admin/hooks/useAdminAction';

// What each channel is doing: members, content, what is waiting for review, the last upload.

const STATUS_TONE: Record<string, ChipTone> = {
  active: 'good',
  pending: 'brand',
  suspended: 'bad',
  rejected: 'bad',
};

export default function ChannelActivityScreen() {
  const [channels, setChannels] = useState<ChannelActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setChannels(await adminChannelsApi.listActivity());
    } catch (err) {
      showAlert('Could not load channel activity', errorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshControl = usePullToRefresh(load);
  const actions = useAdminAction(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const suspend = (channel: ChannelActivity) =>
    actions.confirm(
      'Suspend channel?',
      `"${channel.name}" disappears for everyone until it is reactivated.`,
      'Suspend',
      () =>
        actions.run(
          channel.id,
          () => adminChannelsApi.setStatus(channel.id, 'suspended'),
          `"${channel.name}" has been suspended.`,
        ),
    );

  return (
    <AdminScreen title="Channel Activity">
      {loading ? (
        <ActivityIndicator size="large" color={Colors.brandBlue} style={styles.loading} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={channel => channel.id}
          contentContainerStyle={adminStyles.list}
          refreshControl={refreshControl}
          ListEmptyComponent={<EmptyState icon="broadcast" title="No channels" />}
          renderItem={({ item }) => (
            <Card>
              <View style={[adminStyles.row, styles.header]}>
                <Text style={[adminStyles.name, styles.flex]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Chip
                  label={item.status.toUpperCase()}
                  tone={STATUS_TONE[item.status] ?? 'neutral'}
                />
              </View>
              <Text style={adminStyles.muted}>Owner: {item.owner_name}</Text>
              <View style={styles.stats}>
                <Stat label="Members" value={item.member_count} />
                <Stat label="Content" value={item.total_content_count} />
                <Stat label="Pending" value={item.pending_content_count} highlight />
              </View>
              <Text style={adminStyles.muted}>Last upload: {formatDate(item.last_upload_at)}</Text>
              {item.status !== 'suspended' ? (
                <Button
                  label="Suspend"
                  variant="danger"
                  size="sm"
                  busy={actions.busy === item.id}
                  onPress={() => suspend(item)}
                  style={styles.suspend}
                />
              ) : null}
            </Card>
          )}
        />
      )}
    </AdminScreen>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && value > 0 && styles.highlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 60 },
  header: { justifyContent: 'space-between', marginBottom: Spacing.xs },
  flex: { flex: 1 },
  stats: { flexDirection: 'row', marginVertical: Spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.extrabold },
  statLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  highlight: { color: Colors.warning },
  suspend: { marginTop: Spacing.md, alignSelf: 'flex-start' },
});
