import { supabase } from "@/src/lib/supabase";
import type {
  AdminBootstrapResponse,
  CreateAdminUserPayload,
  CreateGroupPayload,
  CreatePointClassificationPayload,
  CreatePointEventTypePayload,
  CreatePointTagPayload,
  CreateSpeciesPayload,
  UpdateAdminUserPayload,
  UpdateGroupPayload,
  UpdatePointClassificationPayload,
  UpdatePointEventTypePayload,
  UpdatePointTagPayload,
  UpdateSpeciesPayload,
} from "@/src/types/domain";

async function createAuthHeaders(body?: BodyInit | null, headers?: HeadersInit) {
  const sessionResponse = await supabase.auth.getSession();
  const accessToken = sessionResponse.data.session?.access_token;
  const result = new Headers(headers);

  if (accessToken) {
    result.set("Authorization", `Bearer ${accessToken}`);
  }

  if (body && !(body instanceof FormData) && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json");
  }

  return result;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const headers = await createAuthHeaders(init?.body ?? null, init?.headers);
  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return null as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; details?: unknown }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Nao foi possivel concluir a operacao.";
    throw new Error(message);
  }

  return payload as T;
}

export function loadAdminBootstrap() {
  return requestJson<AdminBootstrapResponse>("/api/admin/bootstrap");
}

export function createAdminGroup(payload: CreateGroupPayload) {
  return requestJson("/api/admin/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminGroup(groupId: string, payload: UpdateGroupPayload) {
  return requestJson(`/api/admin/groups?id=${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminUser(payload: CreateAdminUserPayload) {
  return requestJson("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminUser(userId: string, payload: UpdateAdminUserPayload) {
  return requestJson(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminPointClassification(payload: CreatePointClassificationPayload) {
  return requestJson("/api/admin/point-classifications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminPointClassification(
  classificationId: string,
  payload: UpdatePointClassificationPayload,
) {
  return requestJson(`/api/admin/point-classifications?id=${encodeURIComponent(classificationId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminPointClassification(classificationId: string) {
  return requestJson(`/api/admin/point-classifications?id=${encodeURIComponent(classificationId)}`, {
    method: "DELETE",
  });
}

export function createAdminPointTag(payload: CreatePointTagPayload) {
  return requestJson("/api/admin/point-tags", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminPointTag(tagId: string, payload: UpdatePointTagPayload) {
  return requestJson(`/api/admin/point-tags?id=${encodeURIComponent(tagId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminPointTag(tagId: string) {
  return requestJson(`/api/admin/point-tags?id=${encodeURIComponent(tagId)}`, {
    method: "DELETE",
  });
}

export function createAdminSpecies(payload: CreateSpeciesPayload) {
  return requestJson("/api/admin/species", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminSpecies(speciesId: string, payload: UpdateSpeciesPayload) {
  return requestJson(`/api/admin/species?id=${encodeURIComponent(speciesId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminPointEventType(payload: CreatePointEventTypePayload) {
  return requestJson("/api/admin/point-event-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminPointEventType(
  pointEventTypeId: string,
  payload: UpdatePointEventTypePayload,
) {
  return requestJson(`/api/admin/point-event-types?id=${encodeURIComponent(pointEventTypeId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
