import * as Linking from "expo-linking";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { withGroupLogo, withPointGroupLogo } from "@/src/lib/group-logos";
import { loadPointTags } from "@/src/lib/point-tags";
import { supabase } from "@/src/lib/supabase";
import type {
  CreatePointEventPayload,
  CreatePointPayload,
  GroupRecord,
  NativeUploadFile,
  PointClassificationRecord,
  PointDetailRecord,
  PointEventRecord,
  PointEventTypeRecord,
  PointMediaRecord,
  PointRecord,
  PointTagRecord,
  SpeciesRecord,
  UpdatePointPayload,
  UserContext,
  UserProfile,
} from "@/src/types/domain";

function getSingleRow<T>(rows: T[] | null | undefined, errorMessage: string) {
  const row = rows?.[0];

  if (!row) {
    throw new Error(errorMessage);
  }

  return row;
}

function requireData<T>(data: T | null, error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function getAuthRedirectUrl(pathname: string) {
  return Linking.createURL(pathname);
}

const DEFAULT_APP_URL = "https://redeverde.expo.app";

function getAppApiUrl(pathname: string) {
  if (Platform.OS === "web") {
    return pathname;
  }

  const baseUrl = (process.env.EXPO_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
  return `${baseUrl}${pathname}`;
}

async function createAuthorizedHeaders(headers?: HeadersInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const result = new Headers(headers);

  if (session?.access_token) {
    result.set("Authorization", `Bearer ${session.access_token}`);
  }

  return result;
}

async function requestAppJson<T>(pathname: string, init?: RequestInit) {
  const headers = await createAuthorizedHeaders(init?.headers);
  const response = await fetch(getAppApiUrl(pathname), {
    ...init,
    headers,
  });
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

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return session;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function signUpWithPassword(input: {
  name: string;
  email: string;
  password: string;
}) {
  const redirectTo = getAuthRedirectUrl("/login");
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
      },
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendPasswordResetEmail(email: string) {
  const redirectTo = getAuthRedirectUrl("/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateCurrentUserPassword(password: string) {
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function listGroups() {
  const { data, error } = await supabase.rpc("list_groups");
  const rows = requireData(data, error) as GroupRecord[] | null;
  return (rows ?? []).map(withGroupLogo);
}


export async function createGroup(payload: {
  name: string;
  code: string;
  isPublic: boolean;
}): Promise<GroupRecord> {
  return requestAppJson<GroupRecord>("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function joinGroup(groupId: string): Promise<void> {
  await requestAppJson<{ ok: boolean }>("/api/groups/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId }),
  });
}
export async function listPointClassifications(options?: { onlyActive?: boolean }) {
  const { data, error } = await supabase.rpc("list_point_classifications", {
    p_only_active: options?.onlyActive ?? true,
  });

  return (requireData(data, error) as PointClassificationRecord[] | null) ?? [];
}

export async function listSpecies() {
  const { data, error } = await supabase.rpc("list_species", {
    p_only_active: true,
  });

  return (requireData(data, error) as SpeciesRecord[] | null) ?? [];
}

export async function listPointTags(options?: {
  pointClassificationId?: string | null;
  onlyActive?: boolean;
}) {
  const { data, error } = await loadPointTags(supabase, {
    pointClassificationId: options?.pointClassificationId ?? null,
    onlyActive: options?.onlyActive ?? true,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PointTagRecord[];
}

export async function getUserContext(session: Session | null): Promise<UserContext | null> {
  if (!session?.user) {
    return null;
  }

  const [profileResponse, groups] = await Promise.all([
    supabase
      .from("users")
      .select("id, auth_user_id, name, email, preferred_group_id, created_at")
      .eq("auth_user_id", session.user.id)
      .single(),
    listGroups(),
  ]);

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message);
  }

  const profile = profileResponse.data as UserProfile | null;

  if (!profile) {
    return null;
  }

  const manageableGroups = groups.filter(
    (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
  );
  const submissionGroups = groups.filter((group) => group.viewer_can_submit_points);
  const approvableGroups = groups.filter((group) => group.viewer_can_approve_points);
  const preferredGroup = groups.find((group) => group.id === profile.preferred_group_id) ?? null;

  return {
    profile,
    groups,
    manageable_groups: manageableGroups,
    submission_groups: submissionGroups,
    approvable_groups: approvableGroups,
    preferred_group: preferredGroup,
    is_super_admin: groups.some((group) => group.my_role === "super_admin"),
    has_group_admin: groups.some(
      (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
    ),
    has_point_workspace:
      manageableGroups.length > 0 ||
      submissionGroups.length > 0 ||
      approvableGroups.length > 0,
  };
}

export async function listPoints(filters?: {
  classificationIds?: string[] | null;
  classificationId?: string | null;
  groupId?: string | null;
}) {
  const classificationId =
    filters?.classificationId ??
    (filters?.classificationIds?.length === 1 ? filters.classificationIds[0] : null);
  const searchParams = new URLSearchParams();

  if (classificationId) {
    searchParams.set("classificationId", classificationId);
  }

  if (filters?.groupId) {
    searchParams.set("groupId", filters.groupId);
  }

  return requestAppJson<PointRecord[]>(
    `/api/points${searchParams.size ? `?${searchParams.toString()}` : ""}`,
  );
}

export async function listWorkspacePoints(filters?: {
  classificationIds?: string[] | null;
  classificationId?: string | null;
  groupId?: string | null;
  pendingOnly?: boolean;
  mineOnly?: boolean;
}) {
  const classificationId =
    filters?.classificationId ??
    (filters?.classificationIds?.length === 1 ? filters.classificationIds[0] : null);
  const searchParams = new URLSearchParams();

  if (classificationId) {
    searchParams.set("classificationId", classificationId);
  }

  if (filters?.groupId) {
    searchParams.set("groupId", filters.groupId);
  }

  if (filters?.pendingOnly) {
    searchParams.set("pendingOnly", "true");
  }

  if (filters?.mineOnly) {
    searchParams.set("mineOnly", "true");
  }

  return requestAppJson<PointRecord[]>(
    `/api/points/workspace${searchParams.size ? `?${searchParams.toString()}` : ""}`,
  );
}

export async function getPoint(pointId: string) {
  return requestAppJson<PointDetailRecord>(`/api/points/detail?pointId=${encodeURIComponent(pointId)}`);
}

export async function listPointEvents(pointId: string) {
  return requestAppJson<PointEventRecord[]>(`/api/points/events?pointId=${encodeURIComponent(pointId)}`);
}

export async function listPointMedia(pointId: string) {
  return requestAppJson<PointMediaRecord[]>(`/api/points/media?pointId=${encodeURIComponent(pointId)}`);
}

export async function listPointEventTypes(pointClassificationId?: string | null) {
  const { data, error } = await supabase.rpc("list_point_event_types", {
    p_point_classification_id: pointClassificationId || null,
  });

  return (requireData(data, error) as PointEventTypeRecord[] | null) ?? [];
}

export async function createPoint(payload: CreatePointPayload) {
  if (payload.photos?.length) {
    const formData = new FormData();

    formData.append("groupId", payload.groupId);
    formData.append("classificationId", payload.classificationId);
    formData.append("title", payload.title);
    formData.append("isPublic", payload.isPublic ? "true" : "false");
    formData.append("longitude", String(payload.longitude));
    formData.append("latitude", String(payload.latitude));

    if (payload.description?.trim()) {
      formData.append("description", payload.description.trim());
    }

    if (payload.speciesId?.trim()) {
      formData.append("speciesId", payload.speciesId.trim());
    }

    for (const tagId of payload.tagIds ?? []) {
      formData.append("tagIds", tagId);
    }

    for (const photo of payload.photos) {
      formData.append("photos", normalizePhotoFileForFormData(photo.file));
      formData.append("photoCaptions", photo.caption?.trim() || "");
    }

    return requestAppJson<PointRecord>("/api/points", {
      method: "POST",
      body: formData,
    });
  }

  return requestAppJson<PointRecord>("/api/points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      groupId: payload.groupId,
      classificationId: payload.classificationId,
      tagIds: payload.tagIds ?? [],
      title: payload.title,
      speciesId: payload.speciesId?.trim() || null,
      description: payload.description?.trim() || null,
      isPublic: payload.isPublic,
      longitude: payload.longitude,
      latitude: payload.latitude,
    }),
  });
}

export async function updatePoint(pointId: string, payload: UpdatePointPayload) {
  return requestAppJson<PointRecord>(`/api/points/detail?pointId=${encodeURIComponent(pointId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function reviewPoint(pointId: string, action: "approve" | "reject") {
  const { data, error } = await supabase.rpc("review_point", {
    p_point_id: pointId,
    p_action: action,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "Nao foi possivel revisar o ponto.",
  );

  return withPointGroupLogo(point);
}

export async function createPointEvent(pointId: string, payload: CreatePointEventPayload) {
  if (payload.photos?.length) {
    const formData = new FormData();

    if (payload.pointEventTypeId) {
      formData.append("pointEventTypeId", payload.pointEventTypeId);
    }

    if (payload.eventType?.trim()) {
      formData.append("eventType", payload.eventType.trim());
    }

    if (payload.description?.trim()) {
      formData.append("description", payload.description.trim());
    }

    if (payload.eventDate?.trim()) {
      formData.append("eventDate", payload.eventDate.trim());
    }

    for (const photo of payload.photos) {
      formData.append("photos", normalizePhotoFileForFormData(photo.file));
      formData.append("photoCaptions", photo.caption?.trim() || "");
    }

    return requestAppJson<PointEventRecord>(
      `/api/points/events?pointId=${encodeURIComponent(pointId)}`,
      {
        method: "POST",
        body: formData,
      },
    );
  }

  return requestAppJson<PointEventRecord>(`/api/points/events?pointId=${encodeURIComponent(pointId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pointEventTypeId: payload.pointEventTypeId || null,
      eventType: payload.eventType || null,
      description: payload.description?.trim() || null,
      eventDate: payload.eventDate || null,
    }),
  });
}

function normalizePhotoFileForFormData(file: File | NativeUploadFile) {
  if (isNativeUploadFile(file)) {
    return {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob;
  }

  return file;
}

function isNativeUploadFile(file: File | NativeUploadFile): file is NativeUploadFile {
  return typeof file === "object" && file !== null && "uri" in file;
}
