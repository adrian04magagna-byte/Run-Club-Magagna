# Run Club Magagna — plano do MVP treinador–aluno

## Produto e implementação

Evoluir o protótipo para uma plataforma móvel de corrida para um treinador responsável e seus alunos. A identidade do treinador nesta versão é a conta Manus correspondente ao e-mail mantido no segredo protegido `COACH_EMAIL` (ou ao `OWNER_OPEN_ID` quando configurado); nenhuma conta recebe o papel de treinador por padrão. O MVP cobre cadastro de alunos com aprovação manual, treino com etapas, atribuição a um aluno/data, registro manual de atividade e avaliação pelo treinador. Cada aluno acessa apenas seus próprios planos, registros e comentários. As telas Hoje/Progresso/Planos/Perfil e a área Clube consomem as consultas persistidas do MVP; o registro manual ainda não usa GPS nem execução em tempo real.

O app continua no starter Expo Router / React Native / TypeScript, com API Express/tRPC e Drizzle. Para alunos, o fluxo é e-mail e senha com aprovação manual. Para o treinador, o OAuth Manus valida o redirect e um nonce de uso único no callback antes de trocar o código; o papel administrativo só é concedido à identidade configurada em `COACH_EMAIL`/`OWNER_OPEN_ID`. O segredo `COACH_EMAIL` foi aplicado nos ambientes disponíveis; o primeiro login OAuth real ainda precisa ser concluído pelo próprio treinador. Senhas são armazenadas somente como hashes scrypt com salt; respostas pendentes/rejeitadas não recebem sessão de atleta. Estado de treinador/aluno, papel e vínculo com treinador são verificados no servidor em cada operação. Login web usa cookie HttpOnly, Secure/SameSite None em HTTPS e o nome de cookie de Preview; tokens móveis ficam no SecureStore.

A tela Perfil permitirá que a própria pessoa autenticada altere o nome de exibição e escolha/substitua uma foto quadrada da biblioteca de imagens; e-mail e papel não são editáveis. O cliente Expo usa `expo-image-picker` e `expo-image-manipulator` para seleção/corte e JPEG redimensionado; o backend valida tipo/tamanho, cria um objeto de chave aleatória no Storage gerenciado, grava somente nome e chave no MySQL e entrega URLs de leitura assinadas de curta duração. A foto fica privada: disponível ao titular e ao treinador apenas nas telas dos alunos que pertencem à turma; outros alunos não recebem essas URLs. A chave de API de Storage permanece no servidor.

O modelo relacional aditivo cobre contas/aprovação, relação treinador–aluno, treinos/etapas, atribuições, registros manuais e revisões. A primeira etapa Strava segue a opção escolhida pelo usuário: somente alunos aprovados podem conectar a própria conta OAuth e consultar, sob demanda, o próprio histórico e métricas. A conta do Treinador não conecta alunos nem recebe acesso a atividades Strava. O feed e a avaliação do Treinador aceitam somente registros manuais compartilhados; qualquer linha legada/futura `source = strava` é excluída no servidor. Nenhum registro Strava é gravado em `activities`, enviado ao feed do Treinador ou avaliado pelo Treinador. O detalhe e as séries de sensores só são retornados quando o `athlete.id` recebido do Strava corresponde ao hash do atleta vinculado à sessão; o ID Strava legível não é persistido.

Para respeitar a política de retenção, não persistir atividades/métricas nem criar cache durável; não haverá sincronização em segundo plano, webhooks, polling ou refetch automático por foco/reconexão nesta etapa. Exibir aviso de dados acessados, método, finalidade e retirada de consentimento; o botão de desconexão exclui tokens, hash, escopos e estados OAuth locais, e a tela orienta a revogação no painel Strava. Guardar access/refresh tokens criptografados server-side com `STRAVA_TOKEN_ENCRYPTION_KEY` dedicada, de pelo menos 32 bytes aleatórios, separada do segredo de sessão; persistir somente escopos/datas de vínculo e hash do ID Strava enquanto conectado. O estado OAuth é de uso único e curto prazo. O escopo inicial é `activity:read`; `activity:read_all` só será solicitado posteriormente se o aluno escolher explicitamente acesso às próprias atividades privadas e após explicar esse alcance.

O callback Strava é um endpoint HTTPS fixo do servidor, derivado da URL pública da API; após validar `state`, o servidor redireciona somente à origem web que iniciou ou ao deep link fixo do app. O código de autorização é trocado por tokens apenas em procedimento autenticado do próprio aluno. Habilitar a integração também exige assinatura Strava e cadastro de app de desenvolvedor; apps novos começam com capacidade para um atleta, podem ser elevados a dez e exigem revisão Strava para capacidade maior. Client ID/Secret, chave de criptografia e domínio de callback dependem da configuração do app Strava e do formulário protegido; a política atual não autoriza exibir atividades ao Treinador sem confirmação escrita da Strava.

Não enviar mensagens transacionais de e-mail nem oferecer recuperação de senha por e-mail até configurar um provedor de e-mail; o cadastro pendente e a aprovação podem ser vistos dentro do app. Não alterar/destruir dados existentes: migrations apenas aditivas e nenhum seed que substitua registros reais. Manter o Preview web utilizável e telas orientadas a uma mão.

## Design

- **Movimento:** utilitarismo esportivo contemporâneo, com acabamento editorial e linguagem de clube de corrida, não de dashboard corporativo.
- **Princípios:** tarefas primárias evidentes; números legíveis em movimento; incentivo sem pressão; visibilidade clara de quem criou, executou e avaliou cada treino.
- **Cores:** azul-marinho para foco e confiança, verde-lima para ação/progresso, papel quente para descanso visual, azul claro para orientação e coral para estados pessoais. A cor nunca será o único sinal de estado.
- **Layout:** cartões verticais e faixas de treino em fluxo, com listas de alunos e agenda de sessões; telas de corrida usam números grandes e poucos controles.
- **Elementos marcantes:** trilha pontilhada de ritmo; etiqueta de estado do treino/avaliação; notas do treinador em cartões azul-claro.
- **Interação:** ações grandes, confirmação visível e feedback imediato para aprovar, atribuir, concluir e avaliar.
- **Animação:** transições curtas e discretas; progresso por preenchimento suave; sem animação indispensável à leitura ou ao controle.
- **Tipografia:** sans de sistema com títulos pesados e condensados em hierarquia; métricas com numerais tabulares; microcopy compacta e clara.
- **Essência:** “o clube de corrida pessoal que liga o treino prescrito ao que cada aluno realmente fez”; personalidade próxima, consistente e encorajadora.
- **Voz:** frases curtas, sem jargão ou cobrança. Exemplos: “Um treino de cada vez, com acompanhamento de verdade.” “Você fez o que combinou; vamos escolher o próximo passo.”
- **Marca:** manter wordmark “Run Club Magagna” e símbolo abstrato de pista como ativo, com aplicação em layouts existentes.
- **Cor de assinatura:** verde-lima `#D7F752`.

## Estrutura do projeto

- `app/(tabs)/`: Hoje, Progresso, Planos, Perfil editável e a área `club.tsx`, cujo conteúdo muda conforme o papel autenticado.
- `app/login.tsx`, `app/signup.tsx` e `app/pending.tsx`: acesso do treinador/aluno, pedido de conta e estado de aprovação.
- `app/(tabs)/club.tsx`: painel do treinador para aprovar alunos, criar/atribuir treinos e avaliar atividades; painel do aluno para consultar etapas, registrar execução e ler avaliações.
- `app/strava.tsx` e Perfil: somente aluno aprovado pode consentir, conectar/desconectar sua conta via OAuth e consultar seu próprio histórico/métricas; o Treinador não vê esses dados.
- `app/activity.tsx`, `app/workout/[id].tsx`, `app/summary.tsx`: preservar o fluxo visual inicial do protótipo; conectar cronômetro/GPS e conclusão em tempo real a sessões atribuídas em etapa futura, sem afirmar que o registro manual atual faz rastreamento GPS.
- `components/`: componentes de corrida, avatar com fallback e componentes de formulário/estado comuns.
- `server/routers.ts`, `server/routers/account.ts`, `server/routers/club.ts`, `server/routers/strava.ts`, `server/_core/index.ts`, `server/_core/stravaOAuth.ts`, `server/security/passwords.ts` e `server/storage/profile-avatars.ts`: callback OAuth HTTPS com retorno fixo/validado; procedimentos limitados a alunos aprovados e à conta Strava vinculada ao ID da sessão; troca/renovação de tokens e criptografia server-side; nenhum token ou dado de atividade no bundle do cliente.
- `drizzle/schema.ts`, `drizzle/`: tabelas aditivas para vínculo Strava e estados OAuth de uso único; sem persistência de atividades Strava e migrations versionadas.
- `shared/`: tipos que podem atravessar o cliente e servidor, sem tokens nem segredos.

## Dependências e restrições

O projeto já tem servidor, banco e presign do Storage gerenciados habilitados e mantém listener Mobile 8081 + API 3000. As gravações de schema/dados do banco de desenvolvimento afetam a base compartilhada do projeto; por isso, somente aplicar alterações aditivas solicitadas. Login/aprovação de alunos, treinos manuais e revisões não dependem do Strava. `COACH_EMAIL` foi configurado de forma protegida; falta validar o primeiro login real, que deve ser feito pelo treinador. Client ID/Secret, URL de callback e capacidade da API Strava para os alunos são dependências externas pendentes; não declarar sincronização real antes de concluir essa configuração e validar OAuth. Credenciais devem ser configuradas pelo formulário seguro do projeto, nunca no chat. Serviços de e-mail para recuperação e notificações ficam como dependência posterior, não requisito implícito desta etapa.
