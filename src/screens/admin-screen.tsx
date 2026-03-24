import { Picker } from "@react-native-picker/picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Toast from "react-native-toast-message";

import {
  createAdminGroup,
  createAdminPointClassification,
  createAdminPointEventType,
  createAdminPointTag,
  createAdminSpecies,
  createAdminUser,
  deleteAdminPointClassification,
  deleteAdminPointEventType,
  deleteAdminSpecies,
  deleteAdminPointTag,
  loadAdminBootstrap,
  updateAdminGroup,
  updateAdminPointClassification,
  updateAdminPointEventType,
  updateAdminPointTag,
  updateAdminSpecies,
  updateAdminUser,
} from "@/src/lib/admin-web-api";
import { useAppContext } from "@/src/providers/app-provider";
import { GroupAvatar } from "@/src/components/groups/group-avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field, FieldHint, FieldInput, FieldLabel, FieldSwitch } from "@/src/components/ui/field";
import { LoadingView } from "@/src/components/ui/loading-view";
import { ModalSheet } from "@/src/components/ui/modal-sheet";
import { Screen } from "@/src/components/ui/screen";
import { colors, spacing } from "@/src/theme";
import type {
  AdminBootstrapResponse,
  AdminUserRecord,
  GroupRecord,
  PointClassificationRecord,
  PointEventTypeRecord,
  PointTagRecord,
  SpeciesRecord,
  UpdateAdminUserMembershipPayload,
  UserRole,
} from "@/src/types/domain";
import { USER_ROLE_LABELS, USER_ROLE_OPTIONS } from "@/src/types/domain";

type AdminSection =
  | "groups"
  | "users"
  | "classifications"
  | "tags"
  | "event-types"
  | "species";

type ModalMode = "create" | "edit";

type ModalState =
  | {
      section: AdminSection;
      mode: ModalMode;
      id?: string;
    }
  | null;

interface GroupFormState {
  name: string;
  code: string;
  isPublic: boolean;
  acceptsPointCollaboration: boolean;
  maxPendingPointsPerCollaborator: string;
  logoFile: File | null;
  logoPreviewUrl: string | null;
  removeLogo: boolean;
}

interface EditableMembership {
  groupId: string;
  role: UserRole;
}

interface UserFormState {
  name: string;
  email: string;
  preferredGroupId: string;
  memberships: EditableMembership[];
}

interface ClassificationFormState {
  name: string;
  slug: string;
  requiresSpecies: boolean;
  isActive: boolean;
  markerColor: string;
}

interface TagFormState {
  pointClassificationId: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

interface EventTypeFormState {
  pointClassificationId: string;
  name: string;
  slug: string;
}

interface SpeciesFormState {
  commonName: string;
  scientificName: string;
  origin: "native" | "exotic";
  isActive: boolean;
}

const SECTION_LABELS: Record<AdminSection, string> = {
  groups: "Grupos",
  users: "Usuarios",
  classifications: "Classificacoes",
  tags: "Tags",
  "event-types": "Tipos de evento",
  species: "Especies",
};

const SECTION_SINGULAR_LABELS: Record<AdminSection, string> = {
  groups: "grupo",
  users: "usuario",
  classifications: "classificacao",
  tags: "tag",
  "event-types": "tipo de evento",
  species: "especie",
};

const groupLogoFileInputStyle: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
  color: colors.text,
  fontSize: 14,
  padding: `${spacing.sm}px ${spacing.md}px`,
};

const groupLogoImageStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  borderRadius: 24,
  height: 96,
  objectFit: "cover",
  width: 96,
};

function sortByLocale<T>(items: T[], selector: (item: T) => string) {
  return [...items].sort((a, b) => selector(a).localeCompare(selector(b), "pt-BR"));
}

function buildDefaultGroupForm(): GroupFormState {
  return {
    name: "",
    code: "",
    isPublic: false,
    acceptsPointCollaboration: false,
    maxPendingPointsPerCollaborator: "5",
    logoFile: null,
    logoPreviewUrl: null,
    removeLogo: false,
  };
}

function buildDefaultClassificationForm(): ClassificationFormState {
  return {
    name: "",
    slug: "",
    requiresSpecies: false,
    isActive: true,
    markerColor: "#6a5a91",
  };
}

function buildDefaultTagForm(classificationId = ""): TagFormState {
  return {
    pointClassificationId: classificationId,
    name: "",
    slug: "",
    description: "",
    isActive: true,
  };
}

function buildDefaultEventTypeForm(classificationId = ""): EventTypeFormState {
  return {
    pointClassificationId: classificationId,
    name: "",
    slug: "",
  };
}

function buildDefaultSpeciesForm(): SpeciesFormState {
  return {
    commonName: "",
    scientificName: "",
    origin: "native",
    isActive: true,
  };
}

function buildDefaultUserForm(groups: GroupRecord[]): UserFormState {
  const defaultGroupId = groups[0]?.id ?? "";

  return {
    name: "",
    email: "",
    preferredGroupId: defaultGroupId,
    memberships: defaultGroupId
      ? [
          {
            groupId: defaultGroupId,
            role: "group_collaborator",
          },
        ]
      : [],
  };
}

function buildGroupFormFromRecord(group: GroupRecord): GroupFormState {
  return {
    name: group.name,
    code: group.code,
    isPublic: group.is_public,
    acceptsPointCollaboration: group.accepts_point_collaboration,
    maxPendingPointsPerCollaborator: String(group.max_pending_points_per_collaborator ?? 5),
    logoFile: null,
    logoPreviewUrl: group.logo_url ?? null,
    removeLogo: false,
  };
}

function buildUserFormFromRecord(user: AdminUserRecord): UserFormState {
  return {
    name: user.name,
    email: user.email,
    preferredGroupId: user.preferred_group_id ?? "",
    memberships: user.memberships.map((membership) => ({
      groupId: membership.group_id,
      role: membership.role,
    })),
  };
}

function buildClassificationFormFromRecord(
  classification: PointClassificationRecord,
): ClassificationFormState {
  return {
    name: classification.name,
    slug: classification.slug,
    requiresSpecies: classification.requires_species,
    isActive: classification.is_active,
    markerColor: classification.marker_color,
  };
}

function buildTagFormFromRecord(tag: PointTagRecord): TagFormState {
  return {
    pointClassificationId: tag.point_classification_id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description ?? "",
    isActive: tag.is_active,
  };
}

function buildEventTypeFormFromRecord(pointEventType: PointEventTypeRecord): EventTypeFormState {
  return {
    pointClassificationId: pointEventType.point_classification_id,
    name: pointEventType.name,
    slug: pointEventType.slug,
  };
}

function buildSpeciesFormFromRecord(species: SpeciesRecord): SpeciesFormState {
  return {
    commonName: species.common_name,
    scientificName: species.scientific_name,
    origin: species.origin,
    isActive: species.is_active,
  };
}

function PickerField({
  label,
  selectedValue,
  onValueChange,
  items,
  enabled = true,
}: {
  label: string;
  selectedValue: string;
  onValueChange: (value: string) => void;
  items: { label: string; value: string }[];
  enabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <View style={[styles.pickerShell, !enabled ? styles.disabledShell : null]}>
        <Picker enabled={enabled} selectedValue={selectedValue} onValueChange={(value) => onValueChange(String(value))}>
          {items.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </Field>
  );
}

export function AdminScreen() {
  const { isAuthenticated, isReady, refreshBootstrap, userContext } = useAppContext();
  const [bootstrap, setBootstrap] = useState<AdminBootstrapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("groups");
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  const [groupForm, setGroupForm] = useState<GroupFormState>(buildDefaultGroupForm);
  const [userForm, setUserForm] = useState<UserFormState>(buildDefaultUserForm([]));
  const [classificationForm, setClassificationForm] =
    useState<ClassificationFormState>(buildDefaultClassificationForm);
  const [tagForm, setTagForm] = useState<TagFormState>(buildDefaultTagForm());
  const [eventTypeForm, setEventTypeForm] = useState<EventTypeFormState>(buildDefaultEventTypeForm());
  const [speciesForm, setSpeciesForm] = useState<SpeciesFormState>(buildDefaultSpeciesForm);
  const localGroupLogoPreviewRef = useRef<string | null>(null);

  const isWeb = Platform.OS === "web";
  const canAccessAdmin = Boolean(userContext?.is_super_admin || userContext?.has_group_admin);
  const permissions = bootstrap?.permissions;
  const availableSections = useMemo(() => {
    if (!permissions?.canManageGlobalCatalogs) {
      return ["groups", "users"] as AdminSection[];
    }

    return ["groups", "users", "classifications", "tags", "event-types", "species"] as AdminSection[];
  }, [permissions?.canManageGlobalCatalogs]);

  const sortedGroups = useMemo(
    () => sortByLocale(bootstrap?.groups ?? [], (group) => group.name),
    [bootstrap?.groups],
  );
  const sortedUsers = useMemo(
    () => sortByLocale(bootstrap?.users ?? [], (user) => user.name),
    [bootstrap?.users],
  );
  const sortedClassifications = useMemo(
    () => sortByLocale(bootstrap?.classifications ?? [], (classification) => classification.name),
    [bootstrap?.classifications],
  );
  const sortedTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    const tags = [...(bootstrap?.pointTags ?? [])].sort((a, b) => {
      const byClassification = (a.point_classification_name ?? "").localeCompare(
        b.point_classification_name ?? "",
        "pt-BR",
      );
      return byClassification !== 0 ? byClassification : a.name.localeCompare(b.name, "pt-BR");
    });

    if (!query) {
      return tags;
    }

    return tags.filter((tag) => {
      const haystack = `${tag.name} ${tag.slug} ${tag.description ?? ""} ${tag.point_classification_name ?? ""}`
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [bootstrap?.pointTags, tagSearch]);
  const sortedEventTypes = useMemo(
    () =>
      [...(bootstrap?.eventTypes ?? [])].sort((a, b) => {
        const byClassification = a.point_classification_name.localeCompare(
          b.point_classification_name,
          "pt-BR",
        );
        return byClassification !== 0 ? byClassification : a.name.localeCompare(b.name, "pt-BR");
      }),
    [bootstrap?.eventTypes],
  );
  const filteredSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();
    const items = sortByLocale(bootstrap?.speciesCatalog ?? [], (species) => species.common_name);

    if (!query) {
      return items;
    }

    return items.filter((species) => {
      const haystack = `${species.common_name} ${species.scientific_name}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [bootstrap?.speciesCatalog, speciesSearch]);
  const editableGroups = useMemo(() => {
    if (!bootstrap) {
      return [];
    }

    return sortedGroups.filter(
      (group) =>
        bootstrap.permissions.canCreateGroups ||
        bootstrap.permissions.manageableGroupIds.includes(group.id),
    );
  }, [bootstrap, sortedGroups]);
  const classificationOptions = useMemo(
    () =>
      (bootstrap?.classifications ?? [])
        .filter((classification) => classification.is_active || modalState?.mode === "edit")
        .map((classification) => ({
          label: classification.name,
          value: classification.id,
        })),
    [bootstrap?.classifications, modalState?.mode],
  );
  const assignableUserRoleOptions = useMemo(
    () =>
      permissions?.canEditUserIdentity
        ? USER_ROLE_OPTIONS
        : USER_ROLE_OPTIONS.filter((option) => option.value !== "super_admin"),
    [permissions?.canEditUserIdentity],
  );

  const reloadAdminData = useCallback(async () => {
    setIsLoading(true);

    try {
      const nextBootstrap = await loadAdminBootstrap();
      setBootstrap(nextBootstrap);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !isAuthenticated || !canAccessAdmin || !isWeb) {
      setIsLoading(false);
      return;
    }

    void reloadAdminData();
  }, [canAccessAdmin, isAuthenticated, isReady, isWeb, reloadAdminData]);

  useEffect(() => {
    if (!availableSections.includes(activeSection)) {
      setActiveSection(availableSections[0] ?? "groups");
    }
  }, [activeSection, availableSections]);

  useEffect(() => {
    return () => {
      if (isWeb && localGroupLogoPreviewRef.current && typeof URL !== "undefined") {
        URL.revokeObjectURL(localGroupLogoPreviewRef.current);
      }
    };
  }, [isWeb]);

  const handleGroupLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      return;
    }

    if (localGroupLogoPreviewRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(localGroupLogoPreviewRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    localGroupLogoPreviewRef.current = nextPreviewUrl;
    setGroupForm((current) => ({
      ...current,
      logoFile: nextFile,
      logoPreviewUrl: nextPreviewUrl,
      removeLogo: false,
    }));
    event.currentTarget.value = "";
  };

  const handleGroupLogoRemove = () => {
    if (localGroupLogoPreviewRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(localGroupLogoPreviewRef.current);
      localGroupLogoPreviewRef.current = null;
    }

    setGroupForm((current) => ({
      ...current,
      logoFile: null,
      logoPreviewUrl: null,
      removeLogo: true,
    }));
  };

  const openModal = (section: AdminSection, mode: ModalMode, id?: string) => {
    if (!bootstrap) {
      return;
    }

    if (section === "groups") {
      const group = sortedGroups.find((item) => item.id === id);
      setGroupForm(group && mode === "edit" ? buildGroupFormFromRecord(group) : buildDefaultGroupForm());
    }

    if (section === "users") {
      const user = sortedUsers.find((item) => item.id === id);
      setUserForm(
        user && mode === "edit"
          ? buildUserFormFromRecord(user)
          : buildDefaultUserForm(editableGroups.length ? editableGroups : sortedGroups),
      );
    }

    if (section === "classifications") {
      const classification = sortedClassifications.find((item) => item.id === id);
      setClassificationForm(
        classification && mode === "edit"
          ? buildClassificationFormFromRecord(classification)
          : buildDefaultClassificationForm(),
      );
    }

    if (section === "tags") {
      const tag = sortedTags.find((item) => item.id === id);
      setTagForm(
        tag && mode === "edit"
          ? buildTagFormFromRecord(tag)
          : buildDefaultTagForm(classificationOptions[0]?.value ?? ""),
      );
    }

    if (section === "event-types") {
      const pointEventType = sortedEventTypes.find((item) => item.id === id);
      setEventTypeForm(
        pointEventType && mode === "edit"
          ? buildEventTypeFormFromRecord(pointEventType)
          : buildDefaultEventTypeForm(classificationOptions[0]?.value ?? ""),
      );
    }

    if (section === "species") {
      const species = filteredSpecies.find((item) => item.id === id);
      setSpeciesForm(
        species && mode === "edit" ? buildSpeciesFormFromRecord(species) : buildDefaultSpeciesForm(),
      );
    }

    setModalState({ section, mode, id });
  };

  const closeModal = () => {
    setModalState(null);
    setIsSubmitting(false);
  };

  const refreshAll = async () => {
    await Promise.all([reloadAdminData(), refreshBootstrap()]);
  };

  const submitCurrentModal = async () => {
    if (!modalState) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (modalState.section === "groups") {
        if (modalState.mode === "create") {
          await createAdminGroup({
            name: groupForm.name,
            code: groupForm.code,
            isPublic: groupForm.isPublic,
            acceptsPointCollaboration: groupForm.acceptsPointCollaboration,
            maxPendingPointsPerCollaborator: Number(groupForm.maxPendingPointsPerCollaborator || 5),
            logo: groupForm.logoFile ?? undefined,
          });
        } else if (modalState.id) {
          await updateAdminGroup(modalState.id, {
            name: groupForm.name,
            code: groupForm.code,
            isPublic: groupForm.isPublic,
            acceptsPointCollaboration: groupForm.acceptsPointCollaboration,
            maxPendingPointsPerCollaborator: Number(groupForm.maxPendingPointsPerCollaborator || 5),
            logo: groupForm.logoFile ?? undefined,
            removeLogo: groupForm.removeLogo,
          });
        }
      }

      if (modalState.section === "users") {
        if (!userForm.memberships.length) {
          throw new Error("Informe ao menos um vinculo de grupo.");
        }

        if (modalState.mode === "create") {
          if (userForm.memberships.length > 1) {
            throw new Error("Crie o usuario com um grupo inicial e depois ajuste os demais vinculos.");
          }

          await createAdminUser({
            name: userForm.name,
            email: userForm.email,
            groupId: userForm.memberships[0].groupId,
            preferredGroupId: userForm.memberships[0].groupId,
            role: userForm.memberships[0].role,
          });
        } else if (modalState.id) {
          const memberships: UpdateAdminUserMembershipPayload[] = userForm.memberships.map((membership) => ({
            groupId: membership.groupId,
            role: membership.role,
          }));

          await updateAdminUser(modalState.id, {
            ...(permissions?.canEditUserIdentity
              ? {
                  name: userForm.name,
                  email: userForm.email,
                }
              : {}),
            preferredGroupId: userForm.preferredGroupId || null,
            memberships,
          });
        }
      }

      if (modalState.section === "classifications") {
        if (modalState.mode === "create") {
          await createAdminPointClassification(classificationForm);
        } else if (modalState.id) {
          await updateAdminPointClassification(modalState.id, classificationForm);
        }
      }

      if (modalState.section === "tags") {
        if (modalState.mode === "create") {
          await createAdminPointTag(tagForm);
        } else if (modalState.id) {
          await updateAdminPointTag(modalState.id, tagForm);
        }
      }

      if (modalState.section === "event-types") {
        if (modalState.mode === "create") {
          await createAdminPointEventType(eventTypeForm);
        } else if (modalState.id) {
          await updateAdminPointEventType(modalState.id, eventTypeForm);
        }
      }

      if (modalState.section === "species") {
        if (modalState.mode === "create") {
          await createAdminSpecies(speciesForm);
        } else if (modalState.id) {
          await updateAdminSpecies(modalState.id, speciesForm);
        }
      }

      await refreshAll();
      Toast.show({
        type: "success",
        text1: "Administracao atualizada",
      });
      closeModal();
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error instanceof Error ? error.message : "Nao foi possivel salvar.",
      });
      setIsSubmitting(false);
    }
  };

  const confirmDeleteClassification = async (classification: PointClassificationRecord) => {
    if (!globalThis.confirm?.(`Excluir a classificacao "${classification.name}"?`)) {
      return;
    }

    try {
      await deleteAdminPointClassification(classification.id);
      await refreshAll();
      Toast.show({
        type: "success",
        text1: "Classificacao removida",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error instanceof Error ? error.message : "Nao foi possivel excluir.",
      });
    }
  };

  const confirmDeleteTag = async (tag: PointTagRecord) => {
    if (!globalThis.confirm?.(`Excluir a tag "${tag.name}"?`)) {
      return;
    }

    try {
      await deleteAdminPointTag(tag.id);
      await refreshAll();
      Toast.show({
        type: "success",
        text1: "Tag removida",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error instanceof Error ? error.message : "Nao foi possivel excluir.",
      });
    }
  };

  const confirmDeleteEventType = async (pointEventType: PointEventTypeRecord) => {
    if (!globalThis.confirm?.(`Excluir o tipo de evento "${pointEventType.name}"?`)) {
      return;
    }

    try {
      await deleteAdminPointEventType(pointEventType.id);
      await refreshAll();
      Toast.show({
        type: "success",
        text1: "Tipo de evento removido",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error instanceof Error ? error.message : "Nao foi possivel excluir.",
      });
    }
  };

  const confirmDeleteSpecies = async (species: SpeciesRecord) => {
    if (!globalThis.confirm?.(`Excluir a especie "${species.common_name}"?`)) {
      return;
    }

    try {
      await deleteAdminSpecies(species.id);
      await refreshAll();
      Toast.show({
        type: "success",
        text1: "Especie removida",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: error instanceof Error ? error.message : "Nao foi possivel excluir.",
      });
    }
  };

  if (!isReady) {
    return <LoadingView label="Preparando a administracao..." />;
  }

  if (!isAuthenticated || !userContext) {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>Administracao</Text>
          <Text style={styles.description}>Entre para acessar a area administrativa.</Text>
        </Card>
      </Screen>
    );
  }

  if (!canAccessAdmin) {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>Acesso restrito</Text>
          <Text style={styles.description}>
            Esta area e reservada para superusuarios e administradores de grupo.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (!isWeb) {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>Administracao</Text>
          <Text style={styles.description}>
            A administracao completa desta primeira fase esta disponivel na versao web do Expo.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (isLoading || !bootstrap) {
    return <LoadingView label="Carregando a administracao..." />;
  }

  return (
    <Screen>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              {bootstrap.permissions.canManageGlobalCatalogs
                ? "Gestao da plataforma"
                : "Gestao dos grupos"}
            </Text>
            <Text style={styles.description}>
              {bootstrap.permissions.canManageGlobalCatalogs
                ? "Gerencie grupos, usuarios e catalogos do sistema."
                : "Gerencie os grupos e usuarios dentro do seu escopo."}
            </Text>
          </View>
          <Button compact label="Atualizar" onPress={() => void refreshAll()} variant="secondary" />
        </View>
        <View style={styles.tabRow}>
          {availableSections.map((section) => (
            <Pressable
              key={section}
              onPress={() => setActiveSection(section)}
              style={[styles.tabButton, activeSection === section ? styles.tabButtonActive : null]}
            >
              <Text style={[styles.tabLabel, activeSection === section ? styles.tabLabelActive : null]}>
                {SECTION_LABELS[section]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {activeSection === "groups" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Grupos</Text>
              <Text style={styles.sectionDescription}>
                {bootstrap.permissions.canCreateGroups
                  ? "Cadastre novos grupos e ajuste visibilidade, colaboracao e limites."
                  : "Visualize os grupos do seu escopo e ajuste apenas os que voce administra."}
              </Text>
            </View>
            {bootstrap.permissions.canCreateGroups ? (
              <Button compact label="Novo grupo" onPress={() => openModal("groups", "create")} />
            ) : null}
          </View>
          {sortedGroups.map((group) => {
            const canEdit =
              bootstrap.permissions.canCreateGroups ||
              bootstrap.permissions.manageableGroupIds.includes(group.id);

            return (
              <Card key={group.id}>
                <View style={styles.listRowHeader}>
                  <View style={styles.listRowIdentity}>
                    <GroupAvatar logoUrl={group.logo_url} name={group.name} size={40} />
                    <View style={styles.listRowCopy}>
                      <Text style={styles.listRowTitle}>{group.name}</Text>
                      <Text style={styles.listRowSubtitle}>@{group.code}</Text>
                    </View>
                  </View>
                  {canEdit ? (
                    <Button compact label="Editar" onPress={() => openModal("groups", "edit", group.id)} variant="ghost" />
                  ) : null}
                </View>
                <View style={styles.badgeWrap}>
                  <Badge tone={group.is_public ? "success" : "default"}>
                    {group.is_public ? "Publico" : "Privado"}
                  </Badge>
                  <Badge tone={group.accepts_point_collaboration ? "warning" : "default"}>
                    {group.accepts_point_collaboration ? "Aceita colaboracao" : "Sem colaboracao"}
                  </Badge>
                  {group.my_role ? <Badge>{USER_ROLE_LABELS[group.my_role]}</Badge> : null}
                  {group.logo_url ? <Badge>Com logo</Badge> : null}
                </View>
                <Text style={styles.metaText}>
                  Limite de pendencias por colaborador: {group.max_pending_points_per_collaborator}
                </Text>
              </Card>
            );
          })}
        </Card>
      ) : null}

      {activeSection === "users" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Usuarios</Text>
              <Text style={styles.sectionDescription}>
                {bootstrap.permissions.canInviteUsers
                  ? "Convide novos usuarios e gerencie seus vinculos de grupo."
                  : "Ajuste os papeis dos usuarios apenas nos grupos que voce administra."}
              </Text>
            </View>
            {bootstrap.permissions.canInviteUsers ? (
              <Button
                compact
                label="Novo usuario"
                onPress={() => openModal("users", "create")}
                disabled={!sortedGroups.length}
              />
            ) : null}
          </View>
          {sortedUsers.length ? (
            sortedUsers.map((user) => (
              <Card key={user.id}>
                <View style={styles.listRowHeader}>
                  <View style={styles.listRowCopy}>
                    <Text style={styles.listRowTitle}>{user.name}</Text>
                    <Text style={styles.listRowSubtitle}>{user.email}</Text>
                  </View>
                  <Button compact label="Editar" onPress={() => openModal("users", "edit", user.id)} variant="ghost" />
                </View>
                <View style={styles.badgeWrap}>
                  {user.memberships.map((membership) => (
                    <Badge key={`${user.id}-${membership.group_id}`}>
                      {membership.group_name}: {USER_ROLE_LABELS[membership.role]}
                    </Badge>
                  ))}
                </View>
                {user.preferred_group_name ? (
                  <Text style={styles.metaText}>Grupo preferencial: {user.preferred_group_name}</Text>
                ) : null}
                {user.hidden_membership_count ? (
                  <Text style={styles.metaText}>
                    Possui mais {user.hidden_membership_count} vinculo(s) fora do seu escopo.
                  </Text>
                ) : null}
                {user.preferred_group_hidden ? (
                  <Text style={styles.metaText}>
                    O grupo preferencial atual esta fora do seu escopo de visualizacao.
                  </Text>
                ) : null}
              </Card>
            ))
          ) : (
            <EmptyState
              title="Sem usuarios"
              description="Nenhum usuario aparece dentro do seu escopo administrativo."
            />
          )}
        </Card>
      ) : null}

      {activeSection === "classifications" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Classificacoes</Text>
              <Text style={styles.sectionDescription}>
                Defina as classificacoes centrais que estruturam o comportamento dos pontos.
              </Text>
            </View>
            <Button compact label="Nova classificacao" onPress={() => openModal("classifications", "create")} />
          </View>
          {sortedClassifications.map((classification) => (
            <Card key={classification.id}>
              <View style={styles.listRowHeader}>
                <View style={styles.listRowCopy}>
                  <Text style={styles.listRowTitle}>{classification.name}</Text>
                  <Text style={styles.listRowSubtitle}>{classification.slug}</Text>
                </View>
                <View style={styles.inlineActions}>
                  <Button compact label="Editar" onPress={() => openModal("classifications", "edit", classification.id)} variant="ghost" />
                  <Button compact label="Excluir" onPress={() => void confirmDeleteClassification(classification)} variant="danger" />
                </View>
              </View>
              <View style={styles.badgeWrap}>
                <Badge tone={classification.is_active ? "success" : "default"}>
                  {classification.is_active ? "Ativa" : "Inativa"}
                </Badge>
                <Badge>{classification.requires_species ? "Exige especie" : "Sem especie"}</Badge>
                <Badge>{classification.event_type_count} tipos de evento</Badge>
              </View>
              <Text style={styles.metaText}>Cor do marcador: {classification.marker_color}</Text>
            </Card>
          ))}
        </Card>
      ) : null}

      {activeSection === "tags" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <Text style={styles.sectionDescription}>
                Organize as tags reutilizaveis associadas a cada classificacao.
              </Text>
            </View>
            <Button compact label="Nova tag" onPress={() => openModal("tags", "create")} />
          </View>
          <Field>
            <FieldLabel>Buscar tags</FieldLabel>
            <FieldInput value={tagSearch} onChangeText={setTagSearch} placeholder="Nome, slug ou classificacao" />
          </Field>
          {sortedTags.map((tag) => (
            <Card key={tag.id}>
              <View style={styles.listRowHeader}>
                <View style={styles.listRowCopy}>
                  <Text style={styles.listRowTitle}>{tag.name}</Text>
                  <Text style={styles.listRowSubtitle}>{tag.point_classification_name ?? "Sem classificacao"}</Text>
                </View>
                <View style={styles.inlineActions}>
                  <Button compact label="Editar" onPress={() => openModal("tags", "edit", tag.id)} variant="ghost" />
                  <Button compact label="Excluir" onPress={() => void confirmDeleteTag(tag)} variant="danger" />
                </View>
              </View>
              <View style={styles.badgeWrap}>
                <Badge tone={tag.is_active ? "success" : "default"}>
                  {tag.is_active ? "Ativa" : "Inativa"}
                </Badge>
                <Badge>{tag.slug}</Badge>
              </View>
              {tag.description ? <Text style={styles.metaText}>{tag.description}</Text> : null}
            </Card>
          ))}
        </Card>
      ) : null}

      {activeSection === "event-types" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Tipos de evento</Text>
              <Text style={styles.sectionDescription}>
                Ajuste os tipos de evento usados na linha do tempo dos pontos.
              </Text>
            </View>
            <Button compact label="Novo tipo" onPress={() => openModal("event-types", "create")} />
          </View>
          {sortedEventTypes.map((pointEventType) => (
            <Card key={pointEventType.id}>
              <View style={styles.listRowHeader}>
                <View style={styles.listRowCopy}>
                  <Text style={styles.listRowTitle}>{pointEventType.name}</Text>
                  <Text style={styles.listRowSubtitle}>{pointEventType.point_classification_name}</Text>
                </View>
                <View style={styles.inlineActions}>
                  <Button compact label="Editar" onPress={() => openModal("event-types", "edit", pointEventType.id)} variant="ghost" />
                  <Button compact label="Excluir" onPress={() => void confirmDeleteEventType(pointEventType)} variant="danger" />
                </View>
              </View>
              <View style={styles.badgeWrap}>
                <Badge>{pointEventType.slug}</Badge>
              </View>
            </Card>
          ))}
        </Card>
      ) : null}

      {activeSection === "species" ? (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Especies</Text>
              <Text style={styles.sectionDescription}>
                Mantenha o catalogo botanico utilizado nos pontos que exigem especie.
              </Text>
            </View>
            <Button compact label="Nova especie" onPress={() => openModal("species", "create")} />
          </View>
          <Field>
            <FieldLabel>Buscar especies</FieldLabel>
            <FieldInput value={speciesSearch} onChangeText={setSpeciesSearch} placeholder="Nome popular ou cientifico" />
          </Field>
          {filteredSpecies.map((species) => (
            <Card key={species.id}>
              <View style={styles.listRowHeader}>
                <View style={styles.listRowCopy}>
                  <Text style={styles.listRowTitle}>{species.common_name}</Text>
                  <Text style={styles.listRowSubtitle}>{species.scientific_name}</Text>
                </View>
                <View style={styles.inlineActions}>
                  <Button compact label="Editar" onPress={() => openModal("species", "edit", species.id)} variant="ghost" />
                  <Button compact label="Excluir" onPress={() => void confirmDeleteSpecies(species)} variant="danger" />
                </View>
              </View>
              <View style={styles.badgeWrap}>
                <Badge tone={species.is_active ? "success" : "default"}>
                  {species.is_active ? "Ativa" : "Inativa"}
                </Badge>
                <Badge>{species.origin === "native" ? "Nativa" : "Exotica"}</Badge>
              </View>
            </Card>
          ))}
        </Card>
      ) : null}

      <ModalSheet
        open={Boolean(modalState)}
        onClose={closeModal}
        title={
          modalState
            ? `${modalState.mode === "create" ? "Novo" : "Editar"} ${SECTION_SINGULAR_LABELS[modalState.section]}`
            : "Edicao"
        }
      >
        {modalState ? (
          <ScrollView contentContainerStyle={styles.modalContent}>
            {modalState.section === "groups" ? (
              <>
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <FieldInput value={groupForm.name} onChangeText={(value) => setGroupForm((current) => ({ ...current, name: value }))} />
                </Field>
                <Field>
                  <FieldLabel>Codigo</FieldLabel>
                  <FieldInput value={groupForm.code} onChangeText={(value) => setGroupForm((current) => ({ ...current, code: value }))} autoCapitalize="none" />
                  <FieldHint>Use um identificador curto, sem espacos.</FieldHint>
                </Field>
                <Field>
                  <FieldLabel>Limite de pendencias por colaborador</FieldLabel>
                  <FieldInput
                    value={groupForm.maxPendingPointsPerCollaborator}
                    onChangeText={(value) => setGroupForm((current) => ({ ...current, maxPendingPointsPerCollaborator: value.replace(/[^0-9]/g, "") }))}
                    keyboardType="number-pad"
                  />
                </Field>
                <FieldSwitch label="Grupo publico" value={groupForm.isPublic} onValueChange={(value) => setGroupForm((current) => ({ ...current, isPublic: value }))} />
                <FieldSwitch label="Aceita colaboracao de pontos" value={groupForm.acceptsPointCollaboration} onValueChange={(value) => setGroupForm((current) => ({ ...current, acceptsPointCollaboration: value }))} />
                <Field>
                  <FieldLabel>Logo do grupo</FieldLabel>
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleGroupLogoChange}
                    style={groupLogoFileInputStyle}
                    type="file"
                  />
                  <FieldHint>Use PNG, JPG ou WEBP com no maximo 5 MB.</FieldHint>
                  {groupForm.logoPreviewUrl ? (
                    <View style={styles.groupLogoPreviewShell}>
                      <img
                        alt="Preview da logo do grupo"
                        src={groupForm.logoPreviewUrl}
                        style={groupLogoImageStyle}
                      />
                    </View>
                  ) : (
                    <View style={styles.groupLogoEmptyShell}>
                      <Text style={styles.groupLogoEmptyLabel}>Nenhuma logo selecionada.</Text>
                    </View>
                  )}
                  {groupForm.logoPreviewUrl ? (
                    <View style={styles.groupLogoActions}>
                      <Button compact label="Remover logo" onPress={handleGroupLogoRemove} variant="ghost" />
                    </View>
                  ) : null}
                </Field>
              </>
            ) : null}

            {modalState.section === "users" ? (
              <>
                {permissions?.canEditUserIdentity ? (
                  <>
                    <Field>
                      <FieldLabel>Nome</FieldLabel>
                      <FieldInput value={userForm.name} onChangeText={(value) => setUserForm((current) => ({ ...current, name: value }))} />
                    </Field>
                    <Field>
                      <FieldLabel>E-mail</FieldLabel>
                      <FieldInput value={userForm.email} onChangeText={(value) => setUserForm((current) => ({ ...current, email: value }))} autoCapitalize="none" keyboardType="email-address" />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field>
                      <FieldLabel>Nome</FieldLabel>
                      <FieldInput editable={false} value={userForm.name} />
                    </Field>
                    <Field>
                      <FieldLabel>E-mail</FieldLabel>
                      <FieldInput editable={false} value={userForm.email} />
                    </Field>
                  </>
                )}
                <Field>
                  <FieldLabel>Vinculos de grupo</FieldLabel>
                  <View style={styles.membershipStack}>
                    {userForm.memberships.map((membership, index) => {
                      const availableGroupOptions = (editableGroups.length ? editableGroups : sortedGroups).map((group) => ({
                        label: group.name,
                        value: group.id,
                      }));

                      return (
                        <View key={`${membership.groupId}-${index}`} style={styles.membershipRow}>
                          <View style={styles.membershipColumn}>
                            <PickerField
                              label="Grupo"
                              selectedValue={membership.groupId}
                              onValueChange={(value) =>
                                setUserForm((current) => ({
                                  ...current,
                                  memberships: current.memberships.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, groupId: value } : item,
                                  ),
                                  preferredGroupId:
                                    current.preferredGroupId === membership.groupId ? value : current.preferredGroupId,
                                }))
                              }
                              items={availableGroupOptions}
                            />
                          </View>
                          <View style={styles.membershipColumn}>
                            <PickerField
                              label="Papel"
                              selectedValue={membership.role}
                              onValueChange={(value) =>
                                setUserForm((current) => ({
                                  ...current,
                                  memberships: current.memberships.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, role: value as UserRole } : item,
                                  ),
                                }))
                              }
                              items={assignableUserRoleOptions.map((option) => ({
                                label: option.label,
                                value: option.value,
                              }))}
                            />
                          </View>
                          <Button compact label="Remover" variant="danger" onPress={() => setUserForm((current) => {
                            const nextMemberships = current.memberships.filter((_, itemIndex) => itemIndex !== index);
                            return {
                              ...current,
                              memberships: nextMemberships,
                              preferredGroupId:
                                current.preferredGroupId === membership.groupId ? nextMemberships[0]?.groupId ?? "" : current.preferredGroupId,
                            };
                          })} />
                        </View>
                      );
                    })}
                    {modalState.mode === "edit" ? (
                      <Button compact label="Adicionar vinculo" variant="secondary" onPress={() => {
                        const candidateGroups = editableGroups.length ? editableGroups : sortedGroups;
                        const nextGroup = candidateGroups.find((group) => !userForm.memberships.some((membership) => membership.groupId === group.id)) ?? candidateGroups[0];
                        if (!nextGroup) return;
                        setUserForm((current) => ({
                          ...current,
                          memberships: [...current.memberships, { groupId: nextGroup.id, role: "group_collaborator" }],
                          preferredGroupId: current.preferredGroupId || nextGroup.id,
                        }));
                      }} />
                    ) : null}
                  </View>
                </Field>
                <PickerField
                  label="Grupo preferencial"
                  selectedValue={userForm.preferredGroupId}
                  onValueChange={(value) => setUserForm((current) => ({ ...current, preferredGroupId: value }))}
                  items={userForm.memberships.map((membership) => {
                    const group = sortedGroups.find((item) => item.id === membership.groupId);
                    return { label: group?.name ?? membership.groupId, value: membership.groupId };
                  })}
                  enabled={userForm.memberships.length > 0}
                />
              </>
            ) : null}

            {modalState.section === "classifications" ? (
              <>
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <FieldInput value={classificationForm.name} onChangeText={(value) => setClassificationForm((current) => ({ ...current, name: value }))} />
                </Field>
                <Field>
                  <FieldLabel>Slug</FieldLabel>
                  <FieldInput value={classificationForm.slug} onChangeText={(value) => setClassificationForm((current) => ({ ...current, slug: value }))} autoCapitalize="none" />
                </Field>
                <Field>
                  <FieldLabel>Cor do marcador</FieldLabel>
                  <FieldInput value={classificationForm.markerColor} onChangeText={(value) => setClassificationForm((current) => ({ ...current, markerColor: value }))} autoCapitalize="none" />
                </Field>
                <FieldSwitch label="Exige especie" value={classificationForm.requiresSpecies} onValueChange={(value) => setClassificationForm((current) => ({ ...current, requiresSpecies: value }))} />
                <FieldSwitch label="Classificacao ativa" value={classificationForm.isActive} onValueChange={(value) => setClassificationForm((current) => ({ ...current, isActive: value }))} />
              </>
            ) : null}

            {modalState.section === "tags" ? (
              <>
                <PickerField label="Classificacao" selectedValue={tagForm.pointClassificationId} onValueChange={(value) => setTagForm((current) => ({ ...current, pointClassificationId: value }))} items={classificationOptions} />
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <FieldInput value={tagForm.name} onChangeText={(value) => setTagForm((current) => ({ ...current, name: value }))} />
                </Field>
                <Field>
                  <FieldLabel>Slug</FieldLabel>
                  <FieldInput value={tagForm.slug} onChangeText={(value) => setTagForm((current) => ({ ...current, slug: value }))} autoCapitalize="none" />
                </Field>
                <Field>
                  <FieldLabel>Descricao</FieldLabel>
                  <FieldInput value={tagForm.description} onChangeText={(value) => setTagForm((current) => ({ ...current, description: value }))} />
                </Field>
                <FieldSwitch label="Tag ativa" value={tagForm.isActive} onValueChange={(value) => setTagForm((current) => ({ ...current, isActive: value }))} />
              </>
            ) : null}

            {modalState.section === "event-types" ? (
              <>
                <PickerField label="Classificacao" selectedValue={eventTypeForm.pointClassificationId} onValueChange={(value) => setEventTypeForm((current) => ({ ...current, pointClassificationId: value }))} items={classificationOptions} />
                <Field>
                  <FieldLabel>Nome</FieldLabel>
                  <FieldInput value={eventTypeForm.name} onChangeText={(value) => setEventTypeForm((current) => ({ ...current, name: value }))} />
                </Field>
                <Field>
                  <FieldLabel>Slug</FieldLabel>
                  <FieldInput value={eventTypeForm.slug} onChangeText={(value) => setEventTypeForm((current) => ({ ...current, slug: value }))} autoCapitalize="none" />
                </Field>
              </>
            ) : null}

            {modalState.section === "species" ? (
              <>
                <Field>
                  <FieldLabel>Nome popular</FieldLabel>
                  <FieldInput value={speciesForm.commonName} onChangeText={(value) => setSpeciesForm((current) => ({ ...current, commonName: value }))} />
                </Field>
                <Field>
                  <FieldLabel>Nome cientifico</FieldLabel>
                  <FieldInput value={speciesForm.scientificName} onChangeText={(value) => setSpeciesForm((current) => ({ ...current, scientificName: value }))} />
                </Field>
                <PickerField label="Origem" selectedValue={speciesForm.origin} onValueChange={(value) => setSpeciesForm((current) => ({ ...current, origin: value as "native" | "exotic" }))} items={[{ label: "Nativa", value: "native" }, { label: "Exotica", value: "exotic" }]} />
                <FieldSwitch label="Especie ativa" value={speciesForm.isActive} onValueChange={(value) => setSpeciesForm((current) => ({ ...current, isActive: value }))} />
              </>
            ) : null}

            <View style={styles.modalActions}>
              <Button compact label="Cancelar" onPress={closeModal} variant="ghost" />
              <Button compact label={isSubmitting ? "Salvando..." : "Salvar"} onPress={() => void submitCurrentModal()} disabled={isSubmitting} />
            </View>
          </ScrollView>
        ) : null}
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tabButton: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  sectionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  listRowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  listRowIdentity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
  },
  listRowCopy: {
    flex: 1,
    gap: 2,
  },
  listRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  listRowSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  groupLogoPreviewShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 124,
    padding: spacing.md,
  },
  groupLogoEmptyShell: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 108,
    padding: spacing.md,
  },
  groupLogoEmptyLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  groupLogoActions: {
    alignItems: "flex-start",
  },
  pickerShell: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  disabledShell: {
    opacity: 0.6,
  },
  modalContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    paddingTop: spacing.sm,
  },
  membershipStack: {
    gap: spacing.sm,
  },
  membershipRow: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  membershipColumn: {
    flex: 1,
  },
});
