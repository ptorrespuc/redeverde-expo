import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoints } from "@/src/lib/point-tags";
import { filterVisiblePoints } from "@/src/lib/point-visibility";
import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient, getAccessTokenFromRequest } from "@/src/server/supabase";
import type { PointRecord } from "@/src/types/domain";

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

  const viewerProfileId = await loadViewerProfileId(request);
  const visiblePoints = filterVisiblePoints((((data ?? []) as PointRecord[]) ?? []), viewerProfileId);
  const pointsWithTags = await attachPointTagsToPoints(supabase, visiblePoints);

  return Response.json(pointsWithTags.map(withPointGroupLogo));
}
