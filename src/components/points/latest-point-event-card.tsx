import * as Linking from "expo-linking";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { formatDateTime } from "@/src/lib/format";
import { colors, spacing } from "@/src/theme";
import type { PointEventRecord } from "@/src/types/domain";

interface LatestPointEventCardProps {
  event: PointEventRecord;
  title?: string;
}

export function getLatestPointEvent(events: PointEventRecord[]) {
  return [...events].sort(comparePointEvents)[0] ?? null;
}

export function LatestPointEventCard({
  event,
  title = "Ultimo evento",
}: LatestPointEventCardProps) {
  const firstPhoto = event.media[0] ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.eventType}>{event.event_type}</Text>
        <Text style={styles.eventMeta}>
          {formatDateTime(event.event_date)} | {event.created_by_name}
        </Text>
        {event.description ? (
          <Text numberOfLines={4} style={styles.description}>
            {event.description}
          </Text>
        ) : null}

        {firstPhoto ? (
          <Pressable
            disabled={!firstPhoto.signed_url}
            onPress={() => {
              if (!firstPhoto.signed_url) {
                return;
              }

              void Linking.openURL(firstPhoto.signed_url);
            }}
            style={styles.photoBlock}
          >
            {firstPhoto.signed_url ? (
              <Image
                resizeMode="cover"
                source={{ uri: firstPhoto.signed_url }}
                style={styles.photoImage}
              />
            ) : (
              <View style={[styles.photoImage, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderText}>Imagem indisponivel</Text>
              </View>
            )}
            <Text style={styles.photoCaption}>
              {firstPhoto.caption || "Foto do ultimo evento"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function comparePointEvents(left: PointEventRecord, right: PointEventRecord) {
  const dateDifference = getPointEventTimestamp(right.event_date) - getPointEventTimestamp(left.event_date);

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return getPointEventTimestamp(right.created_at) - getPointEventTimestamp(left.created_at);
}

function getPointEventTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  eventType: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  eventMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  photoBlock: {
    gap: spacing.sm,
  },
  photoImage: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    height: 190,
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
