# Run Club Magagna — pacote de migração

Este arquivo contém o código-fonte do app móvel, API, schema/migrations, testes e assets do **Run Club Magagna** no checkpoint `af97506`. Foi preparado para transferência a outra plataforma cloud.

## Importante: código-fonte não equivale a migração completa do ambiente

O ZIP não transfere contas, alunos, treinos, avaliações, fotos, sessões, banco de dados, tokens Strava, segredos ou histórico Git. Isso é intencional: são dados privados e credenciais não devem circular dentro de um arquivo compactado. O destino precisará de seu próprio banco MySQL, armazenamento de fotos, variáveis de ambiente, domínio HTTPS e serviços de autenticação/API.

O projeto atual usa partes específicas da plataforma Manus: login/OAuth Manus (`server/_core/oauth.ts`, `server/_core/sdk.ts`), algumas APIs gerenciadas (LLM, notificações e serviços em `server/_core/`) e armazenamento de objetos para avatares (`server/storage/profile-avatars.ts`). A nova nuvem precisa oferecer serviços compatíveis ou essas integrações precisam ser adaptadas para os serviços dela. O login Manus não é substituído automaticamente pelo login OAuth do Strava: são fluxos diferentes. Mantenha um provedor de login de usuários separado do vínculo Strava.

## Estrutura incluída

- `app/`, `components/`, `hooks/`, `lib/`, `constants/`: aplicativo Expo / React Native.
- `server/`, `shared/`: API Express/tRPC e lógica compartilhada, incluindo OAuth Strava.
- `drizzle/`: schema Drizzle e migrations SQL versionadas.
- `assets/`, `public/`: imagens e assets usados pelo app.
- `tests/`, `package.json`, `pnpm-lock.yaml`, configurações: testes e configuração do projeto.
- `plan.md`, `TODO.md` e prompt de produto: decisões e escopo do app.

## Requisitos e primeira execução

Use Node.js LTS compatível com Expo SDK do projeto, pnpm `9.12.0`, MySQL compatível com `mysql2`/Drizzle e HTTPS público. Instale as dependências com `pnpm install --frozen-lockfile`. Para desenvolvimento, configure primeiro as integrações e variáveis necessárias, depois rode `pnpm dev`; o starter usa Metro/Expo Web na porta `8081` e API na `3000`. Rode `pnpm check`, `pnpm lint`, `pnpm test` e `pnpm build` para verificar o código. A plataforma de destino deve configurar separadamente como servir o frontend Expo Web e a API Express; o script `build` existente compila a API e não é, sozinho, uma configuração universal de deploy.

Antes do primeiro uso com banco, revise `drizzle.config.ts`, configure `DATABASE_URL` no ambiente protegido e aplique as migrations conforme o processo da plataforma de destino. Não rode migrations contra o banco original ou produção sem backup e autorização. O banco de destino começa vazio, a menos que os dados sejam migrados por um processo separado.

## Variáveis de ambiente

` .env.example` lista nomes de variáveis e placeholders vazios; nunca preencha segredos nesse arquivo nem os envie por chat. Cadastre-os no gerenciador seguro de secrets do provedor. Alguns recursos atuais exigem integração com a plataforma Manus e não funcionarão no novo provedor até serem portados:

- Autenticação atual: `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL` e `MANUS_OAUTH_PORTAL_URL`; use no cloud novo somente se ele ainda oferecer esses serviços. Caso contrário, implemente/adapte um provedor de login e sessões.
- Banco: `DATABASE_URL` MySQL.
- Identidade do Treinador: `COACH_EMAIL` ou `OWNER_OPEN_ID`, vinculada ao provedor de login escolhido.
- API Strava: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_TOKEN_ENCRYPTION_KEY` apenas no servidor. A chave criptográfica deve ter pelo menos 32 bytes fortes, gerados aleatoriamente. Não gere uma chave fraca nem a compartilhe por mensagens.
- URL pública: `EXPO_PUBLIC_API_BASE_URL` deve apontar para a API HTTPS pública; confirme no provedor de build que essa variável pública não contém segredos.
- Fotos e alguns serviços: `MANUS_API_URL`, `MANUS_API_KEY`, `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY` pertencem às integrações Manus. Não reutilize esses nomes/valores às cegas no novo cloud; adapte para o storage/serviços de destino.

A configuração Expo pública é compilada para o app; não coloque Client Secret, chave criptográfica, chave de sessão, senha de banco ou chave privada em `EXPO_PUBLIC_*`.

## Strava após a mudança de domínio

A integração busca as atividades do próprio aluno sob demanda; não envia atividades Strava ao Treinador e não as persiste como histórico no banco. Ao trocar de host, recadastre no painel de desenvolvedor Strava o **domínio público da API de destino** como Authorization Callback Domain. Configure no Strava e no novo cloud o callback HTTPS completo correspondente ao caminho implementado, `/api/strava/oauth/callback`, e confira a URI exata enviada no parâmetro `redirect_uri`. O endereço temporário Manus/Preview não deve ser reutilizado no cloud novo.

Se for uma migração de código apenas, sem transferir banco, os alunos terão que autorizar novamente suas contas Strava no novo ambiente. Se houver migração de dados do banco, os tokens existentes só podem ser lidos com a mesma chave criptográfica Strava — transfira-a por um canal seguro de secrets, não dentro do ZIP. Faça a migração com backup, verifique a política do provedor e remova estados OAuth pendentes. Nunca copie tokens para logs ou arquivos. O cadastro/capacidade e a revisão do app Strava dependem do painel da Strava; a conexão configurada num cloud não se transfere automaticamente para outro domínio.

## Checklist no provedor de destino

1. Importe e extraia o ZIP; instale a versão de Node/pnpm indicada.
2. Escolha e configure o provedor de autenticação de usuários e adapte a autenticação Manus se necessário. Não use Strava como login da conta do Run Club sem uma decisão de produto e implementação próprias.
3. Configure um MySQL novo, secrets de servidor e storage privado para fotos; revise/migre schema e dados separadamente.
4. Defina URL pública HTTPS da API, do frontend e do callback OAuth; atualize redirect URIs, CORS, cookies e links profundos para os domínios novos.
5. Reconfigure Strava Client ID/Secret e chave de criptografia no cofre de secrets do destino. Não inclua esses valores no repositório ou ZIP.
6. Execute as verificações e teste login, aprovações, agenda, avaliações, fotos e OAuth Strava com uma conta de teste autorizada, sem usar dados reais de aluno sem consentimento.

## Segurança

Este pacote deve ser tratado como código-fonte, mas mesmo assim revise-o antes de torná-lo público. Não publique dados de alunos nem arquivos `.env`. O arquivo `.env.example` contém somente placeholders. O ZIP não inclui `node_modules`, `.git`, cache Expo, saída compilada, dump de banco, uploads, credenciais ou tokens.

## Atualização: hash do ID Strava agora é HMAC (importante ao migrar dados)

O identificador pseudonimizado da conta Strava passou de SHA-256 simples para **HMAC-SHA-256** com chave derivada (HKDF, rótulo próprio) de `STRAVA_TOKEN_ENCRYPTION_KEY`. IDs do Strava são números curtos e enumeráveis; o hash simples podia ser revertido por força bruta.

Consequências: vínculos Strava criados **antes** desta versão têm o hash antigo e não serão reconhecidos; os alunos precisam desconectar e conectar de novo (o banco novo começa vazio, então não há impacto). Não migre linhas antigas de `strava_connections` sem pedir a reconexão. A mesma chave `STRAVA_TOKEN_ENCRYPTION_KEY` agora também protege o hash: trocá-la invalida os vínculos.

Também corrigido: séries do Strava são reduzidas de forma uniforme a 300 pontos (antes eram cortadas nos primeiros 300) e a cadência de corrida é exibida em passos/min (dobro do valor por perna enviado pelo Strava).
