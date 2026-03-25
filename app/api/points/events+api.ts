import { jsonError } from "@/src/server/http";
import {
  createAdminSupabaseClient,
  createRequestSupabaseClient,
} from "@/src/server/supabase";
import type { PointDetailRecord, PointEventRecord, PointMediaRecord } from "@/src/types/domain";

const POINT_MEDIA_BUCKET = "point-timeline-media";
const POINT_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 12;
const MAX_EVENT_FILES = 6;
const MAX_EVENT_FILE_SIZE = 10 * 1024 * 1024;

type EventMediaRow = Omit<PointMediaRecord, "signed_url">;
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
  const pointId = getPointIdFromRequest(request);

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const requestSupabase = createRequestSupabaseClient(request);
  const point = await loadAccessiblePoint(requestSupabase, pointId);

  if ("error" in point) {
    return point.error;
  }

  const { data, error } = await requestSupabase.rpc("list_point_events", {
    p_point_id: pointId,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const adminSupabase = createAdminSupabaseClient();
  const events = await hydrateEventMedia(
    adminSupabase,
    (((data ?? []) as PointEventRecord[]) ?? []).map(normalizeEvent),
  );

  return Response.json(events);
}

export async function POST(request: Request) {
  const pointId = getPointIdFromRequest(request);

  if (!pointId) {
    return jsonError("Informe o pointId.", 400);
  }

  const requestSupabase = createRequestSupabaseClient(request);
  const pointResult = await loadAccessiblePoint(requestSupabase, pointId);

  if ("error" in pointResult) {
    return pointResult.error;
  }

  if (!pointResult.point.viewer_can_manage) {
    return jsonError("Voce nao tem permissao para criar eventos neste ponto.", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartCreate(request, requestSupabase, pointResult.point);
  }

  const body = await request.json().catch(() => null);
  const { data, error } = await requestSupabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id:
      typeof body?.pointEventTypeId === "string" ? body.pointEventTypeId || null : null,
    p_event_type: typeof body?.eventType === "string" ? body.eventType || null : null,
    p_description: typeof body?.description === "string" ? body.description || null : null,
    p_event_date: typeof body?.eventDate === "string" ? body.eventDate || null : null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const event = ((data ?? []) as PointEventRecord[])[0] ?? null;

  if (!event) {
    return jsonError("O evento nao foi criado.", 500);
  }

  return Response.json(normalizeEvent(event), { status: 201 });
}

async function handleMultipartCreate(
  request: Request,
  requestSupabase: ReturnType<typeof createRequestSupabaseClient>,
  point: PointDetailRecord,
) {
  const formData = (await request.formData()) as unknown as MultipartFormData;
  const eventType = `${formData.get("eventType") ?? ""}`.trim();
  const pointEventTypeId = `${formData.get("pointEventTypeId") ?? ""}`.trim();
  const description = `${formData.get("description") ?? ""}`.trim();
  const eventDate = `${formData.get("eventDate") ?? ""}`.trim();
  const photoEntries = formData.getAll("photos");
  const photoCaptionEntries = formData.getAll("photoCaptions");
  const files = photoEntries.filter(isUploadableFile);

  const validationError = validateEventFiles(files);

  if (validationError) {
    return validationError;
  }

  const { data, error } = await requestSupabase.rpc("create_point_event", {
    p_point_id: point.id,
    p_point_event_type_id: pointEventTypeId || null,
    p_event_type: eventType || null,
    p_description: description || null,
    p_event_date: eventDate || null,
  });

  if (error) {
    return jsonError(error.message, 400);
  }

  const createdEvent = ((data ?? []) as PointEventRecord[])[0] ?? null;

  if (!createdEvent) {
    return jsonError("O evento nao foi criado.", 500);
  }

  if (!files.length) {
    return Response.json(normalizeEvent(createdEvent), { status: 201 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const uploadedPaths: string[] = [];
  const insertedMedia: EventMediaRow[] = [];

  try {
    for (const [index, file] of files.entries()) {
      const storagePath = buildTimelineStoragePath(point.id, createdEvent.id, file.name);
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

      const { data: mediaRow, error: mediaError } = await adminSupabase
        .from("point_media")
        .insert({
          point_id: point.id,
          point_event_id: createdEvent.id,
          file_url: storagePath,
          caption: caption || null,
        })
        .select("id, point_id, point_event_id, file_url, caption, created_at")
        .single();

      if (mediaError) {
        throw new Error(mediaError.message);
      }

      insertedMedia.push(mediaRow as EventMediaRow);
    }

    const [eventWithMedia] = await hydrateEventMedia(adminSupabase, [
      {
        ...normalizeEvent(createdEvent),
        media: insertedMedia.map((media) => ({ ...media, signed_url: null })),
      },
    ]);

    return Response.json(eventWithMedia, { status: 201 });
  } catch (error) {
    await rollbackEvent(adminSupabase, createdEvent.id, uploadedPaths);

    return jsonError(
      error instanceof Error ? error.message : "Nao foi possivel salvar as fotos do evento.",
      400,
    );
  }
}

async function loadAccessiblePoint(
  requestSupabase: ReturnType<typeof createRequestSupabaseClient>,
  pointId: string,
) {
  const { data, error } = await requestSupabase.rpc("get_point", {
    p_point_id: pointId,
  });

  if (error) {
    return { error: jsonError(error.message, 400) } as const;
  }

  const point = ((data ?? []) as PointDetailRecord[])[0] ?? null;

  if (!point) {
    return { error: jsonError("Ponto nao encontrado.", 404) } as const;
  }

  return { point } as const;
}

function getPointIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("pointId");
}

function normalizeEvent(event: PointEventRecord): PointEventRecord {
  return {
    ...event,
    media: Array.isArray(event.media) ? event.media : [],
  };
}

async function hydrateEventMedia(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  events: PointEventRecord[],
) {
  return Promise.all(
    events.map(async (event) => {
      const media = await Promise.all(
        (event.media ?? []).map(async (mediaRow) => {
          const fileUrl = mediaRow.file_url;

          if (!fileUrl) {
            return {
              ...mediaRow,
              signed_url: null,
            } satisfies PointMediaRecord;
          }

          const { data, error } = await adminSupabase.storage
            .from(POINT_MEDIA_BUCKET)
            .createSignedUrl(fileUrl, POINT_MEDIA_SIGNED_URL_TTL_SECONDS);

          return {
            ...mediaRow,
            signed_url: error ? null : data.signedUrl,
          } satisfies PointMediaRecord;
        }),
      );

      return {
        ...event,
        media,
      } satisfies PointEventRecord;
    }),
  );
}

function validateEventFiles(files: UploadableFile[]) {
  if (files.length > MAX_EVENT_FILES) {
    return jsonError(`Envie no maximo ${MAX_EVENT_FILES} fotos por evento.`, 400);
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return jsonError("Somente imagens sao permitidas nos eventos.", 400);
    }

    if (file.size > MAX_EVENT_FILE_SIZE) {
      return jsonError("Cada foto do evento pode ter no maximo 10 MB.", 400);
    }
  }

  return null;
}

async function rollbackEvent(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  eventId: string,
  uploadedPaths: string[],
) {
  if (uploadedPaths.length) {
    await adminSupabase.storage.from(POINT_MEDIA_BUCKET).remove(uploadedPaths);
  }

  await adminSupabase.from("point_media").delete().eq("point_event_id", eventId);
  await adminSupabase.from("point_events").delete().eq("id", eventId);
}

function buildTimelineStoragePath(pointId: string, eventId: string, fileName: string) {
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${pointId}/${eventId}/${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
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
