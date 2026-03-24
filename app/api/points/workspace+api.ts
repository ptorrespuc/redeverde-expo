import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoints } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { applyPendingDisplayToPoints } from "@/src/server/pending-point-display";
import { createRequestSupabaseClient, getAccessTokenFromRequest } from "@/src/server/supabase";
import type { PointRecord } from "@/src/types/domain";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const classificationIdParam = searchParams.get("classificationId");
  const groupIdParam = searchParams.get("groupId");
  const pendingOnly = searchParams.get("pendingOnly") === "true";
  const mineOnly = searchParams.get("mineOnly") === "true";
  const classificationId =
    classificationIdParam && classificationIdParam !== "all" ? classificationIdParam : null;
  const groupId = groupIdParam && groupIdParam !== "all" ? groupIdParam : null;

  const { data, error } = await supabase.rpc("list_workspace_points", {
    p_point_classification_id: classificationId,
    p_group_id: groupId,
    p_pending_only: pendingOnly,
    p_only_mine: mineOnly,
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
