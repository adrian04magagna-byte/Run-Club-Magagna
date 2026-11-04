# Run Club Magagna — como rodar e publicar

O app saiu da plataforma Manus. Agora roda assim:

| Parte | Onde | Observação |
| --- | --- | --- |
| App web (Expo) | GitHub Pages | Publicado pelo workflow `.github/workflows/pages.yml` a cada push na `main`. |
| API (Express + tRPC) | Vercel | Função única em `api/index.ts`, configurada por `vercel.json`. |
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
- **Treinador**: o e-mail em `COACH_EMAIL` vira treinador automaticamente.
  - Com Google: basta entrar com a conta Google desse e-mail.
  - Com e-mail e senha: na tela de login, "É o treinador? Primeiro acesso", informando o código `COACH_SIGNUP_CODE`.
    O código impede que outra pessoa crie a conta com o e-mail do treinador antes dele.

## Publicar

### 1. Supabase (banco)

O projeto `run-club-magagna` (região São Paulo) já tem o schema aplicado, com RLS ligado em todas as
tabelas: a API do Supabase não expõe nada, só a nossa API acessa o banco.

Em **Project Settings → Database**, defina a senha do banco e copie a string de conexão do
**Transaction pooler** (porta `6543`). Ela vira o `DATABASE_URL` da Vercel.

Migrations futuras: altere `drizzle/schema.ts`, rode `npx drizzle-kit generate` e aplique o SQL gerado no Supabase.

### 2. Vercel (API)

Importe o repositório na Vercel (framework "Other"; o `vercel.json` já define tudo) e cadastre as variáveis:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | String do Transaction pooler do Supabase |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `COACH_EMAIL` | E-mail do treinador |
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
