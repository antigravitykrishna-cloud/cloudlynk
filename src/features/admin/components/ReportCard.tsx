import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { formatDateTime } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type {
  ModerationAction,
  PendingReport,
  ReportTargetType,
} from '@/features/admin/api/adminReportsApi';

const REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Inappropriate content',
  copyright_violation: 'Copyright violation',
  harassment: 'Harassment or bullying',
  spam: 'Spam or scam account',
  impersonation: 'Impersonation',
  hate_speech: 'Hate speech',
  other: 'Other',
};

const TARGET_CHIP: Record<ReportTargetType, { label: string; tone: 'brand' | 'bad' | 'warn' }> = {
  content: { label: 'CONTENT', tone: 'brand' },
  user: { label: 'USER', tone: 'bad' },
  copyright: { label: 'COPYRIGHT', tone: 'warn' },
  other: { label: 'OTHER', tone: 'brand' },
};

/** The actions that make sense for a report depend on what it points at. */
function actionsFor(report: PendingReport) {
  const actions: { action: ModerationAction; label: string; variant: ButtonVariant }[] = [
    { action: 'dismiss', label: 'Dismiss', variant: 'secondary' },
    { action: 'warn', label: 'Warn', variant: 'secondary' },
  ];
  if (report.post_id) {
    actions.push({ action: 'remove_content', label: 'Remove content', variant: 'warning' });
  }
  if (report.channel_id) {
    actions.push({ action: 'suspend_channel', label: 'Suspend channel', variant: 'warning' });
  }
  if (report.reported_user_id) {
    actions.push({ action: 'suspend_user', label: 'Suspend user', variant: 'danger' });
    actions.push({ action: 'ban_user', label: 'Ban user', variant: 'danger' });
  }
  return actions;
}

/**
 * One report in the moderation queue. Dismissing needs no note; every other action asks for one,
 * which is kept in the audit log.
 */
export function ReportCard({
  report,
  resolving,
  onResolve,
}: {
  report: PendingReport;
  resolving: boolean;
  onResolve: (action: ModerationAction, note: string) => void;
}) {
  const [chosenAction, setChosenAction] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState('');
  const chip = TARGET_CHIP[report.target_type] ?? TARGET_CHIP.other;

  const choose = (action: ModerationAction) => {
    if (action === 'dismiss') {
      onResolve(action, 'Dismissed — no violation found.');
      return;
    }
    setChosenAction(action);
    setNote('');
  };

  const confirm = () => {
    if (!chosenAction) return;
    if (!note.trim()) {
      showAlert(
        'Note required',
        'Add a short note explaining this action (kept for audit history).',
      );
      return;
    }
    onResolve(chosenAction, note.trim());
  };

  return (
    <Card>
      <View style={styles.topRow}>
        <Chip label={chip.label} tone={chip.tone} />
        <Text style={styles.date}>{formatDateTime(report.created_at)}</Text>
      </View>

      <Text style={styles.reason}>{REASON_LABELS[report.reason] ?? report.reason}</Text>
      <Text style={styles.meta}>Reported by {report.reporterName}</Text>
      {report.reportedUserName ? (
        <Text style={styles.meta}>Account: {report.reportedUserName}</Text>
      ) : null}
      {report.postTitle ? <Text style={styles.meta}>Content: {report.postTitle}</Text> : null}

      {chosenAction ? (
        <View style={styles.noteForm}>
          <TextField
            placeholder="Note for the audit log (required)…"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={styles.row}>
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => setChosenAction(null)}
            />
            <Button label="Confirm" size="sm" onPress={confirm} busy={resolving} />
          </View>
        </View>
      ) : (
        <View style={[styles.row, styles.actions]}>
          {actionsFor(report).map(({ action, label, variant }) => (
            <Button
              key={action}
              label={label}
              variant={variant}
              size="sm"
              disabled={resolving}
              onPress={() => choose(action)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  date: { fontSize: FontSize.xs, color: Colors.textMuted },
  reason: {
    fontSize: FontSize.subhead,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 6,
  },
  meta: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: 2 },
  noteForm: { marginTop: Spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actions: { marginTop: Spacing.md },
});
