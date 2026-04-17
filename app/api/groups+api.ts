import { withGroupLogo } from "@/src/lib/group-logos";
import { getRequestUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { GroupRecord } from "@/src/types/domain";

export async function GET(request: Request) {
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("list_groups");

  if (error) {
    return jsonError(error.message, 400);
  }

  return Response.json((((data ?? []) as GroupRecord[]) ?? []).map(withGroupLogo));
}

type CreateGroupPayload = {
  name: string;
  code: string;
  isPublic: boolean;
};

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

  if (!body || typeof body !== "object") {
    return jsonError("Payload invalido.", 400);
  }

  const parsed = body as Record<string, unknown>;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const code = typeof parsed.code === "string"
    ? parsed.code.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase()
    : "";
  const isPublic = Boolean(parsed.isPublic);

  if (!name) {
    return jsonError("Nome do grupo e obrigatorio.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_code: code,
    p_is_public: isPublic,
    p_accepts_point_collaboration: false,
    p_max_pending_points_per_collaborator: 5,
  });

  if (error && error.message.toLowerCase().includes("max_pending_points_per_collaborator")) {
    const fallback = await supabase.rpc("create_group", {
      p_name: name,
      p_code: code,
      p_is_public: isPublic,
      p_accepts_point_collaboration: false,
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

  // Segurança: garante que o criador é group_admin independente do que o RPC fizer.
  const adminSupabase = createAdminSupabaseClient();
  await adminSupabase
    .from("user_groups")
    .upsert(
      { user_id: context.profile.id, group_id: group.id, role: "group_admin" },
      { onConflict: "user_id,group_id", ignoreDuplicates: false },
    );

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const updatedGroup = ((((groups ?? []) as GroupRecord[]) ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === group.id);

  if (!updatedGroup) {
    return jsonError("Grupo criado, mas nao foi possivel carrega-lo.", 404);
  }

  return Response.json(updatedGroup, { status: 201 });
}
  