import { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdminHeader, ActionButton, Card, adminStyles } from '../../components/AdminUI';
import { showAlert } from '../../components/Feedback';
import { fireHaptic } from '../../components/Press';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/theme';
import { AdminControl } from '../../lib/adminControl';

// Send a message to users. It lands in their Notifications inbox (the bell).
// Push notifications are not wired up yet, so it is seen the next time the
// app is opened, not as a phone alert.

type Audience = 'all' | 'premium' | 'free';
const AUDIENCES: { key: Audience; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'premium', label: 'Premium members' },
  { key: 'free', label: 'Free accounts' },
];

export default function AdminBroadcastScreen() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [sending, setSending] = useState(false);

  const send = () => {
    const who = AUDIENCES.find(a => a.key === audience)!.label.toLowerCase();
    showAlert('Send announcement?', `"${title.trim()}" goes to ${who}. It cannot be unsent.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', onPress: async () => {
          setSending(true);
          try {
            const n = await AdminControl.broadcast(title, body, audience);
            fireHaptic('success');
            setTitle(''); setBody('');
            showAlert('Sent', `Delivered to ${n} ${n === 1 ? 'person' : 'people'}.`);
          } catch (e: any) {
            fireHaptic('error');
            showAlert('Could not send', e?.message ?? 'Please try again.');
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={adminStyles.safe} edges={['top']}>
      <AdminHeader title="Announcement" />
      <ScrollView contentContainerStyle={adminStyles.list} keyboardShouldPersistTaps="handled">
        <Text style={[adminStyles.muted, { marginBottom: 12 }]}>
          Appears in each person's Notifications the next time they open Cloudlynk.
        </Text>
        <Card>
          <Text style={adminStyles.label}>Send to</Text>
          <View style={[adminStyles.row, { flexWrap: 'wrap' }]}>
            {AUDIENCES.map(a => (
              <TouchableOpacity key={a.key} style={[st.pill, audience === a.key && st.pillOn]} onPress={() => setAudience(a.key)}>
                <Text style={[st.pillTxt, audience === a.key && st.pillTxtOn]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[adminStyles.label, { marginTop: 14 }]}>Title</Text>
          <TextInput style={adminStyles.input} value={title} onChangeText={setTitle} maxLength={120}
            placeholder="New movies this week" placeholderTextColor={Colors.textMuted} />
          <Text style={[adminStyles.label, { marginTop: 10 }]}>Message</Text>
          <TextInput style={[adminStyles.input, { minHeight: 120, textAlignVertical: 'top' }]} value={body} onChangeText={setBody}
            maxLength={1000} multiline placeholder="Write the message…" placeholderTextColor={Colors.textMuted} />
          <Text style={[adminStyles.muted, { textAlign: 'right', marginTop: 4 }]}>{body.length}/1000</Text>
          <View style={{ marginTop: 10 }}>
            <ActionButton label="Send" busy={sending} disabled={!title.trim() || !body.trim()} onPress={send} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  pill: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  pillOn: { backgroundColor: Colors.brandBlue, borderColor: Colors.brandBlue },
  pillTxt: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  pillTxtOn: { color: '#FFFFFF' },
});
