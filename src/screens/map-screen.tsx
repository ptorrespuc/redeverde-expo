import { Picker } from "@react-native-picker/picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";

import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { MapCanvas } from "@/src/components/map/map-canvas";
import type { MapCanvasHandle, MapRegion } from "@/src/components/map/map-canvas.types";
import { PointActionModal } from "@/src/components/points/point-action-modal";
import { PointFormModal } from "@/src/components/points/point-form-modal";
import { PointSummaryCard } from "@/src/components/points/point-summary-card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field, FieldInput, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { LoadingView } from "@/src/components/ui/loading-view";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { Screen } from "@/src/components/ui/screen";
import { createPoint, listPoints, reviewPoint } from "@/src/lib/api";
import { calculateDistanceMeters, formatDistance } from "@/src/lib/format";
import { geocodeAddress } from "@/src/lib/geocoding";
import { loadGroupSelection, saveGroupSelection } from "@/src/lib/group-selection";
import { isPointPendingForReview } from "@/src/lib/point-display";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { CreatePointPayload, PointRecord, PointTagRecord } from "@/src/types/domain";

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

function syncSelection(current: string[], availableIds: string[]) {
  if (!availableIds.length) {
    return [];
  }

  const availableIdSet = new Set(availableIds);
  const preserved = current.filter((item) => availableIdSet.has(item));

  if (!preserved.length) {
    return availableIds;
  }

  return preserved;
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
    >
      <Text style={[styles.filterChipCheck, selected ? styles.filterChipCheckSelected : null]}>
        {selected ? "☑" : "☐"}
      </Text>
      <Text style={[styles.filterChipLabel, selected ? styles.filterChipLabelSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MapScreen() {
  const params = useLocalSearchParams<{ group?: string; grupo?: string }>();
  const router = useRouter();
  const mapRef = useRef<MapCanvasHandle | null>(null);
  const screenScrollRef = useRef<ScrollView | null>(null);
  const focusSelectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    classifications,
    isAuthenticated,
    isReady,
    speciesCatalog,
    userContext,
    visibleGroups,
  } = useAppContext();
  const initialGroupCode = params.grupo || params.group || null;
  const submissionGroups = userContext?.submission_groups ?? [];
  const approvableGroups = userContext?.approvable_groups ?? [];
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [groupFilter, setGroupFilter] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selectedClassificationIds, setSelectedClassificationIds] = useState<string[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<PointRecord | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(DEFAULT_REGION);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<Partial<CreatePointPayload>>({});
  const [mapSectionY, setMapSectionY] = useState(0);

  const centerOnCurrentLocation = useCallback(
    async (animate = true, notifyOnError = true) => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          if (notifyOnError) {
            Toast.show({
              type: "error",
              text1: "Localizacao nao permitida",
            });
          }
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

        if (animate) {
          mapRef.current?.animateToRegion(nextRegion, 450);
        }
      } catch (error) {
        if (notifyOnError) {
          Toast.show({
            type: "error",
            text1: "Nao foi possivel obter sua localizacao",
            text2: error instanceof Error ? error.message : "Tente novamente.",
          });
        }
      }
    },
    [],
  );

  useEffect(() => {
    void centerOnCurrentLocation(false, false);
  }, [centerOnCurrentLocation]);

  useEffect(() => {
    return () => {
      if (focusSelectionTimeoutRef.current) {
        clearTimeout(focusSelectionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function resolveInitialGroup() {
      if (!visibleGroups.length) {
        return;
      }

      const codedGroup = initialGroupCode
        ? visibleGroups.find((group) => group.code === initialGroupCode) ?? null
        : null;
      const savedGroupId = await loadGroupSelection();
      const savedGroup =
        savedGroupId && savedGroupId !== "all"
          ? visibleGroups.find((group) => group.id === savedGroupId) ?? null
          : savedGroupId === "all"
            ? { id: "all" }
            : null;
      const preferredGroup =
        userContext?.preferred_group &&
        visibleGroups.find((group) => group.id === userContext.preferred_group?.id);
      const fallbackSelection = codedGroup?.id ?? savedGroup?.id ?? preferredGroup?.id ?? "all";

      if (ignore) {
        return;
      }

      setGroupFilter(fallbackSelection);

      if (codedGroup?.id || savedGroup?.id) {
        await saveGroupSelection(fallbackSelection);
      }
    }

    void resolveInitialGroup();

    return () => {
      ignore = true;
    };
  }, [initialGroupCode, userContext?.preferred_group, visibleGroups]);

  const refreshPoints = useCallback(
    async (nextGroupId = groupFilter) => {
      setIsLoading(true);

      try {
        const nextPoints = await listPoints({
          groupId: nextGroupId === "all" ? null : nextGroupId,
        });
        setPoints(nextPoints);
        setSelectedPoint((current) => nextPoints.find((point) => point.id === current?.id) ?? null);
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Falha ao carregar pontos",
          text2: error instanceof Error ? error.message : "Tente novamente.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [groupFilter],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void refreshPoints();
  }, [isReady, refreshPoints]);

  const selectedGroup = visibleGroups.find((group) => group.id === groupFilter) ?? null;
  const isAllGroupsSelected = groupFilter === "all";
  const currentGroupSummary =
    isAllGroupsSelected ? null : selectedGroup ?? (visibleGroups.length === 1 ? visibleGroups[0] : null);
  const canReviewInCurrentScope =
    groupFilter === "all"
      ? approvableGroups.length > 0
      : approvableGroups.some((group) => group.id === groupFilter);
  const mapScopedPoints = useMemo(
    () =>
      points.filter((point) =>
        point.viewer_can_approve ? true : !isPointPendingForReview(point),
      ),
    [points],
  );

  const availableClassificationIds = useMemo(
    () => Array.from(new Set(mapScopedPoints.map((point) => point.classification_id))),
    [mapScopedPoints],
  );
  const selectedClassificationIdSet = useMemo(
    () => new Set(selectedClassificationIds),
    [selectedClassificationIds],
  );
  const availableClassifications = useMemo(
    () =>
      classifications.filter((classification) => availableClassificationIds.includes(classification.id)),
    [availableClassificationIds, classifications],
  );

  useEffect(() => {
    setSelectedClassificationIds((current) => syncSelection(current, availableClassificationIds));
  }, [availableClassificationIds]);

  const activeClassifications = useMemo(
    () =>
      classifications.filter(
        (classification) =>
          selectedClassificationIdSet.has(classification.id) &&
          availableClassificationIds.includes(classification.id),
      ),
    [availableClassificationIds, classifications, selectedClassificationIdSet],
  );
  const classificationsRequiringSpecies = useMemo(
    () => activeClassifications.filter((classification) => classification.requires_species),
    [activeClassifications],
  );
  const allSpeciesForCurrentGroup = useMemo(
    () =>
      classifications.filter(
        (classification) =>
          availableClassificationIds.includes(classification.id) && classification.requires_species,
      ),
    [availableClassificationIds, classifications],
  );
  const speciesCatalogMap = useMemo(
    () => new Map(speciesCatalog.map((species) => [species.id, species])),
    [speciesCatalog],
  );
  const allAvailableSpecies = useMemo(
    () => {
      if (!allSpeciesForCurrentGroup.length) {
        return [];
      }

      const speciesIds = new Set<string>();

      for (const point of mapScopedPoints) {
        const classification = classifications.find((item) => item.id === point.classification_id);

        if (!classification?.requires_species || !point.species_id) {
          continue;
        }

        speciesIds.add(point.species_id);
      }

      return Array.from(speciesIds)
        .map((speciesId) => speciesCatalogMap.get(speciesId))
        .filter((species): species is NonNullable<typeof species> => Boolean(species))
        .sort((left, right) => left.common_name.localeCompare(right.common_name, "pt-BR"));
    },
    [allSpeciesForCurrentGroup.length, classifications, mapScopedPoints, speciesCatalogMap],
  );
  const availableSpecies = useMemo(
    () => {
      if (!classificationsRequiringSpecies.length) {
        return [];
      }

      const speciesIds = new Set<string>();

      for (const point of mapScopedPoints) {
        const classification = classifications.find((item) => item.id === point.classification_id);

        if (!classification?.requires_species || !selectedClassificationIdSet.has(point.classification_id)) {
          continue;
        }

        if (point.species_id) {
          speciesIds.add(point.species_id);
        }
      }

      return Array.from(speciesIds)
        .map((speciesId) => speciesCatalogMap.get(speciesId))
        .filter((species): species is NonNullable<typeof species> => Boolean(species))
        .sort((left, right) => left.common_name.localeCompare(right.common_name, "pt-BR"));
    },
    [
      classifications,
      classificationsRequiringSpecies.length,
      mapScopedPoints,
      selectedClassificationIdSet,
      speciesCatalogMap,
    ],
  );
  const availableTags = useMemo(
    () => {
      const tagsById = new Map<string, PointTagRecord>();

      for (const point of mapScopedPoints) {
        if (!selectedClassificationIdSet.has(point.classification_id)) {
          continue;
        }

        for (const tag of point.tags ?? []) {
          tagsById.set(tag.id, tag);
        }
      }

      return Array.from(tagsById.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      );
    },
    [mapScopedPoints, selectedClassificationIdSet],
  );
  const allAvailableTags = useMemo(
    () => {
      const tagsById = new Map<string, PointTagRecord>();

      for (const point of mapScopedPoints) {
        for (const tag of point.tags ?? []) {
          tagsById.set(tag.id, tag);
        }
      }

      return Array.from(tagsById.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR"),
      );
    },
    [mapScopedPoints],
  );

  useEffect(() => {
    setSelectedSpeciesIds((current) =>
      syncSelection(
        current,
        availableSpecies.map((species) => species.id),
      ),
    );
  }, [availableSpecies]);

  useEffect(() => {
    setSelectedTagIds((current) =>
      syncSelection(
        current,
        availableTags.map((tag) => tag.id),
      ),
    );
  }, [availableTags]);

  const selectedSpeciesIdSet = useMemo(() => new Set(selectedSpeciesIds), [selectedSpeciesIds]);
  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const classificationMap = useMemo(
    () => new Map(classifications.map((classification) => [classification.id, classification])),
    [classifications],
  );
  const classificationTagMap = useMemo(() => {
    const entries = new Map<string, PointTagRecord[]>();

    for (const tag of availableTags) {
      const current = entries.get(tag.point_classification_id) ?? [];
      current.push(tag);
      entries.set(tag.point_classification_id, current);
    }

    return entries;
  }, [availableTags]);
  const speciesFilterActive =
    availableSpecies.length > 0 && selectedSpeciesIds.length !== availableSpecies.length;
  const tagFilterActive = availableTags.length > 0 && selectedTagIds.length !== availableTags.length;

  const filteredPoints = useMemo(
    () =>
      mapScopedPoints
        .filter((point) => selectedClassificationIdSet.has(point.classification_id))
        .filter((point) => !pendingOnly || isPointPendingForReview(point))
        .filter((point) => {
          if (!speciesFilterActive) {
            return true;
          }

          const classification = classificationMap.get(point.classification_id);

          if (!classification?.requires_species) {
            return true;
          }

          return point.species_id ? selectedSpeciesIdSet.has(point.species_id) : false;
        })
        .filter((point) => {
          if (!tagFilterActive) {
            return true;
          }

          const tagsForClassification = classificationTagMap.get(point.classification_id) ?? [];

          if (!tagsForClassification.length) {
            return true;
          }

          const pointTagIds = new Set((point.tags ?? []).map((tag) => tag.id));
          return Array.from(pointTagIds).some((tagId) => selectedTagIdSet.has(tagId));
        }),
    [
      classificationMap,
      classificationTagMap,
      pendingOnly,
      mapScopedPoints,
      selectedClassificationIdSet,
      selectedSpeciesIdSet,
      selectedTagIdSet,
      speciesFilterActive,
      tagFilterActive,
    ],
  );
  const sortedPoints = useMemo(
    () =>
      [...filteredPoints]
        .map((point) => ({
          point,
          distance:
            mapCenter == null
              ? null
              : calculateDistanceMeters(mapCenter, {
                  latitude: point.latitude,
                  longitude: point.longitude,
                }),
        }))
        .sort((a, b) => {
          if (a.distance != null && b.distance != null && a.distance !== b.distance) {
            return a.distance - b.distance;
          }

          if (a.distance != null && b.distance == null) {
            return -1;
          }

          if (a.distance == null && b.distance != null) {
            return 1;
          }

          return a.point.title.localeCompare(b.point.title, "pt-BR");
        }),
    [filteredPoints, mapCenter],
  );
  const defaultSubmissionGroupId =
    submissionGroups.find((group) => group.id === groupFilter)?.id ?? submissionGroups[0]?.id ?? "";
  const currentMapTarget = mapCenter ?? {
    latitude: mapRegion.latitude,
    longitude: mapRegion.longitude,
  };

  function focusPoint(point: PointRecord, options?: { revealMap?: boolean }) {
    const nextRegion = createFocusedRegion(point.latitude, point.longitude);
    setMapRegion(nextRegion);
    setMapCenter({ latitude: point.latitude, longitude: point.longitude });
    mapRef.current?.animateToRegion(nextRegion, 450);

    if (focusSelectionTimeoutRef.current) {
      clearTimeout(focusSelectionTimeoutRef.current);
      focusSelectionTimeoutRef.current = null;
    }

    if (options?.revealMap) {
      setSelectedPoint(null);

      requestAnimationFrame(() => {
        screenScrollRef.current?.scrollTo({
          y: Math.max(mapSectionY - spacing.md, 0),
          animated: true,
        });
      });

      focusSelectionTimeoutRef.current = setTimeout(() => {
        setSelectedPoint(point);
        focusSelectionTimeoutRef.current = null;
      }, 420);
      return;
    }

    setSelectedPoint(point);
  }

  function openCreateModal(coordinates?: { latitude: number; longitude: number }) {
    if (!submissionGroups.length) {
      Toast.show({
        type: "error",
        text1: isAuthenticated ? "Sem permissao para criar pontos" : "Entre para criar pontos",
      });
      return;
    }

    const nextCoordinates = coordinates ?? currentMapTarget;

    setDraftValues({
      groupId: defaultSubmissionGroupId,
      classificationId: classifications[0]?.id ?? "",
      longitude: nextCoordinates.longitude,
      latitude: nextCoordinates.latitude,
      isPublic:
        submissionGroups.find((group) => group.id === defaultSubmissionGroupId)?.is_public ?? false,
    });
    setIsCreateOpen(true);
  }

  async function handleCreatePoint(payload: CreatePointPayload) {
    const createdPoint = await createPoint(payload);
    setIsCreateOpen(false);

    const nextGroupFilter =
      groupFilter !== "all" && groupFilter !== createdPoint.group_id ? createdPoint.group_id : groupFilter;

    if (nextGroupFilter !== groupFilter) {
      setGroupFilter(nextGroupFilter);
      await saveGroupSelection(nextGroupFilter);
    }

    await refreshPoints(nextGroupFilter);
    focusPoint(createdPoint, { revealMap: true });
    Toast.show({
      type: "success",
      text1:
        createdPoint.approval_status === "pending" ? "Ponto enviado para aprovacao" : "Ponto criado",
    });
  }

  async function handleReview(point: PointRecord, action: "approve" | "reject") {
    const updatedPoint = await reviewPoint(point.id, action);
    await refreshPoints();
    setSelectedPoint(
      action === "approve" && (!pendingOnly || isPointPendingForReview(updatedPoint))
        ? updatedPoint
        : null,
    );
    Toast.show({
      type: "success",
      text1:
        action === "approve"
          ? point.has_pending_update
            ? "Alteracao aprovada"
            : "Ponto aprovado"
          : "Ponto rejeitado",
    });
  }

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
      setMapCenter({ latitude: result.latitude, longitude: result.longitude });
      mapRef.current?.animateToRegion(nextRegion, 450);
      setIsFiltersOpen(false);
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

  function clearMapFilters() {
    setSelectedClassificationIds(availableClassificationIds);
    setSelectedSpeciesIds(allAvailableSpecies.map((species) => species.id));
    setSelectedTagIds(allAvailableTags.map((tag) => tag.id));
    setPendingOnly(false);
    setAddressQuery("");
  }

  if (!isReady) {
    return <LoadingView label="Carregando mapa..." />;
  }

  const currentGroupTitle = currentGroupSummary?.name ?? "Todos os grupos visíveis";
  const groupActionLabel = selectedGroup || isAllGroupsSelected ? "Trocar grupo" : "Escolher grupo";
  const filterSummaryCount =
    Number(groupFilter !== "all") +
    Number(pendingOnly) +
    Number(selectedClassificationIds.length !== availableClassificationIds.length) +
    Number(speciesFilterActive) +
    Number(tagFilterActive);

  return (
    <Screen scrollViewRef={screenScrollRef}>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Mapa</Text>
            <View style={styles.groupHeader}>
              {currentGroupSummary ? (
                <GroupAvatar
                  logoUrl={currentGroupSummary.logo_url}
                  name={currentGroupSummary.name}
                  size={40}
                />
              ) : null}
              <View style={styles.groupHeaderCopy}>
                <Text style={styles.title}>{currentGroupTitle}</Text>
                <Text style={styles.subtitle}>
                  {currentGroupSummary
                    ? `Grupo ${currentGroupSummary.is_public ? "publico" : "privado"}`
                    : `${visibleGroups.length} grupos no filtro atual`}
                </Text>
              </View>
            </View>
          </View>
          <Badge>{isLoading ? "Carregando..." : `${filteredPoints.length} pontos`}</Badge>
        </View>

        <View style={styles.topActions}>
          {visibleGroups.length > 1 ? (
            <Button
              compact
              label={groupActionLabel}
              onPress={() => setIsFiltersOpen(true)}
              variant="ghost"
            />
          ) : null}
          <Button
            compact
            label={filterSummaryCount ? `Filtros e busca (${filterSummaryCount})` : "Filtros e busca"}
            onPress={() => setIsFiltersOpen(true)}
            variant="ghost"
          />
          {filterSummaryCount ? (
            <Button compact label="Limpar filtros" onPress={clearMapFilters} variant="ghost" />
          ) : null}
        </View>

        <View style={styles.mapInfoBox}>
          <Text style={styles.mapInfoText}>
            {Platform.OS === "web"
              ? "Use Novo ponto para criar no centro do mapa. Se preferir um atalho, clique com o botao direito para criar exatamente no local desejado."
              : "Use Novo ponto para criar no centro do mapa. Arraste o mapa ate o local desejado e toque no botao para cadastrar."}
          </Text>
        </View>
      </Card>

      <View
        onLayout={(event) => {
          setMapSectionY(event.nativeEvent.layout.y);
        }}
      >
        <Card>
          <View style={styles.map}>
            <MapCanvas
              onLongPress={(coordinates: { latitude: number; longitude: number }) => {
                openCreateModal(coordinates);
              }}
              onRegionChangeComplete={(region: MapRegion) => {
                setMapRegion(region);
                setMapCenter({ latitude: region.latitude, longitude: region.longitude });
              }}
              onSelectPoint={(point: PointRecord) => setSelectedPoint(point)}
              points={filteredPoints}
              ref={mapRef}
              region={mapRegion}
              selectedPointId={selectedPoint?.id}
            />
            <View pointerEvents="none" style={styles.centerMarkerOverlay}>
              <View style={styles.centerMarker}>
                <View style={[styles.centerMarkerLine, styles.centerMarkerLineVertical]} />
                <View style={[styles.centerMarkerLine, styles.centerMarkerLineHorizontal]} />
                <View style={styles.centerMarkerDot} />
              </View>
            </View>
          </View>
          <View style={styles.mapActions}>
            {submissionGroups.length ? (
              <Button compact label="Novo ponto" onPress={() => openCreateModal()} variant="secondary" />
            ) : null}
            <Button compact label="Minha posicao" onPress={() => void centerOnCurrentLocation()} variant="ghost" />
          </View>
        </Card>
      </View>

      {sortedPoints.length ? (
        sortedPoints.map(({ point, distance }) => (
          <PointSummaryCard
            key={point.id}
            meta={distance == null ? point.group_name : `${point.group_name} | ${formatDistance(distance)}`}
            onCenter={() => focusPoint(point, { revealMap: true })}
            onPress={() => setSelectedPoint(point)}
            point={point}
            showLifecycleStatus={canReviewInCurrentScope}
          />
        ))
      ) : (
        <EmptyState
          title="Nenhum ponto no filtro"
          description="Ajuste grupo, classificacoes, especies, tags ou pendencias para encontrar registros."
        />
      )}

      <PointActionModal
        onApprove={(point) => void handleReview(point, "approve")}
        onClose={() => setSelectedPoint(null)}
        onEdit={(point) => router.push(`/points/${point.id}/edit`)}
        onOpenDetail={(point) => router.push(`/points/${point.id}`)}
        onReject={(point) => void handleReview(point, "reject")}
        open={Boolean(selectedPoint)}
        point={selectedPoint}
      />

      <PointFormModal
        classifications={classifications}
        groups={submissionGroups}
        initialValues={draftValues}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreatePoint}
        open={isCreateOpen}
        speciesCatalog={speciesCatalog}
        submitLabel="Criar ponto"
        title="Novo ponto"
      />

      <ModalSheet open={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros e busca">
        <ScrollView contentContainerStyle={styles.filtersContent}>
          {visibleGroups.length > 1 ? (
            <Field>
              <FieldLabel>Grupo</FieldLabel>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={groupFilter}
                  onValueChange={(value) => {
                    const nextValue = String(value);
                    setGroupFilter(nextValue);
                    void saveGroupSelection(nextValue);
                  }}
                >
                  <Picker.Item label="Todos os grupos visíveis" value="all" />
                  {visibleGroups.map((group) => (
                    <Picker.Item
                      key={group.id}
                      label={`${group.name} (${group.is_public ? "publico" : "privado"})`}
                      value={group.id}
                    />
                  ))}
                </Picker>
              </View>
            </Field>
          ) : null}

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
                label={isSearchingAddress ? "..." : "Ir"}
                onPress={() => void handleAddressSearch()}
                variant="ghost"
              />
            </View>
          </Field>

          {canReviewInCurrentScope ? (
            <FieldSwitch
              label="Exibir somente pontos pendentes"
              onValueChange={setPendingOnly}
              value={pendingOnly}
            />
          ) : null}

          <View style={styles.filterSection}>
            <Text style={styles.filterTitle}>Classificacoes</Text>
            <Text style={styles.filterDescription}>
              Os pontos do mapa respeitam todas as classificacoes marcadas abaixo.
            </Text>
            <View style={styles.filterActionRow}>
              <Button
                compact
                label="Marcar todas"
                onPress={() => setSelectedClassificationIds(availableClassificationIds)}
                variant="ghost"
              />
              <Button
                compact
                label="Desmarcar todas"
                onPress={() => setSelectedClassificationIds([])}
                variant="ghost"
              />
            </View>
            <View style={styles.filterChipWrap}>
              {availableClassifications.map((classification) => (
                <FilterChip
                  key={classification.id}
                  label={classification.name}
                  onPress={() =>
                    setSelectedClassificationIds((current) =>
                      current.includes(classification.id)
                        ? current.filter((item) => item !== classification.id)
                        : [...current, classification.id],
                    )
                  }
                  selected={selectedClassificationIds.includes(classification.id)}
                />
              ))}
            </View>
            {!availableClassifications.length ? (
              <Text style={styles.filterDescription}>
                Nenhuma classificação encontrada para os pontos do grupo atual.
              </Text>
            ) : null}
          </View>

          {availableSpecies.length ? (
            <View style={styles.filterSection}>
              <Text style={styles.filterTitle}>Especies</Text>
              <Text style={styles.filterDescription}>
                O filtro por especie afeta apenas os pontos das classificacoes que usam especies.
              </Text>
              <View style={styles.filterActionRow}>
                <Button
                  compact
                  label="Marcar todas"
                  onPress={() => setSelectedSpeciesIds(availableSpecies.map((species) => species.id))}
                  variant="ghost"
                />
                <Button
                  compact
                  label="Desmarcar todas"
                  onPress={() => setSelectedSpeciesIds([])}
                  variant="ghost"
                />
              </View>
              <View style={styles.filterChipWrap}>
                {availableSpecies.map((species) => (
                  <FilterChip
                    key={species.id}
                    label={species.common_name}
                    onPress={() =>
                      setSelectedSpeciesIds((current) =>
                        current.includes(species.id)
                          ? current.filter((item) => item !== species.id)
                          : [...current, species.id],
                      )
                    }
                    selected={selectedSpeciesIds.includes(species.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {availableTags.length ? (
            <View style={styles.filterSection}>
              <Text style={styles.filterTitle}>Tags</Text>
              <Text style={styles.filterDescription}>
                As tags acompanham as classificacoes marcadas. Se todas estiverem marcadas, o mapa nao restringe por tags.
              </Text>
              <View style={styles.filterActionRow}>
                <Button
                  compact
                  label="Marcar todas"
                  onPress={() => setSelectedTagIds(availableTags.map((tag) => tag.id))}
                  variant="ghost"
                />
                <Button
                  compact
                  label="Desmarcar todas"
                  onPress={() => setSelectedTagIds([])}
                  variant="ghost"
                />
              </View>
              <View style={styles.filterChipWrap}>
                {availableTags.map((tag) => (
                  <FilterChip
                    key={tag.id}
                    label={tag.name}
                    onPress={() =>
                      setSelectedTagIds((current) =>
                        current.includes(tag.id)
                          ? current.filter((item) => item !== tag.id)
                          : [...current, tag.id],
                      )
                    }
                    selected={selectedTagIds.includes(tag.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.filterFooter}>
            <Button compact label="Limpar filtros" onPress={clearMapFilters} variant="ghost" />
            <Button compact label="Fechar" onPress={() => setIsFiltersOpen(false)} />
          </View>
        </ScrollView>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  groupHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  topActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  mapInfoBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapInfoText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  map: {
    borderRadius: 16,
    height: 360,
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
  mapActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  filtersContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterSection: {
    gap: spacing.sm,
  },
  filterTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  filterDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  filterActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipSelected: {
    borderColor: colors.primary,
  },
  filterChipCheck: {
    color: colors.primary,
    fontSize: 14,
  },
  filterChipCheckSelected: {
    color: colors.primaryStrong,
  },
  filterChipLabel: {
    color: colors.text,
    fontSize: 14,
  },
  filterChipLabelSelected: {
    color: colors.primaryStrong,
    fontWeight: "700",
  },
  filterFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
