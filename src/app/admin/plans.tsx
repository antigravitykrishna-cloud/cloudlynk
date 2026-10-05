import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AdminHeader, ActionButton, Card, Chip, adminStyles } from '../../components/AdminUI';
import { showAlert } from '../../components/Feedback';
import { fireHaptic } from '../../components/Press';
import { Colors } from '../../constants/theme';
import { AdminControl, type AdminPlan } from '../../lib/adminControl';

// Plan names, prices, lengths, which one is "Most popular", and which are on
// sale. Saved through admin_update_plan (v82, audited).
//
// What a change reaches: the app's plan screens and the price UPI / Razorpay
// / Sabpaisa charge (the payments function reads it from this table), from
// the next order. What it does NOT reach: Google Play's price, which lives in
// Play Console. Change both, or the two will disagree.

export default function AdminPlansScreen() {
  const qc = useQueryClient();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AdminPlan>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await AdminControl.listPlans();
      setPlans(rows);
      setDrafts(Object.fromEntries(rows.map(p => [p.code, { ...p }])));
    } catch (e: any) {
      showAlert('Could not load plans', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (code: string, patch: Partial<AdminPlan>) =>
    setDrafts(d => ({ ...d, [code]: { ...d[code], ...patch } }));

  const save = async (code: string) => {
    const p = drafts[code];
    setSaving(code);
    try {
      await AdminControl.updatePlan(p);
      fireHaptic('success');
      // The plan screens cache plans for 30 minutes; drop that so the change
      // shows on this phone immediately.
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      await load();
      showAlert('Saved', `${p.name} is updated. Remember to set the same price in Play Console for Google Play.`);
    } catch (e: any) {
      fireHaptic('error');
      showAlert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title="Plans & prices" />
      <ScrollView
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.brandBlue} />}
      >
        <Text style={[adminStyles.muted, { marginBottom: 12 }]}>
          Changes apply to the app and to UPI / Razorpay / Sabpaisa payments right away. Google Play prices are set separately in Play Console.
        </Text>
        {plans.map(orig => {
          const p = drafts[orig.code] ?? orig;
          const dirty = JSON.stringify(p) !== JSON.stringify(orig);
          return (
            <Card key={orig.code}>
              <View style={[adminStyles.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
                <Text style={adminStyles.name}>{orig.code}</Text>
                <View style={adminStyles.row}>
                  {orig.is_popular && <Chip label="POPULAR" tone="brand" />}
                  <Chip label={orig.is_active ? 'ON SALE' : 'HIDDEN'} tone={orig.is_active ? 'good' : 'neutral'} />
                </View>
              </View>

              <Text style={adminStyles.label}>Name</Text>
              <TextInput style={adminStyles.input} value={p.name} onChangeText={t => set(orig.code, { name: t })} maxLength={40} />

              <Text style={[adminStyles.label, { marginTop: 10 }]}>Description</Text>
              <TextInput style={adminStyles.input} value={p.description} onChangeText={t => set(orig.code, { description: t })} maxLength={80} />

              <View style={[adminStyles.row, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={adminStyles.label}>Price (₹)</Text>
                  <TextInput style={adminStyles.input} keyboardType="number-pad" maxLength={6}
                    value={String(p.price_inr || '')}
                    onChangeText={t => set(orig.code, { price_inr: parseInt(t.replace(/[^0-9]/g, ''), 10) || 0 })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={adminStyles.label}>Length (days)</Text>
                  <TextInput style={adminStyles.input} keyboardType="number-pad" maxLength={4}
                    value={String(p.duration_days || '')}
                    onChangeText={t => set(orig.code, { duration_days: parseInt(t.replace(/[^0-9]/g, ''), 10) || 0 })} />
                </View>
              </View>

              <View style={[adminStyles.row, { justifyContent: 'space-between', marginTop: 12 }]}>
                <Text style={adminStyles.value}>Most popular</Text>
                <Switch value={p.is_popular} onValueChange={v => set(orig.code, { is_popular: v })}
                  trackColor={{ false: Colors.borderStrong, true: Colors.brandBlue }} />
              </View>
              <View style={[adminStyles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                <Text style={adminStyles.value}>On sale</Text>
                <Switch value={p.is_active} onValueChange={v => set(orig.code, { is_active: v })}
                  trackColor={{ false: Colors.borderStrong, true: Colors.brandBlue }} />
              </View>

              {dirty && (
                <View style={[adminStyles.row, { marginTop: 12 }]}>
                  <ActionButton label="Undo" tone="neutral" onPress={() => set(orig.code, { ...orig })} />
                  <ActionButton label="Save" busy={saving === orig.code} onPress={() => save(orig.code)} />
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
