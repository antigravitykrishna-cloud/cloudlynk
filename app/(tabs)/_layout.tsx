import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { NotificationService } from '../../lib/notifications';

type TabIconProps = {
  icon: string;
  label: string;
  focused: boolean;
};

function TabIcon({ icon, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Text style={[styles.icon, focused && styles.iconActive]}>{icon}</Text>
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user, profile } = useAuth();

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
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="☁️" label="Cloud" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🔍" label="Explore" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="channels"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📡" label="Channels" focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profile" focused={focused} />
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
    height: Platform.OS === 'ios' ? 84 : 72,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
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
