import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Colors, FontSize, FontWeight, Radius, Spacing, withAlpha } from '@/theme';
import { formatClock } from '@/utils/format';

/** "Resume from 12:34" over the video, with the choice to start again instead. */
export function ResumePrompt({
  title,
  positionSeconds,
  onResume,
  onRestart,
}: {
  title?: string;
  positionSeconds: number;
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <View style={styles.card}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Text style={styles.position}>Resume from {formatClock(positionSeconds)}</Text>
        <View style={styles.actions}>
          <Button label="▶ Resume" onPress={onResume} style={styles.action} />
          <Button label="Restart" variant="secondary" onPress={onRestart} style={styles.action} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(Colors.black, 0.85),
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 80,
    zIndex: 30,
  },
  card: {
    width: '85%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  position: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.brandBlue,
    marginBottom: Spacing.xl,
  },
  actions: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  action: { flex: 1 },
});
