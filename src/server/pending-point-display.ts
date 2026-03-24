import { loadPointTags } from "@/src/lib/point-tags";
import type {
  PointClassificationRecord,
  PointRecord,
  PointTagRecord,
  SpeciesRecord,
} from "@/src/types/domain";

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type PendingDisplayLookups = {
  classificationsById: Map<string, PointClassificationRecord>;
  speciesById: Map<string, SpeciesRecord>;
  tagsById: Map<string, PointTagRecord>;
};

type PendingDisplayPoint = Pick<
  PointRecord,
  | "group_id"
  | "group_name"
  | "classification_id"
  | "classification_slug"
  | "classification_name"
  | "classification_requires_species"
  | "classification_marker_color"
  | "title"
  | "species_id"
  | "species_name"
  | "species_common_name"
  | "species_scientific_name"
  | "species_origin"
  | "tags"
  | "description"
  | "is_public"
  | "longitude"
  | "latitude"
  | "has_pending_update"
  | "pending_update_data"
>;

export async function applyPendingDisplayToPoints<
  T extends PendingDisplayPoint,
>(supabase: RpcClient, points: T[]) {
  if (!points.some((point) => point.has_pending_update)) {
    return points;
  }

  const lookups = await loadPendingDisplayLookups(supabase);
  return points.map((point) => applyPendingDisplayLookupsToPoint(point, lookups));
}

export async function applyPendingDisplayToPoint<
  T extends PendingDisplayPoint,
>(supabase: RpcClient, point: T) {
  if (!point.has_pending_update) {
    return point;
  }

  const lookups = await loadPendingDisplayLookups(supabase);
  return applyPendingDisplayLookupsToPoint(point, lookups);
}

function applyPendingDisplayLookupsToPoint<T extends PendingDisplayPoint>(
  point: T,
  lookups: PendingDisplayLookups,
) {
  const pendingData = asRecord(point.pending_update_data);

  if (!point.has_pending_update || !pendingData) {
    return point;
  }

  const nextClassificationId =
    typeof pendingData.classification_id === "string" ? pendingData.classification_id : null;
  const nextClassification = nextClassificationId
    ? lookups.classificationsById.get(nextClassificationId) ?? null
    : null;
  const hasPendingSpecies = Object.prototype.hasOwnProperty.call(pendingData, "species_id");
  const nextSpeciesId =
    hasPendingSpecies && typeof pendingData.species_id === "string"
      ? pendingData.species_id
      : null;
  const nextSpecies =
    hasPendingSpecies && nextSpeciesId
      ? lookups.speciesById.get(nextSpeciesId) ?? null
      : null;
  const hasPendingTags = hasPendingTagIds(pendingData);
  const nextTagIds = hasPendingTags ? getPendingTagIds(pendingData) : null;
  const nextTags = hasPendingTags
    ? (nextTagIds ?? [])
        .map((tagId) => lookups.tagsById.get(tagId))
        .filter((tag): tag is PointTagRecord => Boolean(tag))
    : point.tags;

  return {
    ...point,
    group_id: typeof pendingData.group_id === "string" ? pendingData.group_id : point.group_id,
    group_name:
      typeof pendingData.group_name === "string" && pendingData.group_name.trim()
        ? pendingData.group_name.trim()
        : point.group_name,
    classification_id: nextClassification?.id ?? point.classification_id,
    classification_slug: nextClassification?.slug ?? point.classification_slug,
    classification_name: nextClassification?.name ?? point.classification_name,
    classification_requires_species:
      nextClassification?.requires_species ?? point.classification_requires_species,
    classification_marker_color:
      nextClassification?.marker_color ?? point.classification_marker_color,
    title:
      typeof pendingData.title === "string" && pendingData.title.trim()
        ? pendingData.title.trim()
        : point.title,
    species_id: hasPendingSpecies ? nextSpeciesId : point.species_id,
    species_name: hasPendingSpecies ? nextSpecies?.display_name ?? null : point.species_name,
    species_common_name: hasPendingSpecies
      ? nextSpecies?.common_name ?? null
      : point.species_common_name,
    species_scientific_name: hasPendingSpecies
      ? nextSpecies?.scientific_name ?? null
      : point.species_scientific_name,
    species_origin: hasPendingSpecies ? nextSpecies?.origin ?? null : point.species_origin,
    tags: nextTags,
    description: Object.prototype.hasOwnProperty.call(pendingData, "description")
      ? normalizeTextOrNull(pendingData.description)
      : point.description,
    is_public: typeof pendingData.is_public === "boolean" ? pendingData.is_public : point.is_public,
    longitude: typeof pendingData.longitude === "number" ? pendingData.longitude : point.longitude,
    latitude: typeof pendingData.latitude === "number" ? pendingData.latitude : point.latitude,
  };
}

async function loadPendingDisplayLookups(supabase: RpcClient): Promise<PendingDisplayLookups> {
  const [classificationsResponse, speciesResponse, pointTagsResponse] = await Promise.all([
    supabase.rpc("list_point_classifications", { p_only_active: false }),
    supabase.rpc("list_species", { p_only_active: false }),
    loadPointTags(supabase, { pointClassificationId: null, onlyActive: false }),
  ]);

  if (classificationsResponse.error) {
    throw new Error(classificationsResponse.error.message);
  }

  if (speciesResponse.error) {
    throw new Error(speciesResponse.error.message);
  }

  if (pointTagsResponse.error) {
    throw new Error(pointTagsResponse.error.message);
  }

  return {
    classificationsById: new Map(
      (((classificationsResponse.data ?? []) as PointClassificationRecord[]) ?? []).map(
        (classification) => [classification.id, classification],
      ),
    ),
    speciesById: new Map(
      (((speciesResponse.data ?? []) as SpeciesRecord[]) ?? []).map((species) => [species.id, species]),
    ),
    tagsById: new Map(
      (((pointTagsResponse.data ?? []) as PointTagRecord[]) ?? []).map((tag) => [tag.id, tag]),
    ),
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getPendingTagIds(pendingData: Record<string, unknown>) {
  const rawValue = pendingData.pending_tag_ids;

  if (!Array.isArray(rawValue)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      rawValue
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function hasPendingTagIds(pendingData: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(pendingData, "pending_tag_ids");
}

function normalizeTextOrNull(value: unknown) {
  if (typeof value !== "string") {
    return value === null ? null : null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
