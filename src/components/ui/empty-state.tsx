import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/theme";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description, children }: PropsWithChildren<EmptyStateProps>) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  action: {
    marginTop: spacing.sm,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
