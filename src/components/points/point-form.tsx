import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";

import { listPointTags } from "@/src/lib/api";
import { PointCoordinatePickerModal } from "@/src/components/points/point-coordinate-picker-modal";
import { Button } from "@/src/components/ui/button";
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldSwitch,
  FieldTextArea,
} from "@/src/components/ui/field";
import { colors, spacing } from "@/src/theme";
import type {
  CreatePointPayload,
  GroupRecord,
  NativeUploadFile,
  PointClassificationRecord,
  PointPhotoInput,
  PointTagRecord,
  SpeciesRecord,
} from "@/src/types/domain";

const MAX_POINT_PHOTOS = 3;
const MAX_POINT_PHOTO_SIZE = 10 * 1024 * 1024;

interface SelectedPointPhoto extends PointPhotoInput {
  id: string;
  previewUri: string;
}

interface PointFormProps {
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  initialValues?: Partial<CreatePointPayload>;
  submitLabel?: string;
  isEditing?: boolean;
  onCancel?: () => void;
  onSubmit: (payload: CreatePointPayload) => Promise<void>;
}

interface PointFormState {
  groupId: string;
  classificationId: string;
  tagIds: string[];
  title: string;
  speciesId: string;
  description: string;
  isPublic: boolean;
  longitude: string;
  latitude: string;
}

function buildInitialState(
  groups: GroupRecord[],
  classifications: PointClassificationRecord[],
  initialValues?: Partial<CreatePointPayload>,
): PointFormState {
  const selectedGroup = groups.find((group) => group.id === initialValues?.groupId) ?? groups[0];
  const selectedClassification =
    classifications.find((classification) => classification.id === initialValues?.classificationId) ??
    classifications[0];
  const isGroupPublic = selectedGroup?.is_public ?? false;

  return {
    groupId: initialValues?.groupId ?? selectedGroup?.id ?? "",
    classificationId: initialValues?.classificationId ?? selectedClassification?.id ?? "",
    tagIds: initialValues?.tagIds ?? [],
    title: initialValues?.title ?? "",
    speciesId: initialValues?.speciesId ?? "",
    description: initialValues?.description ?? "",
    isPublic: isGroupPublic ? (initialValues?.isPublic ?? true) : false,
    longitude: initialValues?.longitude != null ? String(initialValues.longitude) : "",
    latitude: initialValues?.latitude != null ? String(initialValues.latitude) : "",
  };
}

export function PointForm({
  groups,
  classifications,
  speciesCatalog,
  initialValues,
  submitLabel = "Salvar ponto",
  isEditing = false,
  onCancel,
  onSubmit,
}: PointFormProps) {
  const [formState, setFormState] = useState(() =>
    buildInitialState(groups, classifications, initialValues),
  );
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [availableTags, setAvailableTags] = useState<PointTagRecord[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPointPhoto[]>([]);
  const [showCoordinateEditor, setShowCoordinateEditor] = useState(
    !Boolean(initialValues?.longitude != null && initialValues?.latitude != null),
  );
  const [showCoordinatePicker, setShowCoordinatePicker] = useState(false);

  useEffect(() => {
    const nextState = buildInitialState(groups, classifications, initialValues);
    setFormState(nextState);
    const nextSpecies = speciesCatalog.find((species) => species.id === nextState.speciesId);
    setSpeciesSearch(nextSpecies?.display_name ?? "");
    setShowCoordinateEditor(!(nextState.longitude && nextState.latitude));
    setShowCoordinatePicker(false);
    setSelectedPhotos([]);
  }, [classifications, groups, initialValues, speciesCatalog]);

  useEffect(() => {
    let ignore = false;

    async function loadTags() {
      if (!formState.classificationId) {
        setAvailableTags([]);
        setFormState((current) =>
          current.tagIds.length ? { ...current, tagIds: [] } : current,
        );
        return;
      }

      setIsLoadingTags(true);

      try {
        const nextTags = await listPointTags({
          pointClassificationId: formState.classificationId,
          onlyActive: true,
        });

        if (ignore) {
          return;
        }

        setAvailableTags(nextTags);
        const nextTagIds = new Set(nextTags.map((tag) => tag.id));
        setFormState((current) => ({
          ...current,
          tagIds: current.tagIds.filter((tagId) => nextTagIds.has(tagId)),
        }));
      } catch (error) {
        if (!ignore) {
          setAvailableTags([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Nao foi possivel carregar as tags da classificacao.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoadingTags(false);
        }
      }
    }

    void loadTags();

    return () => {
      ignore = true;
    };
  }, [formState.classificationId]);

  const selectedGroup = groups.find((group) => group.id === formState.groupId) ?? null;
  const selectedClassification =
    classifications.find((classification) => classification.id === formState.classificationId) ?? null;
  const pointCanBePublic = selectedGroup?.is_public ?? false;
  const canConfigureVisibility = selectedGroup?.viewer_can_manage ?? false;
  const showGroupPicker = groups.length > 1;
  const requiresSpecies = selectedClassification?.requires_species ?? false;
  const hasCoordinates = Boolean(formState.longitude.trim() && formState.latitude.trim());
  const filteredSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();

    if (!query) {
      return speciesCatalog;
    }

    return speciesCatalog.filter((species) =>
      [species.display_name, species.common_name, species.scientific_name].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [speciesCatalog, speciesSearch]);

  useEffect(() => {
    if (!requiresSpecies && formState.speciesId) {
      setFormState((current) => ({ ...current, speciesId: "" }));
    }
  }, [formState.speciesId, requiresSpecies]);

  useEffect(() => {
    if (!requiresSpecies && speciesSearch) {
      setSpeciesSearch("");
    }
  }, [requiresSpecies, speciesSearch]);

  useEffect(() => {
    if (!requiresSpecies) {
      return;
    }

    const query = speciesSearch.trim().toLowerCase();

    if (!query) {
      return;
    }

    const exactMatch = speciesCatalog.find((species) =>
      [species.display_name, species.common_name, species.scientific_name].some(
        (value) => value.trim().toLowerCase() === query,
      ),
    );

    if (!exactMatch || exactMatch.id === formState.speciesId) {
      return;
    }

    setFormState((current) => ({
      ...current,
      speciesId: exactMatch.id,
      title: current.title.trim() ? current.title : exactMatch.common_name,
    }));
  }, [formState.speciesId, requiresSpecies, speciesCatalog, speciesSearch]);

  function setField<Key extends keyof PointFormState>(key: Key, value: PointFormState[Key]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function toggleTag(tagId: string) {
    setFormState((current) => {
      const hasTag = current.tagIds.includes(tagId);

      return {
        ...current,
        tagIds: hasTag
          ? current.tagIds.filter((currentTagId) => currentTagId !== tagId)
          : [...current.tagIds, tagId],
      };
    });
  }

  function applyCoordinatesFromMap(coordinates: { latitude: number; longitude: number }) {
    setFormState((current) => ({
      ...current,
      latitude: coordinates.latitude.toString(),
      longitude: coordinates.longitude.toString(),
    }));
    setShowCoordinateEditor(false);
    setShowCoordinatePicker(false);
  }

  async function handlePhotoSelection() {
    setErrorMessage(null);

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage("Permita o acesso a fotos para anexar imagens ao ponto.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.85,
      selectionLimit: MAX_POINT_PHOTOS,
    });

    if (result.canceled) {
      return;
    }

    try {
      const pickedPhotos = await Promise.all(result.assets.map(convertAssetToSelectedPhoto));

      setSelectedPhotos((current) => {
        const nextPhotos = [...current, ...pickedPhotos];

        if (nextPhotos.length > MAX_POINT_PHOTOS) {
          throw new Error(`Adicione no maximo ${MAX_POINT_PHOTOS} fotos por ponto.`);
        }

        return nextPhotos;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel preparar as fotos do ponto.",
      );
    }
  }

  function removePhoto(photoId: string) {
    setSelectedPhotos((current) => current.filter((photo) => photo.id !== photoId));
  }

  function updatePhotoCaption(photoId: string, caption: string) {
    setSelectedPhotos((current) =>
      current.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
    );
  }

  async function handleSubmit() {
    setErrorMessage(null);

    const longitude = Number(formState.longitude);
    const latitude = Number(formState.latitude);

    if (
      !formState.groupId ||
      !formState.classificationId ||
      !formState.title.trim() ||
      Number.isNaN(longitude) ||
      Number.isNaN(latitude)
    ) {
      setErrorMessage("Grupo, classificacao, titulo e coordenadas sao obrigatorios.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        groupId: formState.groupId,
        classificationId: formState.classificationId,
        tagIds: formState.tagIds,
        title: formState.title.trim(),
        speciesId: requiresSpecies ? formState.speciesId || undefined : undefined,
        description: formState.description.trim() || undefined,
        isPublic: canConfigureVisibility
          ? pointCanBePublic
            ? formState.isPublic
            : false
          : pointCanBePublic,
        longitude,
        latitude,
        photos: selectedPhotos.length
          ? selectedPhotos.map(({ file, caption }) => ({
              file,
              caption: caption?.trim() || undefined,
            }))
          : undefined,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o ponto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.helperBox}>
        <Text style={styles.helperText}>
          O grupo define acesso e colaboracao. A classificacao organiza o tipo principal do ponto,
          e as tags detalham a situacao dentro dessa classificacao.
        </Text>
      </View>

      <Field>
        <FieldLabel>Grupo</FieldLabel>
        {showGroupPicker ? (
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={formState.groupId}
              onValueChange={(value) => {
                const nextGroup = groups.find((group) => group.id === value) ?? null;
                setFormState((current) => ({
                  ...current,
                  groupId: value,
                  isPublic: nextGroup?.is_public ?? false,
                }));
              }}
            >
              {groups.map((group) => (
                <Picker.Item key={group.id} label={group.name} value={group.id} />
              ))}
            </Picker>
          </View>
        ) : (
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyTitle}>{selectedGroup?.name ?? "Grupo selecionado"}</Text>
            {selectedGroup?.code ? (
              <Text style={styles.readOnlyMeta}>Codigo: @{selectedGroup.code}</Text>
            ) : null}
          </View>
        )}
      </Field>

      <Field>
        <FieldLabel>Classificacao do ponto</FieldLabel>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={formState.classificationId}
            onValueChange={(value) => setField("classificationId", value)}
          >
            {classifications.map((classification) => (
              <Picker.Item key={classification.id} label={classification.name} value={classification.id} />
            ))}
          </Picker>
        </View>
      </Field>

      {requiresSpecies ? (
        <Field>
          <FieldLabel>Especie</FieldLabel>
          <FieldInput
            autoCapitalize="words"
            onChangeText={setSpeciesSearch}
            placeholder="Buscar por nome popular ou cientifico"
            value={speciesSearch}
          />
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={formState.speciesId}
              onValueChange={(value) => {
                setField("speciesId", value);
                const nextSpecies = speciesCatalog.find((species) => species.id === value);

                if (!nextSpecies) {
                  return;
                }

                setSpeciesSearch(nextSpecies.display_name);
                setFormState((current) => ({
                  ...current,
                  speciesId: value,
                  title: current.title.trim() ? current.title : nextSpecies.common_name,
                }));
              }}
            >
              <Picker.Item label="Selecione uma especie" value="" />
              {filteredSpecies.map((species) => (
                <Picker.Item
                  key={species.id}
                  label={`${species.display_name} | ${species.origin === "exotic" ? "exotica" : "nativa"}`}
                  value={species.id}
                />
              ))}
            </Picker>
          </View>
          <FieldHint>
            Se a busca ficar identica ao nome da especie, a selecao acontece automaticamente.
          </FieldHint>
        </Field>
      ) : null}

      {isLoadingTags ? (
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>Carregando tags da classificacao...</Text>
        </View>
      ) : availableTags.length ? (
        <Field>
          <FieldLabel>Tags do ponto</FieldLabel>
          <View style={styles.tagGrid}>
            {availableTags.map((tag) => {
              const isSelected = formState.tagIds.includes(tag.id);

              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag.id)}
                  style={[styles.tagChip, isSelected ? styles.tagChipSelected : null]}
                >
                  <Text style={[styles.tagChipLabel, isSelected ? styles.tagChipLabelSelected : null]}>
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FieldHint>As tags ajudam a detalhar o ponto sem multiplicar classificacoes.</FieldHint>
        </Field>
      ) : null}

      <Field>
        <FieldLabel>Titulo</FieldLabel>
        <FieldInput
          onChangeText={(value) => setField("title", value)}
          placeholder="Arvore jovem proxima ao portao principal"
          value={formState.title}
        />
      </Field>

      <Field>
        <FieldLabel>Descricao</FieldLabel>
        <FieldTextArea
          onChangeText={(value) => setField("description", value)}
          placeholder="Observacoes de campo, contexto ou problema encontrado."
          value={formState.description}
        />
      </Field>

      {!isEditing ? (
        <Field>
          <FieldLabel>Fotos iniciais</FieldLabel>
          <Button compact label="Adicionar fotos" onPress={() => void handlePhotoSelection()} variant="ghost" />
          <FieldHint>
            Ate {MAX_POINT_PHOTOS} imagens por ponto, com no maximo 10 MB cada.
          </FieldHint>

          {selectedPhotos.length ? (
            <View style={styles.photoList}>
              {selectedPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoCard}>
                  <Image resizeMode="cover" source={{ uri: photo.previewUri }} style={styles.photoPreview} />
                  <Field>
                    <FieldLabel>Legenda</FieldLabel>
                    <FieldInput
                      onChangeText={(value) => updatePhotoCaption(photo.id, value)}
                      placeholder="Ex.: estado inicial do ponto"
                      value={photo.caption ?? ""}
                    />
                  </Field>
                  <Pressable onPress={() => removePhoto(photo.id)} style={styles.removePhotoButton}>
                    <Text style={styles.removePhotoText}>Remover foto</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Field>
      ) : null}

      {canConfigureVisibility ? (
        <FieldSwitch
          label={
            pointCanBePublic ? "Ponto publico" : "Grupo privado: o ponto sera salvo como privado"
          }
          onValueChange={(value) => setField("isPublic", value)}
          value={pointCanBePublic ? formState.isPublic : false}
        />
      ) : (
        <View style={styles.helperBox}>
          <Text style={styles.helperText}>
            Pontos enviados em colaboracao seguem a visibilidade padrao do grupo e podem ficar
            pendentes para aprovacao.
          </Text>
        </View>
      )}

      <View style={styles.coordinateRow}>
        {isEditing && hasCoordinates && !showCoordinateEditor ? (
          <View style={styles.coordinateSummaryCard}>
            <View style={styles.coordinateSummaryCopy}>
              <Text style={styles.coordinateSummaryTitle}>Posicao definida no mapa</Text>
              <Text style={styles.coordinateSummaryText}>
                Latitude {Number(formState.latitude).toFixed(6)} | Longitude{" "}
                {Number(formState.longitude).toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordinateSummaryActions}>
              <Button
                compact
                label="Reposicionar no mapa"
                onPress={() => setShowCoordinatePicker(true)}
                variant="ghost"
              />
              <Button
                compact
                label="Editar coordenadas"
                onPress={() => setShowCoordinateEditor(true)}
                variant="ghost"
              />
            </View>
          </View>
        ) : (
          <View style={styles.coordinateFieldsRow}>
            <Field style={styles.coordinateField}>
              <FieldLabel>Longitude</FieldLabel>
              <FieldInput
                keyboardType="numeric"
                onChangeText={(value) => setField("longitude", value)}
                value={formState.longitude}
              />
              <FieldHint>Use as coordenadas do mapa ou ajuste manualmente.</FieldHint>
            </Field>
            <Field style={styles.coordinateField}>
              <FieldLabel>Latitude</FieldLabel>
              <FieldInput
                keyboardType="numeric"
                onChangeText={(value) => setField("latitude", value)}
                value={formState.latitude}
              />
              <FieldHint>Valores em graus decimais no padrao WGS84.</FieldHint>
            </Field>
          </View>
        )}
      </View>

      {(!isEditing || showCoordinateEditor) && (hasCoordinates || isEditing) ? (
        <View style={styles.coordinateActions}>
          {isEditing ? (
            <Button
              compact
              label="Reposicionar no mapa"
              onPress={() => setShowCoordinatePicker(true)}
              variant="ghost"
            />
          ) : null}
          {isEditing && hasCoordinates ? (
            <Button
              compact
              disabled={!hasCoordinates}
              label="Manter so a posicao do mapa"
              onPress={() => setShowCoordinateEditor(false)}
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <View style={styles.actions}>
        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Salvando..." : submitLabel}
          onPress={() => void handleSubmit()}
        />
        {onCancel ? <Button label="Cancelar" onPress={onCancel} variant="ghost" /> : null}
      </View>

      {isEditing ? (
        <PointCoordinatePickerModal
          initialCoordinates={
            hasCoordinates
              ? {
                  latitude: Number(formState.latitude),
                  longitude: Number(formState.longitude),
                }
              : null
          }
          onClose={() => setShowCoordinatePicker(false)}
          onConfirm={applyCoordinatesFromMap}
          open={showCoordinatePicker}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  helperBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  readOnlyBox: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  readOnlyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  readOnlyMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  tagChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tagChipLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  tagChipLabelSelected: {
    color: "#ffffff",
  },
  photoList: {
    gap: spacing.md,
  },
  photoCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  photoPreview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 180,
    width: "100%",
  },
  removePhotoButton: {
    alignSelf: "flex-start",
  },
  removePhotoText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  coordinateRow: {
    gap: spacing.md,
  },
  coordinateField: {
    flex: 1,
  },
  coordinateFieldsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  coordinateSummaryCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  coordinateSummaryCopy: {
    gap: 4,
  },
  coordinateSummaryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  coordinateSummaryText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  coordinateSummaryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  coordinateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
  },
});

async function convertAssetToSelectedPhoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<SelectedPointPhoto> {
  const fileName = asset.fileName?.trim() || `ponto-${Date.now()}.jpg`;
  const mimeType = asset.mimeType || "image/jpeg";
  const assetWithFile = asset as ImagePicker.ImagePickerAsset & { file?: File | null };
  const size = await resolveAssetSize(asset, assetWithFile.file);

  if (size > MAX_POINT_PHOTO_SIZE) {
    throw new Error("Cada foto do ponto pode ter no maximo 10 MB.");
  }

  const file =
    assetWithFile.file instanceof File
      ? assetWithFile.file
      : createNativeUploadFile(asset.uri, fileName, mimeType);

  return {
    id: createClientSideId(),
    file,
    caption: "",
    previewUri: asset.uri,
  };
}

function createNativeUploadFile(uri: string, fileName: string, mimeType: string): NativeUploadFile {
  return {
    uri,
    name: fileName,
    type: mimeType,
  };
}

async function resolveAssetSize(asset: ImagePicker.ImagePickerAsset, file?: File | null) {
  if (typeof asset.fileSize === "number" && asset.fileSize > 0) {
    return asset.fileSize;
  }

  if (file instanceof File) {
    return file.size;
  }

  return resolveFileSizeFromUri(asset.uri, asset.mimeType || "image/jpeg");
}

async function resolveFileSizeFromUri(uri: string, mimeType: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const normalizedBlob = blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType);
  return normalizedBlob.size;
}

function createClientSideId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
