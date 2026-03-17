import { withGroupLogo } from "@/src/lib/group-logos";
import { jsonError } from "@/src/server/http";
import { createRequestSupabaseClient } from "@/src/server/supabase";
import type { GroupRecord } from "@/src/types/domain";

export async function GET(request: Request) {
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("list_groups");

  if (error) {
    return jsonError(error.message, 400);
  }

  return Response.json((((data ?? []) as GroupRecord[]) ?? []).map(withGroupLogo));
}
