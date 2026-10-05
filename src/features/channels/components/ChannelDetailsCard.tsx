import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { Card } from '@/components/ui/Card';
import type { Channel } from '@/features/channels/api/channelsApi';
import { errorMessage } from '@/utils/errors';

/** A channel's name and description, read-only until "Edit" is tapped. */
export function ChannelDetailsCard({
  channel,
  onSave,
}: {
  channel: Channel;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name ?? '');
  const [description, setDescription] = useState(channel.description ?? '');
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setEditing(false);
    setName(channel.name ?? '');
    setDescription(channel.description ?? '');
  };

  const save = async () => {
    if (!name.trim()) {
      showAlert('Error', 'Channel name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), description.trim());
      setEditing(false);
      showAlert('Success', 'Channel updated successfully');
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to update channel'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Channel Details</Text>
        {!editing && (
          <TouchableOpacity onPress={() => setEditing(true)} accessibilityRole="button">
            <Text style={styles.edit}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing ? (
        <>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Channel name" />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Channel description"
            multiline
          />
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={cancel} style={styles.action} />
            <Button label="Save" onPress={save} busy={saving} style={styles.action} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{channel.name}</Text>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.value}>{channel.description || 'No description'}</Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  edit: { color: Colors.brandBlue, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  label: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: 2 },
  value: { color: Colors.text, fontSize: FontSize.base, marginBottom: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.md },
  action: { flex: 1 },
});
