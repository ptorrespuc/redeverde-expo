import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Field, FieldInput, FieldLabel } from "@/src/components/ui/field";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";

interface LoginPanelProps {
  title?: string;
  description?: string;
  autoRedirect?: boolean;
}

type PanelMode = "signin" | "signup" | "forgot";

export function LoginPanel({
  title = "Entrar",
  description = "Use o mesmo acesso do sistema web para liberar os recursos do grupo.",
  autoRedirect = true,
}: LoginPanelProps) {
  const router = useRouter();
  const { sendPasswordReset, signIn, signUp } = useAppContext();
  const [mode, setMode] = useState<PanelMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn() {
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Informe email e senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);
      Toast.show({
        type: "success",
        text1: "Sessao iniciada",
        text2: "Os grupos do seu perfil foram carregados no aplicativo.",
      });

      if (autoRedirect) {
        router.replace("/");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp() {
    setErrorMessage(null);

    if (!name.trim() || !email.trim() || !password || !repeatPassword) {
      setErrorMessage("Preencha nome, email, senha e repeticao da senha.");
      return;
    }

    if (password !== repeatPassword) {
      setErrorMessage("As senhas nao conferem.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setMode("signin");
      setPassword("");
      setRepeatPassword("");
      Toast.show({
        type: "success",
        text1: "Cadastro enviado",
        text2: "Confira o e-mail para confirmar a conta antes de entrar.",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel criar a conta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage("Informe o email para enviar a recuperacao.");
      return;
    }

    setIsSubmitting(true);

    try {
      await sendPasswordReset(email.trim());
      setMode("signin");
      Toast.show({
        type: "success",
        text1: "Email enviado",
        text2: "Confira sua caixa de entrada para redefinir a senha.",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar o email de recuperacao.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const headerTitle =
    mode === "signin" ? title : mode === "signup" ? "Criar conta" : "Recuperar senha";
  const headerDescription =
    mode === "signin"
      ? description
      : mode === "signup"
        ? "Crie sua conta e depois escolha os grupos em que vai colaborar."
        : "Informe o email para receber o link de redefinicao da senha.";

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{headerTitle}</Text>
        <Text style={styles.description}>{headerDescription}</Text>
      </View>

      {mode === "signup" ? (
        <Field>
          <FieldLabel>Nome</FieldLabel>
          <FieldInput onChangeText={setName} placeholder="Seu nome" value={name} />
        </Field>
      ) : null}

      <Field>
        <FieldLabel>Email</FieldLabel>
        <FieldInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="usuario@exemplo.com"
          value={email}
        />
      </Field>

      {mode !== "forgot" ? (
        <Field>
          <FieldLabel>Senha</FieldLabel>
          <FieldInput
            onChangeText={setPassword}
            placeholder="Sua senha"
            secureTextEntry
            value={password}
          />
        </Field>
      ) : null}

      {mode === "signup" ? (
        <Field>
          <FieldLabel>Repetir senha</FieldLabel>
          <FieldInput
            onChangeText={setRepeatPassword}
            placeholder="Repita a senha"
            secureTextEntry
            value={repeatPassword}
          />
        </Field>
      ) : null}

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Button
        disabled={isSubmitting}
        label={
          isSubmitting
            ? mode === "signin"
              ? "Entrando..."
              : mode === "signup"
                ? "Criando conta..."
                : "Enviando..."
            : mode === "signin"
              ? "Entrar"
              : mode === "signup"
                ? "Cadastrar"
                : "Enviar email"
        }
        onPress={() =>
          void (mode === "signin"
            ? handleSignIn()
            : mode === "signup"
              ? handleSignUp()
              : handleForgotPassword())
        }
      />

      {mode === "signin" ? (
        <View style={styles.linksRow}>
          <Pressable onPress={() => setMode("signup")}>
            <Text style={styles.link}>Cadastre-se aqui</Text>
          </Pressable>
          <Pressable onPress={() => setMode("forgot")}>
            <Text style={styles.link}>Esqueci minha senha</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setMode("signin")}>
          <Text style={styles.link}>Voltar para o login</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 22,
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
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
});
