import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../components/Icon';
import { useEffect } from 'react';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { NotificationService } from '../../lib/notifications';

type TabIconProps = {
  icon: IconName;
  label: string;
  focused: boolean;
};

function TabIcon({ icon, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        {/* The icon takes the tint from the same source as the label, so the
            active state is one decision rather than two that can drift. */}
        <Icon name={icon} size={22} color={focused ? Colors.brandBlue : Colors.inactive} />
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (user && profile?.notifications_enabled !== false) {
      NotificationService.syncPushToken(user.id);
    }
  }, [user, profile?.notifications_enabled]);

  return (
    <Tabs
      key={user?.id ?? 'guest'}
      // Explore is the app's landing surface, so it is also the tab the
      // navigator falls back to — otherwise a cold start or a deep link that
      // resolves to the group lands on whichever screen happens to be declared
      // first.
      initialRouteName="explore"
      screenOptions={{
        headerShown: false,
        // The bar's bottom padding has to clear the gesture pill, which is not
        // a fixed number: it is 0 with 3-button navigation and ~24-48px with
        // gesture navigation, and it differs per device. It was hardcoded to
        // 16, so on a gesture-nav phone the pill was drawn straight through
        // the "Explore" and "Channels" labels.
        tabBarStyle: [
          styles.tabBar,
          {
            height: (Platform.OS === 'ios' ? 84 : 72) + insets.bottom,
            paddingBottom: (Platform.OS === 'ios' ? 24 : 12) + insets.bottom,
          },
        ],
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="cloud" label="Cloud" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="compass" label="Explore" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="channels"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="broadcast" label="Channels" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="user" label="Profile" focused={focused} />
          ),
        }}
      />

    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  tabItem: { alignItems: 'center', gap: 3, width: 80 },
  iconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: Colors.brandLight },
  icon: { fontSize: 22, color: Colors.inactive },
  iconActive: { color: Colors.brand },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.inactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 3,
  },
  labelActive: { color: Colors.brand },
});
