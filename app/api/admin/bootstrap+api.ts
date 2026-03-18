import { loadAdminBootstrap, requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";

export async function GET(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  try {
    const bootstrap = await loadAdminBootstrap(request);

    if (!bootstrap) {
      return jsonError("Nao foi possivel carregar a administracao.", 500);
    }

    return Response.json(bootstrap);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao carregar a administracao.", 400);
  }
}
