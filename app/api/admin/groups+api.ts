import { withGroupLogo } from "@/src/lib/group-logos";
import { requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { GroupRecord } from "@/src/types/domain";

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem criar grupos.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Nome do grupo e obrigatorio.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let { data, error } = await supabase.rpc("create_group", {
    p_name: body.name.trim(),
    p_code: typeof body.code === "string" ? normalizeGroupCode(body.code) : "",
    p_is_public: Boolean(body.isPublic),
    p_accepts_point_collaboration: Boolean(body.acceptsPointCollaboration),
    p_max_pending_points_per_collaborator: normalizePendingLimit(body.maxPendingPointsPerCollaborator),
  });

  if (error && shouldRetryWithoutPendingLimit(error.message)) {
    const fallback = await supabase.rpc("create_group", {
      p_name: body.name.trim(),
      p_code: typeof body.code === "string" ? normalizeGroupCode(body.code) : "",
      p_is_public: Boolean(body.isPublic),
      p_accepts_point_collaboration: Boolean(body.acceptsPointCollaboration),
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return jsonError(error.message, 400);
  }

  const group = (((data ?? []) as GroupRecord[]) ?? [])[0];

  if (!group) {
    return jsonError("O grupo nao foi criado.", 500);
  }

  return Response.json(withGroupLogo(group), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  const groupId = new URL(request.url).searchParams.get("id");

  if (!groupId) {
    return jsonError("Grupo nao informado.", 400);
  }

  if (
    !auth.context.is_super_admin &&
    !auth.context.manageable_groups.some((group) => group.id === groupId)
  ) {
    return jsonError("Voce nao pode editar este grupo.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (typeof body.code === "string") {
    const normalizedCode = normalizeGroupCode(body.code);
    if (normalizedCode) {
      patch.code = normalizedCode;
    }
  }

  if (typeof body.isPublic === "boolean") {
    patch.is_public = body.isPublic;
  }

  if (typeof body.acceptsPointCollaboration === "boolean") {
    patch.accepts_point_collaboration = body.acceptsPointCollaboration;
  }

  if (Object.prototype.hasOwnProperty.call(body, "maxPendingPointsPerCollaborator")) {
    patch.max_pending_points_per_collaborator = normalizePendingLimit(
      body.maxPendingPointsPerCollaborator,
    );
  }

  if (!Object.keys(patch).length) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let { error } = await supabase.from("groups").update(patch).eq("id", groupId);

  if (
    error &&
    "max_pending_points_per_collaborator" in patch &&
    shouldRetryWithoutPendingLimit(error.message)
  ) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.max_pending_points_per_collaborator;
    error = (await supabase.from("groups").update(fallbackPatch).eq("id", groupId)).error;
  }

  if (error) {
    return jsonError(error.message, 400);
  }

  if (patch.is_public === false) {
    const adminSupabase = createAdminSupabaseClient();
    const { error: pointsError } = await adminSupabase
      .from("points")
      .update({ is_public: false })
      .eq("group_id", groupId);

    if (pointsError) {
      return jsonError(pointsError.message, 400);
    }
  }

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const group = ((((groups ?? []) as GroupRecord[]) ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === groupId);

  if (!group) {
    return jsonError("Grupo nao encontrado.", 404);
  }

  return Response.json(group);
}

function normalizeGroupCode(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

function normalizePendingLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 5;

  if (Number.isNaN(parsed)) {
    return 5;
  }

  return Math.max(1, Math.floor(parsed));
}

function shouldRetryWithoutPendingLimit(message: string) {
  return message.toLowerCase().includes("max_pending_points_per_collaborator");
}
