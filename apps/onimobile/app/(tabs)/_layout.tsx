/**
 * Tab layout — Bottom tab navigation matching the design reference.
 * Home | Chat | Widgets | Settings
 */

import { Tabs } from 'expo-router';
import { Home, MessageSquare, LayoutGrid, Settings } from 'lucide-react-native';
import useThemeStore from '../../src/stores/themeStore';
import { getColors } from '../../src/theme/colors';

export default function TabLayout() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 0.5,
          paddingTop: 6,
          height: 88,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="widgets"
        options={{
          title: 'Widgets',
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
