import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoints } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { applyPendingDisplayToPoints } from "@/src/server/pending-point-display";
import { createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointRecord } from "@/src/types/domain";

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

  const visiblePoints = (((data ?? []) as PointRecord[]) ?? []).filter(
    (point) => point.status !== "archived",
  );
  const pointsWithTags = await attachPointTagsToPoints(supabase, visiblePoints);
  const pointsWithPendingDisplay = await applyPendingDisplayToPoints(supabase, pointsWithTags);

  return Response.json(pointsWithPendingDisplay.map(withPointGroupLogo));
}
