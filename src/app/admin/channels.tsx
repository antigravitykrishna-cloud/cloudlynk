import { useCallback, useState } from 'react';
import { View, Text, FlatList, TextInput, Switch, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminHeader, ActionButton, Card, Chip, adminStyles } from '../../components/AdminUI';
import { showAlert } from '../../components/Feedback';
import { fireHaptic, PressScale } from '../../components/Press';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { ChannelService } from '../../lib/channels';
import { AdminControl } from '../../lib/adminControl';

// Every channel, including hidden, pending and suspended ones (admins read
// all channels -- "Admins see all channels" RLS policy). Tap one to edit its
// name, description and category, make it public or hidden, mark it
// official, suspend or reactivate it, or delete it.

type Row = {
  id: string; name: string; description: string | null; category: string | null;
  is_public: boolean; is_official: boolean; status: string;
  member_count: number; post_count: number; created_at: string;
};

const COLUMNS = 'id, name, description, category, is_public, is_official, status, member_count, post_count, created_at';

export default function AdminChannelsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('channels').select(COLUMNS).order('created_at', { ascending: false });
    if (error) showAlert('Could not load channels', error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (r: Row) => {
    if (open === r.id) { setOpen(null); setDraft(null); return; }
    setOpen(r.id); setDraft({ ...r });
  };

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      fireHaptic('success');
      await load();
      setOpen(null); setDraft(null);
      showAlert('Done', done);
    } catch (e: any) {
      fireHaptic('error');
      showAlert('Could not do that', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter(r => r.name.toLowerCase().includes(q) || (r.category ?? '').toLowerCase().includes(q)) : rows;

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title="Channels" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <TextInput style={adminStyles.input} value={query} onChangeText={setQuery}
          placeholder="Search channels" placeholderTextColor={Colors.textMuted} autoCorrect={false} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={r => r.id}
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.brandBlue} />}
        ListEmptyComponent={!loading ? <Text style={adminStyles.empty}>No channels.</Text> : null}
        renderItem={({ item: r }) => (
          <Card>
            <PressScale onPress={() => toggle(r)} scaleTo={0.99}>
              <Text style={adminStyles.name} numberOfLines={1}>{r.name}</Text>
              <View style={[adminStyles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
                <Chip label={r.status.toUpperCase()} tone={r.status === 'active' ? 'good' : r.status === 'pending' ? 'warn' : 'bad'} />
                <Chip label={r.is_public ? 'PUBLIC' : 'HIDDEN'} tone={r.is_public ? 'neutral' : 'brand'} />
                {r.is_official && <Chip label="OFFICIAL" tone="brand" />}
                <Text style={[adminStyles.muted, { marginLeft: 'auto' }]}>{r.member_count} members · {r.post_count} posts</Text>
              </View>
            </PressScale>

            {open === r.id && draft && (
              <View style={{ marginTop: 14 }}>
                <Text style={adminStyles.label}>Name</Text>
                <TextInput style={adminStyles.input} value={draft.name} maxLength={60}
                  onChangeText={t => setDraft({ ...draft, name: t })} />
                <Text style={[adminStyles.label, { marginTop: 10 }]}>Description</Text>
                <TextInput style={[adminStyles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={500}
                  value={draft.description ?? ''} onChangeText={t => setDraft({ ...draft, description: t })} />
                <Text style={[adminStyles.label, { marginTop: 10 }]}>Category</Text>
                <TextInput style={adminStyles.input} value={draft.category ?? ''} maxLength={40}
                  onChangeText={t => setDraft({ ...draft, category: t })} placeholder="e.g. Comedy" placeholderTextColor={Colors.textMuted} />

                <View style={[adminStyles.row, { justifyContent: 'space-between', marginTop: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={adminStyles.value}>Public</Text>
                    <Text style={adminStyles.muted}>Off = hidden: only members and people with a plan can join.</Text>
                  </View>
                  <Switch value={draft.is_public} onValueChange={v => setDraft({ ...draft, is_public: v })}
                    trackColor={{ false: Colors.borderStrong, true: Colors.brandBlue }} />
                </View>
                <View style={[adminStyles.row, { justifyContent: 'space-between', marginTop: 10 }]}>
                  <Text style={adminStyles.value}>Official</Text>
                  <Switch value={draft.is_official} onValueChange={v => setDraft({ ...draft, is_official: v })}
                    trackColor={{ false: Colors.borderStrong, true: Colors.brandBlue }} />
                </View>

                <View style={[adminStyles.row, { marginTop: 14 }]}>
                  <ActionButton label="Open" tone="neutral"
                    onPress={() => router.push({ pathname: '/(tabs)/channels/[id]', params: { id: r.id } })} />
                  <ActionButton label="Save" busy={busy === `save-${r.id}`}
                    onPress={() => run(`save-${r.id}`, () => AdminControl.updateChannel(draft), 'Channel updated.')} />
                </View>
                <View style={[adminStyles.row, { marginTop: 10 }]}>
                  {r.status === 'active' ? (
                    <ActionButton label="Suspend" tone="neutral" busy={busy === `status-${r.id}`}
                      onPress={() => showAlert('Suspend channel?', `"${r.name}" disappears for everyone until you reactivate it.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Suspend', style: 'destructive', onPress: () => run(`status-${r.id}`, () => AdminControl.setChannelStatus(r.id, 'suspended'), 'Channel suspended.') },
                      ])} />
                  ) : (
                    <ActionButton label="Make active" tone="good" busy={busy === `status-${r.id}`}
                      onPress={() => run(`status-${r.id}`, () => AdminControl.setChannelStatus(r.id, 'active'), 'Channel is live.')} />
                  )}
                  <ActionButton label="Delete" tone="bad" busy={busy === `del-${r.id}`}
                    onPress={() => showAlert('Delete channel?', `"${r.name}" and all its content are deleted permanently. This cannot be undone.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => run(`del-${r.id}`, () => ChannelService.deleteChannel(r.id), 'Channel deleted.') },
                    ])} />
                </View>
              </View>
            )}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
