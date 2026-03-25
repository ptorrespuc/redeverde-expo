import { loadPointTags } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type AdminClient = {
  from(table: "point_tag_assignments" | "points"): any;
};

export function normalizeTagIds(tagIds: string[] | null | undefined) {
  return Array.from(
    new Set(
      (tagIds ?? [])
        .filter((tagId): tagId is string => typeof tagId === "string")
        .map((tagId) => tagId.trim())
        .filter(Boolean),
    ),
  );
}

export async function validatePointTagSelection(options: {
  supabase: RpcClient;
  classificationId: string;
  tagIds: string[];
}) {
  const normalizedTagIds = normalizeTagIds(options.tagIds);

  if (!normalizedTagIds.length) {
    return {
      tagIds: [],
      error: null,
    };
  }

  const { data, error } = await loadPointTags(options.supabase, {
    pointClassificationId: options.classificationId,
    onlyActive: true,
  });

  if (error) {
    return {
      tagIds: [],
      error: jsonError(error.message, 400),
    };
  }

  const availableTagIds = new Set((data ?? []).map((tag) => tag.id));
  const invalidTagIds = normalizedTagIds.filter((tagId) => !availableTagIds.has(tagId));

  if (invalidTagIds.length) {
    return {
      tagIds: [],
      error: jsonError("As tags selecionadas nao pertencem a esta classificacao.", 400),
    };
  }

  return {
    tagIds: normalizedTagIds,
    error: null,
  };
}

export async function replacePointTagAssignments(options: {
  adminSupabase: AdminClient;
  pointId: string;
  tagIds: string[];
}) {
  const normalizedTagIds = normalizeTagIds(options.tagIds);
  const { error: deleteError } = await options.adminSupabase
    .from("point_tag_assignments")
    .delete()
    .eq("point_id", options.pointId);

  if (deleteError) {
    return jsonError(deleteError.message, 400);
  }

  if (!normalizedTagIds.length) {
    return null;
  }

  const { error: insertError } = await options.adminSupabase
    .from("point_tag_assignments")
    .insert(
      normalizedTagIds.map((tagId) => ({
        point_id: options.pointId,
        point_tag_id: tagId,
        created_by: null,
      })),
    );

  if (insertError) {
    return jsonError(insertError.message, 400);
  }

  return null;
}

export function mergePendingTagIds(
  pendingUpdateData: Record<string, unknown> | null | undefined,
  tagIds: string[],
) {
  const nextData =
    pendingUpdateData && typeof pendingUpdateData === "object" && !Array.isArray(pendingUpdateData)
      ? { ...pendingUpdateData }
      : {};

  nextData.pending_tag_ids = normalizeTagIds(tagIds);
  return nextData;
}
