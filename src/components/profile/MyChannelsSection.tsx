import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import type { Tables } from '@/lib/database.types';
import { channelStatusBadge } from './shared';

/** The channels this user owns, with a Manage button on each. Only admins can add one. */
export function MyChannelsSection({
  channels,
  loading,
  userId,
  isAdmin,
}: {
  channels: Tables<'channels'>[];
  loading: boolean;
  userId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>My Channels</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => router.push('/create-content')} activeOpacity={0.7}>
            <Text style={styles.addText}>+ Add Channel</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} style={{ paddingVertical: 20 }} />
      ) : channels.length === 0 ? (
        <View style={styles.empty}>
          <CloudlynkLogo size={40} />
          <Text style={styles.emptyText}>No channels yet</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {channels.map(ch => {
            const badge = channelStatusBadge(ch.status);
            return (
              <View key={ch.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{ch.name}</Text>
                  <View style={styles.meta}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                    <Text style={styles.members}>{ch.member_count ?? 0} members</Text>
                  </View>
                </View>
                {(ch.owner_id === userId || isAdmin) && (
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={() =>
                      router.push({ pathname: '/channel/manage/[id]', params: { id: ch.id } })
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.manageBtnText}>Manage</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text },
  addText: { fontSize: 13, fontWeight: '700', color: Colors.brandBlue },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  list: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#182437',
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#22304A',
  },
  name: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  members: { fontSize: 11, color: '#6B7C97' },
  manageBtn: {
    backgroundColor: '#2E7DFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manageBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
