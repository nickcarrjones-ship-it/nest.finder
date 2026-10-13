import { Tabs } from 'expo-router';
import { Image } from 'react-native';
import { colors, type } from '../../theme';
import { track } from '../../store/usageTracker';

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
  // Always visible, signed in or not (2026-10-11). It used to be hidden
  // until sign-in, and Apple's review read a map with no tabs as features
  // hidden from the reviewer (guideline 5.6). Signed out, Ask and Viewings
  // now say what they do and offer sign-in (components/SignInGate.tsx).

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
      // Which tabs get used: one anonymous count per visit (lib/usage.ts).
      screenListeners={({ route }) => ({ focus: () => track('tab_view', { k: route.name }) })}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkLt,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.rule,
          borderTopWidth: 1,
        },
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
          title: 'Ask',
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
      {/* The sixth tab, Shortlist, was REMOVED here (Nick, 2026-09-09) —
          "a little bit redundant" once loved areas live in the picks
          carousel with their own rank and a way to reorder them, which is
          the job that tab was doing with an extra step in between. Its
          route file is deleted outright, not just unlinked: nothing else
          pointed at it, so there was nothing left worth keeping as a
          hidden route the way "picks" above still is. */}
    </Tabs>
  );
}
