import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import type { Tables } from '@/lib/database.types';
import { ManageCard } from './ManageCard';

/** Name, status, visibility and member count. */
export function ChannelSummaryCard({ channel }: { channel: Tables<'channels'> }) {
  const active = channel.status === 'active';
  return (
    <ManageCard>
      <Text style={styles.name}>{channel.name}</Text>
      <View style={styles.badges}>
        <View
          style={[
            styles.badge,
            { backgroundColor: active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)' },
          ]}
        >
          <Text style={[styles.badgeText, { color: active ? Colors.success : '#EAB308' }]}>
            {channel.status}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{channel.is_public ? 'Public' : 'Private'}</Text>
        </View>
        {channel.member_count !== undefined && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{channel.member_count} members</Text>
          </View>
        )}
      </View>
    </ManageCard>
  );
}

const styles = StyleSheet.create({
  name: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  badgeText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
