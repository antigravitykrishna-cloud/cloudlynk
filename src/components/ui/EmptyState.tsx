import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';

type Props = {
  /** An icon from the app's set, or any element (e.g. the logo) via `artwork`. */
  icon?: IconName;
  artwork?: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

/**
 * What a list shows when it has nothing in it. Says what belongs here and how to get it there --
 * or, after a failed load, that it is worth trying again.
 */
export function EmptyState({ icon, artwork, title, message, action }: Props) {
  return (
    <View style={styles.wrap}>
      {artwork ?? (icon ? <Icon name={icon} size={44} color={Colors.textMuted} /> : null)}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} style={styles.action} />
      ) : null}
    </View>
  );
}

/** The usual empty state after a failed request: one retry button. */
export function LoadFailedState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="refresh"
      title={`Couldn't load ${what}`}
      message="Check your connection and try again."
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: FontSize.lg,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    lineHeight: 20,
  },
  action: { marginTop: Spacing.xl },
});
