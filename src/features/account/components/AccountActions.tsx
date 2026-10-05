import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/theme';
import { useSignOutPrompt } from '@/features/account/hooks/useSignOutPrompt';

/** Logout and Delete Account, at the foot of Profile and App Settings. */
export function AccountActions() {
  const router = useRouter();
  const promptSignOut = useSignOutPrompt();
  return (
    <View style={styles.actions}>
      <Button label="Logout" size="lg" onPress={promptSignOut} />
      <Button
        label="Delete Account"
        size="lg"
        variant="danger"
        onPress={() => router.push('/delete-account')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.md, marginVertical: Spacing.lg },
});
