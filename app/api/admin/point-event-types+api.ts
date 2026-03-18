import { requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointEventTypeRecord } from "@/src/types/domain";

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem cadastrar tipos de evento.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body?.pointClassificationId || !body?.name) {
    return jsonError("Classificacao e nome do tipo de evento sao obrigatorios.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("create_point_event_type", {
    p_point_classification_id: String(body.pointClassificationId).trim(),
    p_name: String(body.name).trim(),
    p_slug: typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const pointEventType = (((data ?? []) as PointEventTypeRecord[]) ?? [])[0];

  if (!pointEventType) {
    return jsonError("O tipo de evento nao foi criado.", 500);
  }

  return Response.json(pointEventType, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem alterar tipos de evento.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Tipo de evento nao informado.", 400);
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

  if (!Object.keys(patch).length) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error: updateError } = await supabase.from("point_event_types").update(patch).eq("id", id);

  if (updateError) {
    return jsonError(updateError.message, 400);
  }

  const { data: rows, error: listError } = await supabase.rpc("list_point_event_types", {
    p_point_classification_id: null,
  });

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const pointEventType = (((rows ?? []) as PointEventTypeRecord[]) ?? []).find(
    (item) => item.id === id,
  );

  if (!pointEventType) {
    return jsonError("Tipo de evento nao encontrado.", 404);
  }

  return Response.json(pointEventType);
}
