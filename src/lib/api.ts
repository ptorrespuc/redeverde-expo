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
  const { data, error } = await supabase.rpc("list_point_events", {
    p_point_id: pointId,
  });

  const rows = requireData(data, error) as PointEventRecord[] | null;
  return (rows ?? []).map((event) => ({
    ...event,
    media: event.media ?? [],
  }));
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
  const { data, error } = await supabase.rpc("create_point", {
    p_group_id: payload.groupId,
    p_point_classification_id: payload.classificationId,
    p_title: payload.title,
    p_longitude: payload.longitude,
    p_latitude: payload.latitude,
    p_description: payload.description?.trim() || null,
    p_status: null,
    p_is_public: payload.isPublic,
    p_species_id: payload.speciesId?.trim() || null,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "O ponto nao foi criado.",
  );

  return withPointGroupLogo(point);
}

export async function updatePoint(pointId: string, payload: UpdatePointPayload) {
  const speciesIdProvided = Object.prototype.hasOwnProperty.call(payload, "speciesId");
  const groupIdProvided = Object.prototype.hasOwnProperty.call(payload, "groupId");
  const { data, error } = await supabase.rpc("update_point", {
    p_point_id: pointId,
    p_group_id: groupIdProvided ? payload.groupId ?? null : null,
    p_point_classification_id: payload.classificationId ?? null,
    p_title: payload.title ?? null,
    p_description: payload.description ?? null,
    p_status: null,
    p_longitude: payload.longitude ?? null,
    p_latitude: payload.latitude ?? null,
    p_is_public: typeof payload.isPublic === "boolean" ? payload.isPublic : null,
    p_species_id: payload.speciesId ?? null,
    p_species_id_provided: speciesIdProvided,
  });

  const point = getSingleRow(
    requireData(data, error) as PointRecord[] | null,
    "O ponto nao foi atualizado.",
  );

  return withPointGroupLogo(point);
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
  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id: payload.pointEventTypeId || null,
    p_event_type: payload.eventType || null,
    p_description: payload.description?.trim() || null,
    p_event_date: payload.eventDate || null,
  });

  const event = getSingleRow(
    requireData(data, error) as PointEventRecord[] | null,
    "O evento nao foi criado.",
  );

  return {
    ...event,
    media: event.media ?? [],
  };
}
