import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { Colors } from '@/theme';
import {
  adminReportsApi,
  type ModerationAction,
  type PendingReport,
} from '@/features/admin/api/adminReportsApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { ReportCard } from '@/features/admin/components/ReportCard';
import { errorMessage } from '@/utils/errors';

// The moderation queue for reports filed from the app. Every action re-checks is_admin on the
// server (admin_resolve_report); this screen is a convenience, not the security boundary.

export default function ReportsScreen() {
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await adminReportsApi.listPending());
    } catch (err) {
      // A queue that shows "nothing here" after a failed fetch is worse than one that errors: the
      // admin concludes there is nothing to review while the queue fills up.
      showAlert(
        'Could not load reports',
        errorMessage(err, 'Check your connection and try again.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function resolve(report: PendingReport, action: ModerationAction, note: string) {
    setResolvingId(report.id);
    try {
      await adminReportsApi.resolve(report.id, action, note);
      setReports(current => current.filter(r => r.id !== report.id));
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not resolve report.'));
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <AdminScreen title="Reports">
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={{ marginTop: 60 }} />
      ) : reports.length === 0 ? (
        <EmptyState icon="flag" title="No pending reports" />
      ) : (
        <ScrollView contentContainerStyle={adminStyles.list}>
          {reports.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              resolving={resolvingId === report.id}
              onResolve={(action, note) => resolve(report, action, note)}
            />
          ))}
        </ScrollView>
      )}
    </AdminScreen>
  );
}
