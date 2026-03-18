import { withGroupLogo } from "@/src/lib/group-logos";
import { loadPointTags } from "@/src/lib/point-tags";
import { createAdminSupabaseClient, createRequestSupabaseClient, getAccessTokenFromRequest } from "@/src/server/supabase";
import type {
  AdminBootstrapResponse,
  AdminUserGroupMembership,
  AdminUserRecord,
  GroupRecord,
  PointClassificationRecord,
  PointEventTypeRecord,
  PointTagRecord,
  SpeciesRecord,
  UserContext,
  UserProfile,
  UserRole,
} from "@/src/types/domain";

type MembershipQueryRow = {
  user_id: string;
  group_id: string;
  role: UserRole;
  groups: { name: string; code: string } | { name: string; code: string }[];
};

type UserQueryRow = UserProfile;

export async function getRequestUserContext(request: Request): Promise<UserContext | null> {
  const accessToken = getAccessTokenFromRequest(request);

  if (!accessToken) {
    return null;
  }

  const supabase = createRequestSupabaseClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return null;
  }

  const [profileResponse, groupsResponse] = await Promise.all([
    supabase
      .from("users")
      .select("id, auth_user_id, name, email, preferred_group_id, created_at")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase.rpc("list_groups"),
  ]);

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message);
  }

  if (groupsResponse.error) {
    throw new Error(groupsResponse.error.message);
  }

  const profile = profileResponse.data as UserProfile | null;

  if (!profile) {
    return null;
  }

  const groups = ((((groupsResponse.data ?? []) as GroupRecord[]) ?? []) as GroupRecord[]).map(withGroupLogo);
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

export async function loadAdminBootstrap(request: Request): Promise<AdminBootstrapResponse | null> {
  const context = await getRequestUserContext(request);

  if (!context) {
    return null;
  }

  if (!context.is_super_admin && !context.has_group_admin) {
    return null;
  }

  const requestSupabase = createRequestSupabaseClient(request);
  const adminSupabase = createAdminSupabaseClient();
  const manageableGroupIds = context.manageable_groups.map((group) => group.id);
  const visibleGroupIds = context.groups.map((group) => group.id);

  const [
    groupsResponse,
    classificationsResponse,
    pointTagsResponse,
    eventTypesResponse,
    speciesResponse,
    users,
  ] = await Promise.all([
    context.is_super_admin
      ? requestSupabase.rpc("list_groups")
      : Promise.resolve({ data: context.groups, error: null }),
    context.is_super_admin
      ? requestSupabase.rpc("list_point_classifications", { p_only_active: false })
      : Promise.resolve({ data: [] as PointClassificationRecord[], error: null }),
    context.is_super_admin
      ? loadPointTags(requestSupabase, {
          pointClassificationId: null,
          onlyActive: false,
        })
      : Promise.resolve({ data: [] as PointTagRecord[], error: null }),
    context.is_super_admin
      ? requestSupabase.rpc("list_point_event_types", { p_point_classification_id: null })
      : Promise.resolve({ data: [] as PointEventTypeRecord[], error: null }),
    context.is_super_admin
      ? requestSupabase.rpc("list_species", { p_only_active: false })
      : Promise.resolve({ data: [] as SpeciesRecord[], error: null }),
    loadAdminUsers(adminSupabase, {
      isSuperAdmin: context.is_super_admin,
      visibleGroupIds,
      manageableGroupIds,
    }),
  ]);

  if (groupsResponse.error) {
    throw new Error(groupsResponse.error.message);
  }

  if (classificationsResponse.error) {
    throw new Error(classificationsResponse.error.message);
  }

  if (pointTagsResponse.error) {
    throw new Error(pointTagsResponse.error.message);
  }

  if (eventTypesResponse.error) {
    throw new Error(eventTypesResponse.error.message);
  }

  if (speciesResponse.error) {
    throw new Error(speciesResponse.error.message);
  }

  return {
    permissions: {
      canCreateGroups: context.is_super_admin,
      canEditUserIdentity: context.is_super_admin,
      canInviteUsers: context.is_super_admin,
      canManageGlobalCatalogs: context.is_super_admin,
      manageableGroupIds,
    },
    groups: ((((groupsResponse.data ?? []) as GroupRecord[]) ?? []) as GroupRecord[]).map(withGroupLogo),
    users,
    classifications: ((classificationsResponse.data ?? []) as PointClassificationRecord[]) ?? [],
    pointTags: ((pointTagsResponse.data ?? []) as PointTagRecord[]) ?? [],
    eventTypes: ((eventTypesResponse.data ?? []) as PointEventTypeRecord[]) ?? [],
    speciesCatalog: ((speciesResponse.data ?? []) as SpeciesRecord[]) ?? [],
  };
}

export async function requireAdminUserContext(request: Request) {
  const context = await getRequestUserContext(request);

  if (!context) {
    return {
      context: null,
      error: "Nao autenticado.",
      status: 401,
    } as const;
  }

  if (!context.is_super_admin && !context.has_group_admin) {
    return {
      context: null,
      error: "Esta area e reservada para administracao.",
      status: 403,
    } as const;
  }

  return {
    context,
    error: null,
    status: 200,
  } as const;
}

export async function loadAdminUsers(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  options: { isSuperAdmin: boolean; visibleGroupIds: string[]; manageableGroupIds: string[] },
): Promise<AdminUserRecord[]> {
  if (options.isSuperAdmin) {
    const [{ data: usersData, error: usersError }, { data: membershipsData, error: membershipsError }] =
      await Promise.all([
        adminSupabase
          .from("users")
          .select("id, auth_user_id, name, email, preferred_group_id, created_at")
          .order("name", { ascending: true }),
        adminSupabase
          .from("user_groups")
          .select("user_id, group_id, role, groups!inner(name, code)")
          .order("group_id", { ascending: true }),
      ]);

    if (usersError) {
      throw new Error(usersError.message);
    }

    if (membershipsError) {
      throw new Error(membershipsError.message);
    }

    const membershipsByUserId = buildMembershipMap(
      (membershipsData ?? []) as MembershipQueryRow[],
    );

    return ((usersData ?? []) as UserQueryRow[]).map<AdminUserRecord>((user) => ({
      ...user,
      ...resolvePreferredGroup(membershipsByUserId.get(user.id) ?? [], user.preferred_group_id),
      memberships: membershipsByUserId.get(user.id) ?? [],
      hidden_membership_count: 0,
    }));
  }

  if (!options.visibleGroupIds.length) {
    return [];
  }

  const { data: visibleMembershipsData, error: visibleMembershipsError } = await adminSupabase
    .from("user_groups")
    .select("user_id, group_id, role, groups!inner(name, code)")
    .in("group_id", options.visibleGroupIds)
    .order("group_id", { ascending: true });

  if (visibleMembershipsError) {
    throw new Error(visibleMembershipsError.message);
  }

  const visibleMemberships = (visibleMembershipsData ?? []) as MembershipQueryRow[];
  const userIds = Array.from(new Set(visibleMemberships.map((membership) => membership.user_id)));

  if (!userIds.length) {
    return [];
  }

  const [{ data: usersData, error: usersError }, { data: allMembershipsData, error: allMembershipsError }] =
    await Promise.all([
      adminSupabase
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .in("id", userIds)
        .order("name", { ascending: true }),
      adminSupabase
        .from("user_groups")
        .select("user_id, role")
        .in("user_id", userIds),
    ]);

  if (usersError) {
    throw new Error(usersError.message);
  }

  if (allMembershipsError) {
    throw new Error(allMembershipsError.message);
  }

  const visibleMembershipsByUserId = buildMembershipMap(visibleMemberships);
  const totalMembershipCountByUserId = new Map<string, number>();
  const superAdminUserIds = new Set<string>();

  for (const membership of (allMembershipsData ?? []) as { user_id: string; role: UserRole }[]) {
    totalMembershipCountByUserId.set(
      membership.user_id,
      (totalMembershipCountByUserId.get(membership.user_id) ?? 0) + 1,
    );

    if (membership.role === "super_admin") {
      superAdminUserIds.add(membership.user_id);
    }
  }

  return ((usersData ?? []) as UserQueryRow[])
    .filter((user) => !superAdminUserIds.has(user.id))
    .map<AdminUserRecord>((user) => {
      const memberships = visibleMembershipsByUserId.get(user.id) ?? [];
      const totalMemberships = totalMembershipCountByUserId.get(user.id) ?? memberships.length;

      return {
        ...user,
        ...resolvePreferredGroup(memberships, user.preferred_group_id),
        memberships,
        hidden_membership_count: Math.max(totalMemberships - memberships.length, 0),
      };
    });
}

function buildMembershipMap(memberships: MembershipQueryRow[]) {
  const membershipsByUserId = new Map<string, AdminUserGroupMembership[]>();

  for (const membership of memberships) {
    const groupRecord = Array.isArray(membership.groups)
      ? membership.groups[0]
      : membership.groups;

    if (!groupRecord) {
      continue;
    }

    const current = membershipsByUserId.get(membership.user_id) ?? [];
    current.push({
      group_id: membership.group_id,
      group_name: groupRecord.name,
      group_code: groupRecord.code,
      role: membership.role,
    });
    membershipsByUserId.set(membership.user_id, current);
  }

  return membershipsByUserId;
}

function resolvePreferredGroup(
  memberships: AdminUserGroupMembership[],
  preferredGroupId: string | null,
) {
  const preferredMembership = memberships.find((membership) => membership.group_id === preferredGroupId);

  return {
    preferred_group_id: preferredGroupId,
    preferred_group_name: preferredMembership?.group_name ?? null,
    preferred_group_code: preferredMembership?.group_code ?? null,
    preferred_group_hidden: Boolean(preferredGroupId) && !preferredMembership,
  };
}
