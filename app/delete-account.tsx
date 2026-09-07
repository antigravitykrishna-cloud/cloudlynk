import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { Icon } from '../components/Icon';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const isConfirmed = confirmation.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);
    try {
      await deleteAccount();
    } catch (err: any) {
      showAlert('Error', err.message ?? 'Failed to delete account. Please try again.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.warningCard}>
          <Icon name="flag" size={16} color={Colors.warning} />
          <Text style={styles.warningTitle}>This action is permanent</Text>
          <Text style={styles.warningBody}>
            Deleting your account will permanently remove:{"\n\n"}
            • All your uploaded files{"\n"}
            • All channel posts and content{"\n"}
            • Channel memberships{"\n"}
            • Your profile and settings{"\n\n"}
            This cannot be undone.
          </Text>
        </View>

        <Text style={styles.confirmLabel}>Type DELETE to confirm</Text>
        <TextInput
          style={styles.input}
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="Type DELETE"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={[styles.deleteBtn, !isConfirmed && { opacity: 0.4 }]}
          onPress={handleDelete}
          disabled={!isConfirmed || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete My Account Forever</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  backBtn: { width: 60 },
  backTxt: { color: Colors.accent, fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  content: { flex: 1, padding: Spacing.xl },
  warningCard: {
    backgroundColor: Colors.dangerDim, borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 0.5, borderColor: 'rgba(248,81,73,0.3)', alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  warningIcon: { fontSize: 40, marginBottom: Spacing.md },
  warningTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.danger, marginBottom: Spacing.md },
  warningBody: { fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: 22, textAlign: 'center' },
  confirmLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary,
    letterSpacing: 0.5, marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 0.5,
    borderColor: Colors.border, padding: Spacing.md, color: Colors.text,
    fontSize: FontSize.lg, textAlign: 'center', letterSpacing: 2,
    marginBottom: Spacing.xl,
  },
  deleteBtn: {
    backgroundColor: Colors.danger, borderRadius: Radius.md, paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.extrabold },
});
