import { useEffect, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";

import { Button } from "@/src/components/ui/button";
import {
  Field,
  FieldHint,
  FieldInput,
  FieldLabel,
  FieldTextArea,
} from "@/src/components/ui/field";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { colors, spacing } from "@/src/theme";
import type {
  CreatePointEventPayload,
  NativeUploadFile,
  PointEventPhotoInput,
  PointEventTypeRecord,
} from "@/src/types/domain";

const MAX_EVENT_PHOTOS = 6;
const MAX_EVENT_PHOTO_SIZE = 10 * 1024 * 1024;

interface SelectedEventPhoto extends PointEventPhotoInput {
  id: string;
  previewUri: string;
}

interface EventFormModalProps {
  open: boolean;
  pointTitle: string;
  eventTypeOptions: PointEventTypeRecord[];
  onClose: () => void;
  onSubmit: (payload: CreatePointEventPayload) => Promise<void>;
}

export function EventFormModal({
  open,
  pointTitle,
  eventTypeOptions,
  onClose,
  onSubmit,
}: EventFormModalProps) {
  const [pointEventTypeId, setPointEventTypeId] = useState("");
  const [customEventType, setCustomEventType] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedEventPhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPointEventTypeId("");
    setCustomEventType("");
    setDescription("");
    setEventDate(new Date().toISOString().slice(0, 10));
    setSelectedPhotos([]);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [open]);

  async function handlePhotoSelection() {
    setErrorMessage(null);

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setErrorMessage("Permita o acesso a fotos para anexar imagens ao evento.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.85,
      selectionLimit: MAX_EVENT_PHOTOS,
    });

    if (result.canceled) {
      return;
    }

    try {
      const pickedPhotos = await Promise.all(result.assets.map(convertAssetToSelectedPhoto));

      setSelectedPhotos((current) => {
        const nextPhotos = [...current, ...pickedPhotos];

        if (nextPhotos.length > MAX_EVENT_PHOTOS) {
          throw new Error(`Adicione no maximo ${MAX_EVENT_PHOTOS} fotos por evento.`);
        }

        return nextPhotos;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel preparar as fotos do evento.",
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

    if (eventTypeOptions.length && !pointEventTypeId) {
      setErrorMessage("Selecione o tipo do evento.");
      return;
    }

    if (!eventTypeOptions.length && !customEventType.trim()) {
      setErrorMessage("Informe o tipo do evento.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        pointEventTypeId: pointEventTypeId || undefined,
        eventType: eventTypeOptions.length ? undefined : customEventType.trim(),
        description: description.trim() || undefined,
        eventDate,
        photos: selectedPhotos.map(({ file, caption }) => ({
          file,
          caption: caption?.trim() || undefined,
        })),
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o evento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalSheet onClose={onClose} open={open} title="Novo evento">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Registrar evento para {pointTitle}.</Text>

        {eventTypeOptions.length ? (
          <Field>
            <FieldLabel>Tipo de evento</FieldLabel>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={pointEventTypeId} onValueChange={setPointEventTypeId}>
                <Picker.Item label="Selecione um tipo" value="" />
                {eventTypeOptions.map((eventType) => (
                  <Picker.Item key={eventType.id} label={eventType.name} value={eventType.id} />
                ))}
              </Picker>
            </View>
            <FieldHint>Somente os tipos vinculados a esta classificacao aparecem aqui.</FieldHint>
          </Field>
        ) : (
          <Field>
            <FieldLabel>Tipo de evento</FieldLabel>
            <FieldInput
              onChangeText={setCustomEventType}
              placeholder="Ex.: vistoria, poda, reclassificacao"
              value={customEventType}
            />
          </Field>
        )}

        <Field>
          <FieldLabel>Data do evento</FieldLabel>
          <FieldInput onChangeText={setEventDate} value={eventDate} />
          <FieldHint>Use o formato AAAA-MM-DD.</FieldHint>
        </Field>

        <Field>
          <FieldLabel>Descricao</FieldLabel>
          <FieldTextArea
            onChangeText={setDescription}
            placeholder="Descreva o que aconteceu neste ponto."
            value={description}
          />
        </Field>

        <Field>
          <FieldLabel>Fotos do evento</FieldLabel>
          <Button compact label="Adicionar fotos" onPress={() => void handlePhotoSelection()} variant="ghost" />
          <FieldHint>
            Ate {MAX_EVENT_PHOTOS} imagens por evento, com no maximo 10 MB cada.
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
                      placeholder="Ex.: estado apos a manutencao"
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

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <View style={styles.actions}>
          <Button
            disabled={isSubmitting}
            label={isSubmitting ? "Salvando..." : "Salvar evento"}
            onPress={() => void handleSubmit()}
          />
          <Button label="Cancelar" onPress={onClose} variant="ghost" />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
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
  actions: {
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});

async function convertAssetToSelectedPhoto(asset: ImagePicker.ImagePickerAsset): Promise<SelectedEventPhoto> {
  const fileName = asset.fileName?.trim() || `evento-${Date.now()}.jpg`;
  const mimeType = asset.mimeType || "image/jpeg";
  const assetWithFile = asset as ImagePicker.ImagePickerAsset & { file?: File | null };
  const size = await resolveAssetSize(asset, assetWithFile.file);

  if (size > MAX_EVENT_PHOTO_SIZE) {
    throw new Error("Cada foto do evento pode ter no maximo 10 MB.");
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
