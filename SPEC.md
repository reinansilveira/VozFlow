# VozFlow — Especificação do Projeto

## 1. Objetivo

O VozFlow é uma extensão para Chrome baseada no WhatsApp Web. Seu objetivo é permitir o envio de áudios, textos e mídias de forma organizada e humanizada, incluindo mensagens prontas, agendamentos, funis, gatilhos e ações de remarketing.

Toda funcionalidade deve ser implementada a partir de uma especificação clara, com critérios de aceitação e validação antes de ser considerada concluída.

## 2. Princípios

- React para interfaces e componentes reutilizáveis.
- TypeScript para regras, contratos e segurança de tipos.
- Sass para estilos, seguindo BEM.
- Separação clara entre UI, regras de negócio, serviços e integração com o Chrome.
- Código pequeno, legível, testável e com uma única responsabilidade.
- Nenhum commit deve ser criado sem autorização explícita do responsável pelo projeto.
- Nenhum envio externo, disparo ou ação automatizada deve ocorrer sem regras de segurança e confirmação adequadas.

## 3. Arquitetura-alvo

```text
public/
└── manifest.json

src/
├── background/
│   └── index.ts
├── content/
│   ├── index.ts
│   └── components/
├── entries/
│   ├── popup/
│   ├── options/
│   └── sidepanel/
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── utils/
└── vite-env.d.ts

vite.config.ts
```

### Contextos de execução

- `background`: service worker, sem UI e sem dependência de DOM.
- `content`: código executado no WhatsApp Web; manipulação de DOM e comunicação com a extensão.
- `entries`: pontos de entrada das interfaces React.
- `shared`: código reutilizável entre os contextos, sem dependência indevida de um contexto específico.

## 4. Regras de React e TypeScript

- Componentes TSX devem priorizar composição e leitura visual.
- Regras de negócio devem ficar em hooks, services, stores ou funções TypeScript dedicadas.
- Funções puras devem ficar em `utils` quando forem reutilizáveis.
- Não colocar chamadas de API, manipulação complexa de storage ou automação do WhatsApp diretamente no JSX.
- Usar `export const nome = () => {}` como padrão para funções e componentes.
- Cada função deve ter responsabilidade única.
- Hooks só devem ser criados quando houver estado, ciclo de vida ou composição React real.
- Não usar `use client` sem que a ferramenta de build exija isso.
- Tipos compartilhados devem ser declarados em `shared/types`.
- Evitar `any`; quando necessário, justificar no código.
- Estados de carregamento, vazio, erro e sucesso devem ser tratados na UI.

## 5. Regras de Sass e BEM

Os estilos devem usar Sass e a convenção BEM:

```scss
.hero {
  &__container {
    & > ul {
      @include max(1200px) {
        color: $white;
      }
    }
  }
}
```

- Classes devem seguir `bloco`, `bloco__elemento` e `bloco--modificador`.
- Evitar estilos inline, exceto para valores realmente dinâmicos.
- Variáveis globais ficam em `styles/abstracts/_variables.scss`.
- Mixins ficam em `styles/abstracts/_mixins.scss`.
- Funções Sass ficam em `styles/abstracts/_functions.scss`.
- Breakpoints devem ser centralizados.
- Não repetir cores, espaçamentos, tipografia ou sombras.
- Evitar aninhamento profundo; priorizar até três níveis quando possível.
- Não estilizar elementos por seletores globais frágeis.
- Componentes devem ter estilos próximos à sua implementação ou em um arquivo Sass correspondente.

## 6. Funcionalidades previstas

### Dashboard, navegação e tema

- O popup da extensão deve oferecer a ação **Abrir painel**, que abre o dashboard em uma nova aba do navegador usando uma página interna da própria extensão.
- O cabeçalho do painel compacto dentro do WhatsApp deve exibir uma ação **Painel** claramente identificada, capaz de abrir ou trazer para frente o dashboard completo.
- O dashboard em aba deve ocupar toda a área disponível e, em telas desktop, organizar navegação vertical, cabeçalho e conteúdo no padrão visual do ZapVoice.
- O painel compacto dentro do WhatsApp deve continuar disponível para o contexto da conversa e compartilhar dados, tema e componentes com o dashboard completo.
- Em larguras menores, o dashboard deve converter a navegação vertical em uma faixa horizontal e reorganizar seus cartões sem rolagem lateral da página.
- O painel lateral deve oferecer temas claro e escuro por um controle visível no cabeçalho.
- A preferência de tema deve persistir entre aberturas; na primeira execução, o painel deve respeitar a preferência de cor do sistema.
- O tema escuro deve alcançar todas as telas, cartões, listas, formulários, campos, estados vazios, avisos e ações, sem trechos claros isolados.
- A identidade visual escura deve seguir a referência do ZapVoice: fundo roxo profundo, superfícies em camadas, bordas discretas e acentos coloridos que diferenciam cada área.
- A navegação deve preservar o formato compacto do painel do Chrome e adaptar a hierarquia do dashboard de referência sem reduzir a área útil ou exigir uma largura de desktop.
- O seletor de tema deve possuir nome acessível, estado identificável por tecnologia assistiva, foco visível e contraste suficiente nos dois temas.

### Mensagens

- Salvar e reutilizar textos, áudios, imagens, vídeos e documentos.
- Enviar áudio com aparência de gravação feita no momento.
- Organizar mensagens por categorias e favoritos.

#### Biblioteca e edição

- A biblioteca deve separar a visão geral, áudios, imagens, textos e documentos em abas acessíveis.
- Áudios e imagens salvos podem ser renomeados sem alterar o arquivo armazenado.
- Documentos salvos podem ser renomeados sem alterar o arquivo, o tipo MIME ou a extensão original.
- Textos salvos possuem nome e conteúdo editáveis e podem ser enviados para a conversa aberta.
- Ações de editar, salvar, cancelar, enviar e excluir devem ter rótulos acessíveis e ícones SVG consistentes.

#### Barra de atalhos

- O WhatsApp Web deve exibir os cartões de atalho em uma faixa horizontal imediatamente abaixo do campo de mensagem quando uma conversa estiver aberta, sem cobrir nem impedir a digitação.
- Os três itens mais relevantes devem permanecer visíveis na faixa como blocos compactos, exibindo somente o ícone SVG e o nome do atalho, sem número de ranking nem subtítulo de tipo.
- Cada tipo deve ser reconhecido pela combinação de cor e ícone SVG do próprio bloco; os blocos devem ser independentes, com espaçamento e cantos arredondados equivalentes à referência do ZapVoice.
- Os funis têm prioridade na fileira; dentro de cada tipo, prevalecem quantidade de usos, recência e data de criação.
- Uma bolha de filtro deve abrir um menu compacto e acessível para alternar entre todos, funis, áudios, imagens, mensagens e documentos.
- O atalho deve listar separadamente os funis, áudios, imagens, mensagens e documentos mais usados, com ordenação por quantidade de usos e recência.
- Itens nunca usados permanecem disponíveis depois dos mais usados, ordenados pela criação mais recente.
- Selecionar um item deve abrir no centro da tela uma confirmação com fundo desfocado, destinatário, nome, tipo, duração estimada, término e orientações antes do envio.
- A confirmação deve usar ações explícitas de cancelar e enviar, manter o foco no diálogo, fechar por `Escape` e nunca enviar pelo clique inicial no atalho.
- Documentos devem preservar nome, extensão e tipo MIME durante o envio e também podem compor etapas de funil.
- Nenhum item ou funil pode ser enviado diretamente pelo primeiro clique no atalho.
- A barra deve informar sucesso ou erro, funcionar por teclado e se adaptar ao espaço disponível sem cobrir o campo de mensagem.

### Funis

- Criar sequências de mensagens.
- Misturar textos, áudios e mídias.
- Configurar atrasos entre etapas.
- Pausar, editar, duplicar e ativar/desativar funis.
- Ao editar um funil salvo, carregar nome e etapas no formulário, permitir cancelar a edição e manter sua identidade e data de criação ao salvar.

### Gatilhos e remarketing

- Iniciar um funil por palavra-chave ou evento configurado.
- Criar follow-ups e campanhas de reativação.
- Aplicar tags e segmentar contatos.
- Impedir duplicidade e permitir cancelamento.

Problema: quem atende no WhatsApp responde muitas vezes às mesmas perguntas ("preço", "catálogo") e perde clientes que pararam de responder. O VozFlow deve responder sozinho quando uma mensagem recebida corresponder a uma palavra-chave e acompanhar contatos com uma sequência de mensagens até que eles respondam, sem colocar o número do usuário em risco de restrição por spam.

Escopo:

- Nova área **Automação** no painel (compacto e dashboard), com as abas **Gatilhos** e **Remarketing** e um controle global **Pausar tudo**.
- Recurso exclusivo do plano Pro. O acesso é liberado quando o passe é válido para o número conectado (`hasSendAccess`) e o plano do passe contém a palavra "Pro" (sem diferenciar maiúsculas) ou o estado é `teste_ativo` (o teste grátis libera tudo). Sem esse acesso, a área mostra o motivo e o link de assinatura, as configurações continuam visíveis e editáveis, nenhum gatilho dispara e nenhuma etapa de remarketing é enviada (ficam pendentes até o acesso voltar).
- Configuração global guardada em `chrome.storage.local` (`vozflow.automation`): pausa geral e limite diário de disparos de gatilhos (padrão 50, entre 1 e 500). A pausa geral interrompe novos disparos de gatilhos e o envio das etapas de remarketing, sem apagar inscrições.

Gatilhos:

- Cada gatilho tem nome, uma ou mais palavras-chave (separadas por vírgula ou linha), modo de correspondência, ação, atraso de resposta, período sem repetição, opção de responder em grupos, tag opcional, fluxo de remarketing opcional e liga/desliga.
- Ação: enviar um áudio da biblioteca (com o indicador "gravando" durante o atraso de resposta) ou iniciar um funil salvo (respeitando os atrasos das etapas). O atraso de resposta (0 a 120 s, padrão 5 s) é somado ao atraso da primeira etapa.
- Correspondência: o texto recebido e as palavras-chave são normalizados (minúsculas, sem acentos, sem pontuação, espaços colapsados). Modo **contém**: a palavra ou frase aparece inteira na mensagem (fronteira de palavra; "oi" não corresponde a "boi"). Modo **exata**: a mensagem inteira é igual à palavra-chave. Mensagens sem texto (mídia sem legenda) não disparam gatilhos.
- Fonte: o script da página escuta `chat.new_message` do WhatsApp e só repassa mensagens novas (`isNewMsg`), recebidas (não enviadas pelo próprio usuário), com até 5 minutos de idade e que não sejam status, transmissão ou canal. O texto é usado apenas para comparar no `background` e nunca é armazenado.
- Grupos: gatilhos ignoram grupos (`@g.us`) por padrão; o usuário pode liberar por gatilho.
- Deduplicação: o mesmo gatilho não dispara duas vezes para a mesma conversa dentro do período sem repetição (1 a 720 horas, padrão 24 h). A reserva do disparo é gravada de forma atômica (transação do IndexedDB) antes do envio, então duas mensagens seguidas não geram dois envios. Um disparo que falhou também conta para o período, para não reenviar algo que pode ter saído parcialmente.
- Uma mensagem dispara no máximo um gatilho: o mais antigo entre os ligados que corresponderem.
- Limite diário global de disparos; atingido o limite, novos disparos ficam bloqueados até o dia seguinte e o motivo aparece no painel.
- Depois do disparo, a tag do gatilho é aplicada ao contato e, se configurado, o contato é inscrito no fluxo de remarketing escolhido (respeitando as regras de inscrição abaixo).
- Cada gatilho mostra total de disparos, último disparo e último erro. O envio usa o mesmo executor dos funis manuais, direcionado ao identificador da conversa que enviou a mensagem; falhas são registradas e não são repetidas automaticamente.

Remarketing:

- Um fluxo tem nome, etapas (texto, áudio, imagem ou documento), atraso de cada etapa (em minutos, horas ou dias, contado a partir da inscrição para a primeira etapa e do envio anterior para as demais), limite diário de pessoas, intervalo mínimo entre pessoas e liga/desliga.
- O conteúdo das etapas é copiado da biblioteca ao salvar o fluxo, como nos agendamentos; editar o fluxo atualiza as etapas para as inscrições em andamento (quem já passou da última etapa nova é concluído).
- O fluxo é guardado como uma campanha do tipo `remarketing` na mesma fila dos agendamentos (`campaigns`/`deliveries`), reaproveitando `chrome.alarms`, estados por destinatário, persistência do identificador da mensagem, confirmação por ACK e novas tentativas. Cada inscrição é uma entrega. Campanhas de remarketing não aparecem na tela de agendamentos e nunca são marcadas como concluídas automaticamente.
- Só entram contatos que já conversaram com o usuário: o VozFlow mantém localmente (store `contacts`) as conversas individuais com pelo menos uma mensagem recebida do contato, registradas pelas mensagens recebidas e pela conversa aberta. Grupos nunca entram.
- Formas de inscrição: pela conversa aberta, por um gatilho, ou em lote (reativação) escolhendo contatos conhecidos filtrados por tag e por dias sem mensagens do contato, com confirmação explícita mostrando a quantidade.
- Duplicidade: um contato só pode ter uma inscrição ativa por fluxo; inscrições repetidas são ignoradas e informadas.
- Limites em tempo de execução: o fluxo não envia para mais pessoas por dia que o limite (padrão 20, entre 1 e 100) e respeita o intervalo mínimo entre envios para pessoas diferentes (padrão 10 min, entre 1 e 180); uma etapa adiada por esses limites é reprogramada sem consumir tentativas.
- Saída do fluxo: quando o contato envia qualquer mensagem depois da inscrição, todas as suas inscrições ativas em fluxos são encerradas com o motivo "respondeu"; se uma etapa estiver sendo enviada nesse momento, ela termina e nenhuma outra é enviada. O usuário pode cancelar uma inscrição individual ou excluir o fluxo.
- Desligar o fluxo pausa todas as inscrições; ligar retoma, respeitando os limites.

Não escopo (fases seguintes):

- Gatilhos por outros eventos (primeira mensagem, horário fora do expediente) e expressões regulares.
- Importar contatos da lista completa do WhatsApp; a reativação usa os contatos conhecidos pelo VozFlow.
- Sincronizar gatilhos, fluxos e contatos entre computadores.

Critérios de aceitação:

- O painel permite criar, editar, excluir, ligar e desligar gatilhos e fluxos, com estados de carregamento, vazio, erro, sucesso e bloqueio por plano.
- Uma mensagem com a palavra-chave dispara o áudio ou funil configurado uma única vez por conversa dentro do período sem repetição; uma mensagem de grupo não dispara com a configuração padrão.
- "Pausar tudo" impede novos disparos e envios de remarketing até ser desligado.
- Um contato que responde sai de todos os fluxos ativos; um contato sem mensagem recebida não pode ser inscrito.
- O limite diário e o intervalo entre pessoas do fluxo são respeitados mesmo com várias inscrições vencidas ao mesmo tempo.
- Sem plano Pro ou passe válido, nada é enviado automaticamente.
- Testes cobrem a correspondência de palavras-chave, a deduplicação, os limites do remarketing, a inscrição e a saída do fluxo.

### Agendamento

- Agendar mensagens individuais e sequências.
- Visualizar, editar e cancelar agendamentos.
- Exibir status pendente, enviado, pausado, cancelado e erro.
- Um agendamento deve ser organizado como uma campanha com nome, conteúdo, destinatários, data inicial, intervalo entre pessoas e limite diário.
- A campanha pode usar um texto salvo ou um funil; o conteúdo deve ser copiado no momento da criação para que alterações posteriores na biblioteca não mudem envios já confirmados.
- Os destinatários devem ser informados no formato `Nome; telefone`, um por linha, com normalização do telefone, rejeição de números inválidos e remoção de duplicidades.
- O fluxo principal de destinatários deve permitir adicionar a conversa atualmente aberta no WhatsApp, usando e preservando o identificador real retornado pelo WhatsApp; a digitação de telefone permanece apenas como alternativa.
- A identificação da conversa aberta não deve depender de um único estado interno do WhatsApp: deve priorizar o `chatId` ativo e usar, como alternativas seguras, o identificador presente na conversa renderizada e a correspondência exata do título visível com a lista de conversas.
- Destinatários capturados da conversa devem continuar associados ao mesmo `chatId` ao visualizar ou editar a campanha, sem reconstruir esse identificador a partir do nome ou telefone exibido.
- Para agendamentos simples, a conversa aberta deve ser selecionada automaticamente. O fluxo principal deve solicitar somente conteúdo e data/hora; nome, múltiplos destinatários, limite diário, intervalo, dias úteis e telefone manual ficam em opções avançadas.
- Quando o nome não for informado, a interface deve gerar um nome de campanha legível a partir do conteúdo e dos destinatários.
- O limite diário deve distribuir automaticamente os destinatários entre os dias seguintes, preservando o horário inicial e permitindo ignorar fins de semana.
- O horário inicial representa o envio da primeira etapa. Em um funil, as etapas seguintes respeitam seus próprios atrasos e persistem individualmente entre reinícios do service worker.
- Conteúdos binários de etapas agendadas devem atravessar as mensagens da extensão em formato serializável em JSON e ser reconstruídos antes do envio; o limite por arquivo agendado é de 40 MB.
- Cada destinatário deve possuir progresso e estado independentes: pendente, processando, nova tentativa, enviado, pausado, cancelado ou erro.
- Campanhas ativas podem ser pausadas, retomadas e canceladas; campanhas concluídas ou canceladas não podem voltar a enviar sem uma nova confirmação.
- Antes de ativar, a interface deve mostrar uma prévia com conteúdo, quantidade de pessoas, primeiro e último envio e solicitar confirmação explícita.
- O agendador local deve usar `chrome.alarms`, manter a fila em armazenamento persistente e recriar o próximo alarme sempre que o service worker iniciar.
- Caso o Chrome, o computador, a sessão ou a aba do WhatsApp Web não estejam disponíveis, a entrega deve ficar em nova tentativa, registrar o motivo e nunca ser descartada silenciosamente.
- Falhas temporárias de carregamento, conexão ou identidade do WhatsApp não devem consumir o limite de tentativas de envio. Devem voltar à fila em até 30 segundos; registros antigos com `No LID for user` devem ser recuperados automaticamente.
- O executor deve processar um destinatário por vez, respeitar o limite diário configurado e direcionar o envio pelo identificador do contato, sem depender da conversa aberta.
- Antes de enviar para um telefone salvo como `@c.us`, o executor deve consultar o WhatsApp e validar a existência do usuário. Deve usar `@lid` somente quando a sessão atual já possuir o próprio LID carregado; em sessões não migradas, deve preservar o `@c.us` validado. O identificador compatível resolvido deve ser persistido para as próximas etapas e tentativas.
- Conversas já capturadas como `@lid` devem preservar esse identificador quando a sessão estiver pronta; se o próprio LID da conta ainda não estiver disponível, o executor deve aguardar a sincronização ou usar o telefone `@c.us` mapeado pelo WhatsApp, sem fabricar identificadores.
- Depois de recarregar ou reiniciar o WhatsApp Web, nem o `currentLid` nem o sinal de conta migrada significam sozinhos que a identidade está pronta: se `isLidMigrated`, `isSyncdSessionMigrated` ou `currentLid` indicar migração, a fila deve aguardar até que o próprio LID possa ser lido com sucesso antes de iniciar qualquer envio.
- Se o WhatsApp expuser um LID opcional válido, mas o getter estrito usado internamente pelo envio estiver ausente ou quebrado, a integração pode compatibilizar somente esse getter com o mesmo LID opcional validado. Um LID de dispositivo fornecido pelo próprio WhatsApp só pode ser usado depois de convertido pela fábrica oficial para um LID de usuário e validado sem o sufixo de dispositivo. Não deve fabricar nem gravar uma identidade no WhatsApp.
- O envio só pode começar depois de o runtime completo do WhatsApp informar sessão principal pronta, autenticada e online.
- Uma etapa só pode ser marcada como enviada quando o WhatsApp retornar um identificador de mensagem, resultado `OK` e confirmação de servidor (`ACK` enviado ou superior). Texto, áudio, imagem e documento seguem a mesma regra.
- Antes do disparo, cada etapa deve persistir o identificador de mensagem gerado pelo próprio WhatsApp. Em reinícios ou tentativas recuperadas, o executor deve consultar esse identificador e nunca reenviar uma mensagem que já esteja pendente ou confirmada.
- Se a conversa mudar com segurança de `@c.us` para o `@lid` canônico entre tentativas, um identificador antigo só pode ser substituído depois de o WhatsApp confirmar que a mensagem anterior não existe; a substituição deve ser persistida de forma atômica antes do novo envio.
- O prazo para considerar uma entrega em processamento como interrompida deve ser maior que a soma dos tempos máximos de carregamento completo da sessão e confirmação do envio, evitando que a fila recupere uma tentativa ainda ativa.
- Erros retornados como texto ou objetos do WhatsApp devem ser normalizados e exibidos de forma acionável, sem substituir a causa real por uma mensagem genérica.
- A interface deve informar que o agendamento local depende do computador ligado, Chrome aberto e WhatsApp Web conectado.

### Segurança

- Solicitar confirmação antes de ações irreversíveis ou envios em massa.
- Aplicar limites configuráveis de envio.
- Registrar erros sem armazenar dados sensíveis desnecessários.
- Não enviar mensagens sem uma regra, ação ou autorização configurada pelo usuário.

### Site institucional (landing page)

Problema: o VozFlow precisa de uma página pública de apresentação e venda, indexável por buscadores, com identidade visual própria.

Escopo:

- Landing page estática em `site/`, independente do build da extensão, gerada por `vite.site.config.ts` em `site/dist/`.
- HTML semântico renderizado sem JavaScript; o script da página cuida apenas de melhorias progressivas (menu móvel e ano do rodapé).
- Estilos em Sass com BEM, organizados em `site/src/styles/` (abstracts, base e components), com visual institucional (branco, azul-marinho #0d2433 e verde da marca #12805c, sem degradês nem brilhos) e fonte Plus Jakarta Sans, abordagem mobile-first e sem rolagem lateral.
- Logo vetorizada própria (símbolo e logotipo em SVG) em `site/public/brand/`, usada também como favicon.
- Página de venda (estrutura dor → solução → prova → oferta → garantia), nesta ordem: cabeçalho com navegação e CTA, hero escuro com promessa, CTA, garantias curtas e vídeo de apresentação (capa com play; o som só toca no clique), faixa de provas verdadeiras com selos de segurança, dor do atendimento manual, calculadora de tempo perdido, recursos, como funciona, prova social real (escondida sem dados), para quem é, comparação "sem VozFlow × com VozFlow", planos, garantia, perguntas frequentes, chamada final e rodapé.
- Paleta de conversão: seções escuras (`$color-navy`) alternadas com claras, CTA verde vibrante `$color-cta` com texto escuro (contraste acima de 8:1) e amarelo `$color-highlight` só para destaques (marca-texto, oferta, selo recomendado).
- Prova social publicada (05/11/2026), com fonte Hotmart informada pelo responsável: "Junte-se a mais de 20 mil empreendedores que já atendem no WhatsApp com o VozFlow", com fotos de quatro clientes como avatares, 2,1 mil assinantes ativos e 20 mil downloads; 210 mil mensagens enviadas por dia, calculadas pelo responsável no dashboard da versão anterior.
- Números e depoimentos ficam em `site/src/social-proof.ts`, com contagem animada; a seção "Quem usa" só aparece quando houver dados reais.
- Oferta de lançamento (preço de fundador mantido enquanto a assinatura estiver ativa) acima dos planos. Decisão do responsável (05/11/2026): manter. Quem assinar durante o lançamento renova sempre pelo mesmo valor; aumentos de preço valem só para novas assinaturas (na Cakto, criar novas ofertas em vez de alterar as antigas).
- Avisos de atividade recente: pequenos cartões no canto da tela ("Alguém de Sergipe assinou o Pro · há 12 min") alimentados pela Edge Function pública `recent-activity`, que lê assinaturas ativas da Cakto e testes grátis dos últimos 60 dias. Expõem só o tipo de evento, o plano, o estado (derivado do DDD) e o horário; nunca nome, número ou e-mail. Sem `VITE_ACTIVITY_URL` no build, os avisos usam a lista cadastrada à mão pelo responsável em `site/src/activity-events.ts`, com o dia e a hora de cada compra no horário de Brasília (`AAAA-MM-DD HH:mm`); na tela aparece só "há X min/h/dias"; em dev e em produção o comportamento é o mesmo. Sem eventos, nada aparece. Aviso no topo, abaixo do cabeçalho; primeiro após 5 s, depois a cada 15 s, até 30 por visita (os 30 eventos reais mais recentes), com botão de fechar e sem animação com movimento reduzido.
- Redução de reembolso e atrito na página: requisitos (computador com Chrome e WhatsApp Web; não funciona no app do celular) junto dos planos, FAQ com "O que acontece quando o teste acaba?", "Funciona no celular?" e "É seguro?", preço mensal riscado no plano anual, link "mais de 3 números? Fale com a gente", oferta de fundador válida até 31/12/2026 e botão flutuante de WhatsApp para dúvidas. No celular, o vídeo aparece logo depois do título.
- CTAs também depois de "Como funciona" e da comparação. Cliques marcados com `data-track` (teste, instalar, assinar com `data-plan`, whatsapp).
- Medição de anúncios: Meta Pixel (`VITE_META_PIXEL_ID`) e Google Analytics 4 (`VITE_GA_ID`) em `site/src/analytics.ts`, carregados só depois de "Aceitar" no aviso de cookies ("Recusar" com o mesmo destaque, escolha guardada no navegador e revisável pelo link "Cookies" no rodapé). Eventos: Lead/generate_lead (testar e instalar), InitiateCheckout/begin_checkout com o plano, Contact/contact (WhatsApp). Sem IDs no build, nada carrega e o aviso não aparece. A Política de Privacidade descreve a medição.
- Imagem de compartilhamento (`site/public/brand/og-image.jpg`, 1200×630) com o hero escuro, a promessa "Com a sua voz.", a captura real do vídeo e "3 dias grátis · sem cartão"; gerada de `scripts/og/og-image.html` por `scripts/og/render.mjs`.
- Prova social só com fatos verificáveis (teste sem cartão, garantia de 7 dias, envios sem limite diário, dados no computador do usuário, demonstração real). Números de clientes, avaliações e depoimentos só entram quando forem reais; até lá a seção não aparece. Nunca inventar números ou depoimentos (CDC, art. 37).
- Planos (proposta, valores concentrados no HTML para ajuste): teste grátis de 3 dias com tudo liberado; Essencial, 1 número, R$ 39,90 por mês ou R$ 358,80 por ano (R$ 29,90/mês); Pro, até 3 números, R$ 69,90 por mês ou R$ 598,80 por ano (R$ 49,90/mês), com suporte prioritário e gatilhos e remarketing incluídos. Todos os planos pagos têm envios ilimitados. Alternância mensal/anual no cliente.
- Efeitos de rolagem: barra de progresso de leitura, revelação suave das seções, CTA fixo no celular depois do hero. Tudo desligado com `prefers-reduced-motion` e o conteúdo é visível sem JavaScript.
- "Como funciona" mostra cada etapa com uma demonstração animada do produto em loop (instalação, áudio, funil e agendamento), feita em HTML e Sass, pronta para ser trocada por gravações de tela reais em `<video autoplay muted loop playsinline>`. Com `prefers-reduced-motion`, as demonstrações ficam paradas no estado final.
- Vídeo de apresentação editado (`site/public/media/vozflow-demo.mp4`, 1920×1080, cerca de 71 s, com capa; versão 4: gancho, dor, virada, demonstração real de áudio, funil e painel, prova de tempo economizado, oferta, garantia e CTA): criativo com gravação real do VozFlow no WhatsApp Web, narração, legenda karaokê, selos e chamada para o teste. A versão vertical e o roteiro ficam em `video-criativo/`. O player usa `preload="none"` e há dados estruturados `VideoObject`.
- Texto persuasivo e escaneável: títulos orientados a benefício, frases curtas, CTA principal único ("Testar grátis") repetido nos pontos de decisão e respostas de FAQ com até três frases.
- SEO: `lang="pt-BR"`, um único `h1`, título e descrição únicos, URL canônica, Open Graph, Twitter Card, dados estruturados JSON-LD (`Organization`, `SoftwareApplication` e `FAQPage`), `robots.txt`, `sitemap.xml` e web app manifest.
- Guias de conteúdo (decisão do responsável em 05/11/2026, para ranquear em buscas orgânicas): `/guias/` reúne os guias e cada guia fica em `/guias/<slug>/`. Primeiros temas, escolhidos pelas buscas de quem procura o que o VozFlow resolve: enviar áudio pronto no WhatsApp Web, agendar mensagens no WhatsApp Web, mensagens prontas (com modelos) e funil de vendas no WhatsApp. Cada guia tem título e descrição únicos, URL canônica, trilha de navegação (visível e em `BreadcrumbList`), dados `Article`, índice, chamada para o teste grátis e links para os outros guias. O conteúdo descreve só o que a extensão faz hoje, cita as alternativas nativas do WhatsApp quando existirem e orienta o uso sem spam. Os guias aparecem no rodapé de todas as páginas e no sitemap.
- O domínio público vem da variável `SITE_URL` no build ou, no Netlify, do endereço principal do site (variável `URL`). `SITE_GOOGLE_VERIFICATION` adiciona a meta de verificação do Google Search Console. Publicação no Netlify configurada em `netlify.toml` (build, cache longo para `/assets/*` e cabeçalhos básicos de segurança). Sem domínio definido, as URLs ficam relativas, o `robots.txt` é gerado sem `Sitemap` e o `sitemap.xml` não é emitido.

Não escopo:

- Checkout, login, área do cliente e depoimentos (não há depoimentos reais disponíveis).
- Copiar textos, imagens ou marca de sites de terceiros; a referência é apenas estrutural.

Critérios de aceitação:

- `npm run site:build` termina sem erros e gera `site/dist/`.
- A página funciona de 320 px a desktop sem rolagem horizontal.
- Navegação por teclado com foco visível, link para pular ao conteúdo, contraste adequado e respeito a `prefers-reduced-motion`.
- Preços, links da Chrome Web Store e contato ficam concentrados e sinalizados para substituição pelos valores reais.

Páginas legais:

- `site/privacidade/index.html` (Política de Privacidade) e `site/termos/index.html` (Termos de Uso, com a política de reembolso na seção `#reembolso`), servidas em `/privacidade/` e `/termos/`, com o mesmo cabeçalho e rodapé do site, entradas no `sitemap.xml` e URL canônica.
- O conteúdo descreve exatamente o que o sistema faz: dados coletados pela extensão (número do WhatsApp conectado, identificador da instalação, versão e registros de acesso guardados por 6 meses), dados recebidos da Cakto (nome, e-mail, telefone e dados do pedido, sem documento nem cartão), o que fica apenas no computador do usuário (biblioteca, agendamentos e conversas), finalidades, bases legais da LGPD, compartilhamento (Supabase e Cakto), transferência internacional, prazos de guarda, direitos do titular, segurança e a declaração de Uso Limitado da Chrome Web Store.
- Os Termos cobrem licença por número, teste grátis, planos mensal e anual pela Cakto, renovação e cancelamento, direito de arrependimento de 7 dias (CDC, art. 49) com revogação da licença no reembolso, uso aceitável no WhatsApp, ausência de vínculo com Meta e Google, limitação de responsabilidade, suspensão e foro do consumidor.
- Controlador identificado apenas pela marca VozFlow e pelo e-mail reverbolanz@gmail.com, sem nome, CNPJ nem endereço (decisão do responsável, ciente de que a LGPD e o Decreto 7.962/2013 pedem a identificação do fornecedor) (canal do titular; empresa de pequeno porte dispensada de encarregado pela Resolução CD/ANPD nº 2/2022). O e-mail aparece no rodapé de todas as páginas. O rodapé destaca a navegação do site (Início, Como funciona, Vídeo, Planos, Dúvidas e o botão Testar grátis); privacidade, termos, reembolso e contato ficam discretos na faixa final, em texto pequeno.
- O cartão de licença da extensão mostra links para as duas páginas antes do teste grátis quando `VITE_SITE_URL` estiver definido no build.

### Licenciamento, teste grátis e painel administrativo

Problema: o VozFlow precisa liberar um teste grátis limitado por número de WhatsApp, vender acesso por chave de licença e permitir que o administrador bloqueie ou ajuste qualquer chave a qualquer momento.

Princípio: a permissão mora no servidor, não na chave nem na extensão. A chave é apenas um identificador opaco; plano, validade, estado e números vinculados ficam no servidor, que é a única fonte de verdade. A extensão roda no computador do cliente e pode ser adulterada, então a proteção local serve para barrar o uso casual, e o controle real é feito no servidor.

Escopo:

- Backend de licenças no Supabase, versionado em `supabase/` (migrations, seed e Edge Functions), com a chave privada de assinatura apenas nos segredos das Edge Functions:
  - Postgres com Row Level Security ativo em todas as tabelas. A extensão nunca acessa tabelas diretamente; usa somente as Edge Functions públicas `trial-start`, `license-activate` e `pass-refresh`, que operam com a service role no servidor.
  - O painel acessa os dados com a sessão do admin, autorizado por policies que exigem usuário presente na tabela `admins` e sessão com MFA (`aal2`). Ações sensíveis (criar chave, revogar, desvincular, bloquear) passam pela Edge Function `admin`, que confere a sessão e grava o `audit_log`.
  - Supabase Auth apenas para o admin, com cadastro público desativado e MFA por TOTP obrigatório.
  - Desenvolvimento local com `npx supabase start` (Docker); o projeto de produção é criado pelo responsável e as chaves ficam fora do repositório.
- Entidades:
  - `plan`: nome, período (mensal ou anual, em dias), limite de números e o identificador da oferta correspondente na Cakto.
  - `license`: código da chave, plano, estado (`ativa`, `suspensa`, `revogada`, `expirada`), data de expiração, limite de números, origem (`manual` ou `cakto`), dados do comprador (nome, e-mail, telefone), pedido e assinatura da Cakto, se a chave já foi entregue, observação do admin, datas de criação e alteração.
  - `payment_event`: cada evento recebido da Cakto (identificador do pedido, tipo de evento e conteúdo), usado para idempotência e auditoria.
  - `activation`: vínculo entre licença, número de WhatsApp (normalizado em E.164) e identificador da instalação, com data de ativação e última verificação.
  - `trial`: número de WhatsApp, identificador da instalação, início e fim do teste.
  - `blocked_number`: número bloqueado em definitivo, com motivo.
  - `audit_log`: registro de cada ação do admin e de cada evento relevante (ativação, revogação, renovação, teste negado).
- Chaves do passe: par Ed25519 gerado por `node scripts/gerar-chaves-passe.mjs`; a privada fica no segredo `LICENSE_PASS_PRIVATE_KEY` do Supabase e a pública entra no build da extensão por `VITE_LICENSE_PUBLIC_KEY`.
- Formato da chave: `VOZ-XXXX-XXXX-XXXX`, gerada com aleatoriedade criptográfica, alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L).
- Teste grátis:
  - A extensão lê o número conectado no WhatsApp Web (já disponível em `src/content/wpp-session.ts`) e o identificador da instalação (gerado uma vez e salvo em `chrome.storage.local`), e solicita o teste ao servidor.
  - Número nunca visto e não bloqueado recebe teste de 3 dias. Número que já teve teste ou licença, ou número bloqueado, tem o teste negado.
  - Uma mesma instalação não pode abrir testes para vários números em sequência; o limite fica configurável no servidor.
- Ativação da chave:
  - O cliente cola a chave na extensão; o servidor valida o estado e vincula o número conectado, respeitando o limite de números do plano.
  - Chave com limite de números atingido é recusada com mensagem clara e orientação de contato.
- Verificação contínua:
  - Após o teste ou a ativação, o servidor devolve um passe assinado (Ed25519) contendo número, plano, estado e validade curta (padrão 72 h, configurável). A extensão guarda o passe e o verifica localmente com a chave pública embutida.
  - O `background` renova o passe periodicamente e sempre que o número conectado muda. Bloqueios feitos pelo admin passam a valer na próxima renovação.
  - Sem conexão com o servidor, a extensão funciona até o passe vencer; depois, bloqueia os recursos de envio até conseguir renovar.
  - O passe só vale para o número conectado; se o WhatsApp Web trocar de conta, a extensão exige nova verificação.
- Bloqueio de recursos na extensão:
  - A decisão "pode usar" fica centralizada em um serviço em `src/shared/services` consultado pelo `background`; a UI apenas reflete o estado.
  - Sem passe válido, os envios (atalhos, funis, agendamentos e gatilhos) ficam bloqueados; a biblioteca continua visível e editável para o cliente não perder o trabalho.
  - Agendamentos pendentes não são disparados sem passe válido e ficam marcados como "aguardando licença".
- Implementação na extensão:
  - O script da página (`main-world`) informa o número da conta conectada; o content script repassa ao `background`, que guarda o estado em `chrome.storage.local` (`vozflow.license`) e renova o passe quando o número muda, a cada 30 minutos se estiver perto de vencer ou desatualizado, e depois de ficar sem conexão.
  - O content script confere o passe antes de repassar qualquer envio manual (atalhos, mensagens prontas e funis) ao WhatsApp; sem passe válido, mostra o motivo e abre o painel. O `background` faz a mesma conferência antes de cada envio agendado.
  - O painel mostra o cartão de licença no topo: compacto quando há acesso (dias restantes, "Tenho uma chave", "Assinar") e completo nos demais estados, com a ação adequada. O teste só começa por clique, depois do aviso de privacidade.
  - Configuração no build: `VITE_LICENSE_API_URL`, `VITE_LICENSE_PUBLIC_KEY`, `VITE_CHECKOUT_URL` e `VITE_SUPPORT_URL` (modelo em `.env.example`). Sem URL ou chave pública, a extensão fica no estado "licenciamento indisponível" e não envia.
  - Versão mínima do Chrome: 137, a primeira com verificação Ed25519 nativa.
- Estados na interface da extensão: verificando, teste ativo (com dias restantes), teste expirado, licença ativa (com vencimento), licença perto de vencer, chave inválida, licença suspensa ou revogada, número bloqueado, limite de números atingido, WhatsApp desconectado e sem conexão com o servidor. Cada estado tem ação clara (ativar chave, comprar, falar com o suporte, tentar de novo).
- Painel administrativo (aplicação React + TypeScript + Sass BEM em `admin/`, build próprio por Vite, acesso apenas do admin):
  - Login com verificação em duas etapas; nenhuma rota administrativa exposta sem autenticação.
  - Licenças: criar (plano, validade, limite de números, observação), copiar a chave para enviar ao cliente, suspender, reativar, revogar, renovar ou estender validade, alterar limite de números.
  - Números: ver números vinculados a cada licença, desvincular um número (troca de chip), bloquear e desbloquear números.
  - Testes: listar testes, encerrar um teste antes do prazo e conceder novo teste manualmente.
  - Busca por chave, número ou observação; histórico (`audit_log`) por licença.
  - Indicadores básicos: testes iniciados, testes convertidos em licença e licenças ativas.
  - Implementação: `admin/` (build por `vite.admin.config.ts`, scripts `admin:dev`, `admin:build` e `admin:preview`), com `@supabase/supabase-js`. Leituras pelo RLS, alterações pela Edge Function `admin` e indicadores pela função `vf_admin_stats`. Seções: Licenças (busca, filtros, criação manual, detalhe com entrega, situação, validade, números e histórico), Testes, Números bloqueados, Planos (oferta da Cakto), Eventos da Cakto e Configurações.
  - Primeiro acesso: `node scripts/criar-admin.mjs <email>` cria o usuário e o registra em `admins`; no primeiro login o painel exige cadastrar o app autenticador (TOTP) e, depois, o código a cada sessão.
  - Variáveis em `admin/.env`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (modelo em `admin/.env.example`). O painel não é indexado (`noindex`).
- Vendas pela Cakto (checkout, Pix, cartão e assinatura), integradas por webhook na Edge Function `cakto-webhook`:
  - Planos mensal e anual disponíveis para qualquer pessoa, cada um como uma oferta na Cakto ligada a um `plan`.
  - Autenticidade: valida a assinatura `X-Cakto-Signature` (HMAC-SHA256 de `{timestamp}.{corpo}` com o segredo do webhook, tolerância de 5 minutos) quando presente; senão, compara o campo `secret` do corpo em tempo constante. Requisição inválida recebe 401 e não altera nada.
  - Idempotência: o mesmo evento para o mesmo pedido nunca é processado duas vezes; a função responde 2xx rapidamente.
  - `purchase_approved`: cria a licença do plano da oferta, com validade do período mais 3 dias de tolerância, e a deixa pronta para entrega.
  - `subscription_renewed`: estende a validade da licença da assinatura por mais um período, a partir da maior data entre hoje e o vencimento atual.
  - `refund_requested`: suspende a licença até a decisão do reembolso.
  - `refund` e `chargeback` (inclui MED do Pix): revogam a licença na hora e bloqueiam os números vinculados e o telefone do comprador para novos testes.
  - `subscription_canceled`: a licença continua válida até o fim do período já pago e não é mais renovada.
  - Oferta sem plano cadastrado ou evento não tratado: registrado em `payment_event` e sinalizado no painel, sem criar licença.
- Entrega da chave: o painel mostra as licenças ainda não entregues, com nome, e-mail e telefone do comprador e botões para copiar a chave e abrir uma mensagem pronta no WhatsApp. O envio automático por e-mail fica para quando houver provedor de e-mail definido. O admin também pode gerar chaves manuais (cortesia, parceiros).
- Redução de reembolsos: teste grátis antes da compra, revogação automática no reembolso, bloqueio de novo teste para quem reembolsou e requisitos claros na página de venda (Chrome no computador, WhatsApp Web conectado, computador ligado para agendamentos). O direito de arrependimento de 7 dias (CDC, art. 49) é respeitado; não há política de "sem reembolso".
- Controle de versão: o servidor informa a versão mínima aceita da extensão; versões abaixo dela mostram aviso de atualização obrigatória e bloqueiam envios.
- Registros de acesso: cada chamada da extensão grava IP, data, hora, operação, número e instalação em `access_logs`, sem leitura pelo painel, mantidos por 6 meses (Marco Civil da Internet, art. 15) e apagados depois.
- Privacidade e LGPD: o número de telefone é dado pessoal. Coletar apenas número, identificador da instalação e versão da extensão; nunca conteúdo de conversas, contatos ou mídias. Exibir aviso e link da Política de Privacidade antes de iniciar o teste ou ativar a chave. Declarar a coleta nas práticas de privacidade da Chrome Web Store.
- Segurança da API: HTTPS obrigatório, limite de requisições por IP e por instalação, respostas que não revelam se uma chave existe quando ela é inválida, e segredos apenas em variáveis de ambiente.

Não escopo (fases seguintes):

- Envio automático da chave por e-mail ou WhatsApp.
- Área do cliente para trocar o número vinculado sozinho.
- Proteção contra engenharia reversa da extensão além da verificação do passe assinado.
- Múltiplos administradores com papéis diferentes.

Critérios de aceitação:

- Um número novo consegue iniciar o teste de 3 dias; o mesmo número, em outra instalação ou após reinstalar, tem o teste negado.
- Um número bloqueado pelo admin não consegue iniciar teste nem ativar chave.
- Uma chave ativa vincula o número conectado e libera os envios; uma chave que excede o limite de números é recusada.
- Ao suspender ou revogar uma chave no painel, a extensão bloqueia os envios na próxima renovação do passe, sem precisar reinstalar.
- Um passe adulterado ou de outro número é rejeitado pela extensão.
- Sem conexão, a extensão continua funcionando até o passe vencer e depois bloqueia os envios com mensagem clara.
- A biblioteca do cliente continua acessível mesmo com a licença bloqueada.
- Todas as ações do admin aparecem no histórico.
- Uma compra aprovada na Cakto cria exatamente uma licença do plano da oferta, mesmo que o webhook chegue repetido.
- Um reembolso ou chargeback revoga a licença e impede novo teste do comprador; um webhook com segredo ou assinatura inválidos é recusado sem efeito.
- A renovação da assinatura estende a validade; o cancelamento mantém a licença até o fim do período pago.
- Testes cobrem a validação do passe, as transições de estado da licença e o bloqueio de recursos no `background`.

Decisões tomadas:

- Backend e autenticação do admin no Supabase (05/11/2026).
- Vendas pela Cakto, com planos mensal e anual para qualquer pessoa (05/11/2026).

Decisões pendentes (responsável):

- Onde hospedar o painel `admin/` (sugestão: Vercel ou Netlify, com domínio próprio quando existir).
- Preço e quantidade de números de cada plano (proposta no site: Essencial 1 número, Pro 3 números).
- Data de encerramento da oferta de lançamento.
- Provedor para enviar a chave automaticamente por e-mail.
- Validade do passe e tolerância sem internet (sugestão: 72 h).
- Limite de testes por instalação.

## 7. Manifest V3

- `public/manifest.json` é a fonte da configuração da extensão.
- Permissões devem ser mínimas e justificadas.
- O service worker não deve depender de APIs de janela ou DOM.
- Comunicação entre contexts deve usar mensagens tipadas.
- Recursos expostos ao WhatsApp Web devem ser explicitamente declarados.

## 8. Fluxo Spec-Driven Development

1. Descrever o problema e o resultado esperado.
2. Definir escopo, não escopo e critérios de aceitação.
3. Atualizar a especificação antes da implementação.
4. Implementar em pequenos incrementos.
5. Validar tipos, build, comportamento e estados da interface.
6. Revisar arquitetura, acessibilidade e segurança.
7. Mostrar o resumo das alterações ao responsável.
8. Aguardar autorização explícita antes de criar commit.

## 9. Critérios mínimos de aceite

- A funcionalidade atende todos os critérios da spec.
- O código respeita a separação de contextos.
- Componentes seguem React e TypeScript definidos neste documento.
- Sass segue BEM, variáveis e mixins compartilhados.
- Não há lógica de negócio complexa no JSX.
- Build e validações disponíveis passam sem erros.
- Não há commit sem autorização explícita.
