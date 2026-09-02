import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { colors, type } from '../../theme';
import { useAuthStore } from '../../store/authStore';

/**
 * The five custom marks from Claude Design (Nick, 2026-09-02), replacing
 * the emoji row. Each is two-tone — ink outline, teal accent — matching the
 * app's own palette already, so unlike the old emoji these aren't tinted:
 * a tintColor would flatten the teal accent to a single colour. Dimmed by
 * opacity instead, same as the emoji were.
 */
const TAB_ICONS = {
  map: require('../../assets/tab-icons/map.png'),
  agent: require('../../assets/tab-icons/agent.png'),
  viewings: require('../../assets/tab-icons/viewings.png'),
  shortlist: require('../../assets/tab-icons/shortlist.png'),
  settings: require('../../assets/tab-icons/settings.png'),
} as const;

function TabIcon({ name, focused }: { name: keyof typeof TAB_ICONS; focused: boolean }) {
  return (
    <Image
      source={TAB_ICONS[name]}
      style={{ width: 22, height: 22, opacity: focused ? 1 : 0.45 }}
      resizeMode="contain"
    />
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
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: 'Agent',
          tabBarIcon: ({ focused }) => <TabIcon name="agent" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="viewings"
        options={{
          title: 'Viewings',
          tabBarIcon: ({ focused }) => <TabIcon name="viewings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shortlist"
        options={{
          title: 'Shortlist',
          tabBarIcon: ({ focused }) => <TabIcon name="shortlist" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
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
