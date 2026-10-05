import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import type { Channel } from './shared';

const BUTTON: Record<'manage' | 'leave' | 'join', { label: string; outline: boolean }> = {
  manage: { label: 'Manage', outline: false },
  leave: { label: 'Leave', outline: true },
  join: { label: 'Join', outline: false },
};

/**
 * One channel in the list. The avatar, the body and the action button are deliberately SIBLING
 * touchables, not nested: wrapping the row in a pressable would swallow the button's tap.
 */
export function ChannelRow({
  channel,
  index,
  action,
  onOpen,
  onAction,
}: {
  channel: Channel;
  /** Position in the list, for the staggered entrance (capped at 8 rows, as on Feed). */
  index: number;
  action: 'manage' | 'leave' | 'join';
  onOpen: () => void;
  onAction: () => void;
}) {
  const button = BUTTON[action];
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}
      style={styles.row}
    >
      {channel.status === 'pending' && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>PENDING</Text>
        </View>
      )}
      <TouchableOpacity style={styles.avatar} onPress={onOpen} activeOpacity={0.7}>
        <Icon name={channel.is_public ? 'globe' : 'lock'} size={22} color={Colors.brandBlue} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.info} onPress={onOpen} activeOpacity={0.7}>
        <Text style={styles.name} numberOfLines={1}>
          {channel.name}
        </Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Icon name="user" size={13} color={Colors.textMuted} />
            <Text style={styles.statText}>{(channel.member_count ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.stat}>
            <Icon name="folder" size={13} color={Colors.textMuted} />
            <Text style={styles.statText}>{(channel.post_count ?? 0).toLocaleString()}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.btn,
          action === 'join' && styles.joinBtn,
          button.outline && styles.outlineBtn,
        ]}
        onPress={onAction}
        activeOpacity={0.7}
      >
        <Text style={button.outline ? styles.outlineBtnText : styles.btnText}>{button.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  pendingBadge: {
    position: 'absolute',
    top: 6,
    right: 16,
    backgroundColor: '#FFB347',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 1,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  stats: { flexDirection: 'row', gap: 14 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  btn: {
    backgroundColor: Colors.brandBlue,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  joinBtn: { paddingHorizontal: 18 },
  outlineBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.brandBlue,
  },
  btnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  outlineBtnText: { color: Colors.brandBlue, fontSize: 13, fontWeight: '700' },
});
