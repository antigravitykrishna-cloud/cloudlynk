import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { initials } from './shared';

/** Avatar, name, email and the edit / settings buttons at the top of Profile. */
export function ProfileHeader({
  fullName,
  subtitle,
}: {
  fullName: string | null | undefined;
  subtitle: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(fullName)}</Text>
        </View>
      </View>
      <Text style={styles.userName}>{fullName ?? 'User'}</Text>
      <Text style={styles.userEmail}>{subtitle}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.7}
        >
          <Icon name="edit" size={17} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/app-setting')}
          activeOpacity={0.7}
        >
          <Icon name="settings" size={17} color={Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.surface,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  userName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
    textAlign: 'center',
  },
  userEmail: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
