import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { useAuth } from '@/features/auth/hooks/useAuth';

const CONFIRMATION_WORD = 'DELETE';

export default function DeleteAccountScreen() {
  const { deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION_WORD;

  async function deleteForever() {
    if (!confirmed) return;
    setDeleting(true);
    try {
      // On success the session ends and the root layout routes away from this screen.
      await deleteAccount();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Failed to delete account. Please try again.'));
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScreenHeader title="Delete Account" fallbackHref="/app-setting" />
      <View style={styles.content}>
        <View style={styles.warning}>
          <Icon name="flag" size={16} color={Colors.warning} />
          <Text style={styles.warningTitle}>This action is permanent</Text>
          <Text style={styles.warningBody}>
            Deleting your account will permanently remove:{'\n\n'}• All your uploaded files{'\n'}•
            All channel posts and content{'\n'}• Channel memberships{'\n'}• Your profile and
            settings{'\n\n'}
            This cannot be undone.
          </Text>
        </View>

        <TextField
          label={`Type ${CONFIRMATION_WORD} to confirm`}
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder={`Type ${CONFIRMATION_WORD}`}
          autoCapitalize="characters"
          style={styles.confirmation}
        />

        <Button
          label="Delete My Account Forever"
          size="lg"
          variant="danger"
          haptic="heavy"
          onPress={deleteForever}
          busy={deleting}
          disabled={!confirmed}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, padding: Spacing.xl },
  warning: {
    backgroundColor: Colors.dangerDim,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dangerBorder,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  warningTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.danger,
    marginBottom: Spacing.md,
  },
  warningBody: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  confirmation: { textAlign: 'center', letterSpacing: 2, fontSize: FontSize.lg },
});
