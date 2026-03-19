import { ScrollView, StyleSheet, View } from "react-native";
import type { PropsWithChildren, RefObject } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/src/theme";

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
}

export function Screen({ children, scroll = true, padded = true, scrollViewRef }: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, padded ? styles.padded : null]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={[styles.fill, padded ? styles.padded : null]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
});
