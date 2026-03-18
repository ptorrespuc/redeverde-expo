import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";

export default function TabLayout() {
  const { userContext } = useAppContext();
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, spacing.sm);
  const showAdminTab =
    Platform.OS === "web" && Boolean(userContext?.is_super_admin || userContext?.has_group_admin);

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
      {showAdminTab ? (
        <Tabs.Screen
          name="admin"
          options={{
            title: "Admin",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons color={color} name="cog-outline" size={size} />
            ),
          }}
        />
      ) : (
        <Tabs.Screen name="admin" options={{ href: null }} />
      )}
    </Tabs>
  );
}
