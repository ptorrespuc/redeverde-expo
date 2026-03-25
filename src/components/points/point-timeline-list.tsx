import * as Linking from "expo-linking";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/src/components/ui/empty-state";
import { formatDateTime } from "@/src/lib/format";
import { colors, spacing } from "@/src/theme";
import type { PointEventRecord } from "@/src/types/domain";

interface PointTimelineListProps {
  events: PointEventRecord[];
  emptyTitle: string;
  emptyDescription: string;
}

export function PointTimelineList({
  events,
  emptyTitle,
  emptyDescription,
}: PointTimelineListProps) {
  if (!events.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
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

          {event.media?.length ? (
            <ScrollView
              contentContainerStyle={styles.mediaRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {event.media.map((media) => (
                <Pressable
                  disabled={!media.signed_url}
                  key={media.id}
                  onPress={() => {
                    if (!media.signed_url) {
                      return;
                    }

                    void Linking.openURL(media.signed_url);
                  }}
                  style={styles.mediaCard}
                >
                  {media.signed_url ? (
                    <Image resizeMode="cover" source={{ uri: media.signed_url }} style={styles.mediaImage} />
                  ) : (
                    <View style={[styles.mediaImage, styles.mediaPlaceholder]}>
                      <Text style={styles.mediaPlaceholderText}>Imagem indisponivel</Text>
                    </View>
                  )}
                  {media.caption ? <Text style={styles.mediaCaption}>{media.caption}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  mediaRow: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  mediaCard: {
    gap: spacing.xs,
    width: 164,
  },
  mediaImage: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    height: 132,
    width: "100%",
  },
  mediaPlaceholder: {
    alignItems: "center",
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  mediaPlaceholderText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  mediaCaption: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
