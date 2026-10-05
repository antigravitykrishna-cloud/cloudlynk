import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import type { Channel } from '@/features/channels/api/channelsApi';

/** What the button on the right of a channel row does. */
export type ChannelRowAction = 'manage' | 'leave' | 'join';

/**
 * One channel in a list. The avatar and the text open the channel; the button on the right is a
 * sibling, not a child, so tapping it never also opens the channel.
 */
export function ChannelRow({
  channel,
  index,
  action,
  onOpen,
  onAction,
}: {
  channel: Channel;
  /** Position in the list, for the staggered entrance. */
  index: number;
  action: ChannelRowAction;
  onOpen: () => void;
  onAction: () => void;
}) {
  return (
    // Rows arrive 45 ms apart, capped at 8 so a long list does not keep the last row waiting.
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}
      style={styles.row}
    >
      <TouchableOpacity style={styles.avatar} onPress={onOpen} activeOpacity={0.7}>
        <Icon name={channel.is_public ? 'globe' : 'lock'} size={22} color={Colors.brandBlue} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.info} onPress={onOpen} activeOpacity={0.7}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {channel.name}
          </Text>
          {channel.status === 'pending' ? <Chip label="PENDING" tone="warn" /> : null}
        </View>
        <View style={styles.stats}>
          <Stat icon="user" value={channel.member_count} />
          <Stat icon="folder" value={channel.post_count} />
        </View>
      </TouchableOpacity>

      {action === 'manage' ? (
        <Button label="Manage" size="sm" onPress={onAction} />
      ) : action === 'leave' ? (
        <Button label="Leave" size="sm" variant="outline" onPress={onAction} />
      ) : (
        <Button label="Join" size="sm" onPress={onAction} />
      )}
    </Animated.View>
  );
}

function Stat({ icon, value }: { icon: 'user' | 'folder'; value: number | null }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={13} color={Colors.textMuted} />
      <Text style={styles.statText}>{(value ?? 0).toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  name: {
    flexShrink: 1,
    fontSize: FontSize.subhead,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  stats: { flexDirection: 'row', gap: 14 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  statText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
});
