import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { TextField } from '@/components/ui/TextField';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { adminBillingApi, type AdminPlan } from '@/features/admin/api/adminBillingApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { SwitchRow } from '@/features/admin/components/SwitchRow';

// The plans on sale: name, description, price, length, popular and on-sale. Google Play prices are
// set separately in Play Console.

const digitsOnly = (text: string) => parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;

export default function AdminPlansScreen() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);

  const load = useCallback(async () => {
    try {
      setPlans(await adminBillingApi.listPlans());
    } catch (err) {
      showAlert('Could not load plans', errorMessage(err, 'Please try again.'));
    }
  }, []);
  const refreshControl = usePullToRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <AdminScreen title="Plans & prices">
      <ScrollView
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <Text style={[adminStyles.muted, styles.intro]}>
          Changes apply to the app and to UPI / Razorpay / Sabpaisa payments right away. Google Play
          prices are set separately in Play Console.
        </Text>
        {plans.map(plan => (
          // Keyed by the saved row, so a reload resets the editor to what the database holds.
          <PlanEditor key={JSON.stringify(plan)} plan={plan} onSaved={load} />
        ))}
      </ScrollView>
    </AdminScreen>
  );
}

function PlanEditor({ plan, onSaved }: { plan: AdminPlan; onSaved: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const edit = (patch: Partial<AdminPlan>) => setDraft(current => ({ ...current, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);

  async function save() {
    setSaving(true);
    try {
      await adminBillingApi.updatePlan(draft);
      fireHaptic('success');
      // The plan screens cache plans for 30 minutes; drop that so this phone shows the change now.
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      await onSaved();
      showAlert(
        'Saved',
        `${draft.name} is updated. Remember to set the same price in Play Console for Google Play.`,
      );
    } catch (err) {
      fireHaptic('error');
      showAlert('Could not save', errorMessage(err, 'Please try again.'));
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={[adminStyles.row, styles.header]}>
        <Text style={adminStyles.name}>{plan.code}</Text>
        <View style={adminStyles.row}>
          {plan.is_popular ? <Chip label="POPULAR" tone="brand" /> : null}
          <Chip
            label={plan.is_active ? 'ON SALE' : 'HIDDEN'}
            tone={plan.is_active ? 'good' : 'neutral'}
          />
        </View>
      </View>
      <TextField
        label="Name"
        value={draft.name}
        onChangeText={name => edit({ name })}
        maxLength={40}
      />
      <TextField
        label="Description"
        value={draft.description}
        onChangeText={description => edit({ description })}
        maxLength={80}
      />
      <View style={adminStyles.row}>
        <View style={styles.half}>
          <TextField
            label="Price (₹)"
            keyboardType="number-pad"
            maxLength={6}
            value={String(draft.price_inr || '')}
            onChangeText={text => edit({ price_inr: digitsOnly(text) })}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Length (days)"
            keyboardType="number-pad"
            maxLength={4}
            value={String(draft.duration_days || '')}
            onChangeText={text => edit({ duration_days: digitsOnly(text) })}
          />
        </View>
      </View>
      <SwitchRow
        label="Most popular"
        value={draft.is_popular}
        onChange={is_popular => edit({ is_popular })}
      />
      <SwitchRow
        label="On sale"
        value={draft.is_active}
        onChange={is_active => edit({ is_active })}
      />
      {dirty ? (
        <View style={adminStyles.actions}>
          <Button
            label="Undo"
            variant="secondary"
            onPress={() => setDraft(plan)}
            style={styles.half}
          />
          <Button label="Save" onPress={save} busy={saving} style={styles.half} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: Spacing.md },
  header: { justifyContent: 'space-between', marginBottom: Spacing.sm },
  half: { flex: 1 },
});
