import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";

import { listPointTags } from "@/src/lib/api";
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
  PointClassificationRecord,
  PointTagRecord,
  SpeciesRecord,
} from "@/src/types/domain";

interface PointFormProps {
  groups: GroupRecord[];
  classifications: PointClassificationRecord[];
  speciesCatalog: SpeciesRecord[];
  initialValues?: Partial<CreatePointPayload>;
  submitLabel?: string;
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

  useEffect(() => {
    const nextState = buildInitialState(groups, classifications, initialValues);
    setFormState(nextState);
    const nextSpecies = speciesCatalog.find((species) => species.id === nextState.speciesId);
    setSpeciesSearch(nextSpecies?.display_name ?? "");
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
        <Field style={styles.coordinateField}>
          <FieldLabel>Longitude</FieldLabel>
          <FieldInput
            keyboardType="numeric"
            onChangeText={(value) => setField("longitude", value)}
            value={formState.longitude}
          />
        </Field>
        <Field style={styles.coordinateField}>
          <FieldLabel>Latitude</FieldLabel>
          <FieldInput
            keyboardType="numeric"
            onChangeText={(value) => setField("latitude", value)}
            value={formState.latitude}
          />
        </Field>
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <View style={styles.actions}>
        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Salvando..." : submitLabel}
          onPress={() => void handleSubmit()}
        />
        {onCancel ? <Button label="Cancelar" onPress={onCancel} variant="ghost" /> : null}
      </View>
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
  coordinateRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  coordinateField: {
    flex: 1,
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
