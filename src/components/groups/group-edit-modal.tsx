import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";

import { updateAdminGroup } from "@/src/lib/admin-web-api";
import { Button } from "@/src/components/ui/button";
import { Field, FieldHint, FieldInput, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { colors, spacing } from "@/src/theme";
import type { GroupRecord } from "@/src/types/domain";

interface GroupFormState {
  name: string;
  code: string;
  isPublic: boolean;
  acceptsPointCollaboration: boolean;
  maxPendingPointsPerCollaborator: string;
  logoFile: File | null;
  logoPreviewUrl: string | null;
  removeLogo: boolean;
}

function buildFormFromGroup(group: GroupRecord): GroupFormState {
  return {
    name: group.name,
    code: group.code,
    isPublic: group.is_public,
    acceptsPointCollaboration: group.accepts_point_collaboration,
    maxPendingPointsPerCollaborator: String(group.max_pending_points_per_collaborator ?? 5),
    logoFile: null,
    logoPreviewUrl: group.logo_url ?? null,
    removeLogo: false,
  };
}

interface GroupEditModalProps {
  group: GroupRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function GroupEditModal({ group, onClose, onSuccess }: GroupEditModalProps) {
  const [form, setForm] = useState<GroupFormState>({
    name: "",
    code: "",
    isPublic: false,
    acceptsPointCollaboration: false,
    maxPendingPointsPerCollaborator: "5",
    logoFile: null,
    logoPreviewUrl: null,
    removeLogo: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const logoPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (group) {
      setForm(buildFormFromGroup(group));
    }
  }, [group?.id]);

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (logoPreviewRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(logoPreviewRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    logoPreviewRef.current = previewUrl;

    setForm((prev) => ({
      ...prev,
      logoFile: file,
      logoPreviewUrl: previewUrl,
      removeLogo: false,
    }));

    event.currentTarget.value = "";
  };

  const handleLogoRemove = () => {
    if (logoPreviewRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(logoPreviewRef.current);
      logoPreviewRef.current = null;
    }

    setForm((prev) => ({
      ...prev,
      logoFile: null,
      logoPreviewUrl: null,
      removeLogo: true,
    }));
  };

  const handleSave = async () => {
    if (!group) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateAdminGroup(group.id, {
        name: form.name,
        code: form.code,
        isPublic: form.isPublic,
        acceptsPointCollaboration: form.acceptsPointCollaboration,
        maxPendingPointsPerCollaborator: Number(form.maxPendingPointsPerCollaborator || 5),
        logo: form.logoFile ?? undefined,
        removeLogo: form.removeLogo,
      });

      Toast.show({ type: "success", text1: "Grupo atualizado com sucesso." });
      onSuccess();
      onClose();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Erro ao atualizar grupo",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalSheet
      open={group !== null}
      onClose={onClose}
      title={group ? `Gerenciar: ${group.name}` : "Gerenciar grupo"}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Field>
          <FieldLabel>Nome</FieldLabel>
          <FieldInput
            value={form.name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
          />
        </Field>

        <Field>
          <FieldLabel>Codigo</FieldLabel>
          <FieldInput
            autoCapitalize="none"
            value={form.code}
            onChangeText={(value) => setForm((prev) => ({ ...prev, code: value }))}
          />
          <FieldHint>Use um identificador curto, sem espacos.</FieldHint>
        </Field>

        <Field>
          <FieldLabel>Limite de pendencias por colaborador</FieldLabel>
          <FieldInput
            keyboardType="number-pad"
            value={form.maxPendingPointsPerCollaborator}
            onChangeText={(value) =>
              setForm((prev) => ({
                ...prev,
                maxPendingPointsPerCollaborator: value.replace(/[^0-9]/g, ""),
              }))
            }
          />
        </Field>

        <FieldSwitch
          label="Grupo publico"
          value={form.isPublic}
          onValueChange={(value) => setForm((prev) => ({ ...prev, isPublic: value }))}
        />

        <FieldSwitch
          label="Aceita colaboracao de pontos"
          value={form.acceptsPointCollaboration}
          onValueChange={(value) =>
            setForm((prev) => ({ ...prev, acceptsPointCollaboration: value }))
          }
        />

        {Platform.OS === "web" ? (
          <Field>
            <FieldLabel>Logo do grupo</FieldLabel>
            <input
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoChange}
              style={logoFileInputStyle}
              type="file"
            />
            <FieldHint>Use PNG, JPG ou WEBP com no maximo 5 MB.</FieldHint>
            {form.logoPreviewUrl ? (
              <View style={styles.logoPreviewShell}>
                <img
                  alt="Preview da logo do grupo"
                  src={form.logoPreviewUrl}
                  style={logoImageStyle}
                />
              </View>
            ) : (
              <View style={styles.logoEmptyShell}>
                <Text style={styles.logoEmptyLabel}>Nenhuma logo selecionada.</Text>
              </View>
            )}
            {form.logoPreviewUrl ? (
              <Button
                compact
                label="Remover logo"
                onPress={handleLogoRemove}
                variant="ghost"
              />
            ) : null}
          </Field>
        ) : null}

        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Salvando..." : "Salvar alteracoes"}
          onPress={() => {
            void handleSave();
          }}
        />
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  logoPreviewShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 124,
    padding: spacing.md,
  },
  logoEmptyShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 108,
    padding: spacing.md,
  },
  logoEmptyLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
});

const logoFileInputStyle: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
  color: colors.text,
  fontSize: 14,
  padding: `${spacing.sm}px ${spacing.md}px`,
};

const logoImageStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  borderRadius: 24,
  height: 96,
  objectFit: "cover",
  width: 96,
};
