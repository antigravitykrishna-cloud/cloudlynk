import { Platform, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePushRegistration } from '@/features/notifications/hooks/usePushRegistration';

// The bottom tabs. Explore is the landing tab: it is named as the initial route so a cold start or
// a deep link to the group never lands on whichever tab happens to be declared first.

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Cloud', icon: 'cloud' },
  { name: 'feed', label: 'Feed', icon: 'globe' },
  { name: 'explore', label: 'Explore', icon: 'compass' },
  { name: 'channels', label: 'Channels', icon: 'broadcast' },
  { name: 'profile', label: 'Profile', icon: 'user' },
];

export default function TabsLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  usePushRegistration();

  // The bar has to clear the system navigation: 0 with 3-button navigation, up to ~48px with
  // gesture navigation, and different per device -- so it comes from the safe area, not a constant.
  const tabBarSize = {
    height: (Platform.OS === 'ios' ? 84 : 72) + insets.bottom,
    paddingBottom: (Platform.OS === 'ios' ? 24 : 12) + insets.bottom,
  };

  return (
    <Tabs
      // A new account starts on fresh tabs rather than the previous account's screens.
      key={user?.id ?? 'guest'}
      initialRouteName="explore"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [styles.tabBar, tabBarSize],
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

function TabIcon({ icon, label, focused }: { icon: IconName; label: string; focused: boolean }) {
  const color = focused ? Colors.brandBlue : Colors.textMuted;
  return (
    <View style={styles.tab}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  tab: { alignItems: 'center', gap: 3, width: 80 },
  iconWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: Colors.brandBlueDim },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 3,
  },
});
