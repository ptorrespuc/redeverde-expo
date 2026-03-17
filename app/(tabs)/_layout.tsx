import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/src/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, spacing.sm);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "rgba(21,34,27,0.08)",
          height: 58 + tabBarBottomPadding,
          paddingBottom: tabBarBottomPadding,
          paddingTop: spacing.sm,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Mapa",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons color={color} name="map-marker-radius-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: "Pontos",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons color={color} name="format-list-bulleted-square" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Conta",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons color={color} name="account-circle-outline" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
