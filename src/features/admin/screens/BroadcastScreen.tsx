import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { PillTabs } from '@/components/ui/Tabs';
import { TextField } from '@/components/ui/TextField';
import { Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { adminUsersApi, type BroadcastAudience } from '@/features/admin/api/adminUsersApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';

// Send a message to users. It lands in their Notifications inbox (the bell) and is seen the next
// time they open the app; it is not sent as a push notification.

const AUDIENCES: { key: BroadcastAudience; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'premium', label: 'Premium members' },
  { key: 'free', label: 'Free accounts' },
];

const MAX_MESSAGE_LENGTH = 1000;

export default function BroadcastScreen() {
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const delivered = await adminUsersApi.broadcast(title.trim(), body.trim(), audience);
      fireHaptic('success');
      setTitle('');
      setBody('');
      showAlert('Sent', `Delivered to ${delivered} ${delivered === 1 ? 'person' : 'people'}.`);
    } catch (err) {
      fireHaptic('error');
      showAlert('Could not send', errorMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const confirmSend = () => {
    const who = AUDIENCES.find(option => option.key === audience)?.label.toLowerCase();
    showAlert('Send announcement?', `"${title.trim()}" goes to ${who}. It cannot be unsent.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: send },
    ]);
  };

  return (
    <AdminScreen title="Announcement">
      <ScrollView contentContainerStyle={adminStyles.list} keyboardShouldPersistTaps="handled">
        <Text style={[adminStyles.muted, styles.intro]}>
          Appears in each person&apos;s Notifications the next time they open Cloudlynk.
        </Text>
        <Card>
          <Text style={adminStyles.label}>Send to</Text>
          <PillTabs tabs={AUDIENCES} selected={audience} onSelect={setAudience} />
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="New movies this week"
          />
          <TextField
            label="Message"
            value={body}
            onChangeText={setBody}
            maxLength={MAX_MESSAGE_LENGTH}
            multiline
            placeholder="Write the message…"
            hint={`${body.length}/${MAX_MESSAGE_LENGTH}`}
          />
          <Button
            label="Send"
            onPress={confirmSend}
            busy={sending}
            disabled={!title.trim() || !body.trim()}
          />
        </Card>
      </ScrollView>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: Spacing.md },
});
