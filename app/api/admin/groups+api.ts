import { GROUP_LOGO_BUCKET, withGroupLogo } from "@/src/lib/group-logos";
import { requireAdminUserContext } from "@/src/server/admin";
import {
  buildGroupLogoPath,
  deleteGroupLogoIfPresent,
  ensureGroupLogoBucketExists,
  validateGroupLogoFile,
} from "@/src/server/group-logo-storage";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/src/server/supabase";
import type { GroupRecord } from "@/src/types/domain";

type CreateGroupRequestPayload = {
  name: string;
  code: string;
  isPublic: boolean;
  acceptsPointCollaboration: boolean;
  maxPendingPointsPerCollaborator: number;
  logoFile: File | null;
};

type UpdateGroupRequestPayload = {
  name?: string;
  code?: string;
  isPublic?: boolean;
  acceptsPointCollaboration?: boolean;
  maxPendingPointsPerCollaborator?: number;
  logoFile: File | null;
  removeLogo: boolean;
};

type ServerFormData = {
  get(name: string): FormDataEntryValue | null;
  has(name: string): boolean;
};

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem criar grupos.", 403);
  }

  let parsed: CreateGroupRequestPayload;

  try {
    parsed = await parseCreateGroupRequest(request);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Payload de grupo invalido.", 400);
  }

  if (!parsed.name) {
    return jsonError("Nome do grupo e obrigatorio.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let { data, error } = await supabase.rpc("create_group", {
    p_name: parsed.name,
    p_code: parsed.code,
    p_is_public: parsed.isPublic,
    p_accepts_point_collaboration: parsed.acceptsPointCollaboration,
    p_max_pending_points_per_collaborator: parsed.maxPendingPointsPerCollaborator,
  });

  if (error && shouldRetryWithoutPendingLimit(error.message)) {
    const fallback = await supabase.rpc("create_group", {
      p_name: parsed.name,
      p_code: parsed.code,
      p_is_public: parsed.isPublic,
      p_accepts_point_collaboration: parsed.acceptsPointCollaboration,
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

  if (parsed.logoFile) {
    const uploadResult = await uploadGroupLogo(group.id, parsed.logoFile);

    if (!uploadResult.ok) {
      const adminSupabase = createAdminSupabaseClient();
      await adminSupabase.from("groups").delete().eq("id", group.id);
      return jsonError(uploadResult.error, 400);
    }
  }

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const updatedGroup = ((((groups ?? []) as GroupRecord[]) ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === group.id);

  if (!updatedGroup) {
    return jsonError("Grupo nao encontrado.", 404);
  }

  return Response.json(updatedGroup, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  const groupId = new URL(request.url).searchParams.get("id");

  if (!groupId) {
    return jsonError("Grupo nao informado.", 400);
  }

  if (
    !auth.context.is_super_admin &&
    !auth.context.manageable_groups.some((group) => group.id === groupId)
  ) {
    return jsonError("Voce nao pode editar este grupo.", 403);
  }

  let parsed: UpdateGroupRequestPayload;

  try {
    parsed = await parseUpdateGroupRequest(request);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Payload de atualizacao invalido.",
      400,
    );
  }

  const patch: Record<string, unknown> = {};

  if (typeof parsed.name === "string" && parsed.name.trim()) {
    patch.name = parsed.name.trim();
  }

  if (typeof parsed.code === "string") {
    const normalizedCode = normalizeGroupCode(parsed.code);
    if (normalizedCode) {
      patch.code = normalizedCode;
    }
  }

  if (typeof parsed.isPublic === "boolean") {
    patch.is_public = parsed.isPublic;
  }

  if (typeof parsed.acceptsPointCollaboration === "boolean") {
    patch.accepts_point_collaboration = parsed.acceptsPointCollaboration;
  }

  if (typeof parsed.maxPendingPointsPerCollaborator === "number") {
    patch.max_pending_points_per_collaborator = parsed.maxPendingPointsPerCollaborator;
  }

  if (!Object.keys(patch).length && !parsed.logoFile && !parsed.removeLogo) {
    return jsonError("Nenhum campo valido foi informado.", 400);
  }

  const supabase = createRequestSupabaseClient(request);
  let error = null as { message: string } | null;

  if (Object.keys(patch).length) {
    const updateResponse = await supabase.from("groups").update(patch).eq("id", groupId);
    error = updateResponse.error;

    if (
      error &&
      "max_pending_points_per_collaborator" in patch &&
      shouldRetryWithoutPendingLimit(error.message)
    ) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.max_pending_points_per_collaborator;
      error = (await supabase.from("groups").update(fallbackPatch).eq("id", groupId)).error;
    }
  }

  if (error) {
    return jsonError(error.message, 400);
  }

  if (patch.is_public === false) {
    const adminSupabase = createAdminSupabaseClient();
    const { error: pointsError } = await adminSupabase
      .from("points")
      .update({ is_public: false })
      .eq("group_id", groupId);

    if (pointsError) {
      return jsonError(pointsError.message, 400);
    }
  }

  const currentLogoResponse = await createAdminSupabaseClient()
    .from("groups")
    .select("logo_path")
    .eq("id", groupId)
    .maybeSingle();

  if (currentLogoResponse.error) {
    return jsonError(currentLogoResponse.error.message, 400);
  }

  const currentLogoPath = currentLogoResponse.data?.logo_path ?? null;

  if (parsed.logoFile) {
    const uploadResult = await uploadGroupLogo(groupId, parsed.logoFile, currentLogoPath);

    if (!uploadResult.ok) {
      return jsonError(uploadResult.error, 400);
    }
  } else if (parsed.removeLogo && currentLogoPath) {
    const adminSupabase = createAdminSupabaseClient();
    const { error: removeError } = await adminSupabase
      .from("groups")
      .update({ logo_path: null })
      .eq("id", groupId);

    if (removeError) {
      return jsonError(removeError.message, 400);
    }

    try {
      await deleteGroupLogoIfPresent(currentLogoPath);
    } catch {
      // Non-blocking cleanup: the group no longer references the removed logo.
    }
  }

  const { data: groups, error: listError } = await supabase.rpc("list_groups");

  if (listError) {
    return jsonError(listError.message, 400);
  }

  const group = ((((groups ?? []) as GroupRecord[]) ?? []) as GroupRecord[])
    .map(withGroupLogo)
    .find((item) => item.id === groupId);

  if (!group) {
    return jsonError("Grupo nao encontrado.", 404);
  }

  return Response.json(group);
}

async function parseCreateGroupRequest(request: Request): Promise<CreateGroupRequestPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = (await request.formData()) as unknown as ServerFormData;
    const logoEntry = formData.get("logo");
    const logoFile = logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;

    if (logoFile) {
      validateGroupLogoFile(logoFile);
    }

    return {
      name: `${formData.get("name") ?? ""}`.trim(),
      code: normalizeGroupCode(`${formData.get("code") ?? ""}`),
      isPublic: parseBooleanValue(formData.get("isPublic")) ?? false,
      acceptsPointCollaboration:
        parseBooleanValue(formData.get("acceptsPointCollaboration")) ?? false,
      maxPendingPointsPerCollaborator: normalizePendingLimit(
        formData.get("maxPendingPointsPerCollaborator"),
      ),
      logoFile,
    };
  }

  const body = await request.json().catch(() => null);

  return {
    name: typeof body?.name === "string" ? body.name.trim() : "",
    code: typeof body?.code === "string" ? normalizeGroupCode(body.code) : "",
    isPublic: Boolean(body?.isPublic),
    acceptsPointCollaboration: Boolean(body?.acceptsPointCollaboration),
    maxPendingPointsPerCollaborator: normalizePendingLimit(body?.maxPendingPointsPerCollaborator),
    logoFile: null,
  };
}

async function parseUpdateGroupRequest(request: Request): Promise<UpdateGroupRequestPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = (await request.formData()) as unknown as ServerFormData;
    const logoEntry = formData.get("logo");
    const logoFile = logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;

    if (logoFile) {
      validateGroupLogoFile(logoFile);
    }

    return {
      name: formData.has("name") ? `${formData.get("name") ?? ""}` : undefined,
      code: formData.has("code") ? `${formData.get("code") ?? ""}` : undefined,
      isPublic: formData.has("isPublic") ? parseBooleanValue(formData.get("isPublic")) : undefined,
      acceptsPointCollaboration: formData.has("acceptsPointCollaboration")
        ? parseBooleanValue(formData.get("acceptsPointCollaboration"))
        : undefined,
      maxPendingPointsPerCollaborator: formData.has("maxPendingPointsPerCollaborator")
        ? normalizePendingLimit(formData.get("maxPendingPointsPerCollaborator"))
        : undefined,
      logoFile,
      removeLogo: parseBooleanValue(formData.get("removeLogo")) ?? false,
    };
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error("Payload de atualizacao invalido.");
  }

  return {
    name: typeof body.name === "string" ? body.name : undefined,
    code: typeof body.code === "string" ? body.code : undefined,
    isPublic: typeof body.isPublic === "boolean" ? body.isPublic : undefined,
    acceptsPointCollaboration:
      typeof body.acceptsPointCollaboration === "boolean"
        ? body.acceptsPointCollaboration
        : undefined,
    maxPendingPointsPerCollaborator: Object.prototype.hasOwnProperty.call(
      body,
      "maxPendingPointsPerCollaborator",
    )
      ? normalizePendingLimit(body.maxPendingPointsPerCollaborator)
      : undefined,
    logoFile: null,
    removeLogo: Boolean(body.removeLogo),
  };
}

async function uploadGroupLogo(groupId: string, logoFile: File, previousLogoPath?: string | null) {
  try {
    await ensureGroupLogoBucketExists();
    const storagePath = buildGroupLogoPath(groupId, logoFile.name);
    const adminSupabase = createAdminSupabaseClient();
    const { error: uploadError } = await adminSupabase.storage
      .from(GROUP_LOGO_BUCKET)
      .upload(storagePath, new Uint8Array(await logoFile.arrayBuffer()), {
        contentType: logoFile.type || "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: updateError } = await adminSupabase
      .from("groups")
      .update({ logo_path: storagePath })
      .eq("id", groupId);

    if (updateError) {
      await deleteGroupLogoIfPresent(storagePath);
      throw updateError;
    }

    if (previousLogoPath && previousLogoPath !== storagePath) {
      try {
        await deleteGroupLogoIfPresent(previousLogoPath);
      } catch {
        // Non-blocking cleanup: the group already points to the new logo.
      }
    }

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Nao foi possivel salvar a logo do grupo.",
    };
  }
}

function normalizeGroupCode(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

function normalizePendingLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 5;

  if (Number.isNaN(parsed)) {
    return 5;
  }

  return Math.max(1, Math.floor(parsed));
}

function parseBooleanValue(value: FormDataEntryValue | null) {
  if (value === null) {
    return undefined;
  }

  return `${value}`.trim().toLowerCase() === "true";
}

function shouldRetryWithoutPendingLimit(message: string) {
  return message.toLowerCase().includes("max_pending_points_per_collaborator");
}
