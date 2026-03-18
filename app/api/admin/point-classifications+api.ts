import { requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointClassificationRecord } from "@/src/types/domain";

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem cadastrar classificacoes.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body?.name) {
    return jsonError("Nome da classificacao e obrigatorio.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("create_point_classification", {
    p_name: String(body.name).trim(),
    p_slug: typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null,
    p_requires_species: Boolean(body.requiresSpecies),
    p_marker_color:
      typeof body.markerColor === "string" && body.markerColor.trim()
        ? body.markerColor.trim()
        : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const classification = (((data ?? []) as PointClassificationRecord[]) ?? [])[0];

  if (!classification) {
    return jsonError("A classificacao nao foi criada.", 500);
  }

  return Response.json(classification, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem alterar classificacoes.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Classificacao nao informada.", 400);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (typeof body.slug === "string" && body.slug.trim()) {
    patch.slug = body.slug.trim();
  }

  if (typeof body.requiresSpecies === "boolean") {
    patch.requires_species = body.requiresSpecies;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (typeof body.markerColor === "string" && body.markerColor.trim()) {
    patch.marker_color = body.markerColor.trim();
  }

  if (!Object.keys(patch).length) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let { error } = await supabase.from("point_classifications").update(patch).eq("id", id);

  if (error && "is_active" in patch && error.message.toLowerCase().includes("is_active")) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.is_active;
    error = (await supabase.from("point_classifications").update(fallbackPatch).eq("id", id)).error;
  }

  if (error) {
    return jsonError(error.message, 400);
  }

  const { data: rows, error: listError } = await supabase.rpc("list_point_classifications", {
    p_only_active: false,
  });

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const classification = (((rows ?? []) as PointClassificationRecord[]) ?? []).find(
    (item) => item.id === id,
  );

  if (!classification) {
    return jsonError("Classificacao nao encontrada.", 404);
  }

  return Response.json(classification);
}

export async function DELETE(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem excluir classificacoes.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Classificacao nao informada.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const adminSupabase = createAdminSupabaseClient();
  const [{ count: pointsCount, error: pointsError }, { count: eventTypesCount, error: eventTypesError }] =
    await Promise.all([
      adminSupabase
        .from("points")
        .select("id", { count: "exact", head: true })
        .eq("point_classification_id", id),
      adminSupabase
        .from("point_event_types")
        .select("id", { count: "exact", head: true })
        .eq("point_classification_id", id),
    ]);

  if (pointsError) {
    return jsonError(pointsError.message, 400);
  }

  if (eventTypesError) {
    return jsonError(eventTypesError.message, 400);
  }

  if (pointsCount || eventTypesCount) {
    const { error } = await supabase
      .from("point_classifications")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      return jsonError(error.message, 400);
    }

    return Response.json({ mode: "logical" });
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("point_classifications")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return jsonError(deleteError.message, 400);
  }

  if (!deletedRows?.length) {
    return jsonError("Classificacao nao encontrada.", 404);
  }

  return Response.json({ mode: "physical" });
}
