import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextButton } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { showAlert } from '@/components/ui/Feedback';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { channelsApi } from '@/features/channels/api/channelsApi';

// A new channel. It starts as pending and goes live once an admin approves it.

const CATEGORIES = [
  'Entertainment',
  'Sports',
  'Gaming',
  'Travel',
  'Fitness',
  'Food',
  'Music',
  'Education',
  'News',
  'Comedy',
  'Statuses',
  'Other',
];

const DESCRIPTION_MAX = 250;

type Visibility = 'public' | 'private';

export default function CreateChannelScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function problem(): [string, string] | null {
    if (!user) return ['Error', 'You must be logged in to create a channel.'];
    if (!name.trim()) return ['Name required', 'Please enter a channel name.'];
    if (!category) return ['Category required', 'Please select a channel category.'];
    if (!agreed)
      return ['Terms required', 'Please agree to the Channel Community Rules to continue.'];
    return null;
  }

  async function submit() {
    const issue = problem();
    if (issue) {
      showAlert(...issue);
      return;
    }
    setSubmitting(true);
    try {
      await channelsApi.create({
        ownerId: user!.id,
        name: name.trim(),
        description: description.trim(),
        isPublic: visibility === 'public',
        link,
        category: category ?? undefined,
      });
      showAlert(
        'Channel submitted!',
        "Your channel is under review. We'll activate it within 7 days.",
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      showAlert('Error', (err as Error)?.message ?? 'Failed to create channel.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader
        title="New Channel"
        right={<TextButton label="Submit" onPress={submit} disabled={submitting} />}
      />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Channel name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Photography Hub"
          />
          <TextField
            label="Description"
            hint={`Up to ${DESCRIPTION_MAX} characters`}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel about?"
            multiline
            maxLength={DESCRIPTION_MAX}
          />
          <TextField
            label="Channel link"
            value={link}
            onChangeText={setLink}
            placeholder="https://..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <SelectField
            label="Category"
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
            placeholder="Choose a category"
          />
          <RadioGroup
            options={[
              { value: 'public', label: 'Public' },
              { value: 'private', label: 'Private' },
            ]}
            value={visibility}
            onChange={setVisibility}
          />

          <View style={styles.divider} />
          <Text style={styles.hint}>
            Once your channel is approved, open it to start uploading movies, series, or short
            films.
          </Text>

          <Checkbox checked={agreed} onToggle={() => setAgreed(value => !value)}>
            By submitting a channel, you agree to follow Cloudlynk&apos;s{' '}
            <Text style={styles.bold}>Community Guidelines</Text> — no copyrighted content you
            don&apos;t own the rights to, no content involving minors, and content stays subject to
            review at any time.
          </Checkbox>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.lg },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  bold: { fontWeight: FontWeight.bold, color: Colors.text },
});
