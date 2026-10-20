# Prompt para Claude Code — Run Club Magagna

Quero desenvolver um aplicativo móvel funcional chamado **Run Club Magagna**, para um treinador de corrida e seus alunos. Trabalhe como engenheiro de software sênior, designer de produto e especialista em segurança. Construa o produto por etapas, valide cada etapa e explique com clareza o que já funciona e o que ainda depende de configuração externa.

## Primeiro passo: inspecionar antes de alterar

Se eu fornecer um repositório existente, antes de editar:

1. Leia o README, a estrutura, as dependências, as variáveis de ambiente de exemplo, o estado do Git e os testes.
2. Preserve a arquitetura e os recursos que já funcionam. Não recrie o projeto nem troque framework sem justificar e pedir minha autorização.
3. Não sobrescreva minhas alterações. Não imprima segredos, tokens, URLs com códigos OAuth nem dados pessoais nos logs.
4. Faça um plano curto e implemente o próximo passo completo, sem parar em uma análise genérica.

Se o repositório estiver vazio, proponha uma base móvel com **Expo, React Native, Expo Router e TypeScript**, mais API protegida no servidor, banco relacional e armazenamento privado para fotos. Mantenha credenciais e tokens somente no servidor.

## Produto e papéis

A interface deve estar em **português do Brasil**. Use sempre o rótulo **“Treinador”** no masculino e o nome **“Run Club Magagna”**. O produto deve ter visual esportivo, claro e acolhedor, com a identidade existente: azul-marinho/escuro, fundo claro e verde-lima `#D7F752`. Não use o logotipo do Strava como ícone do aplicativo.

### Aluno

- Cadastro com e-mail e senha.
- Uma conta nova fica pendente; o aluno só acessa a área privada depois da aprovação do Treinador.
- Perfil editável com nome e foto.
- Agenda com os treinos atribuídos pelo Treinador, datas e etapas de cada treino.
- Registro manual de atividade concluída e consulta das avaliações recebidas.
- Conexão voluntária da própria conta Strava e visualização privada do próprio histórico, se a configuração OAuth estiver válida.

### Treinador

- Acesso protegido e painel próprio.
- Aprovar ou rejeitar cadastros de alunos.
- Criar treinos com várias etapas e instruções, atribuir o treino a alunos e definir data.
- Consultar atividades **registradas manualmente** pelos alunos e avaliá-las com nota de 1 a 5 estrelas e comentário.
- Perfil editável com nome e foto.

## Regra essencial da integração Strava

A integração Strava escolhida é **somente para o aluno ver os próprios dados**. O Treinador não pode consultar atividades importadas do Strava, receber um feed delas nem avaliá-las dentro do app. A avaliação pelo Treinador continua limitada às atividades registradas manualmente no Run Club Magagna. Nunca misture atividade Strava com atividade manual.

- Faça OAuth 2.0 no servidor. Cada aluno aprovado autoriza sua própria conta e pode desconectar quando quiser.
- Solicite apenas o escopo `activity:read` inicialmente. Não peça `activity:read_all` nem permissão de escrita. Avise que atividades “Only You” e dados de zonas privadas podem não aparecer com o escopo básico.
- Busque lista, detalhes e métricas sob demanda, quando o aluno abrir/atualizar a tela. Não crie sincronização de fundo nem webhooks nesta fase.
- Não persista atividades, rotas, métricas, streams ou detalhes Strava no banco ou em cache durável. Mostre esses dados apenas ao aluno titular e em memória enquanto a tela os utiliza.
- Persista somente os dados mínimos da conexão: tokens cifrados no servidor, escopos autorizados, datas de expiração e um identificador pseudonimizado/hash da conta para validar titularidade e evitar vínculos duplicados. Não persista o ID Strava em texto legível.
- Antes de devolver detalhes ou streams, confirme que o `athlete.id` da atividade pertence à conta Strava vinculada à sessão autenticada. Não aceite `userId` ou ID de aluno enviado pelo cliente para escolher o titular.
- Guarde Client Secret e uma chave criptográfica dedicada em variáveis protegidas de servidor. Cifre tokens com AES-256-GCM ou solução equivalente bem implementada; nunca use um segredo curto, não reutilize a chave de sessão e nunca envie tokens ao cliente.
- Use `state` aleatório, de uso único e com expiração curta; validar o estado antes de trocar o código. Implemente renovação segura do access token expirado e armazene o refresh token mais recente.
- Ao desconectar, apague imediatamente tokens, escopos, hash de conta e estados OAuth locais. Tente revogar a autorização pelo endpoint oficial; se a revogação remota falhar, informe isso sem manter a conexão local ativa.
- Inclua links “View on Strava” para as atividades de origem. Não use qualquer parte do logotipo Strava como ícone do Run Club Magagna.
- Trate erros `redirect_uri` sem adivinhação: derive o callback da URL pública da API configurada no ambiente; compare a URI exata enviada ao Strava com o domínio cadastrado no painel; explique separadamente o campo “Site” e o campo “Authorization Callback Domain”. Nunca deixe endereço temporário de Preview hardcoded no código.
- Documente que o app Strava novo começa em modo de um atleta; para contas de alunos, o responsável precisa elevar a capacidade no painel Strava. O app depende de uma conta Strava com assinatura para ser criado. O código deve mostrar um estado claro quando credenciais/callback não estiverem configurados, sem dados falsos.
- Respeite limites de chamadas: paginação, atualização manual, tratamento de 429 e mensagens úteis ao aluno.

## Segurança e dados

- Verifique autorização e papel no servidor em toda operação; esconder um botão no cliente não basta.
- Hash de senha com algoritmo adequado e parâmetros atuais; sessão em cookie HttpOnly/Secure ou armazenamento seguro nativo, conforme plataforma.
- Valide entradas, limite tentativas de autenticação e proteja endpoints contra CSRF/abuso quando aplicável.
- Fotos de perfil devem usar armazenamento privado, validar tipo/tamanho e evitar URLs públicas permanentes sem necessidade.
- Migrações devem ser aditivas e nunca apagar ou modificar dados existentes sem minha autorização explícita.
- Inclua política simples de privacidade e avisos claros antes de conectar o Strava, indicando exatamente quais dados são consultados, por quem e por quanto tempo ficam armazenados.

## Experiência e telas

Crie navegação móvel de uso simples, adequada a uma mão, com estados de carregamento, vazio e erro. Inclua pelo menos:

- Login, cadastro de aluno e tela de aguardando aprovação.
- Início do aluno com próximo treino, progresso e acesso à agenda.
- Agenda/treino com etapas detalhadas e registro manual de conclusão.
- Avaliações do Treinador visíveis ao aluno.
- Painel do Treinador para aprovações, criação/atribuição de treinos e avaliação manual.
- Perfil editável para ambos os papéis.
- Tela Strava privada do aluno: consentimento, conectar/desconectar, lista paginada, detalhes e métricas que realmente vierem da API. Não invente métricas ausentes.

O GPS em tempo real pode ficar como etapa futura. Até existir gravação GPS real, não descreva um registro manual como se fosse rastreamento GPS.

## Validação e entrega

- Escreva testes para permissões, aprovação, OAuth `state`, cifragem/renovação de tokens, validação de titularidade, filtros do feed do Treinador e separação entre atividade manual e Strava.
- Rode typecheck, lint, testes e build disponíveis no repositório. Corrija falhas antes de declarar concluído.
- Não conecte uma conta real nem aceite consentimento Strava em nome de um aluno. O próprio aluno deve iniciar e aprovar a autorização.
- Ao final, informe: o que foi implementado, verificações executadas, o que ainda depende de configurar no painel Strava, callback completo a cadastrar, URL de Preview e qualquer limitação conhecida. Não diga que OAuth está funcionando até completar um teste real autorizado por um aluno.

Comece inspecionando o repositório e, em seguida, implemente o que estiver faltando sem quebrar o que já funciona.