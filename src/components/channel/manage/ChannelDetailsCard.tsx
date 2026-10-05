import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/theme';
import type { Tables } from '@/lib/database.types';
import { ManageCard } from './ManageCard';

/** Shows the channel's name and description, with an inline form to edit them. */
export function ChannelDetailsCard({
  channel,
  onSave,
}: {
  channel: Tables<'channels'>;
  /** Resolves true if the save went through. */
  onSave: (name: string, description: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setName(channel.name || '');
    setDescription(channel.description || '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(name, description)) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManageCard>
      <View style={styles.header}>
        <Text style={styles.title}>Channel Details</Text>
        {!editing && (
          <TouchableOpacity onPress={startEditing}>
            <Text style={styles.editButton}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing ? (
        <View>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Channel name"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Channel description"
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={4}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.disabled]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <Text style={styles.detailLabel}>Name</Text>
          <Text style={styles.detailValue}>{channel.name}</Text>
          <Text style={styles.detailLabel}>Description</Text>
          <Text style={styles.detailValue}>{channel.description || 'No description'}</Text>
        </View>
      )}
    </ManageCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  editButton: { color: Colors.brandBlue, fontSize: 14, fontWeight: '600' },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.brandBlue,
  },
  saveButtonText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    marginBottom: 2,
  },
  detailValue: { color: Colors.text, fontSize: 15 },
});
