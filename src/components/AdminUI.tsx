import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { PressScale } from './Press';
import { Icon, type IconName } from './Icon';

// Shared pieces for the admin screens added in v82 (users, payments, plans,
// channels, announcements), so they look like one panel rather than six.

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
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={s.right}>{right}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.section}>{children.toUpperCase()}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' }) {
  const t = TONES[tone];
  return (
    <View style={[s.chip, { backgroundColor: t.bg }]}>
      <Text style={[s.chipTxt, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const TONES = {
  neutral: { bg: 'rgba(159,176,201,0.12)', fg: Colors.textSecondary },
  good:    { bg: 'rgba(46,212,122,0.14)', fg: Colors.success },
  warn:    { bg: 'rgba(255,179,71,0.14)', fg: Colors.warning },
  bad:     { bg: 'rgba(255,77,109,0.14)', fg: Colors.danger },
  brand:   { bg: Colors.accentOrangeDim, fg: Colors.brandBlue },
};

export function ActionButton({
  label, onPress, tone = 'brand', busy, disabled,
}: {
  label: string; onPress: () => void; tone?: 'brand' | 'neutral' | 'bad' | 'good'; busy?: boolean; disabled?: boolean;
}) {
  const bg = tone === 'brand' ? Colors.brandBlue
    : tone === 'bad' ? 'rgba(255,77,109,0.14)'
    : tone === 'good' ? 'rgba(46,212,122,0.16)'
    : Colors.surfaceElevated;
  const fg = tone === 'brand' ? '#FFFFFF' : tone === 'bad' ? Colors.danger : tone === 'good' ? Colors.success : Colors.text;
  return (
    <PressScale
      style={[s.btn, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>}
    </PressScale>
  );
}

export function ToolTile({ icon, label, hint, tint, onPress, badge }: {
  icon: IconName; label: string; hint: string; tint: string; onPress: () => void; badge?: number;
}) {
  return (
    <PressScale style={s.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.tileIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={18} color={Colors.text} />
      </View>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.tileHint} numberOfLines={2}>{hint}</Text>
      {!!badge && badge > 0 && (
        <View style={s.badge}><Text style={s.badgeTxt}>{badge > 99 ? '99+' : badge}</Text></View>
      )}
    </PressScale>
  );
}

/** The plan state of an account, as one chip. */
export function planChip(u: { plan_status: string | null; plan_expires_at: string | null }) {
  if (u.plan_status === 'lifetime') return <Chip label="LIFETIME" tone="good" />;
  const live = u.plan_status === 'active' && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
  if (live) return <Chip label={`PREMIUM · ${formatDate(u.plan_expires_at)}`} tone="good" />;
  if (u.plan_status === 'active' || u.plan_status === 'expired') return <Chip label="EXPIRED" tone="warn" />;
  return <Chip label="FREE" />;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const adminStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  input: {
    backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    color: Colors.text, fontSize: FontSize.base, paddingHorizontal: 12, paddingVertical: 10,
  },
  muted: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 19 },
  empty: { color: Colors.textSecondary, fontSize: FontSize.base, textAlign: 'center', marginTop: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: 6 },
  value: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  name: { color: Colors.text, fontSize: FontSize.subhead, fontWeight: FontWeight.bold },
});

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 30, color: Colors.brandBlue, fontWeight: FontWeight.regular, lineHeight: 32 },
  title: { flex: 1, textAlign: 'center', color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  right: { width: 44, alignItems: 'flex-end', paddingRight: Spacing.sm },
  section: {
    color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, letterSpacing: 0.6,
    marginTop: Spacing.xl, marginBottom: Spacing.sm, marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border, padding: Spacing.lg, marginBottom: 10,
  },
  chip: { borderRadius: Radius.xs, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  chipTxt: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  btn: { borderRadius: Radius.md, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  btnTxt: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  tile: {
    width: '48%', backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, padding: 14, marginBottom: 10,
  },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tileLabel: { color: Colors.text, fontSize: FontSize.base, fontWeight: FontWeight.bold },
  tileHint: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 3, lineHeight: 16 },
  badge: {
    position: 'absolute', top: 10, right: 10, minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeTxt: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: FontWeight.extrabold },
});
