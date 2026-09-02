import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, type } from '../../theme';
import { useAuthStore } from '../../store/authStore';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  // Signed out, there is exactly one thing to do — see your commute region
  // and decide whether to sign in — and every other tab is either empty or
  // gated behind auth anyway. So the whole bar is hidden until sign-in
  // (Nick's call, 2026-08-23), which also hands the map that strip of
  // screen back at precisely the moment the app is trying to sell it.
  const user = useAuthStore((s) => s.user);

  return (
    <Tabs
      // Off by default on native (see BottomTabView.js), which detaches an
      // inactive tab's native view to save memory — and on Android that
      // sometimes comes back blank instead of redrawn, which is exactly
      // what emptied the Agent conversation after a trip to the map and
      // back (Nick, 2026-09-02): the messages were still there in the
      // store, the screen just failed to repaint them. Five tabs, none
      // of them heavy enough for the memory saving to matter.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkLt,
        tabBarStyle: user
          ? {
              backgroundColor: colors.white,
              borderTopColor: colors.rule,
              borderTopWidth: 1,
            }
          : { display: 'none' },
        tabBarLabelStyle: {
          fontSize: type.tab.fontSize,
          fontFamily: type.tab.fontFamily,
          letterSpacing: type.tab.letterSpacing,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <TabIcon glyph="🗺️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'Agent',
          tabBarIcon: ({ focused }) => <TabIcon glyph="✨" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="viewings"
        options={{
          title: 'Viewings',
          tabBarIcon: ({ focused }) => <TabIcon glyph="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shortlist"
        options={{
          title: 'Shortlist',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⭐" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} />,
        }}
      />
      {/* Picks now live on the map itself (carousel + bubbles) — this route
          stays reachable (the "see everything" full list) but is no longer
          a separate tab, so it doesn't compete with the map as the primary
          way to browse picks. */}
      <Tabs.Screen name="picks" options={{ href: null }} />
    </Tabs>
  );
}
