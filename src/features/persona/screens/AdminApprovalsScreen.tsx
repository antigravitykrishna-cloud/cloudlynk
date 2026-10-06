/**
 * Admin Approvals Screen
 * Shows pending user approvals for organic users
 * Allows admins to review and approve/reject users
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  fetchPendingApprovals,
  approveUser as approve,
  rejectUser as reject,
  type PendingUser,
} from '../api/approvals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors, Spacing } from '@/theme';
import { showAlert } from '@/components/ui/Feedback';

export default function AdminApprovalsScreen() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      setUsers(await fetchPendingApprovals());
    } catch (error) {
      console.error('Failed to fetch pending users:', error);
      showAlert('Error', 'Failed to load pending approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPendingUsers();
  }, []);

  const approveUser = async (userId: string) => {
    try {
      setApproving(userId);
      await approve(userId);

      // Show success and refresh
      showAlert('Approved', `User ${userId.slice(0, 8)}... approved`);
      setUsers(users.filter(u => u.user_id !== userId));
    } catch (error) {
      console.error('Approval failed:', error);
      showAlert('Error', 'Failed to approve user');
    } finally {
      setApproving(null);
    }
  };

  const rejectUser = async (userId: string) => {
    Alert.alert('Reject User', 'Mark this user as rejected?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Reject',
        onPress: async () => {
          try {
            setApproving(userId);
            await reject(userId);

            showAlert('Rejected', `User ${userId.slice(0, 8)}... rejected`);
            setUsers(users.filter(u => u.user_id !== userId));
          } catch {
            showAlert('Error', 'Failed to reject user');
          } finally {
            setApproving(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.brandBlue} />
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>✓ All users approved!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pending Approvals</Text>
        <Text style={styles.count}>{users.length}</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={item => item.user_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <UserCard
            user={item}
            onApprove={() => approveUser(item.user_id)}
            onReject={() => rejectUser(item.user_id)}
            isProcessing={approving === item.user_id}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

function UserCard({
  user,
  onApprove,
  onReject,
  isProcessing,
}: {
  user: PendingUser;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const score = user.risk_score ?? 0.5;
  const riskLevel = score > 0.7 ? 'High' : score > 0.4 ? 'Medium' : 'Low';
  const riskColor = score > 0.7 ? Colors.danger : score > 0.4 ? Colors.warning : Colors.success;

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.userId}>User: {user.user_id.slice(0, 12)}...</Text>
        <View style={[styles.riskBadge, { backgroundColor: riskColor }]}>
          <Text style={styles.riskText}>{riskLevel} Risk</Text>
        </View>
      </View>

      <View style={styles.details}>
        <DetailRow label="Persona" value={user.persona} />
        <DetailRow label="Risk Score" value={`${((user.risk_score ?? 0.5) * 100).toFixed(0)}%`} />
        <DetailRow
          label="Requested"
          value={user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label="Reject"
          size="sm"
          style={styles.rejectButton}
          onPress={onReject}
          disabled={isProcessing}
        />
        <Button
          label="Approve"
          size="sm"
          style={styles.approveButton}
          onPress={onApprove}
          disabled={isProcessing}
          busy={isProcessing}
        />
      </View>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  count: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.brandBlue,
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  listContent: {
    padding: Spacing.md,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  userId: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  details: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  approveButton: {
    flex: 1,
  },
});
