import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showAlert } from '@/components/ui/Feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';

type Props = {
  icon: IconName;
  iconTint?: string;
  title: string;
  /** Who, where and when, one short line each. */
  meta: string[];
  description?: string | null;
  imageUri?: string | null;
  /** Extra controls above Approve / Reject, e.g. a Play button. */
  extra?: ReactNode;
  busy: boolean;
  onApprove: () => void;
  /** Called after the admin confirms the rejection. Omit to supply a custom reject flow. */
  onReject?: () => void;
  /** What the confirmation says will happen, e.g. "The owner will be notified." */
  rejectWarning?: string;
};

/** One item waiting for review: what it is, then Approve and Reject (with a confirmation). */
export function ReviewCard({
  icon,
  iconTint = Colors.brandBlue,
  title,
  meta,
  description,
  imageUri,
  extra,
  busy,
  onApprove,
  onReject,
  rejectWarning = 'The owner will be notified.',
}: Props) {
  const confirmReject = () =>
    showAlert(`Reject "${title}"?`, rejectWarning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: onReject },
    ]);

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name={icon} size={18} color={iconTint} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {meta.map(line => (
            <Text key={line} style={styles.meta} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      {description ? (
        <Text style={styles.description} numberOfLines={4}>
          {description}
        </Text>
      ) : null}
      {imageUri ? <Image source={imageUri} style={styles.image} contentFit="cover" /> : null}
      {extra}
      {onReject ? (
        <View style={styles.actions}>
          <Button
            label="Reject"
            variant="danger"
            onPress={confirmReject}
            disabled={busy}
            style={styles.action}
          />
          <Button
            label="Approve"
            variant="success"
            haptic="success"
            onPress={onApprove}
            busy={busy}
            style={styles.action}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: { color: Colors.text, fontSize: FontSize.subhead, fontWeight: FontWeight.bold },
  meta: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 19,
    marginTop: Spacing.md,
  },
  image: { height: 160, borderRadius: Radius.md, marginTop: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  action: { flex: 1 },
});
