import { getRequestUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { GroupRecord } from "@/src/types/domain";

export async function POST(request: Request) {
  const context = await getRequestUserContext(request);

  if (!context) {
    return jsonError("Nao autenticado.", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Payload invalido.", 400);
  }

  const groupId =
    body && typeof body === "object" && "groupId" in body && typeof (body as Record<string, unknown>).groupId === "string"
      ? ((body as Record<string, unknown>).groupId as string).trim()
      : "";

  if (!groupId) {
    return jsonError("groupId e obrigatorio.", 400);
  }

  // Verifica se o grupo existe e é público usando o cliente autenticado do usuário.
  const supabase = createRequestSupabaseClient(request);
  const { data: groupsData, error: groupsError } = await supabase.rpc("list_groups");

  if (groupsError) {
    return jsonError(groupsError.message, 400);
  }

  const group = ((groupsData ?? []) as GroupRecord[]).find((g) => g.id === groupId);

  if (!group) {
    return jsonError("Grupo nao encontrado.", 404);
  }

  if (!group.is_public) {
    return jsonError("Este grupo e privado. Entre em contato com o administrador para ser convidado.", 403);
  }

  if (group.my_role !== null) {
    return jsonError("Voce ja e membro deste grupo.", 409);
  }

  // Usa cliente admin para inserir em user_groups (RLS impede escrita direta).
  const adminSupabase = createAdminSupabaseClient();
  const { error: joinError } = await adminSupabase
    .from("user_groups")
    .upsert(
      { user_id: context.profile.id, group_id: groupId, role: "group_collaborator" },
      { onConflict: "user_id,group_id", ignoreDuplicates: true },
    );

  if (joinError) {
    return jsonError(joinError.message, 400);
  }

  return Response.json({ ok: true }, { status: 200 });
}
