import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '../components/Feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors } from '../constants/theme';
import Constants from 'expo-constants';
import { Icon, type IconName } from '../components/Icon';

type MenuRow = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

export default function AppSettingScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleSignOut = () => {
    showAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleDelete = () => {
    router.push('/delete-account');
  };

  // Every legal document has one source of truth: a hosted page under
  // supabase/functions/legal-pages. Each row routes to a thin in-app screen
  // that opens the corresponding hosted page in an in-app browser, so the
  // app and the Play-Console-linked pages can never drift apart.
  const menuRows: MenuRow[] = [
    { icon: 'lock', label: 'Privacy Policy', onPress: () => router.push('/privacy') },
    { icon: 'document', label: 'Terms & Conditions', onPress: () => router.push('/terms') },
    { icon: 'user', label: 'Community Guidelines', onPress: () => router.push('/community-guidelines') },
    { icon: 'diamond', label: 'Refund Policy', onPress: () => router.push('/refund-policy') },
    { icon: 'shield', label: 'Copyright & IP Policy', onPress: () => router.push('/copyright') },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Red header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backTxt}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Setting</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Menu rows */}
        <View style={styles.menuGroup}>
          {menuRows.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.menuRow, i === menuRows.length - 1 && styles.menuRowLast]}
              onPress={row.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Icon name={row.icon} size={17} color={Colors.brandBlue} />
              </View>
              <Text style={styles.menuLabel}>{row.label}</Text>
              <Text style={styles.chevron}>{'›'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Version info */}
        <View style={styles.versionBlock}>
          <Text style={styles.versionText}>Cloudlynk · v{Constants.expoConfig?.version ?? '0.0.0'}</Text>
          <Text style={styles.versionSub}>© 2026 Cloudlynk Inc. All rights reserved.</Text>
        </View>

        {/* Bottom buttons */}
        <View style={styles.bottomButtons}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#ffffff', fontSize: 28, fontWeight: '700', lineHeight: 28 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  body: { flex: 1 },
  menuGroup: { marginHorizontal: 16, marginTop: 16, marginBottom: 16, backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#182437', alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  chevron: { fontSize: 18, color: Colors.textMuted },
  versionBlock: { alignItems: 'center', paddingVertical: 16 },
  versionText: { fontSize: 12, color: Colors.text, fontWeight: '700' },
  versionSub: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },
  bottomButtons: { paddingHorizontal: 16, marginTop: 8, gap: 12 },
  logoutBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  logoutBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  deleteBtn: { backgroundColor: '#2A1620', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  deleteBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '800' },
});
