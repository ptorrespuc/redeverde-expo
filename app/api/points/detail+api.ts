import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoint } from "@/src/lib/point-tags";
import { canViewerSeePoint } from "@/src/lib/point-visibility";
import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient, getAccessTokenFromRequest } from "@/src/server/supabase";
import type { PointDetailRecord } from "@/src/types/domain";

async function loadViewerProfileId(request: Request) {
  const accessToken = getAccessTokenFromRequest(request);

  if (!accessToken) {
    return null;
  }

  const supabase = createRequestSupabaseClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return profile?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pointId = searchParams.get("pointId");

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const [{ data, error }, viewerProfileId] = await Promise.all([
    supabase.rpc("get_point", {
      p_point_id: pointId,
    }),
    loadViewerProfileId(request),
  ]);

  if (error) {
    return jsonError(error.message, 400);
  }

  const point = ((data ?? []) as PointDetailRecord[])[0] ?? null;

  if (!point || !canViewerSeePoint(point, viewerProfileId)) {
    return jsonError("Ponto nao encontrado.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, point);
  return Response.json(withPointGroupLogo(pointWithTags));
}
