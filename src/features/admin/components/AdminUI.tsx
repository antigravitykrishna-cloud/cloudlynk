import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { PressScale } from '@/components/ui/Press';
import { Icon, type IconName } from '@/components/ui/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Shared pieces for the admin screens, so they look like one panel rather than twenty.

/**
 * The frame of every admin screen: header with back button, then the content, or "Access denied"
 * for an account that is not an admin. The server re-checks is_admin on every admin call; this
 * only keeps the screens tidy.
 */
export function AdminScreen({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { isAdmin } = useAuth();
  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <ScreenHeader title={title} right={right} fallbackHref="/admin" />
      {isAdmin ? (
        children
      ) : (
        <EmptyState icon="lock" title="Access denied" message="This area is for admins only." />
      )}
    </SafeAreaView>
  );
}

export function AdminHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={s.header}>
      <TouchableOpacity
        style={s.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={s.backTxt}>‹</Text>
      </TouchableOpacity>
      <Text style={s.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.right}>{right}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.section}>{children.toUpperCase()}</Text>;
}

export function ActionButton({
  label,
  onPress,
  tone = 'brand',
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'brand' | 'neutral' | 'bad' | 'good';
  busy?: boolean;
  disabled?: boolean;
}) {
  const bg =
    tone === 'brand'
      ? Colors.brandBlue
      : tone === 'bad'
        ? Colors.dangerDim
        : tone === 'good'
          ? Colors.successDim
          : Colors.surfaceElevated;
  const fg =
    tone === 'brand'
      ? Colors.white
      : tone === 'bad'
        ? Colors.danger
        : tone === 'good'
          ? Colors.success
          : Colors.text;
  return (
    <PressScale
      style={[s.btn, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>
      )}
    </PressScale>
  );
}

export function ToolTile({
  icon,
  label,
  hint,
  tint,
  onPress,
  badge,
}: {
  icon: IconName;
  label: string;
  hint: string;
  tint: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <PressScale
      style={s.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[s.tileIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={18} color={Colors.text} />
      </View>
      <Text style={s.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.tileHint} numberOfLines={2}>
        {hint}
      </Text>
      {!!badge && badge > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeTxt}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </PressScale>
  );
}

/** The plan state of an account, as one chip. */
export function planChip(u: { plan_status: string | null; plan_expires_at: string | null }) {
  if (u.plan_status === 'lifetime') return <Chip label="LIFETIME" tone="good" />;
  const live =
    u.plan_status === 'active' && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
  if (live) return <Chip label={`PREMIUM · ${formatDate(u.plan_expires_at)}`} tone="good" />;
  if (u.plan_status === 'active' || u.plan_status === 'expired')
    return <Chip label="EXPIRED" tone="warn" />;
  return <Chip label="FREE" />;
}

export const adminStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.base,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  muted: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 19 },
  empty: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    textAlign: 'center',
    marginTop: 60,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: 6,
  },
  value: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  name: { color: Colors.text, fontSize: FontSize.subhead, fontWeight: FontWeight.bold },
});

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backTxt: {
    fontSize: 30,
    color: Colors.brandBlue,
    fontWeight: FontWeight.regular,
    lineHeight: 32,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  right: { width: 44, alignItems: 'flex-end', paddingRight: Spacing.sm },
  section: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  btn: {
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  btnTxt: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  tile: {
    width: '48%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileLabel: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.bold },
  tileHint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 3, lineHeight: 16 },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeTxt: { color: Colors.text, fontSize: FontSize.xs, fontWeight: FontWeight.extrabold },
});
