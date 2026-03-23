import { jsonError } from "@/src/server/http";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
} from "@/src/server/supabase";
import type { PointDetailRecord, PointMediaRecord } from "@/src/types/domain";

const POINT_MEDIA_BUCKET = "point-timeline-media";
const POINT_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 12;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pointId = searchParams.get("pointId");

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const requestSupabase = createRequestSupabaseClient(request);
  const { data: pointData, error: pointError } = await requestSupabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (pointError) {
    return jsonError(pointError.message, 400);
  }

  const point = ((pointData ?? []) as PointDetailRecord[])[0] ?? null;

  if (!point) {
    return jsonError("Ponto nao encontrado.", 404);
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: mediaRows, error: mediaError } = await adminSupabase
    .from("point_media")
    .select("id, point_id, point_event_id, file_url, caption, created_at")
    .eq("point_id", pointId)
    .is("point_event_id", null)
    .order("created_at", { ascending: true });

  if (mediaError) {
    return jsonError(mediaError.message, 400);
  }

  const media = await Promise.all(
    (((mediaRows ?? []) as Omit<PointMediaRecord, "signed_url">[]) ?? []).map(async (row) => {
      const { data: signedUrlData, error: signedUrlError } = await adminSupabase.storage
        .from(POINT_MEDIA_BUCKET)
        .createSignedUrl(row.file_url, POINT_MEDIA_SIGNED_URL_TTL_SECONDS);

      return {
        ...row,
        signed_url: signedUrlError ? null : signedUrlData.signedUrl,
      } satisfies PointMediaRecord;
    }),
  );

  return Response.json(media);
}
