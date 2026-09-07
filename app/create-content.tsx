import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { ChannelService } from '../lib/channels';
import { Colors } from '../constants/theme';

const CATEGORIES = [
  'Entertainment', 'Sports', 'Gaming', 'Travel', 'Fitness', 'Food',
  'Music', 'Education', 'News', 'Comedy', 'Statuses', 'Other',
];

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function NewChannelScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelLink, setChannelLink] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) { showAlert('Error', 'You must be logged in to create a channel.'); return; }
    if (!name.trim()) { showAlert('Name required', 'Please enter a channel name.'); return; }
    if (!category) { showAlert('Category required', 'Please select a channel category.'); return; }
    if (!agreed) { showAlert('Terms required', 'Please agree to the Channel Community Rules to continue.'); return; }

    setSubmitting(true);
    try {
      await ChannelService.createChannel(user.id, name.trim(), description.trim(), isPublic, channelLink, category ?? undefined);
      showAlert(
        'Channel submitted!',
        'Your channel is under review. We\'ll activate it within 7 days.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: unknown) {
      showAlert('Error', err instanceof Error ? err.message : 'Failed to create channel.');
    } finally {
      setSubmitting(false);
    }
  };

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'JL';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Red header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
            <Text style={styles.headerBackTxt}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Channel</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
            activeOpacity={0.7}
          >
            {submitting
              ? <ActivityIndicator color={Colors.brand} size="small" />
              : <Text style={styles.submitBtnText}>Submit</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.contentWrap} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <View style={styles.avatarBlock}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          {/* Channel Name */}
          <Field label="Channel Name">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Photography Hub"
              placeholderTextColor={Colors.textMuted}
            />
          </Field>

          {/* Description */}
          <Field label="Description" helper="* max 250 characters">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this channel about?"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={250}
            />
          </Field>

          {/* Channel Link */}
          <Field label="Channel Link">
            <TextInput
              style={styles.input}
              value={channelLink}
              onChangeText={setChannelLink}
              placeholder="https://..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>

          {/* Category dropdown */}
          <Field label="Select Channel Category">
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              activeOpacity={0.7}
            >
              <Text style={category ? styles.inputText : styles.placeholderText}>
                {category ?? 'Choose a category'}
              </Text>
              <Text style={styles.dropdownChevron}>{'▼'}</Text>
            </TouchableOpacity>
            {showCategoryPicker && (
              <View style={styles.pickerList}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={styles.pickerItem}
                    onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerItemText}>{cat}</Text>
                    {category === cat && <Text style={styles.pickerCheck}>{'✓'}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Field>

          {/* Public / Private */}
          <View style={styles.radioRow}>
            <TouchableOpacity style={styles.radioOption} onPress={() => setIsPublic(true)} activeOpacity={0.7}>
              <View style={[styles.radio, isPublic && styles.radioSelected]}>
                {isPublic && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.radioLabel}>Public</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioOption} onPress={() => setIsPublic(false)} activeOpacity={0.7}>
              <View style={[styles.radio, !isPublic && styles.radioSelected]}>
                {!isPublic && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.radioLabel}>Private</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Video hint */}
          <Text style={styles.videoHint}>
            {'Once your channel is approved, open it to start uploading movies, series, or short films.'}
          </Text>

          {/* T&C checkbox */}
          <TouchableOpacity style={styles.termsRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.7}>
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>{'✓'}</Text>}
            </View>
            <Text style={styles.termsText}>
              By submitting a channel, you agree to follow Cloudlynk's{' '}
              <Text style={{ fontWeight: '700' }}>Community Guidelines</Text> — no copyrighted
              content you don't own the rights to, no content involving minors, and content stays
              subject to review at any time.
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { color: '#ffffff', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  submitBtn: { backgroundColor: '#ffffff', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  submitBtnText: { color: Colors.brand, fontSize: 13, fontWeight: '900' },
  body: { flex: 1 },
  contentWrap: { paddingBottom: 40 },
  avatarBlock: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.brand, fontSize: 28, fontWeight: '900' },
  field: { marginHorizontal: 16, marginBottom: 16 },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  fieldHelper: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text, minHeight: 44 },
  inputText: { fontSize: 14, color: Colors.text },
  placeholderText: { fontSize: 14, color: Colors.textMuted },
  textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  dropdownBtn: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownChevron: { fontSize: 12, color: Colors.textMuted, marginLeft: 8 },
  pickerList: { marginTop: 4, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  pickerItemText: { fontSize: 14, color: Colors.text },
  pickerCheck: { fontSize: 14, color: Colors.brand, fontWeight: '900' },
  radioRow: { flexDirection: 'row', gap: 32, marginHorizontal: 16, marginBottom: 16 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9FB0C9', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: Colors.brand },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brand },
  radioLabel: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16, marginBottom: 16 },
  videoHint: { fontSize: 12, color: Colors.textMuted, fontWeight: '500', marginHorizontal: 16, marginBottom: 16, lineHeight: 18 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 16, marginTop: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#9FB0C9', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  termsText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 18 },
});
