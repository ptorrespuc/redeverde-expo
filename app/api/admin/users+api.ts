import { loadAdminUsers, requireAdminUserContext } from "@/src/server/admin";
import { jsonError } from "@/src/server/http";
import { createAdminSupabaseClient } from "@/src/server/supabase";
import type { AdminUserGroupMembership, AdminUserRecord, UserRole } from "@/src/types/domain";

const validRoles = new Set<UserRole>([
  "super_admin",
  "group_admin",
  "group_approver",
  "group_collaborator",
]);
const manageableRoles = new Set<UserRole>([
  "group_admin",
  "group_approver",
  "group_collaborator",
]);

type MembershipRow = {
  group_id: string;
  role: UserRole;
  groups: { name: string; code: string } | { name: string; code: string }[];
};

export async function POST(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  if (!auth.context.is_super_admin) {
    return jsonError("Apenas superusuarios podem criar usuarios.", 403);
  }

  const body = await request.json().catch(() => null);

  if (
    !body?.name ||
    !body?.email ||
    !body?.groupId ||
    !body?.role ||
    !validRoles.has(body.role)
  ) {
    return jsonError("Payload de criacao de usuario invalido.", 400);
  }

  const admin = createAdminSupabaseClient();
  const email = String(body.email).trim().toLowerCase();
  const name = String(body.name).trim();
  const groupId = String(body.groupId).trim();
  const preferredGroupId =
    typeof body.preferredGroupId === "string" && body.preferredGroupId.trim()
      ? body.preferredGroupId.trim()
      : groupId;
  const redirectTo = new URL("/login", request.url).toString();

  if (preferredGroupId !== groupId) {
    return jsonError(
      "O grupo preferencial inicial precisa ser o mesmo grupo vinculado no cadastro.",
      400,
    );
  }

  const { data: createdUser, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      name,
    },
    redirectTo,
  });

  if (authError || !createdUser.user) {
    return jsonError(authError?.message ?? "Nao foi possivel criar o usuario no Auth.", 400);
  }

  const authUser = createdUser.user;
  const { data: publicUser, error: userError } = await admin
    .from("users")
    .upsert(
      {
        auth_user_id: authUser.id,
        name,
        email,
        preferred_group_id: preferredGroupId,
      },
      {
        onConflict: "auth_user_id",
      },
    )
    .select("id")
    .single();

  if (userError || !publicUser) {
    return jsonError(
      userError?.message ?? "Nao foi possivel sincronizar o usuario publico.",
      400,
    );
  }

  const { error: membershipError } = await admin.from("user_groups").upsert(
    {
      user_id: publicUser.id,
      group_id: groupId,
      role: body.role,
    },
    {
      onConflict: "user_id,group_id",
    },
  );

  if (membershipError) {
    return jsonError(membershipError.message, 400);
  }

  return Response.json(
    {
      authUserId: authUser.id,
      publicUserId: publicUser.id,
      email,
      inviteSent: true,
      groupId,
      preferredGroupId,
      role: body.role,
      redirectTo,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return jsonError("Usuario nao informado.", 400);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Payload de atualizacao invalido.", 400);
  }

  const currentUser = auth.context;
  const admin = createAdminSupabaseClient();
  const manageableGroupIds = new Set(currentUser.manageable_groups.map((group) => group.id));
  const [{ data: existingUser, error: existingUserError }, { data: existingMembershipsData, error: existingMembershipsError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("user_groups")
        .select("group_id, role, groups!inner(name, code)")
        .eq("user_id", id)
        .order("group_id", { ascending: true }),
    ]);

  if (existingUserError) {
    return jsonError(existingUserError.message, 400);
  }

  if (existingMembershipsError) {
    return jsonError(existingMembershipsError.message, 400);
  }

  if (!existingUser) {
    return jsonError("Usuario nao encontrado.", 404);
  }

  const existingMemberships = normalizeMembershipRows(
    (existingMembershipsData ?? []) as MembershipRow[],
  );
  const targetIsSuperAdmin = existingMemberships.some(
    (membership) => membership.role === "super_admin",
  );
  const visibleExistingMemberships = currentUser.is_super_admin
    ? existingMemberships
    : existingMemberships.filter((membership) => manageableGroupIds.has(membership.group_id));

  if (!currentUser.is_super_admin && !visibleExistingMemberships.length) {
    return jsonError("Usuario fora do seu escopo de administracao.", 404);
  }

  if (!currentUser.is_super_admin && targetIsSuperAdmin) {
    return jsonError("Administradores de grupo nao podem editar superusuarios.", 403);
  }

  const nextName =
    currentUser.is_super_admin &&
    typeof body.name === "string" &&
    body.name.trim()
      ? body.name.trim()
      : existingUser.name;
  const nextEmail =
    currentUser.is_super_admin &&
    typeof body.email === "string" &&
    body.email.trim()
      ? body.email.trim().toLowerCase()
      : existingUser.email;

  let preferredGroupId: string | null | undefined;
  let memberships;

  try {
    preferredGroupId = parsePreferredGroupId(body.preferredGroupId);
    memberships = parseMemberships(
      body.memberships,
      currentUser.is_super_admin ? validRoles : manageableRoles,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Os vinculos do usuario nao puderam ser processados.",
      400,
    );
  }

  if (currentUser.is_super_admin && (!nextName || !nextEmail)) {
    return jsonError("Nome e e-mail validos sao obrigatorios para editar o usuario.", 400);
  }

  if (memberships) {
    const membershipGroupIds = memberships.map((membership) => membership.groupId);

    if (!currentUser.is_super_admin) {
      if (membershipGroupIds.some((groupId) => !manageableGroupIds.has(groupId))) {
        return jsonError("Voce so pode alterar papeis nos grupos que administra.", 403);
      }
    } else if (membershipGroupIds.length) {
      const { data: groups, error: groupsError } = await admin
        .from("groups")
        .select("id")
        .in("id", membershipGroupIds);

      if (groupsError) {
        return jsonError(groupsError.message, 400);
      }

      if ((groups ?? []).length !== membershipGroupIds.length) {
        return jsonError("Um ou mais grupos informados nao existem.", 400);
      }
    }
  }

  const resultingMemberships = memberships
    ? mergeMemberships(existingMemberships, memberships, manageableGroupIds, currentUser.is_super_admin)
    : existingMemberships;
  const resultingMembershipGroupIds = new Set(
    resultingMemberships.map((membership) => membership.group_id),
  );

  if (
    preferredGroupId &&
    !currentUser.is_super_admin &&
    !manageableGroupIds.has(preferredGroupId)
  ) {
    return jsonError(
      "Voce so pode definir como preferencial um grupo que administra.",
      403,
    );
  }

  if (preferredGroupId && !resultingMembershipGroupIds.has(preferredGroupId)) {
    return jsonError(
      "O grupo preferencial precisa estar entre os grupos vinculados ao usuario.",
      400,
    );
  }

  const nextPreferredGroupId = resolveNextPreferredGroupId(
    preferredGroupId,
    existingUser.preferred_group_id,
    resultingMemberships,
    Boolean(memberships),
  );

  if (currentUser.is_super_admin) {
    const { error: authError } = await admin.auth.admin.updateUserById(existingUser.auth_user_id, {
      email: nextEmail,
      user_metadata: {
        name: nextName,
      },
    });

    if (authError) {
      return jsonError(authError.message ?? "Nao foi possivel atualizar o usuario no Auth.", 400);
    }
  }

  if (memberships) {
    let deleteMembershipsQuery = admin.from("user_groups").delete().eq("user_id", id);

    if (!currentUser.is_super_admin) {
      deleteMembershipsQuery = deleteMembershipsQuery.in(
        "group_id",
        Array.from(manageableGroupIds),
      );
    }

    const { error: deleteMembershipsError } = await deleteMembershipsQuery;

    if (deleteMembershipsError) {
      return jsonError(deleteMembershipsError.message, 400);
    }

    if (memberships.length) {
      const { error: insertMembershipsError } = await admin.from("user_groups").insert(
        memberships.map((membership) => ({
          user_id: id,
          group_id: membership.groupId,
          role: membership.role,
        })),
      );

      if (insertMembershipsError) {
        return jsonError(insertMembershipsError.message, 400);
      }
    }
  }

  const publicUserUpdatePayload: {
    name?: string;
    email?: string;
    preferred_group_id?: string | null;
  } = {};

  if (currentUser.is_super_admin) {
    publicUserUpdatePayload.name = nextName;
    publicUserUpdatePayload.email = nextEmail;
  }

  if (
    nextPreferredGroupId !== existingUser.preferred_group_id ||
    Boolean(memberships) ||
    currentUser.is_super_admin
  ) {
    publicUserUpdatePayload.preferred_group_id = nextPreferredGroupId;
  }

  if (Object.keys(publicUserUpdatePayload).length) {
    const { error: publicUserError } = await admin
      .from("users")
      .update(publicUserUpdatePayload)
      .eq("id", id);

    if (publicUserError) {
      return jsonError(publicUserError.message, 400);
    }
  }

  let updatedUser: AdminUserRecord | null;

  try {
    updatedUser = await loadAdminUser(
      admin,
      id,
      currentUser.is_super_admin ? null : manageableGroupIds,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Nao foi possivel recarregar o usuario atualizado.",
      400,
    );
  }

  if (!updatedUser) {
    return jsonError("Usuario nao encontrado.", 404);
  }

  return Response.json(updatedUser);
}

export async function GET(request: Request) {
  const auth = await requireAdminUserContext(request);

  if (!auth.context) {
    return jsonError(auth.error, auth.status);
  }

  try {
    const users = await loadAdminUsers(createAdminSupabaseClient(), {
      isSuperAdmin: auth.context.is_super_admin,
      visibleGroupIds: auth.context.groups.map((group) => group.id),
      manageableGroupIds: auth.context.manageable_groups.map((group) => group.id),
    });

    return Response.json(users);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Falha ao listar usuarios.", 400);
  }
}

async function loadAdminUser(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  visibleGroupIds: Set<string> | null,
): Promise<AdminUserRecord | null> {
  const [{ data: user, error: userError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, auth_user_id, name, email, preferred_group_id, created_at")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("user_groups")
        .select("group_id, role, groups!inner(name, code)")
        .eq("user_id", userId)
        .order("group_id", { ascending: true }),
    ]);

  if (userError) {
    throw new Error(userError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  if (!user) {
    return null;
  }

  const normalizedMemberships = normalizeMembershipRows((memberships ?? []) as MembershipRow[]);
  const visibleMemberships = visibleGroupIds
    ? normalizedMemberships.filter((membership) => visibleGroupIds.has(membership.group_id))
    : normalizedMemberships;

  return {
    ...user,
    ...resolvePreferredGroup(visibleMemberships, user.preferred_group_id),
    memberships: visibleMemberships,
    hidden_membership_count: Math.max(
      normalizedMemberships.length - visibleMemberships.length,
      0,
    ),
  };
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

function normalizeMembershipRows(memberships: MembershipRow[]): AdminUserGroupMembership[] {
  return memberships
    .map((membership) => {
      const groupRecord = Array.isArray(membership.groups)
        ? membership.groups[0]
        : membership.groups;

      if (!groupRecord) {
        return null;
      }

      return {
        group_id: membership.group_id,
        group_name: groupRecord.name,
        group_code: groupRecord.code,
        role: membership.role,
      };
    })
    .filter((membership): membership is NonNullable<typeof membership> => membership !== null);
}

function parseMemberships(rawMemberships: unknown, allowedRoles: Set<UserRole>) {
  if (rawMemberships === undefined) {
    return null;
  }

  if (!Array.isArray(rawMemberships)) {
    throw new Error("Os vinculos do usuario precisam ser enviados em lista.");
  }

  const normalized = new Map<string, UserRole>();

  for (const membership of rawMemberships) {
    if (!membership || typeof membership !== "object") {
      throw new Error("Foi encontrado um vinculo de grupo invalido.");
    }

    const groupId =
      typeof (membership as { groupId?: unknown }).groupId === "string"
        ? (membership as { groupId: string }).groupId.trim()
        : "";
    const role = (membership as { role?: unknown }).role;

    if (!groupId || !role || !allowedRoles.has(role as UserRole)) {
      throw new Error("Foi encontrado um vinculo de grupo invalido.");
    }

    normalized.set(groupId, role as UserRole);
  }

  return Array.from(normalized.entries()).map(([groupId, role]) => ({
    groupId,
    role,
  }));
}

function parsePreferredGroupId(rawPreferredGroupId: unknown) {
  if (rawPreferredGroupId === undefined) {
    return undefined;
  }

  if (rawPreferredGroupId === null) {
    return null;
  }

  if (typeof rawPreferredGroupId !== "string") {
    throw new Error("O grupo preferencial informado e invalido.");
  }

  const normalized = rawPreferredGroupId.trim();
  return normalized || null;
}

function mergeMemberships(
  existingMemberships: AdminUserGroupMembership[],
  incomingMemberships: { groupId: string; role: UserRole }[],
  manageableGroupIds: Set<string>,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) {
    return incomingMemberships.map((membership) => ({
      group_id: membership.groupId,
      group_name:
        existingMemberships.find((item) => item.group_id === membership.groupId)?.group_name ?? "",
      group_code:
        existingMemberships.find((item) => item.group_id === membership.groupId)?.group_code ?? "",
      role: membership.role,
    }));
  }

  const preservedMemberships = existingMemberships.filter(
    (membership) => !manageableGroupIds.has(membership.group_id),
  );
  const editableMemberships = incomingMemberships.map((membership) => ({
    group_id: membership.groupId,
    group_name:
      existingMemberships.find((item) => item.group_id === membership.groupId)?.group_name ?? "",
    group_code:
      existingMemberships.find((item) => item.group_id === membership.groupId)?.group_code ?? "",
    role: membership.role,
  }));

  return [...preservedMemberships, ...editableMemberships];
}

function resolveNextPreferredGroupId(
  requestedPreferredGroupId: string | null | undefined,
  existingPreferredGroupId: string | null,
  resultingMemberships: AdminUserGroupMembership[],
  membershipsWereUpdated: boolean,
) {
  const resultingGroupIds = new Set(resultingMemberships.map((membership) => membership.group_id));

  if (requestedPreferredGroupId !== undefined) {
    return requestedPreferredGroupId;
  }

  if (existingPreferredGroupId && resultingGroupIds.has(existingPreferredGroupId)) {
    return existingPreferredGroupId;
  }

  if (membershipsWereUpdated) {
    return resultingMemberships[0]?.group_id ?? null;
  }

  return existingPreferredGroupId;
}
