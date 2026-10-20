# Publicação do app web no GitHub Pages

O GitHub Pages só hospeda arquivos estáticos. Ele publica o **app web** (Expo). A **API** (Express/tRPC) e o **MySQL** continuam precisando de outro lugar com HTTPS.

## Passo a passo
1. Crie o repositório e envie este código para a branch `main`.
2. Em Settings > Pages, escolha "Source: GitHub Actions".
3. Em Settings > Secrets and variables > Actions > **Variables**, crie `API_BASE_URL` com a URL pública da API (sem barra no fim). Não coloque segredos aqui.
4. No servidor da API, defina `EXPO_WEB_PREVIEW_URL` com a origem exata do site (ex.: `https://usuario.github.io`, sem barra final) para liberar o CORS.
5. Faça um push em `main` (ou rode o workflow manualmente em Actions).

## Regra importante: o site precisa ficar na raiz do domínio
O retorno do Strava no app web usa `origin + /strava/callback`. Num site de projeto (`usuario.github.io/nome-do-repo/`) isso apontaria para fora do app. Use um destes:
- repositório chamado `usuario.github.io`; ou
- domínio próprio configurado em Settings > Pages.

## O que não funciona só com Pages
- Login, banco, fotos e Strava dependem da API publicada à parte. O callback OAuth do Strava aponta para o domínio da **API** (`/api/strava/oauth/callback`), não para o Pages.
- O login atual usa o OAuth da Manus; fora dela o login do Treinador precisa ser adaptado.
- Pages não oferece fallback de SPA: o workflow copia `index.html` para `404.html` para as rotas internas funcionarem. Teste abrir um endereço interno diretamente.
- Os apps de Android e iOS não vão para o Pages: são gerados com o EAS Build.
