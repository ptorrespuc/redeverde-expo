import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoint, attachPointTagsToPoints } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { applyPendingDisplayToPoint, applyPendingDisplayToPoints } from "@/src/server/pending-point-display";
import {
  replacePointTagAssignments,
  validatePointTagSelection,
} from "@/src/server/point-tag-write";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getAccessTokenFromRequest,
} from "@/src/server/supabase";
import type { CreatePointPayload, PointDetailRecord, PointRecord } from "@/src/types/domain";

export async function GET(request: Request) {
  const supabase = createRequestSupabaseClient(request);
  const { searchParams } = new URL(request.url);
  const classificationIdParam = searchParams.get("classificationId");
  const groupIdParam = searchParams.get("groupId");
  const classificationId =
    classificationIdParam && classificationIdParam !== "all" ? classificationIdParam : null;
  const groupId = groupIdParam && groupIdParam !== "all" ? groupIdParam : null;

  const { data, error } = await supabase.rpc("list_points", {
    p_point_classification_id: classificationId,
    p_group_id: groupId,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const visiblePoints = (((data ?? []) as PointRecord[]) ?? []).filter(
    (point) => point.status !== "archived",
  );
  const pointsWithTags = await attachPointTagsToPoints(supabase, visiblePoints);
  const pointsWithPendingDisplay = await applyPendingDisplayToPoints(supabase, pointsWithTags);

  return Response.json(pointsWithPendingDisplay.map(withPointGroupLogo));
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as Partial<CreatePointPayload> | null;

  if (!body) {
    return jsonError("Payload de criacao invalido.", 400);
  }

  if (
    typeof body.groupId !== "string" ||
    typeof body.classificationId !== "string" ||
    typeof body.title !== "string" ||
    typeof body.longitude !== "number" ||
    typeof body.latitude !== "number" ||
    typeof body.isPublic !== "boolean"
  ) {
    return jsonError("Grupo, classificacao, titulo, visibilidade e coordenadas sao obrigatorios.", 400);
  }

  const validatedTagIds = await validatePointTagSelection({
    supabase,
    classificationId: body.classificationId,
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
  });

  if (validatedTagIds.error) {
    return validatedTagIds.error;
  }

  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: body.groupId,
    p_point_classification_id: body.classificationId,
    p_title: body.title.trim(),
    p_longitude: body.longitude,
    p_latitude: body.latitude,
    p_description: typeof body.description === "string" ? body.description.trim() || null : null,
    p_status: null,
    p_is_public: body.isPublic,
    p_species_id:
      typeof body.speciesId === "string" && body.speciesId.trim() ? body.speciesId.trim() : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const createdPoint = ((data ?? []) as PointRecord[])[0] ?? null;

  if (!createdPoint) {
    return jsonError("O ponto nao foi criado.", 500);
  }

  const adminSupabase = createAdminSupabaseClient();
  const tagAssignmentError = await replacePointTagAssignments({
    adminSupabase,
    pointId: createdPoint.id,
    tagIds: validatedTagIds.tagIds,
  });

  if (tagAssignmentError) {
    return tagAssignmentError;
  }

  const { data: detailData, error: detailError } = await supabase.rpc("get_point", {
    p_point_id: createdPoint.id,
  });

  if (detailError) {
    return jsonError(detailError.message, 400);
  }

  const detailedPoint = ((detailData ?? []) as PointDetailRecord[])[0] ?? null;

  if (!detailedPoint) {
    return jsonError("Ponto nao encontrado apos a criacao.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, detailedPoint);
  const pointWithPendingDisplay = await applyPendingDisplayToPoint(supabase, pointWithTags);

  return Response.json(withPointGroupLogo(pointWithPendingDisplay), { status: 201 });
}
