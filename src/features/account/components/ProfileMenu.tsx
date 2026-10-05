import { useRouter, type Href } from 'expo-router';
import { showAlert } from '@/components/ui/Feedback';
import type { IconName } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { profileApi, type ProfileUpdate } from '@/features/auth/api/profileApi';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { SettingsGroup } from '@/features/account/components/SettingsGroup';
import { SettingsRow } from '@/features/account/components/SettingsRow';

type Link = { icon: IconName; iconBackground: string; label: string; href: Href };

/** Shortcuts into the admin area, shown on an admin's own Profile. */
const ADMIN_LINKS: Link[] = [
  { icon: 'shield', iconBackground: Colors.brandBlueDim, label: 'Admin Panel', href: '/admin' },
  {
    icon: 'clipboard',
    iconBackground: Colors.warningDim,
    label: 'Admin: Pending Channels',
    href: '/admin/pending-channels',
  },
  {
    icon: 'edit',
    iconBackground: Colors.warningDim,
    label: 'Pending Channel Content',
    href: '/admin/pending-channel-content',
  },
  {
    icon: 'chart',
    iconBackground: Colors.brandBlueDim,
    label: 'Channel Activity',
    href: '/admin/channel-activity',
  },
  {
    icon: 'flag',
    iconBackground: Colors.dangerDim,
    label: 'Reports (Content & Users)',
    href: '/admin/reports',
  },
  {
    icon: 'check-circle',
    iconBackground: Colors.successDim,
    label: 'User Approvals',
    href: '/admin/user-approvals',
  },
  {
    icon: 'diamond',
    iconBackground: Colors.warningDim,
    label: 'Subscribers',
    href: '/admin/subscribers',
  },
  {
    icon: 'film',
    iconBackground: Colors.lavenderDim,
    label: 'Content & Access',
    href: '/admin/content',
  },
  {
    icon: 'upload',
    iconBackground: Colors.brandBlueDim,
    label: 'Upload Content',
    href: '/admin/upload',
  },
  { icon: 'history', iconBackground: Colors.neutralDim, label: 'Audit Log', href: '/admin/audit' },
];

const ACCOUNT_LINKS: Link[] = [
  {
    icon: 'chart',
    iconBackground: Colors.successDim,
    label: 'My Subscription',
    href: '/my-subscription',
  },
  { icon: 'video', iconBackground: Colors.warningDim, label: 'My Videos', href: '/my-videos' },
  { icon: 'lock', iconBackground: Colors.brandBlueDim, label: 'Privacy Policy', href: '/privacy' },
  {
    icon: 'document',
    iconBackground: Colors.warningDim,
    label: 'Terms of Service',
    href: '/terms',
  },
  {
    icon: 'package',
    iconBackground: Colors.successDim,
    label: 'Export My Data',
    href: '/export-data',
  },
];

type Preference = 'auto_backup' | 'wifi_only';

/** The SETTINGS list on Profile. */
export function ProfileMenu() {
  const router = useRouter();
  const { user, profile, isAdmin, isPaidUser, planStatus, refreshProfile } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  async function setPreference(field: Preference, value: boolean) {
    if (!user) return;
    try {
      const patch: ProfileUpdate = { [field]: value };
      await profileApi.update(user.id, patch);
      await refreshProfile();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Update failed'));
    }
  }

  const linkRow = (link: Link) => (
    <SettingsRow
      key={link.label}
      icon={link.icon}
      iconBackground={link.iconBackground}
      label={link.label}
      onPress={() => router.push(link.href)}
    />
  );

  return (
    <SettingsGroup title="SETTINGS">
      {isAdmin ? ADMIN_LINKS.map(linkRow) : null}
      <SettingsRow
        icon="bell"
        iconBackground={Colors.brandBlueDim}
        label="Notifications"
        value={unreadCount > 0 ? `${unreadCount} new` : undefined}
        onPress={() => router.push('/notifications')}
      />
      {ACCOUNT_LINKS.map(linkRow)}
      <SettingsRow
        icon="diamond"
        iconBackground={Colors.brandBlueDim}
        label={isPaidUser ? 'Manage Plan' : 'Upgrade to Premium'}
        value={isPaidUser ? planStatus.toUpperCase() : undefined}
        onPress={() => router.push('/premium')}
      />
      <SettingsRow
        icon="cloud"
        iconBackground={Colors.brandBlueDim}
        label="Auto Backup"
        toggle={{
          value: profile?.auto_backup ?? true,
          onChange: value => setPreference('auto_backup', value),
        }}
      />
      <SettingsRow
        icon="wifi"
        iconBackground={Colors.brandBlueDim}
        label="Wi-Fi Only Uploads"
        toggle={{
          value: profile?.wifi_only ?? false,
          onChange: value => setPreference('wifi_only', value),
        }}
      />
      <SettingsRow
        icon="settings"
        iconBackground={Colors.brandBlueDim}
        label="App Setting"
        onPress={() => router.push('/app-setting')}
      />
    </SettingsGroup>
  );
}
