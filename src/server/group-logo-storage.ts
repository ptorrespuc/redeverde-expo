import { GROUP_LOGO_BUCKET } from "@/src/lib/group-logos";
import { createAdminSupabaseClient } from "@/src/server/supabase";

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function ensureGroupLogoBucketExists() {
  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.storage.createBucket(GROUP_LOGO_BUCKET, {
    public: true,
    fileSizeLimit: MAX_LOGO_FILE_SIZE,
    allowedMimeTypes: ALLOWED_LOGO_MIME_TYPES,
  });

  if (
    error &&
    !error.message.toLowerCase().includes("already exists") &&
    !error.message.toLowerCase().includes("duplicate")
  ) {
    throw error;
  }
}

export function validateGroupLogoFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("A logo deve ser uma imagem.");
  }

  if (!ALLOWED_LOGO_MIME_TYPES.includes(file.type)) {
    throw new Error("A logo deve ser PNG, JPG ou WEBP.");
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    throw new Error("A logo pode ter no maximo 5 MB.");
  }
}

export function buildGroupLogoPath(groupId: string, fileName: string) {
  return `${groupId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export async function deleteGroupLogoIfPresent(path: string | null | undefined) {
  if (!path) {
    return;
  }

  const adminSupabase = createAdminSupabaseClient();
  const { error } = await adminSupabase.storage.from(GROUP_LOGO_BUCKET).remove([path]);

  if (
    error &&
    !error.message.toLowerCase().includes("not found") &&
    !error.message.toLowerCase().includes("no object found")
  ) {
    throw error;
  }
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}
