import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";

import { LoginPanel } from "@/src/components/auth/login-panel";
import { GroupEditModal } from "@/src/components/groups/group-edit-modal";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { GroupRecord } from "@/src/types/domain";
import { USER_ROLE_LABELS } from "@/src/types/domain";

export function AccountScreen() {
  const router = useRouter();
  const { isAuthenticated, isReady, refreshBootstrap, signOut, userContext } = useAppContext();
  const [editingGroup, setEditingGroup] = useState<GroupRecord | null>(null);

  if (!isReady) {
    return <LoadingView label="Preparando a conta..." />;
  }

  if (!isAuthenticated || !userContext) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title}>Conta</Text>
          <Text style={styles.description}>
            Entre para ver seus grupos, aprovar pontos e usar a area operacional.
          </Text>
        </View>
        <LoginPanel autoRedirect={false} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{userContext.profile.name}</Text>
        <Text style={styles.description}>{userContext.profile.email}</Text>
        <View style={styles.badgeRow}>
          {userContext.is_super_admin ? <Badge tone="success">Superusuario</Badge> : null}
          {userContext.has_group_admin ? <Badge>Admin de grupo</Badge> : null}
          {userContext.has_point_workspace ? <Badge>Workspace habilitado</Badge> : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Grupos visiveis</Text>
        {userContext.groups.length ? (
          userContext.groups.map((group) => (
            <View key={group.id} style={styles.groupRow}>
              <View style={styles.groupCopy}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupMeta}>
                  @{group.code} | {group.is_public ? "publico" : "privado"}
                </Text>
              </View>
              <View style={styles.groupActions}>
                {group.my_role ? (
                  <Badge>{USER_ROLE_LABELS[group.my_role]}</Badge>
                ) : (
                  <Badge>Publico</Badge>
                )}
                {(group.viewer_can_manage || group.my_role === "super_admin" || group.my_role === "group_admin") ? (
                  <Button
                    compact
                    label="Gerenciar"
                    onPress={() => setEditingGroup(group)}
                    variant="ghost"
                  />
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            title="Sem grupos"
            description="Este usuario ainda nao esta associado a grupos visiveis."
          />
        )}
      </Card>

      <GroupEditModal
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSuccess={() => {
          void refreshBootstrap();
        }}
      />

      <Card>
        <Text style={styles.sectionTitle}>Acoes</Text>
        <View style={styles.actionStack}>
          <Button
            label="Atualizar dados"
            onPress={() => {
              void refreshBootstrap().then(() => {
                Toast.show({
                  type: "success",
                  text1: "Dados atualizados",
                });
              });
            }}
            variant="secondary"
          />
          <Button
            label="Trocar senha"
            onPress={() => router.push("/reset-password")}
            variant="ghost"
          />
          {userContext.has_group_admin ? (
            Platform.OS === "web" ? (
              <Button
                label="Abrir administracao"
                onPress={() => router.push("/admin")}
                variant="ghost"
              />
            ) : (
              <Text style={styles.webOnlyHint}>
                A administracao completa esta disponivel na versao web.
              </Text>
            )
          ) : null}
          <Button
            label="Sair"
            onPress={() => {
              void signOut().then(() => {
                Toast.show({
                  type: "success",
                  text1: "Sessao encerrada",
                });
              });
            }}
            variant="danger"
          />
        </View>
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
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  groupRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  groupActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
  },
  groupCopy: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  groupMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  actionStack: {
    gap: spacing.sm,
  },
  webOnlyHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
