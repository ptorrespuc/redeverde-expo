import { requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { SpeciesRecord } from "@/src/types/domain";

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superadministradores podem cadastrar especies.", 403);
  }

  const body = await request.json().catch(() => null);

  if (!body?.commonName || !body?.scientificName) {
    return jsonError("Nome popular e nome cientifico sao obrigatorios.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const origin = body.origin === "exotic" ? "exotic" : "native";
  const { data, error } = await supabase.rpc("create_species", {
    p_common_name: String(body.commonName).trim(),
    p_scientific_name: String(body.scientificName).trim(),
    p_origin: origin,
    p_is_active: typeof body.isActive === "boolean" ? body.isActive : true,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const species = (((data ?? []) as SpeciesRecord[]) ?? [])[0];

  if (!species) {
    return jsonError("A especie nao foi criada.", 500);
  }

  return Response.json(species, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superadministradores podem alterar especies.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Especie nao informada.", 400);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.commonName === "string" && body.commonName.trim()) {
    patch.common_name = body.commonName.trim();
  }

  if (typeof body.scientificName === "string" && body.scientificName.trim()) {
    patch.scientific_name = body.scientificName.trim();
  }

  if (body.origin === "native" || body.origin === "exotic") {
    patch.origin = body.origin;
  }

  if (typeof body.isActive === "boolean") {
    patch.is_active = body.isActive;
  }

  if (!Object.keys(patch).length) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error: updateError } = await supabase.from("species").update(patch).eq("id", id);

  if (updateError) {
    return jsonError(updateError.message, 400);
  }

  const { data: rows, error: listError } = await supabase.rpc("list_species", {
    p_only_active: false,
  });

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const species = (((rows ?? []) as SpeciesRecord[]) ?? []).find((item) => item.id === id);

  if (!species) {
    return jsonError("Especie nao encontrada.", 404);
  }

  return Response.json(species);
}

export async function DELETE(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superadministradores podem excluir especies.", 403);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Especie nao informada.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const adminSupabase = createAdminSupabaseClient();
  const { count, error: pointsError } = await adminSupabase
    .from("points")
    .select("id", { count: "exact", head: true })
    .eq("species_id", id);

  if (pointsError) {
    return jsonError(pointsError.message, 400);
  }

  if (count) {
    const { error: logicalDeleteError } = await supabase
      .from("species")
      .update({ is_active: false })
      .eq("id", id);

    if (logicalDeleteError) {
      return jsonError(logicalDeleteError.message, 400);
    }

    return Response.json({ mode: "logical" });
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("species")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return jsonError(deleteError.message, 400);
  }

  if (!deletedRows?.length) {
    return jsonError("Especie nao encontrada.", 404);
  }

  return Response.json({ mode: "physical" });
}
