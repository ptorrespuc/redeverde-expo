import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Toast from "react-native-toast-message";

import { EventFormModal } from "@/src/components/points/event-form-modal";
import { PointForm } from "@/src/components/points/point-form";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import {
  createPointEvent,
  getPoint,
  listPointEventTypes,
  listPointEvents,
  updatePoint,
} from "@/src/lib/api";
import { formatDateTime } from "@/src/lib/format";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type {
  CreatePointPayload,
  PointDetailRecord,
  PointEventRecord,
  PointEventTypeRecord,
} from "@/src/types/domain";

export function EditPointScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { classifications, isReady, speciesCatalog, userContext, visibleGroups } = useAppContext();
  const [point, setPoint] = useState<PointDetailRecord | null>(null);
  const [events, setEvents] = useState<PointEventRecord[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<PointEventTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

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

  const loadEventContext = useCallback(
    async (pointId: string, classificationId: string) => {
      try {
        const [eventsResult, eventTypesResult] = await Promise.allSettled([
          listPointEvents(pointId),
          listPointEventTypes(classificationId),
        ]);

        setEvents(eventsResult.status === "fulfilled" ? eventsResult.value : []);
        setEventTypeOptions(eventTypesResult.status === "fulfilled" ? eventTypesResult.value : []);

        if (eventsResult.status === "rejected" || eventTypesResult.status === "rejected") {
          Toast.show({
            type: "info",
            text1: "Eventos carregados parcialmente",
            text2: "A timeline ou os tipos de evento nao puderam ser atualizados agora.",
          });
        }
      } catch {
        setEvents([]);
        setEventTypeOptions([]);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }

      void loadPoint();
      return undefined;
    }, [isReady, loadPoint]),
  );

  useEffect(() => {
    if (!point) {
      setEvents([]);
      setEventTypeOptions([]);
      return;
    }

    void loadEventContext(point.id, point.classification_id);
  }, [loadEventContext, point]);

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

      {point.viewer_can_manage ? (
        <Card>
          <View style={styles.eventsHeader}>
            <View style={styles.eventsHeaderCopy}>
              <Text style={styles.eventsTitle}>Eventos do ponto</Text>
              <Text style={styles.eventsDescription}>
                Registre movimentacoes da timeline sem sair da edicao. As alteracoes do formulario
                continuam locais ate voce salvar o ponto.
              </Text>
            </View>
            <Button compact label="Novo evento" onPress={() => setIsEventModalOpen(true)} variant="ghost" />
          </View>

          {events.length ? (
            <View style={styles.timelineList}>
              {events.map((event) => (
                <View key={event.id} style={styles.timelineItem}>
                  <Text style={styles.timelineType}>{event.event_type}</Text>
                  <Text style={styles.timelineMeta}>
                    {formatDateTime(event.event_date)} | {event.created_by_name}
                  </Text>
                  {event.description ? (
                    <Text style={styles.timelineDescription}>{event.description}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="Sem eventos registrados"
              description="Use o botao acima para iniciar a timeline operacional deste ponto."
            />
          )}
        </Card>
      ) : null}

      <EventFormModal
        eventTypeOptions={eventTypeOptions}
        onClose={() => setIsEventModalOpen(false)}
        onSubmit={async (payload) => {
          if (!point) {
            return;
          }

          await createPointEvent(point.id, payload);
          Toast.show({
            type: "success",
            text1: "Evento registrado",
          });
          await loadEventContext(point.id, point.classification_id);
        }}
        open={isEventModalOpen}
        pointTitle={point.title}
      />
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
  eventsHeader: {
    gap: spacing.sm,
  },
  eventsHeaderCopy: {
    gap: 4,
  },
  eventsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  eventsDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  timelineList: {
    gap: spacing.md,
  },
  timelineItem: {
    borderLeftColor: colors.secondary,
    borderLeftWidth: 3,
    gap: 4,
    paddingLeft: spacing.md,
  },
  timelineType: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  timelineDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
