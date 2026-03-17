import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { colors, spacing } from "@/src/theme";

const CHECK_INTERVAL_MS = 60_000;
const MIN_CHECK_GAP_MS = 20_000;

export function UpdateReadyBanner() {
  const insets = useSafeAreaInsets();
  const { downloadedUpdate, isDownloading, isRestarting, isUpdatePending } = Updates.useUpdates();
  const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const checkInFlightRef = useRef(false);
  const lastCheckAtRef = useRef(0);

  const pendingUpdateKey = useMemo(() => {
    if (!downloadedUpdate) {
      return null;
    }

    if ("updateId" in downloadedUpdate && downloadedUpdate.updateId) {
      return downloadedUpdate.updateId;
    }

    return downloadedUpdate.type;
  }, [downloadedUpdate]);

  const checkForPendingUpdate = useCallback(async (force = false) => {
    if (Platform.OS === "web" || !Updates.isEnabled || checkInFlightRef.current) {
      return;
    }

    const now = Date.now();

    if (!force && now - lastCheckAtRef.current < MIN_CHECK_GAP_MS) {
      return;
    }

    checkInFlightRef.current = true;
    lastCheckAtRef.current = now;

    try {
      const result = await Updates.checkForUpdateAsync();

      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
    } catch {
      // Falha de rede/servidor de update nao deve interromper a aplicacao.
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !Updates.isEnabled) {
      return;
    }

    void checkForPendingUpdate(true);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkForPendingUpdate();
      }
    });

    const interval = setInterval(() => {
      void checkForPendingUpdate();
    }, CHECK_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [checkForPendingUpdate]);

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
    } catch {
      setIsReloading(false);
    }
  }

  if (
    !isUpdatePending ||
    !pendingUpdateKey ||
    dismissedUpdateKey === pendingUpdateKey ||
    isRestarting
  ) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        style={[
          styles.banner,
          {
            paddingTop: insets.top + spacing.sm,
          },
        ]}
      >
        <View style={styles.badgeRow}>
          <Badge tone="warning">Atualizacao</Badge>
          {isDownloading ? <Badge>Baixando</Badge> : null}
        </View>
        <Text style={styles.title}>Atualizacao recebida</Text>
        <Text style={styles.description}>
          Uma nova versao foi baixada. Voce pode atualizar agora ou continuar e reiniciar depois.
        </Text>
        <View style={styles.actionsRow}>
          <Button
            compact
            disabled={isReloading}
            label={isReloading ? "Atualizando..." : "Atualizar"}
            onPress={() => {
              void handleReloadNow();
            }}
          />
          <Button
            compact
            disabled={isReloading}
            label="Depois"
            onPress={() => {
              setDismissedUpdateKey(pendingUpdateKey);
            }}
            variant="ghost"
          />
        </View>
      </View>
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
  badgeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
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
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
