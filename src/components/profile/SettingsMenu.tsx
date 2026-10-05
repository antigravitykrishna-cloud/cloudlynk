import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Colors } from '@/constants/theme';
import type { IconName } from '@/components/ui/Icon';
import { config } from '@/lib/config';
import { SettingsRow } from './SettingsRow';

const ADMIN_LINKS: { icon: IconName; iconBg: string; label: string; href: Href }[] = [
  { icon: 'shield', iconBg: Colors.brandBlueDim, label: 'Admin Panel', href: '/admin' },
  {
    icon: 'clipboard',
    iconBg: 'rgba(255,179,71,0.14)',
    label: 'Admin: Pending Channels',
    href: '/admin/pending-channels',
  },
  {
    icon: 'edit',
    iconBg: 'rgba(255,179,71,0.14)',
    label: 'Pending Channel Content',
    href: '/admin/pending-channel-content',
  },
  {
    icon: 'chart',
    iconBg: 'rgba(46,125,255,0.14)',
    label: 'Channel Activity',
    href: '/admin/channel-activity',
  },
  {
    icon: 'flag',
    iconBg: 'rgba(255,77,109,0.14)',
    label: 'Reports (Content & Users)',
    href: '/admin/reports',
  },
  {
    icon: 'check-circle',
    iconBg: 'rgba(46,212,122,0.14)',
    label: 'User Approvals',
    href: '/admin/user-approvals',
  },
  {
    icon: 'diamond',
    iconBg: 'rgba(227,179,65,0.14)',
    label: 'Subscribers',
    href: '/admin/subscribers',
  },
  {
    icon: 'film',
    iconBg: 'rgba(180,169,255,0.14)',
    label: 'Content & Access',
    href: '/admin/content',
  },
  {
    icon: 'upload',
    iconBg: 'rgba(46,125,255,0.14)',
    label: 'Upload Content',
    href: '/admin/upload',
  },
  { icon: 'history', iconBg: 'rgba(159,176,201,0.14)', label: 'Audit Log', href: '/admin/audit' },
];

export type ProfileToggle = 'auto_backup' | 'wifi_only';

/** The Profile settings list: admin links (admins only), then account and app settings. */
export function SettingsMenu({
  isAdmin,
  isPaidUser,
  planName,
  unreadCount,
  autoBackup,
  wifiOnly,
  onToggle,
}: {
  isAdmin: boolean;
  isPaidUser: boolean;
  planName: string;
  unreadCount: number;
  autoBackup: boolean;
  wifiOnly: boolean;
  onToggle: (field: ProfileToggle, value: boolean) => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>SETTINGS</Text>
      <View style={styles.group}>
        {isAdmin &&
          ADMIN_LINKS.map(link => (
            <SettingsRow
              key={link.label}
              icon={link.icon}
              iconBg={link.iconBg}
              label={link.label}
              onPress={() => router.push(link.href)}
            />
          ))}
        <SettingsRow
          icon="bell"
          iconBg={Colors.brandBlueDim}
          label="Notifications"
          value={unreadCount > 0 ? `${unreadCount} new` : undefined}
          onPress={() => router.push('/notifications')}
        />
        <SettingsRow
          icon="chart"
          iconBg="rgba(46,212,122,0.14)"
          label="My Subscription"
          onPress={() => router.push('/my-subscription')}
        />
        <SettingsRow
          icon="video"
          iconBg="rgba(255,179,71,0.14)"
          label="My Videos"
          onPress={() => router.push('/my-videos')}
        />
        <SettingsRow
          icon="lock"
          iconBg="rgba(46,125,255,0.14)"
          label="Privacy Policy"
          onPress={() => Linking.openURL(config.privacyPolicyUrl)}
        />
        <SettingsRow
          icon="document"
          iconBg="rgba(255,179,71,0.14)"
          label="Terms of Service"
          onPress={() => Linking.openURL(config.termsUrl)}
        />
        <SettingsRow
          icon="package"
          iconBg="rgba(46,212,122,0.14)"
          label="Export My Data"
          onPress={() => router.push('/export-data')}
        />
        <SettingsRow
          icon="diamond"
          iconBg={Colors.brandBlueDim}
          label={isPaidUser ? 'Manage Plan' : 'Upgrade to Premium'}
          value={isPaidUser ? planName : undefined}
          onPress={() => router.push('/premium')}
        />
        <SettingsRow
          icon="cloud"
          iconBg={Colors.brandBlueDim}
          label="Auto Backup"
          toggle
          toggleValue={autoBackup}
          onToggle={v => onToggle('auto_backup', v)}
        />
        <SettingsRow
          icon="wifi"
          iconBg={Colors.brandBlueDim}
          label="Wi-Fi Only Uploads"
          toggle
          toggleValue={wifiOnly}
          onToggle={v => onToggle('wifi_only', v)}
        />
        <SettingsRow
          icon="settings"
          iconBg={Colors.brandBlueDim}
          label="App Setting"
          onPress={() => router.push('/app-setting')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
});
