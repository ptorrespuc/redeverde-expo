import { loadPointTags } from "@/src/lib/point-tags";
import { requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointTagRecord } from "@/src/types/domain";

async function loadTagOrNull(
  supabase: ReturnType<typeof createRequestSupabaseClient>,
  id: string,
) {
  const { data, error } = await loadPointTags(supabase, { onlyActive: false });

  if (error) {
    return { data: null, error };
  }

  return {
    data: ((data ?? []) as PointTagRecord[]).find((item) => item.id === id) ?? null,
    error: null,
  };
}

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem cadastrar tags.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body?.pointClassificationId || !body?.name) {
    return jsonError("Classificacao e nome da tag sao obrigatorios.", 400);
  }

  const payload = {
    point_classification_id: String(body.pointClassificationId).trim(),
    name: String(body.name).trim(),
    slug: typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null,
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    is_active: typeof body.isActive === "boolean" ? body.isActive : true,
  };

  const supabase = createRequestSupabaseClient(request);
  const { error: insertError } = await supabase.from("point_tags").insert(payload);

  if (insertError) {
    return jsonError(insertError.message, 400);
  }

  const { data, error } = await loadPointTags(supabase, {
    pointClassificationId: payload.point_classification_id,
    onlyActive: false,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const tag = ((data ?? []) as PointTagRecord[]).find(
    (item) =>
      item.point_classification_id === payload.point_classification_id &&
      item.name.localeCompare(payload.name, "pt-BR", { sensitivity: "base" }) === 0,
  );

  if (!tag) {
    return jsonError("A tag nao foi criada.", 500);
  }

  return Response.json(tag, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem alterar tags.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Tag nao informada.", 400);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.pointClassificationId === "string" && body.pointClassificationId.trim()) {
    patch.point_classification_id = body.pointClassificationId.trim();
  }

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    patch.slug = body.slug.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    patch.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (!Object.keys(patch).length) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error: updateError } = await supabase.from("point_tags").update(patch).eq("id", id);

  if (updateError) {
    return jsonError(updateError.message, 400);
  }

  const loaded = await loadTagOrNull(supabase, id);

  if (loaded.error) {
    return jsonError(loaded.error.message, 400);
  }

  if (!loaded.data) {
    return jsonError("Tag nao encontrada.", 404);
  }

  return Response.json(loaded.data);
}

export async function DELETE(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem excluir tags.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Tag nao informada.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const adminSupabase = createAdminSupabaseClient();
  const { count, error: assignmentsError } = await adminSupabase
    .from("point_tag_assignments")
    .select("point_id", { count: "exact", head: true })
    .eq("point_tag_id", id);

  if (assignmentsError) {
    return jsonError(assignmentsError.message, 400);
  }

  if (count) {
    const { error: logicalDeleteError } = await supabase
      .from("point_tags")
      .update({ is_active: false })
      .eq("id", id);

    if (logicalDeleteError) {
      return jsonError(logicalDeleteError.message, 400);
    }

    return Response.json({ mode: "logical" });
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("point_tags")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return jsonError(deleteError.message, 400);
  }

  if (!deletedRows?.length) {
    return jsonError("Tag nao encontrada.", 404);
  }

  return Response.json({ mode: "physical" });
}
