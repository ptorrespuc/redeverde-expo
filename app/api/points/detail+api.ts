import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoint } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointDetailRecord } from "@/src/types/domain";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pointId = searchParams.get("pointId");

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const point = ((data ?? []) as PointDetailRecord[])[0] ?? null;

  if (!point) {
    return jsonError("Ponto nao encontrado.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, point);
  return Response.json(withPointGroupLogo(pointWithTags));
}
