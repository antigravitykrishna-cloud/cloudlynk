import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';

/** A titled block of the review queue with a pending-count badge and an empty message. */
export function QueueSection({
  title,
  count,
  emptyText,
  first,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  /** The first section sits flush; later ones get space above. */
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <View style={[styles.header, !first && { marginTop: 24 }]}>
        <Text style={styles.title}>{title}</Text>
        {count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      {count === 0 ? <Text style={styles.empty}>{emptyText}</Text> : children}
    </>
  );
}

export type QueueAction = { kind: 'play' | 'approve' | 'reject'; onPress: () => void };

const ACTION_LABEL: Record<QueueAction['kind'], string> = {
  play: 'Play',
  approve: 'Approve',
  reject: 'Reject',
};

/** One item awaiting review: its name (and optional type badge), detail lines and buttons. */
export function QueueRow({
  name,
  badge,
  meta,
  description,
  actions,
}: {
  name: string;
  badge?: string | null;
  meta: string[];
  description?: string | null;
  actions: QueueAction[];
}) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        {badge ? (
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{badge}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        )}
        {meta.map((line, i) => (
          <Text key={i} style={styles.meta} numberOfLines={i === 0 ? 1 : undefined}>
            {line}
          </Text>
        ))}
        {description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions.map(a => (
          <TouchableOpacity
            key={a.kind}
            style={styles[a.kind]}
            onPress={a.onPress}
            activeOpacity={0.7}
          >
            <Text style={a.kind === 'reject' ? styles.rejectText : styles.solidText}>
              {ACTION_LABEL[a.kind]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text },
  countBadge: {
    backgroundColor: '#FFB347',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  empty: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  info: { marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  meta: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginBottom: 2 },
  desc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  play: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  approve: {
    backgroundColor: '#2ED47A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reject: {
    backgroundColor: '#2A1620',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.brandBlue,
  },
  solidText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  rejectText: { color: Colors.brandBlue, fontSize: 13, fontWeight: '700' },
  typeBadge: {
    backgroundColor: Colors.brandBlueDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.brandBlue, letterSpacing: 0.3 },
});
