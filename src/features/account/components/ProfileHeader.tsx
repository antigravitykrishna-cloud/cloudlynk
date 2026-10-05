import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { publicMedia } from '@/lib/publicMedia';
import { Colors, FontSize, FontWeight, Spacing, withAlpha } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** Picture, name and email, with shortcuts to Edit Profile and App Settings. */
export function ProfileHeader() {
  const router = useRouter();
  const { profile, user, isGuest } = useAuth();

  return (
    <View style={styles.header}>
      <View style={styles.avatarRing}>
        <Avatar
          uri={profile?.avatar_url ? publicMedia.url(profile.avatar_url) : null}
          name={profile?.full_name}
          size={74}
        />
      </View>
      <Text style={styles.name}>{profile?.full_name ?? 'User'}</Text>
      <Text style={styles.email}>
        {isGuest ? 'Guest account · not saved' : (user?.email ?? '')}
      </Text>
      <View style={styles.shortcuts}>
        <Shortcut icon="edit" label="Edit profile" onPress={() => router.push('/edit-profile')} />
        <Shortcut
          icon="settings"
          label="App settings"
          onPress={() => router.push('/app-setting')}
        />
      </View>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.shortcut}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={17} color={Colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  avatarRing: {
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.white,
    marginBottom: Spacing.md,
  },
  name: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    marginBottom: 2,
    textAlign: 'center',
  },
  email: {
    color: withAlpha(Colors.white, 0.8),
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  shortcuts: { flexDirection: 'row', gap: Spacing.md },
  shortcut: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(Colors.white, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
