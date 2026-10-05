import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getMetaMeasurement, metaConfigured, setMetaMeasurement } from '@/lib/metaAds';
import { Colors, Spacing } from '@/theme';
import { AccountActions } from '@/features/account/components/AccountActions';
import { AppVersion } from '@/features/account/components/AppVersion';
import { SettingsGroup } from '@/features/account/components/SettingsGroup';
import { SettingsRow } from '@/features/account/components/SettingsRow';

// Each legal row opens a thin in-app launcher for the hosted page (features/legal).
const LEGAL_LINKS: { icon: IconName; label: string; href: Href }[] = [
  { icon: 'lock', label: 'Privacy Policy', href: '/privacy' },
  { icon: 'document', label: 'Terms & Conditions', href: '/terms' },
  { icon: 'user', label: 'Community Guidelines', href: '/community-guidelines' },
  { icon: 'diamond', label: 'Refund Policy', href: '/refund-policy' },
  { icon: 'shield', label: 'Copyright & IP Policy', href: '/copyright' },
];

export default function AppSettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="App Setting" fallbackHref="/(tabs)/profile" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsGroup>
          {LEGAL_LINKS.map(link => (
            <SettingsRow
              key={link.label}
              icon={link.icon}
              label={link.label}
              onPress={() => router.push(link.href)}
            />
          ))}
        </SettingsGroup>
        <AdMeasurementSetting />
        <AccountActions />
        <AppVersion />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The ad measurement switch (lib/metaAds.ts). Only in builds with a Meta app ID -- a switch for
 * something the app does not do would be noise.
 */
function AdMeasurementSetting() {
  const available = metaConfigured();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (available) getMetaMeasurement().then(setEnabled);
  }, [available]);

  if (!available) return null;

  const toggle = (on: boolean) => {
    setEnabled(on);
    setMetaMeasurement(on);
  };

  return (
    <SettingsGroup>
      <SettingsRow
        icon="chart"
        label="Ad measurement"
        hint="Lets Meta know when an ad led to installing or buying, using this device's advertising ID. Turning it off stops that."
        toggle={{ value: enabled, onChange: toggle }}
      />
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg },
});
