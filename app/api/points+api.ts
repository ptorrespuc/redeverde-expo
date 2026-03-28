import { withPointGroupLogo } from "@/src/lib/group-logos";
import { attachPointTagsToPoint, attachPointTagsToPoints } from "@/src/lib/point-tags";
import { jsonError } from "@/src/server/http";
import { applyPendingDisplayToPoint, applyPendingDisplayToPoints } from "@/src/server/pending-point-display";
import {
  replacePointTagAssignments,
  validatePointTagSelection,
} from "@/src/server/point-tag-write";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
  getAccessTokenFromRequest,
} from "@/src/server/supabase";
import type { CreatePointPayload, PointDetailRecord, PointRecord } from "@/src/types/domain";

const POINT_MEDIA_BUCKET = "point-timeline-media";
const MAX_POINT_FILES = 3;
const MAX_POINT_FILE_SIZE = 10 * 1024 * 1024;

type MultipartFormData = {
  get(name: string): unknown;
  getAll(name: string): unknown[];
};

type UploadableFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

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

export async function POST(request: Request) {
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

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartCreate(request, supabase);
  }

  const body = (await request.json().catch(() => null)) as Partial<CreatePointPayload> | null;

  if (!body) {
    return jsonError("Payload de criacao invalido.", 400);
  }

  if (
    typeof body.groupId !== "string" ||
    typeof body.classificationId !== "string" ||
    typeof body.title !== "string" ||
    typeof body.longitude !== "number" ||
    typeof body.latitude !== "number" ||
    typeof body.isPublic !== "boolean"
  ) {
    return jsonError("Grupo, classificacao, titulo, visibilidade e coordenadas sao obrigatorios.", 400);
  }

  const validatedTagIds = await validatePointTagSelection({
    supabase,
    classificationId: body.classificationId,
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
  });

  if (validatedTagIds.error) {
    return validatedTagIds.error;
  }

  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: body.groupId,
    p_point_classification_id: body.classificationId,
    p_title: body.title.trim(),
    p_longitude: body.longitude,
    p_latitude: body.latitude,
    p_description: typeof body.description === "string" ? body.description.trim() || null : null,
    p_status: null,
    p_is_public: body.isPublic,
    p_species_id:
      typeof body.speciesId === "string" && body.speciesId.trim() ? body.speciesId.trim() : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const createdPoint = ((data ?? []) as PointRecord[])[0] ?? null;

  if (!createdPoint) {
    return jsonError("O ponto nao foi criado.", 500);
  }

  const adminSupabase = createAdminSupabaseClient();
  const tagAssignmentError = await replacePointTagAssignments({
    adminSupabase,
    pointId: createdPoint.id,
    tagIds: validatedTagIds.tagIds,
  });

  if (tagAssignmentError) {
    return tagAssignmentError;
  }

  const { data: detailData, error: detailError } = await supabase.rpc("get_point", {
    p_point_id: createdPoint.id,
  });

  if (detailError) {
    return jsonError(detailError.message, 400);
  }

  const detailedPoint = ((detailData ?? []) as PointDetailRecord[])[0] ?? null;

  if (!detailedPoint) {
    return jsonError("Ponto nao encontrado apos a criacao.", 404);
  }

  const pointWithTags = await attachPointTagsToPoint(supabase, detailedPoint);
  const pointWithPendingDisplay = await applyPendingDisplayToPoint(supabase, pointWithTags);

  return Response.json(withPointGroupLogo(pointWithPendingDisplay), { status: 201 });
}

async function handleMultipartCreate(
  request: Request,
  supabase: ReturnType<typeof createRequestSupabaseClient>,
) {
  const formData = (await request.formData()) as unknown as MultipartFormData;
  const body = {
    groupId: `${formData.get("groupId") ?? ""}`.trim(),
    classificationId: `${formData.get("classificationId") ?? ""}`.trim(),
    tagIds: formData
      .getAll("tagIds")
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean),
    title: `${formData.get("title") ?? ""}`.trim(),
    longitude: Number(`${formData.get("longitude") ?? ""}`.trim()),
    latitude: Number(`${formData.get("latitude") ?? ""}`.trim()),
    description: `${formData.get("description") ?? ""}`.trim(),
    isPublic: `${formData.get("isPublic") ?? ""}`.trim() === "true",
    speciesId: `${formData.get("speciesId") ?? ""}`.trim(),
  } satisfies Partial<CreatePointPayload>;
  const files = formData.getAll("photos").filter(isUploadableFile);
  const photoCaptionEntries = formData.getAll("photoCaptions");

  if (!body || !body.groupId || !body.classificationId || !body.title || Number.isNaN(body.longitude) || Number.isNaN(body.latitude)) {
    return jsonError("Grupo, classificacao, titulo, visibilidade e coordenadas sao obrigatorios.", 400);
  }

  const fileValidationError = validatePointFiles(files);

  if (fileValidationError) {
    return fileValidationError;
  }

  const validatedTagIds = await validatePointTagSelection({
    supabase,
    classificationId: body.classificationId,
    tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
  });

  if (validatedTagIds.error) {
    return validatedTagIds.error;
  }

  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: body.groupId,
    p_point_classification_id: body.classificationId,
    p_title: body.title.trim(),
    p_longitude: body.longitude,
    p_latitude: body.latitude,
    p_description: typeof body.description === "string" ? body.description.trim() || null : null,
    p_status: null,
    p_is_public: body.isPublic,
    p_species_id:
      typeof body.speciesId === "string" && body.speciesId.trim() ? body.speciesId.trim() : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const createdPoint = ((data ?? []) as PointRecord[])[0] ?? null;

  if (!createdPoint) {
    return jsonError("O ponto nao foi criado.", 500);
  }

  const adminSupabase = createAdminSupabaseClient();
  const uploadedPaths: string[] = [];

  try {
    if (files.length) {
      for (const [index, file] of files.entries()) {
        const storagePath = buildPointStoragePath(createdPoint.id, file.name);
        const arrayBuffer = await file.arrayBuffer();
        const captionEntry = photoCaptionEntries[index];
        const caption = typeof captionEntry === "string" ? captionEntry.trim() : "";

        const { error: uploadError } = await adminSupabase.storage
          .from(POINT_MEDIA_BUCKET)
          .upload(storagePath, Buffer.from(arrayBuffer), {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        uploadedPaths.push(storagePath);

        const { error: mediaError } = await adminSupabase.from("point_media").insert({
          point_id: createdPoint.id,
          point_event_id: null,
          file_url: storagePath,
          caption: caption || null,
        });

        if (mediaError) {
          throw new Error(mediaError.message);
        }
      }
    }

    const tagAssignmentError = await replacePointTagAssignments({
      adminSupabase,
      pointId: createdPoint.id,
      tagIds: validatedTagIds.tagIds,
    });

    if (tagAssignmentError) {
      return tagAssignmentError;
    }

    const { data: detailData, error: detailError } = await supabase.rpc("get_point", {
      p_point_id: createdPoint.id,
    });

    if (detailError) {
      throw new Error(detailError.message);
    }

    const detailedPoint = ((detailData ?? []) as PointDetailRecord[])[0] ?? null;

    if (!detailedPoint) {
      throw new Error("Ponto nao encontrado apos a criacao.");
    }

    const pointWithTags = await attachPointTagsToPoint(supabase, detailedPoint);
    const pointWithPendingDisplay = await applyPendingDisplayToPoint(supabase, pointWithTags);

    return Response.json(withPointGroupLogo(pointWithPendingDisplay), { status: 201 });
  } catch (error) {
    if (uploadedPaths.length) {
      await adminSupabase.storage.from(POINT_MEDIA_BUCKET).remove(uploadedPaths).catch(() => undefined);
    }

    await adminSupabase.from("point_media").delete().eq("point_id", createdPoint.id);
    await adminSupabase.from("points").delete().eq("id", createdPoint.id);

    return jsonError(
      error instanceof Error ? error.message : "Nao foi possivel salvar as fotos do ponto.",
      400,
    );
  }
}

function validatePointFiles(files: UploadableFile[]) {
  if (files.length > MAX_POINT_FILES) {
    return jsonError(`Envie no maximo ${MAX_POINT_FILES} fotos no cadastro inicial.`, 400);
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return jsonError("Somente imagens sao permitidas no cadastro do ponto.", 400);
    }

    if (file.size > MAX_POINT_FILE_SIZE) {
      return jsonError("Cada foto do ponto pode ter no maximo 10 MB.", 400);
    }
  }

  return null;
}

function buildPointStoragePath(pointId: string, fileName: string) {
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${pointId}/point/${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function isUploadableFile(entry: unknown): entry is UploadableFile {
  return Boolean(
    entry &&
      typeof entry === "object" &&
      "name" in entry &&
      "size" in entry &&
      "type" in entry &&
      "arrayBuffer" in entry &&
      typeof (entry as UploadableFile).name === "string" &&
      typeof (entry as UploadableFile).size === "number" &&
      typeof (entry as UploadableFile).type === "string" &&
      typeof (entry as UploadableFile).arrayBuffer === "function" &&
      (entry as UploadableFile).size > 0,
  );
}
