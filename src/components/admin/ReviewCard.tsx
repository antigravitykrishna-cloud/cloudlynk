import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { Icon, type IconName } from '@/components/ui/Icon';

/** A channel or post awaiting review on the Admin Panel, with Reject and Approve. */
export function ReviewCard({
  icon,
  iconColor = Colors.brandBlue,
  iconSize = 20,
  iconBg,
  title,
  titleLines,
  meta,
  description,
  descriptionLines,
  imageUrl,
  busy,
  onApprove,
  onReject,
}: {
  icon: IconName;
  iconColor?: string;
  iconSize?: number;
  iconBg?: string;
  title: string;
  titleLines?: number;
  meta: string;
  description?: string | null;
  descriptionLines?: number;
  imageUrl?: string | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, iconBg ? { backgroundColor: iconBg } : null]}>
          <Icon name={icon} size={iconSize} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={titleLines}>
            {title}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </View>
      {!!description && (
        <Text style={styles.desc} numberOfLines={descriptionLines}>
          {description}
        </Text>
      )}
      {!!imageUrl && <Image source={{ uri: imageUrl }} style={styles.thumb} resizeMode="cover" />}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectBtn} onPress={onReject} disabled={busy}>
          <Text style={styles.rejectTxt}>✕ Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveBtn} onPress={onApprove} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.approveTxt}>✓ Approve</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** "All caught up" when a review list is empty. */
export function ReviewEmpty({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Icon name="check-circle" size={44} color={Colors.success} />
      <Text style={styles.emptyTitle}>All caught up</Text>
      <Text style={styles.emptyDesc}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.extrabold, color: Colors.text },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  thumb: { width: '100%', height: 160, borderRadius: Radius.lg, marginBottom: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  rejectBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerDim,
    borderWidth: 0.5,
    borderColor: 'rgba(248,81,73,0.3)',
    alignItems: 'center',
  },
  rejectTxt: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.danger },
  approveBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
  },
  approveTxt: { fontSize: FontSize.md, fontWeight: FontWeight.extrabold, color: '#000' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.xxxl },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
