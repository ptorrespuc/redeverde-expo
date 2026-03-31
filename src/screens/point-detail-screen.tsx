import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Linking from "expo-linking";
import Toast from "react-native-toast-message";

import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { EventFormModal } from "@/src/components/points/event-form-modal";
import {
  getLatestPointEvent,
  LatestPointEventCard,
} from "@/src/components/points/latest-point-event-card";
import { PointTimelineList } from "@/src/components/points/point-timeline-list";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LoadingView } from "@/src/components/ui/loading-view";
import { Screen } from "@/src/components/ui/screen";
import {
  createPointEvent,
  getPoint,
  listPointMedia,
  listPointEvents,
  listPointEventTypes,
  reviewPoint,
} from "@/src/lib/api";
import { formatDateTime } from "@/src/lib/format";
import { getPointDisplayStatusLabel } from "@/src/lib/point-display";
import { useAppContext } from "@/src/providers/app-provider";
import { colors, spacing } from "@/src/theme";
import type {
  PointDetailRecord,
  PointEventRecord,
  PointEventTypeRecord,
  PointMediaRecord,
} from "@/src/types/domain";

export function PointDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { id } = params;
  const { isReady } = useAppContext();
  const [point, setPoint] = useState<PointDetailRecord | null>(null);
  const [events, setEvents] = useState<PointEventRecord[]>([]);
  const [pointMedia, setPointMedia] = useState<PointMediaRecord[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<PointEventTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const loadPoint = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsLoading(true);

    try {
      const nextPoint = await getPoint(id);
      setPoint(nextPoint);

      const [eventsResult, eventTypesResult, pointMediaResult] = await Promise.allSettled([
        listPointEvents(id),
        listPointEventTypes(nextPoint.classification_id),
        listPointMedia(id),
      ]);

      setEvents(eventsResult.status === "fulfilled" ? eventsResult.value : []);
      setEventTypeOptions(eventTypesResult.status === "fulfilled" ? eventTypesResult.value : []);
      setPointMedia(pointMediaResult.status === "fulfilled" ? pointMediaResult.value : []);

      if (
        eventsResult.status === "rejected" ||
        eventTypesResult.status === "rejected" ||
        pointMediaResult.status === "rejected"
      ) {
        Toast.show({
          type: "info",
          text1: "Ponto carregado parcialmente",
          text2: "Algumas informacoes complementares nao puderam ser carregadas agora.",
        });
      }
    } catch (error) {
      setPoint(null);
      setEvents([]);
      setEventTypeOptions([]);
      setPointMedia([]);
      Toast.show({
        type: "error",
        text1: "Falha ao abrir ponto",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!isReady) {
        return undefined;
      }

      void loadPoint();
      return undefined;
    }, [isReady, loadPoint]),
  );

  async function handleReview(action: "approve" | "reject") {
    if (!point) {
      return;
    }

    try {
      const updatedPoint = await reviewPoint(point.id, action);
      setPoint(updatedPoint as PointDetailRecord);
      Toast.show({
        type: "success",
        text1:
          action === "approve"
            ? point.has_pending_update
              ? "Alteracao aprovada"
              : "Ponto aprovado"
            : "Ponto rejeitado",
      });
      await loadPoint();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Falha ao revisar ponto",
        text2: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  }

  if (!isReady || isLoading) {
    return <LoadingView label="Carregando detalhe..." />;
  }

  if (!point) {
    return (
      <Screen>
        <EmptyState
          title="Ponto indisponivel"
          description="Este ponto nao foi encontrado ou o seu perfil nao possui acesso a ele."
        />
      </Screen>
    );
  }

  const canReview = point.viewer_can_approve && (point.approval_status === "pending" || point.has_pending_update);
  const latestEvent = getLatestPointEvent(events);

  return (
    <Screen>
      <Card>
        <View style={styles.header}>
          <GroupAvatar logoUrl={point.group_logo_url} name={point.group_name} size={38} />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{point.title}</Text>
            <Text style={styles.subtitle}>
              {point.group_name} | {point.classification_name}
            </Text>
          </View>
        </View>

        <View style={styles.badges}>
          <Badge tone={point.approval_status === "pending" ? "warning" : "default"}>
            {getPointDisplayStatusLabel(point)}
          </Badge>
          <Badge tone={point.approval_status === "rejected" ? "danger" : point.approval_status === "pending" ? "warning" : "success"}>
            {point.approval_status === "approved"
              ? "Aprovado"
              : point.approval_status === "pending"
                ? "Pendente"
                : "Rejeitado"}
          </Badge>
          <Badge>{point.is_public ? "Publico" : "Privado"}</Badge>
          {point.has_pending_update ? <Badge tone="warning">Alteracao pendente</Badge> : null}
          {point.tags?.map((tag) => (
            <Badge key={tag.id}>{tag.name}</Badge>
          ))}
        </View>

        {point.description ? <Text style={styles.description}>{point.description}</Text> : null}

        {point.classification_requires_species && point.species_name ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Especie</Text>
            <Text style={styles.blockValue}>{point.species_name}</Text>
          </View>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Latitude</Text>
            <Text style={styles.metaValue}>{point.latitude.toFixed(6)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Longitude</Text>
            <Text style={styles.metaValue}>{point.longitude.toFixed(6)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Criado em</Text>
            <Text style={styles.metaValue}>{formatDateTime(point.created_at)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {(point.viewer_can_manage || point.viewer_can_request_update) ? (
            <Button
              label={point.viewer_can_manage ? "Editar ponto" : "Solicitar alteracao"}
              onPress={() => router.push(`/points/${point.id}/edit`)}
              variant="secondary"
            />
          ) : null}
          {canReview ? (
            <>
              <Button label="Aprovar" onPress={() => void handleReview("approve")} variant="secondary" />
              <Button label="Rejeitar" onPress={() => void handleReview("reject")} variant="danger" />
            </>
          ) : null}
          {point.viewer_can_manage ? (
            <Button label="Novo evento" onPress={() => setIsEventModalOpen(true)} variant="ghost" />
          ) : null}
        </View>
      </Card>

      {latestEvent ? <LatestPointEventCard event={latestEvent} /> : null}

      {pointMedia.length ? (
        <Card>
          <Text style={styles.sectionTitle}>Fotos do ponto</Text>
          <Text style={styles.sectionSubtitle}>
            Imagens registradas no cadastro inicial do ponto.
          </Text>
          <ScrollView
            contentContainerStyle={styles.photoRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {pointMedia.map((media) => (
              <Pressable
                disabled={!media.signed_url}
                key={media.id}
                onPress={() => {
                  if (!media.signed_url) {
                    return;
                  }

                  void Linking.openURL(media.signed_url);
                }}
                style={styles.photoCard}
              >
                {media.signed_url ? (
                  <Image
                    resizeMode="cover"
                    source={{ uri: media.signed_url }}
                    style={styles.photoImage}
                  />
                ) : (
                  <View style={[styles.photoImage, styles.photoPlaceholder]}>
                    <Text style={styles.photoPlaceholderText}>Imagem indisponivel</Text>
                  </View>
                )}
                {media.caption ? <Text style={styles.photoCaption}>{media.caption}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <PointTimelineList
          emptyDescription="A timeline deste ponto ainda nao recebeu registros."
          emptyTitle="Sem eventos"
          events={events}
        />
      </Card>

      <EventFormModal
        eventTypeOptions={eventTypeOptions}
        onClose={() => setIsEventModalOpen(false)}
        onSubmit={async (payload) => {
          await createPointEvent(point.id, payload);
          Toast.show({
            type: "success",
            text1: "Evento registrado",
          });
          await loadPoint();
        }}
        open={isEventModalOpen}
        pointTitle={point.title}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    gap: 2,
  },
  blockLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  blockValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metaItem: {
    minWidth: 120,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  metaValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  photoRow: {
    gap: spacing.md,
    paddingRight: spacing.xs,
  },
  photoCard: {
    gap: spacing.sm,
    width: 220,
  },
  photoImage: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    height: 180,
    width: "100%",
  },
  photoPlaceholder: {
    alignItems: "center",
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  photoPlaceholderText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  photoCaption: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
