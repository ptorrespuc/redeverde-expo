import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoint } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { applyPendingDisplayToPoint } from "@/src/server/pending-point-display";
import {
  mergePendingTagIds,
  replacePointTagAssignments,
  validatePointTagSelection,
} from "@/src/server/point-tag-write";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getAccessTokenFromRequest,
} from "@/src/server/supabase";
import type { PointDetailRecord, UpdatePointPayload } from "@/src/types/domain";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pointId = searchParams.get("pointId");

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const point = ((data ?? []) as PointDetailRecord[])[0] ?? null;

  if (!point) {
    return jsonError("Ponto nao encontrado.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, point);
  const pointWithPendingDisplay = await applyPendingDisplayToPoint(supabase, pointWithTags);
  return Response.json(withPointGroupLogo(pointWithPendingDisplay));
}

export async function PATCH(request: Request) {
  const pointId = getPointIdFromRequest(request);

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const accessToken = getAccessTokenFromRequest(request);

  if (!accessToken) {
    return jsonError("Nao autenticado.", 401);
  }

  const supabase = createRequestSupabaseClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Nao autenticado.", 401);
  }

  const { data: existingData, error: existingError } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (existingError) {
    return jsonError(existingError.message, 400);
  }

  const existingPoint = ((existingData ?? []) as PointDetailRecord[])[0] ?? null;

  if (!existingPoint) {
    return jsonError("Ponto nao encontrado.", 404);
  }

  if (!existingPoint.viewer_can_manage && !existingPoint.viewer_can_request_update) {
    return jsonError("Voce nao pode alterar este ponto.", 403);
  }

  const body = (await request.json().catch(() => null)) as Partial<UpdatePointPayload> | null;

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const requestedClassificationId =
    typeof body.classificationId === "string" && body.classificationId.trim()
      ? body.classificationId.trim()
      : existingPoint.classification_id;
  const tagIdsProvided = Object.prototype.hasOwnProperty.call(body, "tagIds");
  const validatedTagIds = tagIdsProvided
    ? await validatePointTagSelection({
        supabase,
        classificationId: requestedClassificationId,
        tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
      })
    : { tagIds: existingPoint.tags?.map((tag) => tag.id) ?? [], error: null };

  if (validatedTagIds.error) {
    return validatedTagIds.error;
  }

  const speciesIdProvided = Object.prototype.hasOwnProperty.call(body, "speciesId");
  const groupIdProvided = Object.prototype.hasOwnProperty.call(body, "groupId");
  const { data, error } = await supabase.rpc("update_point", {
    p_point_id: pointId,
    p_group_id:
      groupIdProvided && typeof body.groupId === "string" && body.groupId.trim()
        ? body.groupId.trim()
        : null,
    p_point_classification_id:
      typeof body.classificationId === "string" ? body.classificationId.trim() || null : null,
    p_title: typeof body.title === "string" ? body.title : null,
    p_description: typeof body.description === "string" ? body.description : null,
    p_status: null,
    p_longitude: typeof body.longitude === "number" ? body.longitude : null,
    p_latitude: typeof body.latitude === "number" ? body.latitude : null,
    p_is_public: typeof body.isPublic === "boolean" ? body.isPublic : null,
    p_species_id:
      typeof body.speciesId === "string" ? body.speciesId.trim() || null : body.speciesId === null ? null : null,
    p_species_id_provided: speciesIdProvided,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const updatedPoint = ((data ?? []) as PointDetailRecord[])[0] ?? null;

  if (!updatedPoint) {
    return jsonError("O ponto nao foi atualizado.", 500);
  }

  if (tagIdsProvided) {
    const adminSupabase = createAdminSupabaseClient();
    const shouldPersistAsPending =
      updatedPoint.has_pending_update &&
      existingPoint.approval_status === "approved" &&
      !updatedPoint.viewer_can_manage;

    if (shouldPersistAsPending) {
      const { error: pendingError } = await adminSupabase
        .from("points")
        .update({
          pending_update_data: mergePendingTagIds(
            updatedPoint.pending_update_data,
            validatedTagIds.tagIds,
          ),
        })
        .eq("id", pointId);

      if (pendingError) {
        return jsonError(pendingError.message, 400);
      }
    } else {
      const tagAssignmentError = await replacePointTagAssignments({
        adminSupabase,
        pointId,
        tagIds: validatedTagIds.tagIds,
      });

      if (tagAssignmentError) {
        return tagAssignmentError;
      }
    }
  }

  const { data: detailData, error: detailError } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (detailError) {
    return jsonError(detailError.message, 400);
  }

  const detailedPoint = ((detailData ?? []) as PointDetailRecord[])[0] ?? null;

  if (!detailedPoint) {
    return jsonError("Ponto nao encontrado apos a atualizacao.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, detailedPoint);
  const pointWithPendingDisplay = await applyPendingDisplayToPoint(supabase, pointWithTags);
  return Response.json(withPointGroupLogo(pointWithPendingDisplay));
}

function getPointIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("pointId");
}
