import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { SearchBar } from '@/components/ui/SearchBar';
import { PillTabs } from '@/components/ui/Tabs';
import { TextField } from '@/components/ui/TextField';
import { Colors, Radius, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { adminContentApi } from '@/features/admin/api/adminContentApi';
import { adminUsersApi, type AdminUserSummary } from '@/features/admin/api/adminUsersApi';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { grantExpiry, type GrantDuration } from '@/features/admin/grantExpiry';

const DURATIONS: { key: GrantDuration; label: string }[] = [
  { key: 'forever', label: 'Until revoked' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'custom', label: 'Custom date' },
];

/** Find a person, then grant them this post for a while, with an optional reason. */
export function GrantAccessForm({ postId, onGranted }: { postId: string; onGranted: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [person, setPerson] = useState<AdminUserSummary | null>(null);
  const [duration, setDuration] = useState<GrantDuration>('forever');
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');
  const [granting, setGranting] = useState(false);

  async function search() {
    setSearching(true);
    try {
      setResults(await adminUsersApi.search(query));
    } catch (err) {
      showAlert('Could not search users', errorMessage(err, 'Please try again.'));
    } finally {
      setSearching(false);
    }
  }

  async function grant() {
    if (!person) return;
    let expiresAt: string | null;
    try {
      expiresAt = grantExpiry(duration, customDate);
    } catch (err) {
      showAlert('Check the date', errorMessage(err, 'Enter a valid date.'));
      return;
    }
    setGranting(true);
    try {
      await adminContentApi.grantAccess(person.id, postId, expiresAt, reason.trim() || null);
      setPerson(null);
      setResults([]);
      setQuery('');
      setReason('');
      setDuration('forever');
      setCustomDate('');
      onGranted();
    } catch (err) {
      showAlert('Could not grant access', errorMessage(err, 'Please try again.'));
    } finally {
      setGranting(false);
    }
  }

  return (
    <Card>
      <Text style={adminStyles.name}>Grant access</Text>
      <View style={[adminStyles.row, styles.search]}>
        <View style={styles.flex}>
          <SearchBar value={query} onChange={setQuery} placeholder="Search by email or name…" />
        </View>
        <Button label="Find" size="sm" onPress={search} busy={searching} />
      </View>

      {results.map(user => {
        const chosen = person?.id === user.id;
        return (
          <TouchableOpacity
            key={user.id}
            style={[styles.result, chosen && styles.resultChosen]}
            onPress={() => setPerson(user)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen }}
          >
            <View style={styles.flex}>
              <Text style={adminStyles.value}>{user.full_name || user.email}</Text>
              <Text style={adminStyles.muted}>{user.email}</Text>
              <Text style={adminStyles.muted}>
                plan: {user.plan_status ?? 'free'} · {user.account_status}
              </Text>
            </View>
            {chosen ? <Icon name="check-circle" size={20} color={Colors.brandBlue} /> : null}
          </TouchableOpacity>
        );
      })}

      {person ? (
        <View style={styles.details}>
          <Text style={adminStyles.label}>Duration</Text>
          <PillTabs tabs={DURATIONS} selected={duration} onSelect={setDuration} />
          {duration === 'custom' ? (
            <TextField
              value={customDate}
              onChangeText={setCustomDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
          ) : null}
          <TextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Why does this person get access?"
          />
          <View style={adminStyles.row}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPerson(null)}
              style={styles.flex}
            />
            <Button label="Grant access" onPress={grant} busy={granting} style={styles.flex} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { marginTop: Spacing.md },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultChosen: { borderColor: Colors.brandBlue, backgroundColor: Colors.brandBlueDim },
  details: { marginTop: Spacing.md, gap: Spacing.sm },
});
