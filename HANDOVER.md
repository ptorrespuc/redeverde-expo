# Handover — Rede Verde Expo

**Data:** 07/04/2026
**Projeto:** `redeverde-expo`
**Caminho local:** `C:\Users\ptorres\Documents\redeverde-expo`

---

## 1. Visão Geral do Projeto

Aplicativo multiplataforma (Android, iOS, Web) para mapeamento e gestão de pontos de campo de reflorestamento, desenvolvido pela PUC-Rio (org `sgu_puc-rio`).

| Item | Detalhe |
|---|---|
| Framework | Expo v54 + React Native v0.81 |
| Roteamento | Expo Router v6 (file-based, Typed Routes) |
| Backend | Supabase (Auth, PostgreSQL, Storage) + Expo API Routes |
| Linguagem | TypeScript (strict mode) |
| Mapas | `react-native-maps` (nativo) / Google Maps API (web) |
| Build/Deploy | EAS Build + EAS Update (OTA) |

---

## 2. Estrutura de Pastas

```
redeverde-expo/
├── app/                    # Expo Router — rotas e API routes
│   ├── (tabs)/             # Tabs: Mapa, Pontos, Conta, Admin
│   ├── api/                # Server-side API routes (+api.ts)
│   ├── points/             # Detalhe e edição de ponto
│   ├── login.tsx
│   └── reset-password.tsx
├── src/
│   ├── components/         # Componentes reutilizáveis
│   │   ├── auth/
│   │   ├── groups/         # GroupAvatar, GroupEditModal (novo)
│   │   ├── map/            # map-canvas.native.tsx / map-canvas.web.tsx
│   │   ├── points/
│   │   └── ui/             # Button, Badge, Card, Field, ModalSheet...
│   ├── lib/                # Utilitários e clients de API
│   │   ├── admin-web-api.ts
│   │   ├── supabase.ts
│   │   └── ...
│   ├── providers/          # AppProvider (contexto global)
│   ├── screens/            # Implementação das telas principais
│   ├── server/             # Operações server-side (admin, auth, storage)
│   ├── types/              # Tipos TypeScript do domínio
│   └── theme.ts
├── assets/
├── .env.local              # Variáveis de ambiente (não commitado)
├── app.config.ts
└── eas.json
```

---

## 3. Credenciais e Configuração

### Variáveis de Ambiente (`.env.local`)

| Variável | Descrição |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave pública Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta server-side (nunca expor no cliente) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Chave da API do Google Maps |
| `EXPO_PUBLIC_APP_URL` | URL pública do app web |

### Supabase

- **Projeto:** `jwozsflxmctizfucwnjz.supabase.co`
- **Ref:** `jwozsflxmctizfucwnjz`
- **CLI:** vinculado via `npx supabase link --project-ref jwozsflxmctizfucwnjz`

### EAS / Expo

- **Conta:** `sgu_puc-rio` / `admsgu@puc-rio.br`
- **Project ID:** `c8318146-479a-4743-826a-474ccca51456`
- **Canais de build:** `development`, `preview`, `production`
- **OTA Updates URL:** `https://u.expo.dev/c8318146-479a-4743-826a-474ccca51456`

---

## 4. Banco de Dados (Supabase)

### Tabelas principais

| Tabela | Descrição |
|---|---|
| `users` | Perfis de usuário |
| `groups` | Grupos/organizações |
| `points` | Pontos de campo com coordenadas e status de aprovação |
| `point_classifications` | Tipos de ponto (reflorestamento, remoção, etc.) |
| `point_event_types` | Subtipos de evento por classificação |
| `point_tags` | Tags atribuíveis a pontos |
| `species_catalog` | Catálogo de espécies (nativa/exótica) |
| `point_media` | Fotos/anexos de pontos e eventos |
| `point_events` | Histórico de eventos por ponto |

### Storage Buckets

| Bucket | Descrição |
|---|---|
| `point-timeline-media` | Fotos de pontos (max 10MB, 3 por ponto) |
| `group-logos` | Logos dos grupos |

---

## 5. Sistema de Perfis e Permissões

### Papéis (`UserRole`)

| Papel | Descrição |
|---|---|
| `super_admin` | Acesso total ao sistema |
| `group_admin` | Admin dentro dos seus grupos |
| `group_approver` | Pode aprovar pontos pendentes |
| `group_collaborator` | Pode submeter pontos |

### Flags de permissão no contexto do usuário

```typescript
interface UserContext {
  is_super_admin: boolean;
  has_group_admin: boolean;
  has_point_workspace: boolean;
  manageable_groups: GroupRecord[];   // grupos que o usuário pode administrar
  submission_groups: GroupRecord[];   // grupos onde pode submeter pontos
  approvable_groups: GroupRecord[];   // grupos onde pode aprovar pontos
}
```

### Permissão por grupo (`GroupRecord`)

```typescript
viewer_can_manage: boolean;         // pode editar o grupo
viewer_can_submit_points: boolean;
viewer_can_approve_points: boolean;
```

> Todas as permissões são computadas via RLS no banco — não duplicar lógica no frontend.

---

## 6. Funcionalidades Principais

1. **Mapa interativo** — marcadores coloridos por classificação, criar/editar pontos via modal
2. **Gestão de pontos** — criação, edição, aprovação, arquivamento, fotos, tags
3. **Eventos/timeline** — registro de observações com fotos por ponto
4. **Grupos e papéis** — multi-grupo com RBAC
5. **Painel Admin (web)** — usuários, grupos, catálogos, aprovações
6. **OTA Updates** — EAS Update com canais preview/production

---

## 7. Alterações Realizadas Nesta Sessão

### 7.1 Configuração do ambiente

- Adicionadas ao `.env.local`:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `EXPO_PUBLIC_APP_URL`
- Supabase CLI vinculado ao projeto

### 7.2 Gerenciamento de grupo na tela de Conta

**Problema:** Usuários com papel `group_admin` ou `super_admin` não tinham forma de gerenciar grupos fora do painel admin (web-only).

**Solução:** Adicionado botão "Gerenciar" direto na lista de grupos da tela **Conta**, visível somente quando `viewer_can_manage === true`.

#### Arquivos criados

**`src/components/groups/group-edit-modal.tsx`** — novo componente

- Modal reutilizável multiplataforma (Android, iOS, Web)
- Campos: Nome, Código, Limite de pendências, Grupo público, Aceita colaboração
- Upload/remoção de logo (somente web, via `<input type="file">`)
- Chama `updateAdminGroup()` da `admin-web-api.ts` para salvar
- Reseta o formulário automaticamente ao abrir grupo diferente
- Feedback via Toast (sucesso/erro)

#### Arquivos alterados

**`src/screens/account-screen.tsx`**

- Importado `GroupEditModal` e `GroupRecord`
- Adicionado estado `editingGroup: GroupRecord | null`
- Cada grupo na lista agora exibe botão "Gerenciar" (compacto, `variant="ghost"`) quando `viewer_can_manage` é `true`
- `GroupEditModal` renderizado ao final da tela, controlado por `editingGroup`
- Ao salvar, chama `refreshBootstrap()` para atualizar o contexto

#### Comportamento por perfil

| Perfil | Botão "Gerenciar" |
|---|---|
| `super_admin` | Visível em todos os grupos |
| `group_admin` | Visível apenas nos seus grupos |
| `group_approver` / `group_collaborator` | Não aparece |

---

## 8. Comandos Úteis

```bash
# Rodar em desenvolvimento
npx expo start

# Publicar OTA update
npx eas update --channel preview --message "descrição"

# Build Android (APK)
npx eas build --platform android --profile preview

# Inspecionar banco via CLI
npx supabase db diff

# Ver status do login EAS
npx eas whoami
```

---

## 9. Próximos Passos Sugeridos

- [ ] Upload de logo de grupo no app nativo (via `expo-image-picker`)
- [ ] Tela de detalhes do grupo com lista de membros
- [ ] Convite de novos usuários para o grupo (por e-mail) direto no app mobile
- [ ] Notificações push para pontos pendentes de aprovação
