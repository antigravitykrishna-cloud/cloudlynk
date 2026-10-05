import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, TextButton } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { Channel } from '@/features/channels/api/channelsApi';
import { useOwnedChannels } from '@/features/channels/hooks/useOwnedChannels';

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  active: { label: 'Active', tone: 'good' },
  pending: { label: 'Pending', tone: 'warn' },
};
const SUSPENDED = { label: 'Suspended', tone: 'bad' as const };

/** The channels this person owns, each with a Manage button. Only admins can add one. */
export function MyChannelsSection() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { channels, loading } = useOwnedChannels(user?.id);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>My Channels</Text>
        {isAdmin ? (
          <TextButton label="+ Add Channel" onPress={() => router.push('/create-content')} />
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />
      ) : channels.length === 0 ? (
        <View style={styles.empty}>
          <CloudlynkLogo size={40} />
          <Text style={styles.emptyText}>No channels yet</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {channels.map(channel => (
            <OwnedChannelRow
              key={channel.id}
              channel={channel}
              onManage={() =>
                router.push({ pathname: '/channel/manage/[id]', params: { id: channel.id } })
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

function OwnedChannelRow({ channel, onManage }: { channel: Channel; onManage: () => void }) {
  const status = STATUS[channel.status] ?? SUSPENDED;
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.name}>{channel.name}</Text>
        <View style={styles.meta}>
          <Chip label={status.label} tone={status.tone} />
          <Text style={styles.members}>{channel.member_count ?? 0} members</Text>
        </View>
      </View>
      <Button label="Manage" size="sm" onPress={onManage} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text },
  loading: { paddingVertical: Spacing.xl },
  empty: { alignItems: 'center', paddingVertical: 40, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.base, color: Colors.text, fontWeight: FontWeight.semibold },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  rowText: { flex: 1 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs, gap: Spacing.sm },
  members: { fontSize: FontSize.xs, color: Colors.textMuted },
});
