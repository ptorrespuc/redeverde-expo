import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Toast from "react-native-toast-message";

import { createGroup } from "@/src/lib/api";
import { Button } from "@/src/components/ui/button";
import { Field, FieldHint, FieldInput, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { colors, spacing } from "@/src/theme";

interface GroupCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface GroupCreateFormState {
  name: string;
  code: string;
  isPublic: boolean;
}

const INITIAL_FORM: GroupCreateFormState = {
  name: "",
  code: "",
  isPublic: false,
};

function deriveCodeFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function GroupCreateModal({ open, onClose, onSuccess }: GroupCreateModalProps) {
  const [form, setForm] = useState<GroupCreateFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      // Auto-preenche o codigo apenas se ainda nao foi editado manualmente
      code: prev.code === deriveCodeFromName(prev.name) || prev.code === ""
        ? deriveCodeFromName(value)
        : prev.code,
    }));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      Toast.show({
        type: "error",
        text1: "Nome obrigatorio",
        text2: "Informe um nome para o grupo.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await createGroup({
        name: form.name.trim(),
        code: form.code.trim(),
        isPublic: form.isPublic,
      });

      Toast.show({
        type: "success",
        text1: "Grupo criado!",
        text2: form.isPublic
          ? "Seu grupo publico ja esta disponivel."
          : "Seu grupo privado foi criado.",
      });

      setForm(INITIAL_FORM);
      onSuccess();
      onClose();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Erro ao criar grupo",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalSheet open={open} onClose={handleClose} title="Criar grupo">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Voce sera administrador do grupo criado e podera convidar colaboradores depois.
        </Text>

        <Field>
          <FieldLabel>Nome do grupo</FieldLabel>
          <FieldInput
            value={form.name}
            onChangeText={handleNameChange}
            placeholder="Ex: Monitoramento Rio Verde"
          />
        </Field>

        <Field>
          <FieldLabel>Codigo</FieldLabel>
          <FieldInput
            autoCapitalize="none"
            value={form.code}
            onChangeText={(value) =>
              setForm((prev) => ({
                ...prev,
                code: value.replace(/^@+/, "").replace(/\s+/g, "").toLowerCase(),
              }))
            }
            placeholder="ex: monitoramento-rio-verde"
          />
          <FieldHint>Identificador unico sem espacos. Preenchido automaticamente pelo nome.</FieldHint>
        </Field>

        <FieldSwitch
          label="Grupo publico"
          value={form.isPublic}
          onValueChange={(value) => setForm((prev) => ({ ...prev, isPublic: value }))}
        />
        <Text style={styles.switchHint}>
          {form.isPublic
            ? "Qualquer pessoa pode ver este grupo e seus pontos."
            : "Apenas membros convidados podem ver este grupo."}
        </Text>

        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Criando..." : "Criar grupo"}
          onPress={() => {
            void handleCreate();
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
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  switchHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },
});
