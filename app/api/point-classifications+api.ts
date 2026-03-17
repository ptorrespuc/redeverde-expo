import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient } from "@/src/server/supabase";
import type { PointClassificationRecord } from "@/src/types/domain";

export async function GET(request: Request) {
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("list_point_classifications", {
    p_only_active: true,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  return Response.json(((data ?? []) as PointClassificationRecord[]) ?? []);
}
