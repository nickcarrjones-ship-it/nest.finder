import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, type } from '../../theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.copper,
        tabBarInactiveTintColor: colors.inkLt,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.rule,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: type.tab.fontSize,
          fontWeight: type.tab.fontWeight,
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
      {/* TEMPORARY — isochrone merge measurement. Remove with the screen. */}
      <Tabs.Screen
        name="mergetest"
        options={{
          title: 'Merge',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⏱️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shortlist"
        options={{
          title: 'Shortlist',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⭐" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
