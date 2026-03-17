import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

import { Badge } from "@/src/components/ui/badge";
import { colors, spacing } from "@/src/theme";

export function UpdateReadyBanner() {
  const insets = useSafeAreaInsets();
  const { downloadedUpdate, isRestarting, isUpdatePending } = Updates.useUpdates();
  const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  const pendingUpdateKey = useMemo(() => {
    if (!downloadedUpdate) {
      return null;
    }

    if ("updateId" in downloadedUpdate && downloadedUpdate.updateId) {
      return downloadedUpdate.updateId;
    }

    return downloadedUpdate.type;
  }, [downloadedUpdate]);

  useEffect(() => {
    if (!pendingUpdateKey) {
      setDismissedUpdateKey(null);
      setIsReloading(false);
      return;
    }

    if (dismissedUpdateKey && dismissedUpdateKey !== pendingUpdateKey) {
      setDismissedUpdateKey(null);
    }
  }, [dismissedUpdateKey, pendingUpdateKey]);

  async function handleReloadNow() {
    try {
      setIsReloading(true);
      await Updates.reloadAsync();
    } catch (error) {
      setIsReloading(false);
      Alert.alert(
        "Nao foi possivel reiniciar agora",
        error instanceof Error ? error.message : "Tente novamente em alguns instantes.",
      );
    }
  }

  function handlePress() {
    if (!pendingUpdateKey) {
      return;
    }

    Alert.alert(
      "Atualizacao recebida",
      "Uma versao nova ja foi baixada. Voce pode reiniciar agora para abrir o app atualizado ou continuar e reiniciar depois.",
      [
        {
          text: "Depois",
          style: "cancel",
          onPress: () => {
            setDismissedUpdateKey(pendingUpdateKey);
          },
        },
        {
          text: isReloading ? "Reiniciando..." : "Reiniciar agora",
          onPress: () => {
            void handleReloadNow();
          },
        },
      ],
    );
  }

  if (!isUpdatePending || !pendingUpdateKey || dismissedUpdateKey === pendingUpdateKey || isRestarting) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        style={({ pressed }) => [
          styles.banner,
          {
            paddingTop: insets.top + spacing.sm,
          },
          pressed ? styles.bannerPressed : null,
        ]}
      >
        <View style={styles.badgeRow}>
          <Badge tone="warning">Atualizacao</Badge>
        </View>
        <Text style={styles.title}>Atualizacao recebida</Text>
        <Text style={styles.description}>
          Toque aqui para decidir se deseja reiniciar agora e abrir o app atualizado ou depois.
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1200,
  },
  banner: {
    backgroundColor: "#f8efc6",
    borderBottomColor: "#e3c95a",
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: "#8a6c18",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  bannerPressed: {
    opacity: 0.92,
  },
  badgeRow: {
    alignItems: "flex-start",
  },
  title: {
    color: "#6a520e",
    fontSize: 16,
    fontWeight: "800",
  },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
});
