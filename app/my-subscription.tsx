import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

interface SubscriptionStatus {
  plan_status: string | null;
  plan_expires_at: string | null;
  plan_started_at: string | null;
  latest_request_id: string | null;
  latest_request_plan_code: string | null;
  latest_request_amount_inr: number | null;
  latest_request_status: string | null;
  latest_request_rejection_reason: string | null;
  latest_request_created_at: string | null;
  latest_request_reviewed_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case 'active': return '#16a34a';
    case 'pending': return '#d97706';
    case 'expired': return Colors.brand;
    case 'cancelled': return Colors.brand;
    default: return Colors.textMuted;
  }
}

function getRequestStatusColor(status: string | null): string {
  switch (status) {
    case 'approved': return '#16a34a';
    case 'pending': return '#d97706';
    case 'rejected': return Colors.brand;
    default: return Colors.textMuted;
  }
}

/** User-facing subscription status page showing current plan and latest request. */
export default function MySubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_my_subscription_status');
      if (error) throw error;
      if (data && data.length > 0) {
        setStatus(data[0] as SubscriptionStatus);
      } else {
        setStatus(null);
      }
    } catch (err) {
      if (__DEV__) console.error('fetchStatus error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchStatus();
  }, [fetchStatus]));

  const planStatus = status?.plan_status ?? 'free';
  const planLabel = planStatus.toUpperCase();
  const isActive = planStatus === 'active';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backTxt}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Subscription</Text>
        <View style={{ width: 80 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Current Plan Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Plan</Text>
            <View style={[styles.badge, { backgroundColor: getStatusColor(planStatus) + '18' }]}>
              <Text style={[styles.badgeText, { color: getStatusColor(planStatus) }]}>
                {planLabel}
              </Text>
            </View>
            {isActive && status?.plan_expires_at && (
              <Text style={styles.cardMeta}>
                Active until {formatDate(status.plan_expires_at)}
              </Text>
            )}
            {isActive && status?.plan_started_at && (
              <Text style={styles.cardSub}>
                Started {formatDate(status.plan_started_at)}
              </Text>
            )}
            {!isActive && planStatus === 'free' && (
              <Text style={styles.cardMeta}>You are on the free plan.</Text>
            )}
            {planStatus === 'expired' && (
              <Text style={styles.cardMeta}>Your plan expired on {formatDate(status?.plan_expires_at ?? null)}.</Text>
            )}
          </View>

          {/* Latest Request Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Latest Request</Text>
            {status?.latest_request_id ? (
              <View>
                <View style={styles.requestRow}>
                  <Text style={styles.requestPlan}>
                    {(status.latest_request_plan_code ?? '').toUpperCase()}
                    {status.latest_request_amount_inr ? ` · ₹${status.latest_request_amount_inr}` : ''}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: getRequestStatusColor(status.latest_request_status) + '18' }]}>
                    <Text style={[styles.badgeText, { color: getRequestStatusColor(status.latest_request_status) }]}>
                      {(status.latest_request_status ?? '').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardSub}>
                  Submitted {formatDate(status.latest_request_created_at)}
                </Text>

                {status.latest_request_status === 'approved' && status.latest_request_reviewed_at && (
                  <Text style={[styles.cardSub, { color: '#16a34a' }]}>
                    Approved on {formatDate(status.latest_request_reviewed_at)}
                  </Text>
                )}

                {status.latest_request_status === 'rejected' && (
                  <Text style={[styles.cardSub, { color: Colors.brand }]}>
                    Rejected: {status.latest_request_rejection_reason ?? 'Payment not verified'}
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.emptyRequest}>
                <Text style={styles.emptyText}>No subscription requests yet.</Text>
                <Text style={styles.emptySubText}>Tap Upgrade to get started.</Text>
              </View>
            )}
          </View>

          {/* Upgrade Button */}
          <TouchableOpacity
            style={[styles.upgradeBtn, isActive && { opacity: 0.5 }]}
            onPress={() => router.push('/premium')}
            disabled={isActive}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeBtnText}>
              {isActive ? 'Plan Active' : 'Upgrade'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 80 },
  backTxt: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  content: { paddingVertical: 16 },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#f8fafc', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  cardMeta: { fontSize: 13, color: Colors.text, fontWeight: '500', marginTop: 8 },
  cardSub: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  requestPlan: { fontSize: 15, fontWeight: '700', color: Colors.text },
  emptyRequest: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  upgradeBtn: { marginHorizontal: 16, marginTop: 8, backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  upgradeBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
