import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";

import { MapCanvas } from "@/src/components/map/map-canvas";
import type { MapCanvasHandle, MapRegion } from "@/src/components/map/map-canvas.types";
import { Button } from "@/src/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/src/components/ui/field";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { geocodeAddress } from "@/src/lib/geocoding";
import { colors, spacing } from "@/src/theme";

interface CoordinateValue {
  latitude: number;
  longitude: number;
}

interface PointCoordinatePickerModalProps {
  open: boolean;
  initialCoordinates?: CoordinateValue | null;
  onClose: () => void;
  onConfirm: (coordinates: CoordinateValue) => void;
}

const DEFAULT_REGION: MapRegion = {
  latitude: -22.9068,
  longitude: -43.1729,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

function createFocusedRegion(latitude: number, longitude: number): MapRegion {
  return {
    latitude,
    longitude,
    latitudeDelta: 0.004,
    longitudeDelta: 0.004,
  };
}

function formatCoordinateLabel(coordinates: CoordinateValue | null) {
  if (!coordinates) {
    return "Arraste o mapa para posicionar o alvo no novo local do ponto.";
  }

  return `Latitude ${coordinates.latitude.toFixed(6)} | Longitude ${coordinates.longitude.toFixed(6)}`;
}

export function PointCoordinatePickerModal({
  open,
  initialCoordinates,
  onClose,
  onConfirm,
}: PointCoordinatePickerModalProps) {
  const mapRef = useRef<MapCanvasHandle | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(
    initialCoordinates
      ? createFocusedRegion(initialCoordinates.latitude, initialCoordinates.longitude)
      : DEFAULT_REGION,
  );
  const [mapCenter, setMapCenter] = useState<CoordinateValue | null>(initialCoordinates ?? null);
  const [addressQuery, setAddressQuery] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextRegion = initialCoordinates
      ? createFocusedRegion(initialCoordinates.latitude, initialCoordinates.longitude)
      : DEFAULT_REGION;

    setMapRegion(nextRegion);
    setMapCenter(
      initialCoordinates ?? {
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
      },
    );
    setAddressQuery("");
  }, [initialCoordinates, open]);

  const mapHint = useMemo(
    () =>
      Platform.OS === "web"
        ? "No computador, clique com o botao direito no mapa para aplicar imediatamente a nova coordenada. Se preferir, arraste o mapa e use o centro."
        : "No celular, arraste o mapa ate o local desejado. O alvo central indica a coordenada que sera aplicada.",
    [],
  );

  async function handleAddressSearch() {
    if (!addressQuery.trim()) {
      Toast.show({
        type: "error",
        text1: "Informe um endereco",
      });
      return;
    }

    setIsSearchingAddress(true);

    try {
      const result = await geocodeAddress(addressQuery.trim());
      const nextRegion = createFocusedRegion(result.latitude, result.longitude);

      setMapRegion(nextRegion);
      setMapCenter({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      mapRef.current?.animateToRegion(nextRegion, 450);
      Toast.show({
        type: "success",
        text1: "Endereco localizado",
        text2: result.formattedAddress,
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Busca indisponivel",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsSearchingAddress(false);
    }
  }

  async function handleCenterOnCurrentLocation() {
    setIsLocating(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Toast.show({
          type: "error",
          text1: "Localizacao nao permitida",
        });
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextRegion = createFocusedRegion(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
      );

      setMapRegion(nextRegion);
      setMapCenter({
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
      });
      mapRef.current?.animateToRegion(nextRegion, 450);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Nao foi possivel obter sua localizacao",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsLocating(false);
    }
  }

  function applyCoordinates(coordinates: CoordinateValue | null) {
    if (!coordinates) {
      Toast.show({
        type: "error",
        text1: "Mapa ainda sem coordenada",
        text2: "Aguarde o carregamento ou mova o mapa antes de confirmar.",
      });
      return;
    }

    onConfirm(coordinates);
    onClose();
  }

  return (
    <ModalSheet onClose={onClose} open={open} title="Reposicionar no mapa">
      <View style={styles.container}>
        <Text style={styles.description}>
          Ajuste a posicao do ponto diretamente no mapa, seguindo o mesmo fluxo do cadastro.
        </Text>

        <Field>
          <FieldLabel>Buscar endereco</FieldLabel>
          <View style={styles.addressRow}>
            <FieldInput
              onChangeText={setAddressQuery}
              placeholder="Rua, bairro, numero ou referencia"
              value={addressQuery}
            />
            <Button
              compact
              label={isSearchingAddress ? "..." : "Localizar"}
              onPress={() => void handleAddressSearch()}
              variant="ghost"
            />
          </View>
        </Field>

        <View style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusEyebrow}>Centro atual do mapa</Text>
            <Text style={styles.statusText}>{formatCoordinateLabel(mapCenter)}</Text>
          </View>
          <Button
            compact
            label={isLocating ? "Localizando..." : "Minha posicao"}
            onPress={() => void handleCenterOnCurrentLocation()}
            variant="ghost"
          />
        </View>

        <View style={styles.mapHintBox}>
          <Text style={styles.mapHintText}>{mapHint}</Text>
        </View>

        <View style={styles.mapFrame}>
          <MapCanvas
            onLongPress={(coordinates) => applyCoordinates(coordinates)}
            onRegionChangeComplete={(nextRegion) => {
              setMapRegion(nextRegion);
              setMapCenter({
                latitude: nextRegion.latitude,
                longitude: nextRegion.longitude,
              });
            }}
            points={[]}
            ref={mapRef}
            region={mapRegion}
          />
          <View pointerEvents="none" style={styles.centerMarkerOverlay}>
            <View style={styles.centerMarker}>
              <View style={[styles.centerMarkerLine, styles.centerMarkerLineVertical]} />
              <View style={[styles.centerMarkerLine, styles.centerMarkerLineHorizontal]} />
              <View style={styles.centerMarkerDot} />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Button label="Usar centro do mapa" onPress={() => applyCoordinates(mapCenter)} />
          <Button label="Cancelar" onPress={onClose} variant="ghost" />
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  statusCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  mapHintBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapHintText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  mapFrame: {
    borderRadius: 16,
    height: 320,
    overflow: "hidden",
    position: "relative",
  },
  centerMarkerOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  centerMarker: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  centerMarkerLine: {
    backgroundColor: colors.primaryStrong,
    borderRadius: 999,
    position: "absolute",
  },
  centerMarkerLineVertical: {
    height: 24,
    width: 3,
  },
  centerMarkerLineHorizontal: {
    height: 3,
    width: 24,
  },
  centerMarkerDot: {
    backgroundColor: colors.background,
    borderColor: colors.primaryStrong,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    width: 10,
  },
  actions: {
    gap: spacing.sm,
  },
});
