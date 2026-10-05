import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { PressScale } from '@/components/ui/Press';
import { SearchBar } from '@/components/ui/SearchBar';
import { TextField } from '@/components/ui/TextField';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { channelsApi } from '@/features/channels/api/channelsApi';
import { adminChannelsApi, type AdminChannel } from '@/features/admin/api/adminChannelsApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { SwitchRow } from '@/features/admin/components/SwitchRow';
import { useAdminAction } from '@/features/admin/hooks/useAdminAction';

// Every channel, hidden, pending and suspended ones included. Tap one to edit its details, make it
// public or hidden, mark it official, suspend or reactivate it, or delete it.

const STATUS_TONE: Record<string, ChipTone> = { active: 'good', pending: 'warn' };

export default function AdminChannelsScreen() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChannels(await adminChannelsApi.list());
    } catch (err) {
      showAlert('Could not load channels', errorMessage(err, 'Please try again.'));
    }
  }, []);
  const refreshControl = usePullToRefresh(load);
  const actions = useAdminAction(async () => {
    await load();
    setOpenId(null);
  });

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const search = query.trim().toLowerCase();
  const shown = search
    ? channels.filter(
        channel =>
          channel.name.toLowerCase().includes(search) ||
          (channel.category ?? '').toLowerCase().includes(search),
      )
    : channels;

  return (
    <AdminScreen title="Channels">
      <View style={styles.search}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search channels" />
      </View>
      <FlatList
        data={shown}
        keyExtractor={channel => channel.id}
        contentContainerStyle={adminStyles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        ListEmptyComponent={<EmptyState icon="broadcast" title="No channels." />}
        renderItem={({ item }) => (
          <Card>
            <PressScale
              onPress={() => setOpenId(current => (current === item.id ? null : item.id))}
              scaleTo={0.99}
            >
              <ChannelSummary channel={item} />
            </PressScale>
            {openId === item.id ? <ChannelEditor channel={item} actions={actions} /> : null}
          </Card>
        )}
      />
    </AdminScreen>
  );
}

function ChannelSummary({ channel }: { channel: AdminChannel }) {
  return (
    <>
      <Text style={adminStyles.name} numberOfLines={1}>
        {channel.name}
      </Text>
      <View style={[adminStyles.row, styles.chips]}>
        <Chip label={channel.status.toUpperCase()} tone={STATUS_TONE[channel.status] ?? 'bad'} />
        <Chip
          label={channel.is_public ? 'PUBLIC' : 'HIDDEN'}
          tone={channel.is_public ? 'neutral' : 'brand'}
        />
        {channel.is_official ? <Chip label="OFFICIAL" tone="brand" /> : null}
        <Text style={[adminStyles.muted, styles.counts]}>
          {channel.member_count} members · {channel.post_count} posts
        </Text>
      </View>
    </>
  );
}

function ChannelEditor({
  channel,
  actions,
}: {
  channel: AdminChannel;
  actions: ReturnType<typeof useAdminAction>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(channel);
  const edit = (patch: Partial<AdminChannel>) => setDraft(current => ({ ...current, ...patch }));
  const isActive = channel.status === 'active';

  return (
    <View style={styles.editor}>
      <TextField
        label="Name"
        value={draft.name}
        maxLength={60}
        onChangeText={name => edit({ name })}
      />
      <TextField
        label="Description"
        value={draft.description ?? ''}
        multiline
        maxLength={500}
        onChangeText={description => edit({ description })}
      />
      <TextField
        label="Category"
        value={draft.category ?? ''}
        maxLength={40}
        placeholder="e.g. Comedy"
        onChangeText={category => edit({ category })}
      />
      <SwitchRow
        label="Public"
        hint="Off = hidden: only members and people with a plan can join."
        value={draft.is_public}
        onChange={is_public => edit({ is_public })}
      />
      <SwitchRow
        label="Official"
        value={draft.is_official}
        onChange={is_official => edit({ is_official })}
      />

      <View style={adminStyles.actions}>
        <Button
          label="Open"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } })
          }
        />
        <Button
          label="Save"
          busy={actions.busy === 'save'}
          onPress={() =>
            actions.run('save', () => adminChannelsApi.update(draft), 'Channel updated.')
          }
        />
        {isActive ? (
          <Button
            label="Suspend"
            variant="secondary"
            busy={actions.busy === 'status'}
            onPress={() =>
              actions.confirm(
                'Suspend channel?',
                `"${channel.name}" disappears for everyone until you reactivate it.`,
                'Suspend',
                () =>
                  actions.run(
                    'status',
                    () => adminChannelsApi.setStatus(channel.id, 'suspended'),
                    'Channel suspended.',
                  ),
              )
            }
          />
        ) : (
          <Button
            label="Make active"
            variant="success"
            busy={actions.busy === 'status'}
            onPress={() =>
              actions.run(
                'status',
                () => adminChannelsApi.setStatus(channel.id, 'active'),
                'Channel is live.',
              )
            }
          />
        )}
        <Button
          label="Delete"
          variant="danger"
          busy={actions.busy === 'delete'}
          onPress={() =>
            actions.confirm(
              'Delete channel?',
              `"${channel.name}" and all its content are deleted permanently. This cannot be undone.`,
              'Delete',
              () => actions.run('delete', () => channelsApi.remove(channel.id), 'Channel deleted.'),
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  chips: { marginTop: Spacing.sm, flexWrap: 'wrap' },
  counts: { marginLeft: 'auto' },
  editor: { marginTop: 14 },
});
