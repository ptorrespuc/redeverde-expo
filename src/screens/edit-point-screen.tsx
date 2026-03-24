import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Toast from "react-native-toast-message";

import { PointForm } from "@/src/components/points/point-form";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import { getPoint, updatePoint } from "@/src/lib/api";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type { CreatePointPayload, PointDetailRecord } from "@/src/types/domain";

export function EditPointScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { classifications, isReady, speciesCatalog, userContext, visibleGroups } = useAppContext();
  const [point, setPoint] = useState<PointDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadPoint = useCallback(async () => {
    if (!params.id) {
      return;
    }

    setIsLoading(true);

    try {
      const nextPoint = await getPoint(params.id);
      setPoint(nextPoint);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao abrir edicao",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }

      void loadPoint();
      return undefined;
    }, [isReady, loadPoint]),
  );

  const groups = useMemo(() => {
    if (!point) {
      return [];
    }

    const editableScope = point.viewer_can_manage
      ? visibleGroups.filter(
          (group) => group.viewer_can_manage || group.viewer_can_submit_points || group.id === point.group_id,
        )
      : (userContext?.submission_groups ?? []).filter(
          (group) => group.viewer_can_submit_points || group.id === point.group_id,
        );

    const uniqueGroups = new Map(editableScope.map((group) => [group.id, group]));

    if (!uniqueGroups.has(point.group_id)) {
      const currentGroup = visibleGroups.find((group) => group.id === point.group_id);

      if (currentGroup) {
        uniqueGroups.set(currentGroup.id, currentGroup);
      }
    }

    return Array.from(uniqueGroups.values());
  }, [point, userContext?.submission_groups, visibleGroups]);

  async function handleSubmit(payload: CreatePointPayload) {
    if (!point) {
      return;
    }

    const updatedPoint = await updatePoint(point.id, {
      groupId: payload.groupId,
      classificationId: payload.classificationId,
      tagIds: payload.tagIds,
      title: payload.title,
      speciesId: payload.speciesId?.trim() ? payload.speciesId : null,
      description: payload.description,
      isPublic: payload.isPublic,
      longitude: payload.longitude,
      latitude: payload.latitude,
    });

    Toast.show({
      type: "success",
      text1:
        updatedPoint.has_pending_update || updatedPoint.approval_status === "pending"
          ? "Alteracao enviada para aprovacao"
          : "Ponto atualizado",
    });

    router.replace(`/points/${point.id}`);
  }

  if (!isReady || isLoading) {
    return <LoadingView label="Carregando edicao..." />;
  }

  if (!point || (!point.viewer_can_manage && !point.viewer_can_request_update)) {
    return (
      <Screen>
        <EmptyState
          title="Edicao indisponivel"
          description="Seu perfil nao pode alterar este ponto."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{point.viewer_can_manage ? "Editar ponto" : "Solicitar alteracao"}</Text>
        <Text style={styles.description}>
          Atualize classificacao, coordenadas e informacoes operacionais do ponto.
        </Text>
      </View>
      <Card>
        <PointForm
          classifications={classifications}
          groups={groups}
          initialValues={{
            groupId: point.group_id,
            classificationId: point.classification_id,
            tagIds: point.tags?.map((tag) => tag.id) ?? [],
            title: point.title,
            speciesId: point.species_id ?? undefined,
            description: point.description ?? undefined,
            isPublic: point.is_public,
            longitude: point.longitude,
            latitude: point.latitude,
          }}
          isEditing
          onCancel={() => router.back()}
          onSubmit={handleSubmit}
          speciesCatalog={speciesCatalog}
          submitLabel="Salvar alteracoes"
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
});
