import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/src/components/ui/field";
import { Screen } from "@/src/components/ui/screen";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";

export function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword } = useAppContext();
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!password || !repeatPassword) {
      setErrorMessage("Informe a nova senha e a confirmacao.");
      return;
    }

    if (password !== repeatPassword) {
      setErrorMessage("As senhas nao conferem.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePassword(password);
      Toast.show({
        type: "success",
        text1: "Senha atualizada",
      });
      router.replace("/login");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Redefinir senha</Text>
        <Text style={styles.description}>
          Defina uma nova senha para concluir a recuperacao ou trocar a senha da conta.
        </Text>
      </View>
      <Card>
        <Field>
          <FieldLabel>Nova senha</FieldLabel>
          <FieldInput
            onChangeText={setPassword}
            placeholder="Digite a nova senha"
            secureTextEntry
            value={password}
          />
        </Field>
        <Field>
          <FieldLabel>Repetir senha</FieldLabel>
          <FieldInput
            onChangeText={setRepeatPassword}
            placeholder="Repita a nova senha"
            secureTextEntry
            value={repeatPassword}
          />
        </Field>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Button
          disabled={isSubmitting}
          label={isSubmitting ? "Salvando..." : "Salvar nova senha"}
          onPress={() => void handleSubmit()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});
