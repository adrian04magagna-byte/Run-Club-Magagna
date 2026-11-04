# Run Club Magagna — como rodar e publicar

O app saiu da plataforma Manus. Agora roda assim:

| Parte | Onde | Observação |
| --- | --- | --- |
| App web (Expo) | GitHub Pages | Publicado pelo workflow `.github/workflows/pages.yml` a cada push na `main`. |
| API (Express + tRPC) | Vercel | `scripts/build-vercel.mjs` empacota `server/_core/vercel.ts` numa função ESM (Build Output API). |
| Banco | Supabase (Postgres) | Schema em `drizzle/schema.ts`, migrations em `drizzle/*.sql`. |
| Fotos de perfil | Tabela `profile_avatars` | Servidas por `/api/avatars/...` com URL assinada de 1–2 h. |
| Login | E-mail e senha + Google | Sessão por token Bearer (JWT) guardado no aparelho/navegador. |

## Rodar no computador

```bash
pnpm install
cp .env.example .env   # preencha SESSION_SECRET, COACH_EMAIL e COACH_SIGNUP_CODE
pnpm dev               # API em :3000 e app web em :8081
```

Com `DATABASE_URL=pglite:./.local-db` o banco é um Postgres embutido criado na pasta `.local-db`
(não precisa instalar nada; as migrations rodam sozinhas). Apague a pasta para recomeçar do zero.

Verificações: `pnpm check`, `pnpm lint`, `pnpm test` (inclui o fluxo completo treinador → aluno num Postgres embutido).

## Contas

- **Aluno**: cadastra-se com e-mail e senha, ou usa "Continuar com Google". Fica pendente até o treinador aprovar.
- **Treinador**: cada e-mail em `COACH_EMAIL` (lista separada por vírgula) vira treinador automaticamente.
  Cada treinador vê os alunos que ele mesmo aprovou; pedidos pendentes aparecem para todos.
  - Com Google: basta entrar com a conta Google desse e-mail.
  - Com e-mail e senha: na tela de login, "É o treinador? Primeiro acesso", informando o código `COACH_SIGNUP_CODE`.
    O código impede que outra pessoa crie a conta com o e-mail do treinador antes dele.

## Publicar na VM Oracle (produção atual)

App web e API rodam na VM `vm_deon` (Ubuntu ARM, 193.123.122.30), ao lado dos outros sites dela:

- Endereço: https://runclub.193-123-122-30.sslip.io (o sslip.io aponta o nome para o IP; troque por um domínio próprio quando quiser).
- nginx: `/etc/nginx/sites-available/runclub` serve `~/run-club/web` e encaminha `/api/` para `127.0.0.1:3100`.
- API: `~/run-club/api/index.mjs` (arquivo único gerado por `pnpm build`), processo `run-club-api` no pm2, configuração em `~/run-club/api/.env` (permissão 600).

Atualizar depois de mudanças no código:

```bash
pnpm build
EXPO_PUBLIC_API_BASE_URL=https://runclub.193-123-122-30.sslip.io EXPO_BASE_URL= npx expo export --platform web
tar -czf - dist-server/index.mjs | ssh vm_deon 'tar -xzf - -C ~/run-club/api --strip-components=1 && pm2 restart run-club-api'
tar -czf - -C dist . | ssh vm_deon 'rm -rf ~/run-club/web/* && tar -xzf - -C ~/run-club/web && chmod -R a+rX ~/run-club/web'
```

## Publicar (alternativa: GitHub Pages + Vercel)

### 1. Supabase (banco)

O projeto `run-club-magagna` (região São Paulo) já tem o schema aplicado, com RLS ligado em todas as
tabelas: a API do Supabase não expõe nada, só a nossa API acessa o banco.

A API conecta com um usuário próprio, `runclub_api`, pelo **Transaction pooler**
(`aws-1-sa-east-1.pooler.supabase.com:6543`, usuário `runclub_api.abbvlkmlkruxdcvogxkn`).
Ele só lê e grava as tabelas do app (políticas RLS em `drizzle/0002_api_role_policies.sql`).
A string fica apenas no `DATABASE_URL` da Vercel. Para trocar a senha:
`ALTER ROLE runclub_api PASSWORD '...'` no SQL Editor e atualize o `DATABASE_URL`.
Atenção: a conexão direta (`db.<ref>.supabase.co`) só funciona por IPv6 e não serve para a Vercel.

Migrations futuras: altere `drizzle/schema.ts`, rode `npx drizzle-kit generate` e aplique o SQL gerado no Supabase.

### 2. Vercel (API)

Projeto atual: `run-club-magagna-api` (time MAGAGNATECH), em https://run-club-magagna-api.vercel.app.
Publique com `vercel deploy --prod` (o `vercel.json` já define instalação e build). Variáveis:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | String do Transaction pooler com o usuário `runclub_api` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `COACH_EMAIL` | E-mail(s) dos treinadores, separados por vírgula |
| `COACH_SIGNUP_CODE` | Um código que só o treinador saiba |
| `EXPO_PUBLIC_API_BASE_URL` | URL da própria API, ex.: `https://run-club-magagna.vercel.app` |
| `ALLOWED_ORIGINS` | `https://adrian04magagna-byte.github.io` |
| `APP_RETURN_URLS` | `https://adrian04magagna-byte.github.io/Run-Club-Magagna/oauth/callback,runclubmagagna://oauth/callback` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Ver passo 3 |
| `STRAVA_*` | Opcional, ver "Strava" |

Teste: `https://<sua-api>/api/health` deve responder `{"ok":true,...}`.

### 3. Google (login)

No Google Cloud Console: **APIs e serviços → Tela de consentimento OAuth** (tipo externo) e depois
**Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**, com o URI de redirecionamento autorizado:

```
https://<sua-api>/api/auth/google/callback
```

Copie o Client ID e o Client Secret para a Vercel. Sem eles, o botão do Google mostra uma mensagem
explicando que o login com Google ainda não foi configurado; o login com e-mail e senha continua funcionando.

### 4. GitHub Pages (app)

Em **Settings → Secrets and variables → Actions → Variables**, crie `API_BASE_URL` com a URL da API
na Vercel. O próximo push na `main` publica o app apontando para ela.

## Strava

A integração continua no código (`server/_core/stravaOAuth.ts`). Para ativar, cadastre `STRAVA_CLIENT_ID`,
`STRAVA_CLIENT_SECRET` e `STRAVA_TOKEN_ENCRYPTION_KEY` (32+ bytes aleatórios) na Vercel e registre o
domínio da API como *Authorization Callback Domain* no painel do Strava. O callback é `/api/strava/oauth/callback`.

> ⚠️ O `.env` com credenciais Strava reais chegou a ser commitado neste repositório público.
> Gere um novo Client Secret no painel do Strava e uma nova chave de criptografia antes de usar a integração.

## O que saiu do Manus

Removidos: OAuth/SDK Manus, proxy de storage, LLM, notificações, geração de imagem, transcrição de voz
e o runtime de iframe (nenhum era usado pelas telas). O esquema de deep link mudou para `runclubmagagna://`
e o bundle id para `com.magagna.runclub`.
