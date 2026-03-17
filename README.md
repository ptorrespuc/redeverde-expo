# Rede Verde Expo

Aplicacao Expo Router para web e Android, integrada ao mesmo Supabase do sistema atual.

## Comandos principais

```bash
npm install
npm run lint
npm run typecheck
```

## Web

```bash
npm run web
npm run export:web
npm run deploy:web
```

## Android

```bash
npm run build:android:preview
```

Esse perfil gera um APK interno no EAS Build.

## OTA

O projeto esta configurado com `EAS Update` e canais separados:

- `preview`
- `production`

Para publicar uma atualizacao OTA no canal de testes:

```bash
npm run update:preview
```

Para publicar uma atualizacao OTA em producao:

```bash
npm run update:production
```

Observacoes:

- alteracoes de JavaScript, telas e estilos podem ir por OTA quando o runtime nativo for compativel;
- alteracoes nativas exigem novo build do app;
- o `runtimeVersion` usa `fingerprint`, entao o Expo bloqueia OTA incompatível com a base nativa instalada.
