<p align="center">
  <img src="pwa/icons/icon-192.png" width="96" alt="Prumo">
</p>

<h1 align="center">Prumo</h1>

<p align="center"><b>Sua vida no prumo.</b><br>
Finanças, treinos, alimentação, tarefas, metas e rotinas em um único app pessoal, sobre Google Apps Script, Google Sheets e Google Drive.</p>

<p align="center">
  Versão 1.9.0 · pt-BR · R$ · America/Sao_Paulo · Sem servidor próprio, sem mensalidade
</p>

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Funcionalidades](#2-funcionalidades)
3. [Arquitetura](#3-arquitetura)
4. [Estrutura do projeto](#4-estrutura-do-projeto)
5. [Banco de dados](#5-banco-de-dados)
6. [API do servidor](#6-api-do-servidor)
7. [Gatilhos automáticos](#7-gatilhos-automáticos)
8. [Login, usuários e segurança](#8-login-usuários-e-segurança)
9. [App instalável (PWA) e notificações push](#9-app-instalável-pwa-e-notificações-push)
   - [9A. WhatsApp (API oficial da Meta)](#9a-whatsapp-api-oficial-da-meta)
   - [9B. Telegram (grátis, recomendado)](#9b-telegram-grátis-recomendado)
   - [9C. Alarmes](#9c-alarmes)
   - [9D. Estudos: leitor de PDF e Telegram](#9d-estudos-leitor-de-pdf-e-telegram)
10. [Instalação passo a passo](#10-instalação-passo-a-passo)
11. [Configuração](#11-configuração)
12. [Funções para rodar no editor](#12-funções-para-rodar-no-editor)
13. [Cálculos e fórmulas](#13-cálculos-e-fórmulas)
14. [Design](#14-design)
15. [Limites do Google](#15-limites-do-google)
16. [Solução de problemas](#16-solução-de-problemas)
17. [Testes](#17-testes)
18. [Histórico de versões](#18-histórico-de-versões)

---

## 1. Visão geral

O Prumo é um app de controle pessoal que reúne seis áreas da vida num lugar só e cruza as informações entre elas. Um aporte na reserva de emergência faz andar a meta "Juntar 10 mil". O treino de hoje aparece no "Seu dia". As calorias gastas no treino aumentam as calorias disponíveis no diário alimentar. Uma meta de água avança sozinha com o que você registra no diário.

| | |
|---|---|
| **Onde roda** | Web App do Google Apps Script. Funciona no navegador do computador e do celular, e também como app instalado (PWA). |
| **Onde ficam os dados** | Uma planilha Google Sheets com 74 abas, uma por tabela. Os arquivos (comprovantes, fotos, rótulos) ficam numa pasta do Google Drive. |
| **Quem acessa** | Qualquer pessoa com o link e a senha de acesso. Cada e-mail tem os próprios dados. |
| **Custo** | Zero. Usa só a conta Google do dono. |
| **Interface** | Mobile-first, tema escuro (padrão) e claro, fonte Plus Jakarta Sans, ícones próprios em SVG, sem emojis. |

### Destaques

- **Local-first.** O app carrega tudo de uma vez e grava em segundo plano. A tela muda na hora e volta atrás se o servidor recusar ("escrita otimista").
- **Desfazer.** Toda exclusão é lógica e mostra "Desfazer" por alguns segundos.
- **Auditoria completa.** Cada gravação fica registrada com o antes e o depois, quem fez, quando e de qual aparelho.
- **OCR em português.** Foto do cupom fiscal, do comprovante Pix ou do rótulo nutricional vira lançamento ou alimento preenchido.
- **Push no celular.** Lembretes chegam com o app fechado, quando ele está instalado.
- **Telegram.** Avisos, resumo do dia e comandos (/hoje) num bot próprio, grátis e sem servidor.
- **WhatsApp opcional.** Módulo pronto para a API oficial da Meta, que exige verificação da empresa (CNPJ/MEI).
- **Instala como app.** Ícone na tela inicial, abre em tela cheia, atalhos para os módulos.

---

## 2. Funcionalidades

### 2.1 Início

O painel do dia, que junta tudo:

- Saudação e semana em fita, para navegar pelos dias.
- **Seu dia:** rotinas, tarefas, eventos, treinos e contas do dia em ordem de horário. Dá para marcar como feito ali mesmo.
- Cartões rápidos: calorias restantes (anel), água (com botão +250 ml), rotinas feitas, treinos na semana.
- Sequência de dias ativos (chama).
- Para quem está começando: atalhos para o primeiro cadastro e o botão de carregar dados de exemplo.
- **Central de notificações** (sino): contas a vencer, faturas, tarefas atrasadas, metas em risco, lembretes e rotinas. Marca como lida e abre a tela certa.
- **Busca global** (Ctrl K ou ícone de lupa): encontra lançamentos, tarefas, metas, rotinas, exercícios e alimentos, e executa ações ("novo lançamento", "iniciar treino").
- **Botão +:** atalho de criação para todos os módulos.

### 2.2 Finanças

| Tela | O que faz |
|---|---|
| **Resumo** | Saldo em contas, patrimônio (contas + reservas + investimentos − dívidas), receitas e despesas do mês com comparação ao mês anterior, resultado e % da renda, projeção de gastos até o fim do mês, gastos dos últimos 7 dias, fluxo de caixa de 6 meses, despesas por categoria (rosca), próximos vencimentos e orçamento. |
| **Lançamentos** | Lista agrupada por dia com totais. Filtros (tipo, período, busca por texto ou valor), seleção múltipla (pagar, recategorizar, excluir em lote), deslizar para ações. |
| **Novo lançamento** | Receita, despesa ou transferência. Teclado de valor em centavos, categoria com subcategoria, conta ou cartão, forma de pagamento, estabelecimento, tags, observação e anexo do comprovante. Parcelamento no cartão (gera as N parcelas nas faturas certas), recorrência (mensal, semanal etc.), duplicar e status pago/pendente/agendado. Sugere a categoria pela regra do estabelecimento. |
| **Escanear comprovante** | Foto ou PDF do cupom ou do Pix → OCR → valor, data, estabelecimento e categoria preenchidos. O arquivo fica anexado. |
| **Contas** | Contas correntes, poupança, carteira e corretora. Saldo calculado, extrato da conta e **reconciliação** (informe o saldo real e o app cria o ajuste). |
| **Cartões** | Limite usado e disponível, faturas abertas, fechadas e pagas, itens da fatura, **pagar fatura** (gera a saída na conta) e **simulador de compra parcelada** (mostra o impacto nas próximas faturas). |
| **Orçamento** | Limite por categoria no mês, barra de consumo com alerta, copiar do mês anterior. |
| **Contas a pagar** | Agenda dos pendentes e das recorrências, gerar lançamentos do mês, pausar uma recorrência. |
| **Reservas e investimentos** | Caixinhas com meta e progresso, aportes e resgates (saem e entram das contas), investimentos por tipo com rentabilidade. |
| **Dívidas** | Saldo, juros e parcelas. Plano de quitação **avalanche** (maior juros primeiro) ou **bola de neve** (menor saldo primeiro), com valor extra por mês e data estimada de quitação. |
| **Relatórios** | Período de 3, 6 ou 12 meses: evolução de receitas e despesas, categorias, maiores gastos, médias. Exporta CSV e versão para impressão. |
| **Categorias e regras** | Categorias e subcategorias com cor e ícone. Regras do tipo "se o texto contém X, a categoria é Y". |
| **Importar extrato** | CSV ou OFX do banco: mapeamento de colunas, inversão de sinal, prévia e **sem duplicar** (hash de importação). |

### 2.3 Fitness

| Tela | O que faz |
|---|---|
| **Resumo** | Treino do dia, treinos na semana contra a meta, volume, sequência, peso atual e passos. |
| **Treinos (fichas)** | Fichas por objetivo e nível, dias da semana, exercícios com séries, repetições, carga, descanso e ordem. Modelos prontos, duplicar ficha. |
| **Modo foco** | Treino guiado em tela cheia: série por série, carga e repetições anteriores, **descanso automático** com contagem regressiva e bipes, tela sempre acesa. No fim calcula volume, kcal estimadas, e1RM e **recordes pessoais**. |
| **Exercícios** | Biblioteca com 86 exercícios por grupo muscular e equipamento, mais os seus. |
| **Timers** | Cronômetro, regressivo, intervalado, EMOM e Tabata, com presets salvos e som. |
| **Histórico** | Sessões feitas, com detalhe de cada série. |
| **Evolução** | Força por exercício (e1RM ao longo do tempo), medidas corporais, peso e % de gordura, fotos de progresso com comparação lado a lado. |
| **Cardio** | Corrida, bike etc. com distância, tempo, ritmo e kcal (MET). Registro de passos. |
| **Calculadoras** | IMC e faixa saudável, TMB e gasto diário, % de gordura (Marinha), 1RM (Epley/Brzycki), zonas de frequência cardíaca. |

### 2.4 Alimentação

| Tela | O que faz |
|---|---|
| **Diário** | Refeições do dia (café, almoço, lanche, jantar, ceia) com kcal e macros, anel de calorias restantes (soma o gasto do treino se você quiser), água com copos rápidos, copiar um dia, refeições favoritas. |
| **Adicionar alimento** | Busca na base própria com 115 alimentos (TACO aproximada), **código de barras** (câmera com leitura automática ou digitação, consulta a Open Food Facts) e **OCR do rótulo**. |
| **Nutrientes** | Micronutrientes do dia com % do valor diário, ou a **média por dia** de 7 dias, 30 dias, um mês ou um intervalo de datas. |
| **Meta de água** | Toque no total do cartão de água para escolher quantos litros beber por dia (1,5 a 4 L ou outro valor), ou volte ao cálculo automático (35 ml por kg). |
| **Alarmes** | Lembretes de água (a cada N horas, com opção de parar quando a meta do dia for batida), refeições e remédios. Veja a [seção 9C](#9c-alarmes). |
| **Metas e calculadora** | Objetivo (perder, manter, ganhar), TMB por Mifflin-St Jeor ou Katch-McArdle, nível de atividade, ritmo por semana, macros e água, com **limites de segurança** (validados também no servidor). |
| **Meus alimentos / Receitas** | Cadastro próprio. Receita soma os ingredientes e divide por porções. |
| **Relatórios** | Médias de calorias, macros e água, aderência à meta e **TDEE adaptativo** (estimado pelo peso real com média móvel), em 7 dias, 30 dias, mês, 90 dias, ano ou intervalo. |

### 2.5 Tarefas

| Tela | O que faz |
|---|---|
| **Hoje** | Atrasadas, de hoje e sem data, com prioridade, projeto, subtarefas e concluir com um toque. |
| **Próximas / Pendências** | Os próximos dias agrupados. Pendências antigas com "reagendar tudo". |
| **Quadro** | Kanban (a fazer, fazendo, feito) por projeto. |
| **Agenda** | Dia, semana e mês, com eventos (dia inteiro, local, lembrete) e tarefas. Envio opcional ao Google Agenda (conta dona). |
| **Projetos** | Projetos com cor, progresso e arquivamento. |
| **Foco** | Pomodoro ligado a uma tarefa, com ciclos e pausas. |
| **Concluídas / Estatísticas** | Histórico e produtividade por dia, semana e projeto. |
| **Lembretes** | Minutos antes do vencimento: notificação no app, push no celular e e-mail. |
| **Alarme da tarefa** | No editor da tarefa, escolha **Alarme** (na hora, 5, 10, 15, 30 min, 1 h ou 1 dia antes). Toca no app com som e tela cheia, com o botão **Concluir tarefa**. |

### 2.6 Metas

| Tela | O que faz |
|---|---|
| **Visão** | Metas por horizonte (curto, médio, longo) e área da vida, com progresso, ritmo ("no ritmo", "atrasada") e prazo. |
| **Detalhe da meta** | Anel de progresso, atual, alvo, início e prazo, ritmo necessário por semana, gráfico de evolução, motivo ("por que importa"), **marcos**, **check-ins** com humor e anotação, e **vínculos** com tarefas, rotinas e reservas. |
| **Medição automática** | A meta anda sozinha a partir de outro módulo: saldo de uma reserva, peso (fitness ou alimentação), tarefas concluídas, execuções de uma rotina, água. |
| **Roda da vida** | Notas de 0 a 10 por área, com histórico. |
| **Linha do tempo** | Metas e marcos no calendário. |
| **Revisão da semana** | Roteiro guiado: o que avançou, o que travou, próximos passos. |
| **Concluídas e arquivadas** | Histórico das metas encerradas. |

### 2.7 Rotinas

| Tela | O que faz |
|---|---|
| **Hoje** | Linha do tempo com blocos de horário, hábitos e checklists. Marcar feito, parcial ou pulado, e os itens do checklist. |
| **Semana / Mês / Ano** | Planejamento em blocos de horário, calendário mensal e mapa de calor anual. |
| **Hábitos** | Sequência atual e recorde, taxa de cumprimento. |
| **Modelos** | Rotinas prontas (manhã produtiva, bloco de estudo, semana de treino, preparo de refeições) para adicionar com um toque. |
| **Estatísticas** | Cumprimento por categoria e dia da semana. |
| **Cadastro** | Frequência diária, semanal (dias), mensal, anual ou a cada N dias. Modo bloco, hábito ou checklist. Horário de início e fim, cor e ícone. Vínculo com treino, diário, tarefa ou meta. |
| **Aviso de início** | Notificação (e push) quando a rotina com horário está para começar. |

### 2.7A Estudos — concursos públicos

Módulo carregado **sob demanda**: as tabelas de Estudos não entram na carga inicial do app (rota `est.boot`), então o Início continua leve. Telas em **Estudos** (abas Painel, Questões, Revisões e o menu **Mais**):

| Tela | O que faz |
|---|---|
| **Painel** | Concurso em foco, próxima atividade (tarefa do plano ou ciclo), hoje, tempo líquido da semana contra o previsto, questões e precisão dos últimos 7 dias (com o tamanho da amostra), cobertura do edital, assuntos com domínio baixo, último simulado. **Gráficos:** assertividade × erro (rosca), certas × erradas por semana, horas de estudo × meta semanal (linha tracejada; meta definida no próprio cartão) e precisão por disciplina. Cartões configuráveis; cada número abre os registros que o compõem. |
| **Concursos e editais** | Concursos com órgão, cargo, banca, **tipo de concurso (área: bancária, tribunais, fiscal…)**, situação e **data da prova com status** (confirmada, estimada ou indefinida) e fonte. Etapas (inscrição, isenção, pagamento, prova, gabaritos, recursos, resultado…) com checklist, evento na agenda e lembrete. |
| **Edital verticalizado** | Disciplinas, assuntos e subassuntos com teoria, questões, precisão e domínio por assunto. **Versões** do edital (retificação): a nova versão mostra o que foi adicionado, alterado e retirado, sem apagar o histórico. **Leitura do edital** pelo PDF (da biblioteca ou do computador), por texto colado ou por tabela colada do Excel/Planilhas: preenche Disciplina, Assunto, Subassunto, Item, Página, Peso e Questões; tudo fica editável e passa pela prévia antes de gravar. |
| **Planejamento** | Disponibilidade por dia, tamanho da sessão, pausas e folga para imprevistos. A sugestão mostra a conta (peso, domínio, revisões vencidas, proximidade da prova) e você escolhe o que vira tarefa. Ciclo de estudos. |
| **Biblioteca** | PDFs, planilhas, imagens, links, livros e aulas, com código (M1, M2…), versões do arquivo, favoritos, situação e lixeira. **Categoria** (Questões, Revisões, Teoria, Flashcards, Outros) e concurso escolhidos ao guardar (categoria obrigatória; planilha vem sugerida como Questões e, se guardada em Questões/Flashcards, o app oferece importar). No Drive: `Estudos/u-…/<PDFs|Planilhas|Imagens|Outros>/<Concurso ou Geral>/<data do envio>/<Categoria>/arquivo`; mudar categoria ou concurso (inclusive em lote) move o arquivo, sem mudar id, hash ou links. *Reorganizar* mostra a prévia (quantos e para onde) e move os antigos (sem categoria → Outros). Filtro por categoria e caminho da pasta no material. Pelo Telegram, o bot pergunta a categoria (lista numerada; sem resposta, fica em Outros) e depois a disciplina. Envio em blocos (até 50 MB), retomável, e **sem duplicar** (o mesmo arquivo é reconhecido pelo hash). Planilha pode ser só guardada ou importada. |
| **Leitor de PDF** | Ver seção [9D](#9d-estudos-leitor-de-pdf-e-telegram). |
| **Sala de estudo** | Uma sessão aberta por vez, cronômetro de tempo líquido (início, fim e pausas), Pomodoro opcional, anotações rápidas, encerramento com páginas estudadas, questões feitas fora do banco, dúvidas e próximo passo. Sessão manual e correção de horário (com motivo). |
| **Questões** | Banco com filtros (inéditas, erradas, favoritas, com dúvida, comentadas, a revisar, sem gabarito, anuladas, **concurso**, **tipo de concurso (área)**, banca, disciplina, assunto, ano, dificuldade, tipo, origem). **Cartões de assertividade × erro** (% de acertos, quantidade de certas, erradas e não respondidas, pela última resposta de cada questão do filtro ou da seleção). **Selecionar todas** ou uma a uma e **excluir em lote** (com desfazer). Importar e incluir já com concurso e área. **Treino** corrige na hora; **avaliação** corrige no fim. Ao resolver de novo, a resposta anterior fica **oculta** atrás de "Exibir resposta anterior"; vale sempre a última. **Comentário** por questão e **Resposta por IA** (a IA resolve sem ver o gabarito, explica e compara; você pode usar como comentário ou, se a questão não tem gabarito, como gabarito preliminar). Envio de uma série de questões para treinar no Telegram. Gabarito com situação (preliminar, definitivo, anulada, sem gabarito) e histórico; mudar o gabarito de questão já respondida pede o motivo e recalcula as tentativas **mantendo o resultado original**. Listas manuais, aleatórias, de dificuldades e filtros salvos. |
| **Simulados** | **Simulado com tempo** em um passo: quantidade, minutos, origem (aleatórias, só as que errei, só inéditas, filtro atual ou seleção), concurso, área, disciplinas e tipo de questão. Montagem por blocos (disciplina, assunto, banca, quantidade, peso, mínimo) ou a partir de lista. **Regras de pontuação informadas por você** (acerto, erro, branco, anulada, mínimos); o Prumo não supõe penalização pelo nome da banca. Cartão-resposta, marcar para revisar, cronômetro, salvamento a cada 20 s e retomada. O gabarito é congelado no início: se mudar depois, o resultado da prova não muda (a mudança é avisada na correção). Comparação com simulados equivalentes. |
| **Revisões** | Revisões espaçadas (padrão 1, 7, 15, 30, 60, 120 dias, editável): errei, difícil, bom, fácil. Atrasadas destacadas. |
| **Flashcards** | Cartões básicos, de lacuna, com imagem ou áudio; agendamento SM-2; relatório em PDF ou planilha (Estudos › Relatórios). |
| **Caderno de erros** | Causa, raciocínio, explicação, ação e próxima tentativa; erro recorrente soma ocorrências. |
| **Resumos e anotações** | Resumo, fichamento, Cornell, mapa, nota, lei seca e dúvida, em Markdown simples, com versões, vínculos e fonte. **Resumos de PDF com IA** (modos Objetivo, Direcionado e Detalhado; PDF grande em blocos de páginas com progresso e cancelar) viram rascunho com prévia: aprovar, editar (versões), excluir com desfazer, mover, duplicar, regenerar (nova versão) e compartilhar (Telegram, copiar, compartilhar do aparelho, PDF, imprimir). |
| **Discursivas** | Proposta, critérios, texto com versões e avaliações (você, outra pessoa, resultado oficial ou sugestão de IA identificada). Com a IA: **revisar e corrigir** (a nota por critério, b pontos fortes, c problemas por trecho, d trechos reescritos, e plano de reescrita; os trechos aceitos viram nova versão), **temas e propostas** (marcados como sugestão, sem estatística inventada), **texto de exemplo** (material de referência marcado "Gerado por IA") e **Treinar** (proposta + cronômetro). |
| **Desempenho e histórico** | Indicadores com denominadores visíveis ("sem dados" quando não há base), por período, concurso e disciplina; relatório PDF ou planilha (XLSX) e envio ao Telegram. |
| **Relatórios** | (a) resumos e anotações por disciplina, com sumário; (b) flashcards; (c) questões sorteadas (50 por padrão) com **folha de gabarito na última página** (sem gabarito aparece como "sem gabarito"); (d) **relatório completo** com sumário, gerado em blocos com progresso e cancelar. PDF, planilha, imprimir e Telegram. |
| **Assistente de IA** | Ver seção [9E](#9e-estudos-assistente-de-ia). Conversar, gerar resumo, questões e flashcards com fontes (biblioteca, Drive, anotações, questões, edital, meus dados), escolhendo o modelo na hora. |
| **Preferências** | Intervalos de revisão, leitor de PDF, avisos de estudo no Telegram, provedores de IA, verificação de arquivos no Drive. |

**Integrações:** Início (revisões do dia e etapas de concurso no "Seu dia"), busca global (materiais, assuntos, anotações, questões, concursos e ações), Tarefas (atividades do plano são tarefas), Foco (Pomodoro de tarefa de estudo também vira sessão, sem contar duas vezes), Metas (horas, questões, precisão, revisões, discursivas e cobertura como medição automática), Rotinas (vínculo "Sessão de estudo"), Notificações, Logs e Backup.

**Leitura do edital (PDF ou texto):** no PDF, o Prumo extrai o texto página por página e procura a seção *Conteúdos Programáticos*. Lá ele reconhece:
- os **cargos** ("NOME DE RELACIONAMENTO: AGENTE COMERCIAL", "CARGO 2: …"). Quando o edital tem conteúdo diferente por cargo, aparece o campo **Cargo**, já escolhido pelo cargo cadastrado no concurso;
- as **disciplinas** ("LÍNGUA PORTUGUESA: 1 - …") e os **itens** pela numeração em sequência (aceita "1 -", "1.", "1 –", "7 -Texto", "17- Texto" e o número quebrado na linha);
- os **subassuntos**: subitens 1.1, 1.2 ou as partes depois de "Título:" separadas por ";";
- a **página** do PDF onde cada item começa;
- o **quadro de provas** ("Língua Portuguesa: 10 questões com valor de 1,5 ponto cada"), que preenche **Questões** e **Peso** (valor de cada questão) da disciplina no cargo escolhido.

Testado com o edital do Banco do Brasil 2022 (122 linhas para Agente Comercial, 8 disciplinas, páginas 33 a 35). Editais com outro layout podem precisar de ajustes na tabela antes de gravar; PDF digitalizado (só imagem) não tem texto para ler. Colando uma **tabela** (TSV do Excel, CSV com ";" ou ","), cada coluna vai para o seu campo pelo cabeçalho (repetido ou não) e o peso aceita vírgula ("1,5"). Linhas repetidas são ignoradas na gravação.

**Importação de planilha (XLSX ou CSV):** primeira linha com os nomes das colunas. O app gera o modelo no seu Drive. Colunas extras aceitas: `texto_base` (texto de apoio) e `pagina`.

**Importação de PDF de questões** (Questões › *PDF de questões*, no importador ou no menu de um PDF da biblioteca): o app lê o PDF no navegador (PDF.js, com as posições do texto) e monta as linhas no formato do modelo XLSX.
- **Layout:** uma ou duas colunas, cabeçalhos e números de página descartados, linhas e hifenização juntadas, parágrafos preservados, tabelas em texto com as colunas separadas por `|`.
- **Questão:** número (`12. (CESGRANRIO – 2015)`, `12 (FCC – TRT – Analista – 2022)`, `Questão 12`, `1. Ano: 2022 Banca: FGV Órgão: … Prova: …`), banca, ano, órgão e cargo, **enunciado completo**, alternativas `a)`/`A)`/`(A)` de A–E ou A–D (inclusive várias na mesma linha ou impressas no meio da linha anterior), certo/errado (C/E, V/F).
- **Texto de apoio:** "Leia o texto…", "Texto II", "Texto para os itens de 1 a 3", "Read the text…". O texto é separado da pergunta (com título e fonte, "Disponível em… Adaptado.") e repetido nas questões seguintes que falam dele (pelo intervalo citado, por "o texto/trecho/fragmento", por citação entre aspas ou pelo mesmo assunto).
- **Disciplina e assunto:** pelo sumário (página impressa), pelo cabeçalho lateral e pelos títulos (`Æ …`) e subtítulos.
- **Gabarito:** tabelas "GABARITO" (uma por disciplina ou no fim; números que se repetem viram a sequência seguinte), `1-B 2-C`, `1 E 2 C 3 C`, ou "Gabarito: B" depois da questão; "ANULADA"/"*" vira anulada. Comentário/Resolução vira explicação.
- **Figuras, fórmulas e tabelas:** a área da questão é recortada da página (todas as partes, em colunas e páginas diferentes) e anexada como imagem; alternativas que só existem em imagem ficam marcadas.
- **Conferência antes de gravar:** resumo (questões, com gabarito, com texto, com recorte, por disciplina), **avisos com a página** (numeração pulada, número impresso errado corrigido pela sequência, gabarito sem questão, alternativas sem letra), **percentual do texto do PDF aproveitado** com as linhas que ficaram fora, edição de qualquer questão ao lado da página do PDF, desmarcar questões, prefixo do código, banca/órgão/cargo/concurso/área e situação do gabarito.
- **Saída:** *Baixar XLSX* ou *Salvar XLSX no Drive* (formato do modelo + texto de apoio e página) e/ou **Importar**: o PDF vai para a biblioteca (cada questão abre na página dela), os recortes são enviados ao Drive e as questões são gravadas em blocos; reimportar atualiza pelo código, sem duplicar.
- **Testado** com o caderno "1.200 Questões para o Banco do Brasil" (186 páginas, duas colunas): 1.199 questões (o livro não tem a 166 de Português), 9 disciplinas com as contagens do sumário, gabarito em todas, 342 com texto de apoio, 42 com recorte, 99,99% das linhas aproveitadas (a única fora é um "3" solto impresso na página 12). PDF só de imagem (digitalizado) não tem texto para ler.

| Tabela | Colunas | Identificação na reimportação |
|---|---|---|
| Questões | `codigo, tipo (multipla, C/E, curta, discursiva), enunciado*, a, b, c, d, e, gabarito, gabarito_status, explicacao, banca, orgao, cargo, ano, disciplina, assunto, dificuldade, fonte, tags` | `codigo` |
| Flashcards | `baralho, frente*, verso, disciplina, assunto, tags` | `baralho + frente` |
| Edital | `disciplina*, assunto*, subassunto, item_ref, pagina, peso, qtd_questoes, descricao` | `disciplina + assunto` |

A importação sempre passa por **Conferir** (erros por linha); você pode importar só as linhas válidas. Reimportar atualiza o que foi identificado, guardando versão e histórico do gabarito.

### 2.8 Configurações

Conectado como (e-mail) · **Sair** · **Telegram** (bot, conectar, avisos automáticos, resumo das 7h, limites e histórico) · Perfil (foto, nome, nascimento, sexo, altura, unidade de peso) · Aparência (escuro, claro, automático) · Preferências (início da semana, metas diárias, timers, somar calorias do treino) · Notificações (push no celular, rotinas, água, e-mail, resumo das 7h) · Segurança (PIN de 4 a 6 dígitos e bloqueio por inatividade) · Dados e backup (exportar e restaurar JSON, backup da planilha, modo demonstração) · Integrações (Google Agenda, Open Food Facts, gatilhos) · Arquivos (tudo o que foi enviado, com miniatura, renomear e lixeira) · Logs (auditoria e erros com filtros e exportação) · Sobre e diagnóstico.

### 2.9 Recursos transversais

- **Login** por e-mail e senha de acesso. Cada e-mail é um usuário separado ([seção 8](#8-login-usuários-e-segurança)).
- **PIN local** para bloquear o app no aparelho.
- **Escrita otimista com desfazer**, validação no cliente e no servidor e mensagens de erro no campo certo.
- **Atalhos de teclado** no computador: Ctrl K (busca), N (novo), Esc (fechar).
- **Acessibilidade:** alvos de toque de 44 px (botões, chips, abas e campos no celular), foco visível, rótulos ARIA, contraste mínimo de 4,5:1 conferido por teste nos dois temas.
- **Relatórios (motor único):** cada tela descreve o relatório e o mesmo motor gera o **PDF A4 compacto** (cabeçalho com filtros, rodapé "p. X de Y", cabeçalho de tabela repetido na quebra, sumário quando pedido) e a **planilha XLSX** (aba Resumo + uma aba por tabela, números e datas como valores). Botão **Relatório** em Finanças (Lançamentos e Relatórios), Fitness (Evolução), Alimentação (Relatórios), Tarefas (Estatísticas), Metas, Rotinas (Estatísticas), Estudos (Desempenho e Relatórios) e Logs, sempre com o período e os filtros ativos: baixar PDF, baixar planilha, imprimir (iframe oculto; se o navegador bloquear, abre o PDF numa aba) e enviar ao Telegram. **CSV só para importação.**
- **Filtros em todas as listas e relatórios:** período (mês ou ano com setas, 7, 30 ou 90 dias, 3, 6 ou 12 meses, intervalo de datas, tudo), tipo, conta, projeto, prioridade, categoria, área e busca, conforme a tela. Toque no nome do período para voltar ao atual. Quando o período começa antes dos meses carregados na abertura, o app busca o histórico no servidor sozinho.

| Tela | Filtros |
|---|---|
| Finanças › Lançamentos | Mês, ano, 90 dias, intervalo, tudo · tipo · busca · conta, cartão, categoria, tag e valor |
| Finanças › Conta (extrato) | Período · entradas, saídas, pendentes |
| Finanças › Contas a pagar | A pagar / a receber · conta ou cartão |
| Finanças › Relatórios | Mês, 3/6/12 meses, ano, intervalo, tudo · conta ou cartão (também vale para o relatório PDF/XLSX) |
| Finanças › Cartões | Faturas pagas por ano |
| Fitness › Treinos / Histórico / Cardio / Evolução | Dia da semana e objetivo · período, treinos ou cardio, ficha · período e atividade · período do peso, medidas, fotos e força |
| Alimentação › Nutrientes / Relatórios / Receitas | Dia ou média do período · período · busca |
| Tarefas › Próximas / Pendências / Quadro / Concluídas / Estatísticas | Horizonte (7 a 90 dias), prioridade, projeto e busca · período de conclusão · período (semanas ou meses no gráfico) |
| Tarefas e Alimentação › Alarmes | Tipo (água, refeições, remédios, tarefas, outros) |
| Metas › Visão / Linha do tempo / Concluídas | Horizonte, área e busca · prazo, situação e área · período, situação e área |
| Rotinas › Estatísticas / Todas | Período e categoria · situação, categoria, frequência e busca |
| Configurações › Arquivos / Logs | Período, tipo e nome · nível, módulo, data e busca |

---

## 3. Arquitetura

```mermaid
flowchart LR
  subgraph Aparelho
    PWA["App instalado<br/>(pwa/ no GitHub Pages)<br/>manifest + service worker"]
    UI["Interface do Prumo<br/>(HtmlService, iframe)"]
    PWA -- iframe + postMessage --> UI
  end
  UI -- "google.script.run<br/>api(rota, dados, aparelho, token)" --> GAS["Apps Script<br/>(executa como o dono)"]
  GAS --> SH[("Google Sheets<br/>74 abas")]
  GAS --> DR[("Google Drive<br/>arquivos e backups")]
  GAS -- OCR --> DOC["Drive API v3<br/>(Docs com OCR pt)"]
  GAS -- código de barras --> OFF["Open Food Facts"]
  GAS -- "sendMessage / getUpdates" --> TG["Telegram Bot API"]
  GAS -- "texto livre (Cloud API)" --> WA["WhatsApp Cloud API<br/>(Meta)"]
  WA -. "webhook opcional<br/>?wa=chave" .-> GAS
  GAS -- "push sem conteúdo<br/>(VAPID ES256)" --> PS["Serviço de push<br/>FCM / Apple / Mozilla"]
  PS --> SW["Service worker"]
  SW -- "GET ?push=pid" --> GAS
  T["Gatilhos<br/>7h · 15 min · domingo"] --> GAS
```

**Servidor (Apps Script V8).** Tem um único ponto de entrada, `api(rota, dados, aparelho, token)` (e `apiBatch` para várias chamadas numa ida só), com uma lista fechada de rotas. A resposta sempre vem num envelope `{ ok, data, error: { code, message, field }, meta: { ms } }`. O acesso à planilha passa por um repositório genérico (`Db`) dirigido por esquema:

- Lê cada aba no máximo uma vez por requisição, usando a Sheets API em lote (`batchGet`) na carga inicial.
- Mantém um cache versionado e fragmentado (`CacheService`) entre requisições. A invalidação custa O(1) por versão.
- Valida e converte tipos, preenche as colunas de sistema e grava em lote.
- Usa `LockService` (reentrante) para evitar gravações simultâneas.
- Protege contra injeção de fórmula: valores que começam com `=`, `+`, `-` ou `@` são gravados como texto.

**Cliente (JavaScript puro, ES2020).** Fica no namespace `window.Prumo`:

| Parte | Função |
|---|---|
| `P.h` | Templates HTML com escape automático. |
| `P.store` | Dados em memória com escrita otimista e rollback. |
| `P.api` | Promise, timeout, novas tentativas e deduplicação. |
| `P.router` | Rotas por `#/hash`. |
| `P.ui` | Painéis, diálogos, toasts e formulários. |
| `P.charts` | Chart.js 4. |
| `P.calc` | Fórmulas, espelho do `Calc.gs`. |

O HTML é montado com `include()` e não tem scriptlets.

**Carga inicial.** A rota `boot` devolve perfil, preferências e os dados de todos os módulos. As tabelas grandes vêm só numa janela recente (lançamentos dos últimos 25 meses, diário alimentar de 6 meses…). O saldo anterior das contas chega já somado (`finBase`).

---

## 4. Estrutura do projeto

```
prumo/
├── src/                      # projeto do Apps Script
│   ├── appsscript.json       # manifesto: V8, fuso, serviços avançados (Drive v3, Sheets v4), escopos, web app
│   ├── Config.gs             # CONFIG (IDs, login, limites) e SCHEMA de todas as tabelas
│   ├── Utils.gs              # datas, dinheiro, uuid, sha256, erros padronizados
│   ├── Cache.gs              # cache versionado e fragmentado
│   ├── Db.gs                 # repositório genérico sobre o Sheets
│   ├── Auth.gs               # usuário da requisição, perfil, preferências, PIN
│   ├── Login.gs              # login por senha, sessões (token), bloqueio por tentativas
│   ├── Logger.gs             # AppLog: auditoria e erros em lote
│   ├── Api.gs                # doGet, include, api/apiBatch, rotas, boot
│   ├── Files.gs              # upload ao Drive, miniaturas, lixeira
│   ├── Ocr.gs                # OCR e leitura de cupom, Pix e rótulo
│   ├── Finance.gs            # parcelas, faturas, recorrências, reconciliação, importação
│   ├── Fitness.gs            # fechamento de sessão (volume, kcal, e1RM, recordes)
│   ├── Nutrition.gs          # código de barras (Open Food Facts) e meta segura
│   ├── Tasks.gs              # lembretes e Google Agenda
│   ├── Goals.gs              # medição automática e ritmo das metas
│   ├── Routines.gs           # agenda de rotinas do dia
│   ├── Notifications.gs      # central de notificações, avisos com hora, resumo por e-mail
│   ├── Push.gs               # Web Push: VAPID (ECDSA P-256), inscrições, envio e entrega
│   ├── Telegram.gs           # Bot API: conexão por link, leitura (getUpdates), envio, comandos, resumo
│   ├── WhatsApp.gs           # Cloud API da Meta: envio de texto, limites, janela de 24 h, webhook opcional
│   ├── Alarms.gs             # alarmes: horários, disparo pelo gatilho de 5 min, alarm.ack
│   ├── Triggers.gs           # gatilhos diário, 15 min, 5 min e semanal
│   ├── Backup.gs             # cópia da planilha, exportar e importar JSON
│   ├── Setup.gs              # instalação idempotente (abas, formatos, pastas, dados, gatilhos)
│   ├── Seed.gs               # categorias, 86 exercícios, 115 alimentos, timers, modelos de rotina
│   ├── SeedDemo.gs           # dados de demonstração (ids "demo-")
│   ├── Calc.gs               # fórmulas puras + autoteste
│   ├── Index.html            # casca da página
│   ├── icons.html            # sprite SVG de ícones
│   ├── css_*.html            # tokens (temas), base, componentes, módulos
│   └── js_*.html             # core, ui, filters (período/tipo/busca), charts, calc, login, pwa, alarms, telegram, whatsapp e um arquivo por módulo
├── dist3/                    # versão para colar no editor (3 arquivos)
│   ├── Codigo.gs             # todo o servidor
│   ├── Index.html            # toda a interface (scripts protegidos contra o pré-processamento do Google)
│   └── appsscript.json
├── pwa/                      # app instalável (publicar no GitHub Pages)
│   ├── index.html            # abre o Prumo em tela cheia, splash, permissão de push, instalação
│   ├── sw.js                 # service worker: cache, push, clique na notificação
│   ├── manifest.webmanifest  # nome, cores, ícones (inclui maskable) e atalhos
│   ├── config.js             # URL do Web App (/exec)
│   └── icons/                # 192, 512, maskable, apple-touch, badge, favicon
└── logo/                     # marca em SVG e PNG
```

---

## 5. Banco de dados

### 5.1 Convenções

- **Uma aba por tabela.** A linha 1 é o cabeçalho, uma linha por registro. As abas e colunas são criadas pelo `setup()`, que pode rodar de novo sem estragar nada (migração não destrutiva: colunas novas entram no fim). Se uma versão nova trouxer uma tabela e o `setup()` ainda não tiver rodado, a aba é criada sozinha no primeiro acesso.
- **Colunas de sistema** em todas as tabelas:

  | Coluna | O que guarda |
  |---|---|
  | `id` | UUID v4 |
  | `user_id` | **E-mail de quem criou o registro** |
  | `created_at`, `updated_at` | Data e hora ISO com fuso |
  | `deleted_at` | Exclusão lógica |

- **Isolamento por usuário.** Toda leitura filtra por `user_id` = e-mail logado, e toda gravação confere o dono.
- **Auditoria.** Cada criação, edição e exclusão gera uma linha em `logs` com `antes_json` e `depois_json`, em nome do usuário.
- **Formatos.** Colunas de texto, data e JSON são formatadas como texto puro (`@`) para o Sheets não converter "01/02" em data nem "1e3" em número. Listas viram validação de dados na planilha.

### 5.2 Mini-linguagem do esquema

Cada tabela está declarada em `SCHEMA` (Config.gs) como uma linha `nome:tipo[tamanho][(opções)][!][=padrão]`:

| Tipo | Significado | Tipo | Significado |
|---|---|---|---|
| `s` | texto curto (com limite) | `d` | data `aaaa-mm-dd` |
| `t` | texto longo | `dt` | data e hora ISO |
| `i` | inteiro | `b` | sim/não |
| `n` | número | `e(a,b,c)` | lista fechada |
| `m` | dinheiro (2 casas) | `j` | JSON |
| `r` | referência (id de outra tabela) | `!` / `=x` | obrigatório / valor padrão |

### 5.3 Tabelas (74)

### Sistema e usuários

#### `usuarios`

Perfil de cada e-mail que entrou: nome, foto, dados corporais, tema e PIN (hash).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `email` | texto (120) | sim |  |  |
| `nome` | texto (80) |  |  |  |
| `foto_arquivo_id` | texto (60) |  |  |  |
| `nascimento` | data (aaaa-mm-dd) |  |  |  |
| `sexo` | lista |  |  | valores: `masculino`, `feminino`, `outro` |
| `altura_cm` | número |  |  |  |
| `tema` | lista |  | `dark` | valores: `dark`, `light`, `auto` |
| `moeda` | texto (3) |  | `BRL` |  |
| `idioma` | texto (5) |  | `pt-BR` |  |
| `inicio_semana` | inteiro |  | `0` |  |
| `unidade_peso` | lista |  | `kg` | valores: `kg`, `lb` |
| `pin_hash` | texto (100) |  |  |  |
| `ultimo_acesso` | data e hora (ISO) |  |  |  |

#### `configuracoes`

Preferências por usuário no formato módulo.chave → valor (JSON).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `modulo` | texto (30) | sim |  |  |
| `chave` | texto (60) | sim |  |  |
| `valor_json` | JSON |  |  |  |

#### `logs`

Auditoria (antes/depois de cada gravação), avisos, erros do servidor e do navegador, logins.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `ts` | data e hora (ISO) | sim |  |  |
| `nivel` | lista | sim |  | valores: `info`, `warn`, `error`, `audit` |
| `modulo` | texto (30) |  |  |  |
| `acao` | texto (40) |  |  |  |
| `entidade` | texto (40) |  |  |  |
| `entidade_id` | texto (60) |  |  |  |
| `antes_json` | JSON |  |  |  |
| `depois_json` | JSON |  |  |  |
| `mensagem` | texto longo |  |  |  |
| `dispositivo` | texto (160) |  |  |  |
| `duracao_ms` | inteiro |  |  |  |

#### `arquivos`

Metadados dos arquivos enviados ao Drive (comprovantes, fotos, rótulos) e texto do OCR.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `drive_id` | texto (80) | sim |  |  |
| `nome` | texto (200) | sim |  |  |
| `mime` | texto (80) |  |  |  |
| `tamanho_bytes` | inteiro |  |  |  |
| `modulo` | texto (30) |  |  |  |
| `entidade` | texto (40) |  |  |  |
| `entidade_id` | texto (60) |  |  |  |
| `tipo` | lista |  | `outro` | valores: `comprovante`, `foto_perfil`, `foto_progresso`, `rotulo`, `outro` |
| `ocr_texto` | texto longo |  |  |  |
| `ocr_json` | JSON |  |  |  |
| `hash` | texto (80) |  |  |  |

#### `notificacoes`

Central de notificações do app; também é a fila do push no celular.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `tipo` | texto (30) |  |  |  |
| `titulo` | texto (140) | sim |  |  |
| `corpo` | texto longo |  |  |  |
| `data_ref` | data (aaaa-mm-dd) |  |  |  |
| `lida` | sim/não |  | `false` |  |
| `link` | texto (200) |  |  |  |

#### `alarmes`

Alarmes de água, refeições, remédios, tarefas e livres: uma vez, todo dia (dias da semana) ou a cada N minutos entre dois horários; último disparo evita repetição.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (120) | sim |  |  |
| `tipo` | lista |  | `outro` | valores: `tarefa`, `agua`, `refeicao`, `remedio`, `outro` |
| `modo` | lista |  | `diario` | valores: `unico`, `diario`, `intervalo` |
| `data` | data (aaaa-mm-dd) |  |  |  |
| `hora` | texto (5) | sim |  |  |
| `dias_semana` | texto (20) |  |  |  |
| `hora_fim` | texto (5) |  |  |  |
| `intervalo_min` | inteiro |  |  |  |
| `ativo` | sim/não |  | `true` |  |
| `som` | sim/não |  | `true` |  |
| `ref_id` | referência (id) |  |  |  |
| `refeicao` | texto (20) |  |  |  |
| `pular_meta` | sim/não |  | `false` |  |
| `ultimo_disparo` | data e hora (ISO) |  |  |  |
| `observacao` | texto (200) |  |  |  |

#### `push_inscricoes`

Aparelhos com push ativo (endpoint do navegador, controle de entrega e falhas).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `pid` | texto (60) | sim |  |  |
| `endpoint` | texto longo | sim |  |  |
| `p256dh` | texto (200) |  |  |  |
| `auth` | texto (80) |  |  |  |
| `dispositivo` | texto (160) |  |  |  |
| `ativo` | sim/não |  | `true` |  |
| `entregue_ate` | data e hora (ISO) |  |  |  |
| `entregues_json` | JSON |  |  |  |
| `falhas` | inteiro |  | `0` |  |
| `ultimo_envio` | data e hora (ISO) |  |  |  |

#### `tg_mensagens`

Registro do Telegram: mensagens enviadas, bloqueadas (limite), com falha e recebidas (comandos), com chave de deduplicação.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `direcao` | lista | sim |  | valores: `saida`, `entrada` |
| `status` | lista | sim |  | valores: `enviado`, `falhou`, `bloqueado`, `recebido` |
| `origem` | texto (30) |  |  |  |
| `chave` | texto (80) |  |  |  |
| `ref_ids` | texto longo |  |  |  |
| `chat_id` | texto (30) |  |  |  |
| `corpo` | texto longo |  |  |  |
| `msg_id` | texto (30) |  |  |  |
| `erro_codigo` | texto (20) |  |  |  |
| `erro_msg` | texto (300) |  |  |  |

#### `wa_mensagens`

Registro do WhatsApp: mensagens enviadas, simuladas, bloqueadas e recebidas, com chave de deduplicação, id da Meta (wamid) e erro.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `direcao` | lista | sim |  | valores: `saida`, `entrada` |
| `status` | lista | sim |  | valores: `simulado`, `enviando`, `enviado`, `entregue`, `lido`, `falhou`, `bloqueado`, `recebido` |
| `origem` | texto (30) |  |  |  |
| `chave` | texto (80) |  |  |  |
| `ref_ids` | texto longo |  |  |  |
| `para` | texto (20) |  |  |  |
| `corpo` | texto longo |  |  |  |
| `wamid` | texto (120) |  |  |  |
| `erro_codigo` | texto (20) |  |  |  |
| `erro_msg` | texto (300) |  |  |  |
| `tentativas` | inteiro |  | `0` |  |

### Finanças

#### `fin_contas`

Contas bancárias, carteira, poupança e corretora, com saldo inicial.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `tipo` | lista |  | `corrente` | valores: `carteira`, `corrente`, `poupanca`, `investimento`, `outro` |
| `instituicao` | texto (80) |  |  |  |
| `saldo_inicial` | dinheiro (R$) |  | `0` |  |
| `cor` | texto (9) |  |  |  |
| `icone` | texto (30) |  |  |  |
| `incluir_no_total` | sim/não |  | `true` |  |
| `arquivada` | sim/não |  | `false` |  |
| `ordem` | inteiro |  | `0` |  |

#### `fin_cartoes`

Cartões de crédito com limite, dias de fechamento e vencimento e conta de pagamento.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `bandeira` | lista |  | `mastercard` | valores: `visa`, `mastercard`, `elo`, `amex`, `hipercard`, `outro` |
| `final` | texto (4) |  |  |  |
| `limite` | dinheiro (R$) | sim |  |  |
| `dia_fechamento` | inteiro | sim |  |  |
| `dia_vencimento` | inteiro | sim |  |  |
| `conta_pagamento_id` | referência (id) |  |  | → `fin_contas` |
| `cor` | texto (9) |  |  |  |
| `arquivado` | sim/não |  | `false` |  |

#### `fin_categorias`

Categorias e subcategorias de receita e despesa, com cor e ícone.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (60) | sim |  |  |
| `tipo` | lista | sim |  | valores: `receita`, `despesa` |
| `pai_id` | referência (id) |  |  |  |
| `cor` | texto (9) |  |  |  |
| `icone` | texto (30) |  |  |  |
| `ordem` | inteiro |  | `0` |  |
| `arquivada` | sim/não |  | `false` |  |

#### `fin_lancamentos`

Receitas, despesas e transferências (à vista, parceladas, no cartão ou recorrentes).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `tipo` | lista | sim |  | valores: `receita`, `despesa`, `transferencia` |
| `descricao` | texto (140) | sim |  |  |
| `valor` | dinheiro (R$) | sim |  |  |
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `competencia` | texto (7) |  |  |  |
| `status` | lista |  | `pago` | valores: `pago`, `pendente`, `agendado` |
| `conta_id` | referência (id) |  |  | → `fin_contas` |
| `conta_destino_id` | referência (id) |  |  | → `fin_contas` |
| `cartao_id` | referência (id) |  |  | → `fin_cartoes` |
| `fatura_id` | referência (id) |  |  | → `fin_faturas` |
| `categoria_id` | referência (id) |  |  | → `fin_categorias` |
| `parcela_num` | inteiro |  |  |  |
| `parcela_total` | inteiro |  |  |  |
| `grupo_parcela_id` | referência (id) |  |  |  |
| `recorrencia_id` | referência (id) |  |  | → `fin_recorrencias` |
| `forma_pagamento` | lista |  |  | valores: `pix`, `debito`, `credito`, `dinheiro`, `boleto`, `transferencia`, `outro` |
| `estabelecimento` | texto (120) |  |  |  |
| `tags` | texto (200) |  |  |  |
| `observacao` | texto longo |  |  |  |
| `arquivo_ids` | texto (400) |  |  |  |
| `meta_id` | referência (id) |  |  | → `met_metas` |
| `reserva_id` | referência (id) |  |  | → `fin_reservas` |
| `origem` | lista |  | `manual` | valores: `manual`, `ocr`, `importacao`, `recorrencia`, `demo`, `sistema` |
| `import_hash` | texto (80) |  |  |  |

#### `fin_faturas`

Faturas de cartão por competência, com total, status e pagamento.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `cartao_id` | referência (id) | sim |  | → `fin_cartoes` |
| `competencia` | texto (7) | sim |  |  |
| `data_fechamento` | data (aaaa-mm-dd) |  |  |  |
| `data_vencimento` | data (aaaa-mm-dd) |  |  |  |
| `valor_total` | dinheiro (R$) |  | `0` |  |
| `status` | lista |  | `aberta` | valores: `aberta`, `fechada`, `paga` |
| `lancamento_pagamento_id` | referência (id) |  |  |  |

#### `fin_recorrencias`

Modelos de lançamentos que se repetem (salário, aluguel, assinaturas).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `descricao` | texto (140) | sim |  |  |
| `modelo_json` | JSON | sim |  |  |
| `frequencia` | lista |  | `mensal` | valores: `diaria`, `semanal`, `mensal`, `anual` |
| `intervalo` | inteiro |  | `1` |  |
| `dia` | inteiro |  |  |  |
| `inicio` | data (aaaa-mm-dd) | sim |  |  |
| `fim` | data (aaaa-mm-dd) |  |  |  |
| `proxima_geracao` | data (aaaa-mm-dd) |  |  |  |
| `ativa` | sim/não |  | `true` |  |

#### `fin_orcamentos`

Limite mensal por categoria.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `categoria_id` | referência (id) | sim |  | → `fin_categorias` |
| `competencia` | texto (7) | sim |  |  |
| `valor_planejado` | dinheiro (R$) | sim |  |  |
| `rollover` | sim/não |  | `false` |  |

#### `fin_reservas`

Caixinhas e reservas (emergência, viagem), com meta e saldo.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `meta_id` | referência (id) |  |  | → `met_metas` |
| `conta_id` | referência (id) |  |  | → `fin_contas` |
| `valor_alvo` | dinheiro (R$) |  |  |  |
| `saldo_atual` | dinheiro (R$) |  | `0` |  |
| `rendimento_pct` | número |  |  |  |
| `cor` | texto (9) |  |  |  |

#### `fin_investimentos`

Aplicações (renda fixa, ações, fundos, cripto) com valor aplicado e atual.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `tipo` | lista |  | `renda_fixa` | valores: `renda_fixa`, `tesouro`, `acoes`, `fii`, `fundos`, `cripto`, `previdencia`, `outro` |
| `instituicao` | texto (80) |  |  |  |
| `valor_aplicado` | dinheiro (R$) | sim |  |  |
| `valor_atual` | dinheiro (R$) |  |  |  |
| `data_aplicacao` | data (aaaa-mm-dd) |  |  |  |
| `vencimento` | data (aaaa-mm-dd) |  |  |  |
| `rentabilidade` | número |  |  |  |

#### `fin_dividas`

Empréstimos e financiamentos, juros e parcelas.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `credor` | texto (80) | sim |  |  |
| `valor_original` | dinheiro (R$) |  |  |  |
| `saldo_devedor` | dinheiro (R$) | sim |  |  |
| `juros_mensal_pct` | número |  | `0` |  |
| `parcelas` | inteiro |  |  |  |
| `valor_parcela` | dinheiro (R$) |  |  |  |
| `proximo_vencimento` | data (aaaa-mm-dd) |  |  |  |
| `status` | lista |  | `ativa` | valores: `ativa`, `negociando`, `quitada` |

#### `fin_regras`

Regras de categorização automática por texto (estabelecimento → categoria).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `padrao` | texto (80) | sim |  |  |
| `categoria_id` | referência (id) | sim |  | → `fin_categorias` |
| `conta_id` | referência (id) |  |  | → `fin_contas` |

### Fitness

#### `fit_exercicios`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `grupo_muscular` | lista | sim |  | valores: `peito`, `costas`, `ombros`, `biceps`, `triceps`, `antebraco`, `quadriceps`, `posterior`, `gluteos`, `panturrilha`, `abdomen`, `corpo_todo`, `cardio` |
| `musculos_secundarios` | texto (120) |  |  |  |
| `equipamento` | lista |  | `outro` | valores: `barra`, `halter`, `maquina`, `polia`, `peso_corporal`, `kettlebell`, `elastico`, `smith`, `nenhum`, `outro` |
| `tipo` | lista |  | `forca` | valores: `forca`, `cardio`, `mobilidade`, `funcional` |
| `met` | número |  | `5` |  |
| `instrucoes` | texto longo |  |  |  |
| `midia_url` | texto (300) |  |  |  |
| `personalizado` | sim/não |  | `false` |  |

#### `fit_treinos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `objetivo` | lista |  | `hipertrofia` | valores: `hipertrofia`, `forca`, `emagrecimento`, `resistencia`, `condicionamento`, `mobilidade` |
| `nivel` | lista |  | `intermediario` | valores: `iniciante`, `intermediario`, `avancado` |
| `dias_semana` | texto (20) |  |  |  |
| `duracao_estimada_min` | inteiro |  | `60` |  |
| `cor` | texto (9) |  |  |  |
| `ativo` | sim/não |  | `true` |  |
| `observacoes` | texto longo |  |  |  |

#### `fit_treino_itens`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `treino_id` | referência (id) | sim |  | → `fit_treinos` |
| `exercicio_id` | referência (id) | sim |  | → `fit_exercicios` |
| `ordem` | inteiro |  | `0` |  |
| `series` | inteiro |  | `3` |  |
| `reps_min` | inteiro |  | `8` |  |
| `reps_max` | inteiro |  | `12` |  |
| `carga_sugerida` | número |  |  |  |
| `descanso_s` | inteiro |  | `90` |  |
| `tempo_s` | inteiro |  |  |  |
| `metodo` | lista |  | `normal` | valores: `normal`, `dropset`, `biset`, `piramide`, `rest_pause`, `tempo` |
| `observacao` | texto (200) |  |  |  |

#### `fit_sessoes`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `treino_id` | referência (id) |  |  | → `fit_treinos` |
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `inicio` | data e hora (ISO) |  |  |  |
| `fim` | data e hora (ISO) |  |  |  |
| `duracao_s` | inteiro |  |  |  |
| `kcal_estimadas` | número |  |  |  |
| `volume_total` | número |  |  |  |
| `rpe` | inteiro |  |  |  |
| `humor` | inteiro |  |  |  |
| `observacao` | texto longo |  |  |  |
| `status` | lista |  | `concluida` | valores: `em_andamento`, `concluida`, `cancelada` |

#### `fit_series`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `sessao_id` | referência (id) | sim |  | → `fit_sessoes` |
| `exercicio_id` | referência (id) | sim |  | → `fit_exercicios` |
| `ordem` | inteiro |  |  |  |
| `reps` | inteiro |  |  |  |
| `carga` | número |  |  |  |
| `concluida` | sim/não |  | `true` |  |
| `tempo_s` | inteiro |  |  |  |
| `e1rm` | número |  |  |  |
| `eh_pr` | sim/não |  | `false` |  |

#### `fit_cardio`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `atividade` | lista |  | `corrida` | valores: `corrida`, `caminhada`, `bike`, `natacao`, `eliptico`, `remo`, `outro` |
| `distancia_km` | número |  |  |  |
| `duracao_s` | inteiro | sim |  |  |
| `pace` | texto (10) |  |  |  |
| `kcal` | número |  |  |  |
| `fc_media` | inteiro |  |  |  |
| `passos` | inteiro |  |  |  |
| `observacao` | texto (200) |  |  |  |

#### `fit_medidas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `peso_kg` | número |  |  |  |
| `gordura_pct` | número |  |  |  |
| `massa_magra_kg` | número |  |  |  |
| `cintura` | número |  |  |  |
| `quadril` | número |  |  |  |
| `peito` | número |  |  |  |
| `braco_d` | número |  |  |  |
| `braco_e` | número |  |  |  |
| `coxa_d` | número |  |  |  |
| `coxa_e` | número |  |  |  |
| `panturrilha` | número |  |  |  |
| `pescoco` | número |  |  |  |
| `foto_arquivo_ids` | texto (400) |  |  |  |
| `observacao` | texto (200) |  |  |  |

#### `fit_passos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `passos` | inteiro | sim |  |  |

#### `fit_timers_presets`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (60) | sim |  |  |
| `tipo` | lista |  | `intervalado` | valores: `cronometro`, `regressivo`, `intervalado`, `emom`, `tabata` |
| `trabalho_s` | inteiro |  | `40` |  |
| `descanso_s` | inteiro |  | `20` |  |
| `rounds` | inteiro |  | `8` |  |
| `series` | inteiro |  | `1` |  |

### Alimentação

#### `nut_alimentos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (120) | sim |  |  |
| `marca` | texto (80) |  |  |  |
| `codigo_barras` | texto (20) |  |  |  |
| `fonte` | lista |  | `usuario` | valores: `TACO`, `OFF`, `usuario`, `ocr` |
| `porcao_g` | número |  | `100` |  |
| `porcao_desc` | texto (60) |  |  |  |
| `kcal` | número | sim |  |  |
| `proteina_g` | número |  | `0` |  |
| `carbo_g` | número |  | `0` |  |
| `gordura_g` | número |  | `0` |  |
| `gord_sat_g` | número |  |  |  |
| `gord_trans_g` | número |  |  |  |
| `fibra_g` | número |  |  |  |
| `acucar_g` | número |  |  |  |
| `sodio_mg` | número |  |  |  |
| `nutrientes_json` | JSON |  |  |  |
| `favorito` | sim/não |  | `false` |  |
| `ultima_utilizacao` | data e hora (ISO) |  |  |  |

#### `nut_receitas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (120) | sim |  |  |
| `porcoes` | número |  | `1` |  |
| `ingredientes_json` | JSON |  |  |  |
| `totais_json` | JSON |  |  |  |
| `modo_preparo` | texto longo |  |  |  |

#### `nut_diario`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `hora` | texto (5) |  |  |  |
| `refeicao` | lista | sim |  | valores: `cafe`, `lanche_manha`, `almoco`, `lanche_tarde`, `jantar`, `ceia` |
| `alimento_id` | referência (id) |  |  | → `nut_alimentos` |
| `receita_id` | referência (id) |  |  | → `nut_receitas` |
| `nome` | texto (120) |  |  |  |
| `quantidade_g` | número |  |  |  |
| `porcoes` | número |  |  |  |
| `kcal` | número | sim |  |  |
| `proteina_g` | número |  |  |  |
| `carbo_g` | número |  |  |  |
| `gordura_g` | número |  |  |  |
| `fibra_g` | número |  |  |  |
| `sodio_mg` | número |  |  |  |
| `nutrientes_json` | JSON |  |  |  |

#### `nut_agua`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `hora` | texto (5) |  |  |  |
| `ml` | inteiro | sim |  |  |

#### `nut_metas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `vigencia_inicio` | data (aaaa-mm-dd) | sim |  |  |
| `objetivo` | lista |  | `manter` | valores: `perder`, `manter`, `ganhar` |
| `kcal` | número | sim |  |  |
| `proteina_g` | número |  |  |  |
| `carbo_g` | número |  |  |  |
| `gordura_g` | número |  |  |  |
| `fibra_g` | número |  | `30` |  |
| `agua_ml` | inteiro |  |  |  |
| `tmb` | número |  |  |  |
| `tdee` | número |  |  |  |
| `ritmo_kg_semana` | número |  |  |  |
| `formula` | lista |  | `mifflin` | valores: `mifflin`, `katch` |
| `nivel_atividade` | lista |  | `moderado` | valores: `sedentario`, `leve`, `moderado`, `intenso`, `muito_intenso` |
| `peso_alvo_kg` | número |  |  |  |
| `data_alvo` | data (aaaa-mm-dd) |  |  |  |

#### `nut_refeicoes_favoritas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `refeicao` | lista |  |  | valores: `cafe`, `lanche_manha`, `almoco`, `lanche_tarde`, `jantar`, `ceia` |
| `itens_json` | JSON | sim |  |  |

### Tarefas e agenda

#### `tar_projetos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `cor` | texto (9) |  |  |  |
| `icone` | texto (30) |  |  |  |
| `arquivado` | sim/não |  | `false` |  |

#### `tar_tarefas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (160) | sim |  |  |
| `descricao` | texto longo |  |  |  |
| `status` | lista |  | `a_fazer` | valores: `a_fazer`, `fazendo`, `feito`, `cancelada` |
| `prioridade` | inteiro |  | `3` |  |
| `projeto_id` | referência (id) |  |  | → `tar_projetos` |
| `pai_id` | referência (id) |  |  |  |
| `data_vencimento` | data (aaaa-mm-dd) |  |  |  |
| `hora` | texto (5) |  |  |  |
| `duracao_estimada_min` | inteiro |  |  |  |
| `lembrete_min_antes` | inteiro |  |  |  |
| `recorrencia_json` | JSON |  |  |  |
| `tags` | texto (200) |  |  |  |
| `ordem` | número |  | `0` |  |
| `concluida_em` | data e hora (ISO) |  |  |  |
| `meta_id` | referência (id) |  |  | → `met_metas` |
| `rotina_id` | referência (id) |  |  | → `rot_rotinas` |
| `lembrete_enviado` | sim/não |  | `false` |  |
| `est_concurso_id` | referência (id) |  |  |  |
| `est_disciplina_id` | referência (id) |  |  |  |
| `est_assunto_id` | referência (id) |  |  |  |
| `est_material_id` | referência (id) |  |  |  |
| `est_tipo` | lista |  |  | valores: `teoria`, `questoes`, `revisao`, `simulado`, `discursiva`, `leitura`, `aula`, `projeto` |
| `est_checklist_json` | JSON |  |  |  |
| `est_criterio` | texto (300) |  |  |  |
| `est_chave` | texto (120) |  |  |  |

#### `tar_eventos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (160) | sim |  |  |
| `descricao` | texto longo |  |  |  |
| `inicio` | data e hora (ISO) | sim |  |  |
| `fim` | data e hora (ISO) |  |  |  |
| `dia_inteiro` | sim/não |  | `false` |  |
| `local` | texto (120) |  |  |  |
| `cor` | texto (9) |  |  |  |
| `lembrete_min` | inteiro |  |  |  |
| `recorrencia_json` | JSON |  |  |  |
| `calendar_event_id` | texto (200) |  |  |  |

#### `tar_foco`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `tarefa_id` | referência (id) |  |  |  |
| `inicio` | data e hora (ISO) | sim |  |  |
| `duracao_s` | inteiro | sim |  |  |
| `tipo` | lista |  | `pomodoro` | valores: `pomodoro`, `livre`, `pausa` |

### Metas

#### `met_metas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (140) | sim |  |  |
| `descricao` | texto longo |  |  |  |
| `motivo` | texto longo |  |  |  |
| `area` | lista |  | `pessoal` | valores: `financeira`, `saude`, `fitness`, `alimentacao`, `carreira`, `estudos`, `pessoal`, `relacionamentos`, `lazer` |
| `horizonte` | lista |  | `medio` | valores: `curto`, `medio`, `longo` |
| `data_inicio` | data (aaaa-mm-dd) |  |  |  |
| `prazo` | data (aaaa-mm-dd) |  |  |  |
| `medicao` | lista |  | `manual` | valores: `manual`, `automatica`, `marcos` |
| `origem_metrica` | lista |  |  | valores: `fin_reserva`, `fit_peso`, `nut_peso`, `tarefas`, `rotina`, `nut_agua`, `est_horas`, `est_questoes`, `est_precisao`, `est_revisoes`, `est_cobertura`, `est_redacoes` |
| `origem_id` | referência (id) |  |  |  |
| `valor_inicial` | número |  | `0` |  |
| `valor_atual` | número |  | `0` |  |
| `valor_alvo` | número |  |  |  |
| `unidade` | texto (20) |  |  |  |
| `status` | lista |  | `ativa` | valores: `ativa`, `pausada`, `concluida`, `abandonada` |
| `prioridade` | inteiro |  | `2` |  |
| `cor` | texto (9) |  |  |  |

#### `met_marcos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `meta_id` | referência (id) | sim |  | → `met_metas` |
| `titulo` | texto (140) | sim |  |  |
| `valor_alvo` | número |  |  |  |
| `data_prevista` | data (aaaa-mm-dd) |  |  |  |
| `concluido` | sim/não |  | `false` |  |
| `concluido_em` | data e hora (ISO) |  |  |  |
| `ordem` | inteiro |  | `0` |  |

#### `met_checkins`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `meta_id` | referência (id) | sim |  | → `met_metas` |
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `valor` | número |  |  |  |
| `nota` | texto longo |  |  |  |
| `humor` | inteiro |  |  |  |

#### `met_vinculos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `meta_id` | referência (id) | sim |  | → `met_metas` |
| `modulo` | texto (30) | sim |  |  |
| `entidade` | texto (40) | sim |  |  |
| `entidade_id` | referência (id) | sim |  |  |
| `tipo_vinculo` | texto (30) |  |  |  |

### Rotinas

#### `rot_rotinas`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (120) | sim |  |  |
| `categoria` | lista |  | `outro` | valores: `treino`, `estudo`, `trabalho`, `alimentacao`, `hobby`, `saude`, `lazer`, `casa`, `outro` |
| `frequencia` | lista |  | `diaria` | valores: `diaria`, `semanal`, `mensal`, `anual`, `intervalo` |
| `dias_semana` | texto (20) |  |  |  |
| `dia_mes` | inteiro |  |  |  |
| `mes` | inteiro |  |  |  |
| `intervalo_dias` | inteiro |  |  |  |
| `hora_inicio` | texto (5) |  |  |  |
| `hora_fim` | texto (5) |  |  |  |
| `duracao_min` | inteiro |  |  |  |
| `data_inicio` | data (aaaa-mm-dd) |  |  |  |
| `data_fim` | data (aaaa-mm-dd) |  |  |  |
| `cor` | texto (9) |  |  |  |
| `icone` | texto (30) |  |  |  |
| `ativa` | sim/não |  | `true` |  |
| `modo` | lista |  | `habito` | valores: `bloco`, `habito`, `checklist` |
| `vinculo_modulo` | texto (30) |  |  |  |
| `vinculo_id` | referência (id) |  |  |  |
| `meta_id` | referência (id) |  |  | → `met_metas` |

#### `rot_itens`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `rotina_id` | referência (id) | sim |  | → `rot_rotinas` |
| `titulo` | texto (120) | sim |  |  |
| `ordem` | inteiro |  | `0` |  |

#### `rot_execucoes`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `rotina_id` | referência (id) | sim |  | → `rot_rotinas` |
| `data` | data (aaaa-mm-dd) | sim |  |  |
| `status` | lista |  | `feito` | valores: `feito`, `pulado`, `parcial`, `pendente` |
| `hora_real` | texto (5) |  |  |  |
| `nota` | texto (200) |  |  |  |
| `itens_json` | JSON |  |  |  |

#### `rot_modelos`

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (80) | sim |  |  |
| `descricao` | texto (200) |  |  |  |
| `rotinas_json` | JSON | sim |  |  |

### Estudos — concursos públicos

#### `est_concursos`

Concursos acompanhados: órgão, cargo, banca, situação, data da prova com status (confirmada/estimada/indefinida) e fonte, concurso principal.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (160) | sim |  |  |
| `orgao` | texto (120) |  |  |  |
| `cargo` | texto (120) |  |  |  |
| `especialidade` | texto (120) |  |  |  |
| `banca` | texto (80) |  |  |  |
| `escolaridade` | lista |  | `superior` | valores: `fundamental`, `medio`, `tecnico`, `superior`, `pos` |
| `localidade` | texto (120) |  |  |  |
| `link` | texto (300) |  |  |  |
| `observacoes` | texto longo |  |  |  |
| `prioridade` | inteiro |  | `2` |  |
| `situacao` | lista |  | `previsto` | valores: `previsto`, `autorizado`, `edital_publicado`, `inscricoes_abertas`, `preparacao`, `prova_realizada`, `encerrado` |
| `principal` | sim/não |  | `false` |  |
| `arquivado` | sim/não |  | `false` |  |
| `data_prova` | data (aaaa-mm-dd) |  |  |  |
| `data_prova_status` | lista |  | `indefinida` | valores: `confirmada`, `estimada`, `indefinida` |
| `data_fonte` | texto (300) |  |  |  |
| `data_atualizada` | data (aaaa-mm-dd) |  |  |  |
| `cor` | texto (9) |  |  |  |
| `resultado` | texto longo |  |  |  |
| `area` | texto (60) |  |  |  |

#### `est_etapas`

Etapas do concurso (inscrição, isenção, pagamento, prova, gabaritos, recursos, resultado, nomeação…) com data, status, checklist, evento na agenda e lembrete.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `concurso_id` | referência (id) | sim |  | → `est_concursos` |
| `tipo` | lista |  | `outra` | valores: `inscricao`, `pagamento`, `documentos`, `cartao`, `objetiva`, `discursiva`, `teste_fisico`, `titulos`, `pratica`, `resultado`, `outra` |
| `titulo` | texto (160) | sim |  |  |
| `data` | data (aaaa-mm-dd) |  |  |  |
| `data_fim` | data (aaaa-mm-dd) |  |  |  |
| `hora` | texto (5) |  |  |  |
| `data_status` | lista |  | `indefinida` | valores: `confirmada`, `estimada`, `indefinida` |
| `fonte` | texto (300) |  |  |  |
| `fonte_em` | data (aaaa-mm-dd) |  |  |  |
| `local` | texto (200) |  |  |  |
| `status` | lista |  | `pendente` | valores: `pendente`, `feito`, `dispensado` |
| `checklist_json` | JSON |  |  |  |
| `evento_id` | referência (id) |  |  | → `tar_eventos` |
| `lembrete_min` | inteiro |  |  |  |
| `observacao` | texto longo |  |  |  |
| `arquivo_ids` | texto longo |  |  |  |

#### `est_editais`

Versões do edital de cada concurso (retificações); só uma ativa por concurso.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `concurso_id` | referência (id) | sim |  | → `est_concursos` |
| `versao` | inteiro |  | `1` |  |
| `titulo` | texto (160) |  |  |  |
| `data_publicacao` | data (aaaa-mm-dd) |  |  |  |
| `fonte` | texto (300) |  |  |  |
| `arquivo_id` | referência (id) |  |  | → `arquivos` |
| `observacao` | texto longo |  |  |  |
| `ativo` | sim/não |  | `true` |  |

#### `est_disciplinas`

Disciplinas (Língua Portuguesa, Direito Constitucional…), com cor e peso.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (120) | sim |  |  |
| `cor` | texto (9) |  |  |  |
| `ordem` | número |  | `0` |  |

#### `est_assuntos`

Assuntos e subassuntos (árvore por `pai_id`): teoria, dificuldade, prioridade, pré-requisitos, último estudo e próxima revisão.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `disciplina_id` | referência (id) | sim |  | → `est_disciplinas` |
| `pai_id` | referência (id) |  |  | → `est_assuntos` |
| `titulo` | texto (300) | sim |  |  |
| `ordem` | número |  | `0` |  |
| `teoria` | lista |  | `nao_iniciada` | valores: `nao_iniciada`, `em_andamento`, `concluida` |
| `dificuldade` | inteiro |  | `3` |  |
| `prioridade` | inteiro |  | `2` |  |
| `pre_requisitos` | texto longo |  |  |  |
| `esforco_min` | inteiro |  |  |  |
| `notas` | texto longo |  |  |  |
| `ultimo_estudo` | data e hora (ISO) |  |  |  |
| `ultima_revisao` | data e hora (ISO) |  |  |  |
| `proxima_revisao` | data (aaaa-mm-dd) |  |  |  |

#### `est_edital_itens`

Itens do edital verticalizado de uma versão: assunto, referência do item, peso, nº de questões e o que mudou em relação à versão anterior.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `edital_id` | referência (id) | sim |  | → `est_editais` |
| `assunto_id` | referência (id) | sim |  | → `est_assuntos` |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `item_ref` | texto (40) |  |  |  |
| `pagina` | inteiro |  |  |  |
| `descricao` | texto longo |  |  |  |
| `peso` | número |  | `1` |  |
| `qtd_questoes` | inteiro |  |  |  |
| `alteracao` | lista |  | `mantido` | valores: `mantido`, `adicionado`, `alterado`, `retirado` |
| `ordem` | número |  | `0` |  |

#### `est_planos`

Plano de estudos: disponibilidade por dia, tamanho da sessão, pausas, folga para imprevistos, pesos e posição no ciclo.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `concurso_id` | referência (id) |  |  | → `est_concursos` |
| `nome` | texto (120) | sim |  |  |
| `modo` | lista |  | `ciclo` | valores: `ciclo`, `cronograma` |
| `fase` | lista |  | `pre_edital` | valores: `pre_edital`, `pos_edital` |
| `edital_id` | referência (id) |  |  | → `est_editais` |
| `disponibilidade_json` | JSON |  |  |  |
| `sessao_min` | inteiro |  | `50` |  |
| `pausa_min` | inteiro |  | `10` |  |
| `folga_pct` | inteiro |  | `15` |  |
| `inicio` | data (aaaa-mm-dd) |  |  |  |
| `fim` | data (aaaa-mm-dd) |  |  |  |
| `ciclo_pos` | inteiro |  | `0` |  |
| `pesos_json` | JSON |  |  |  |
| `ativo` | sim/não |  | `true` |  |

#### `est_ciclo_itens`

Ordem e duração das disciplinas no ciclo de estudos.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `plano_id` | referência (id) | sim |  | → `est_planos` |
| `disciplina_id` | referência (id) | sim |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `tipo` | lista |  | `teoria` | valores: `teoria`, `questoes`, `revisao`, `simulado`, `discursiva` |
| `minutos` | inteiro |  | `60` |  |
| `ordem` | número |  | `0` |  |
| `fixo` | sim/não |  | `false` |  |

#### `est_sessoes`

Sessões de estudo com tempo canônico (início, fim, pausas, tempo líquido), origem (app, manual, Foco, Telegram), páginas, questões e edições com motivo.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `concurso_id` | referência (id) |  |  | → `est_concursos` |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `material_id` | referência (id) |  |  | → `est_materiais` |
| `tarefa_id` | referência (id) |  |  | → `tar_tarefas` |
| `foco_id` | referência (id) |  |  | → `tar_foco` |
| `tipo` | lista |  | `teoria` | valores: `teoria`, `questoes`, `revisao`, `simulado`, `discursiva`, `leitura`, `aula` |
| `objetivo` | texto (300) |  |  |  |
| `inicio` | data e hora (ISO) | sim |  |  |
| `fim` | data e hora (ISO) |  |  |  |
| `pausas_json` | JSON |  |  |  |
| `liquido_s` | inteiro |  | `0` |  |
| `status` | lista |  | `aberta` | valores: `aberta`, `pausada`, `encerrada`, `cancelada` |
| `origem` | lista |  | `app` | valores: `app`, `manual`, `foco`, `telegram` |
| `aparelho` | texto (160) |  |  |  |
| `pagina_ini` | inteiro |  |  |  |
| `pagina_fim` | inteiro |  |  |  |
| `paginas` | texto (200) |  |  |  |
| `paginas_n` | inteiro |  |  |  |
| `questoes_n` | inteiro |  |  |  |
| `acertos_n` | inteiro |  |  |  |
| `dificuldade` | inteiro |  |  |  |
| `duvidas` | texto longo |  |  |  |
| `proximo_passo` | texto longo |  |  |  |
| `op_key` | texto (80) |  |  |  |
| `edicao_motivo` | texto (300) |  |  |  |

#### `est_materiais`

Biblioteca: PDFs, planilhas, imagens, links, livros, aulas; código Mn, versão, hash (sem duplicar), situação, texto extraído e file_id do Telegram.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `codigo` | texto (12) |  |  |  |
| `titulo` | texto (200) | sim |  |  |
| `descricao` | texto longo |  |  |  |
| `autor` | texto (160) |  |  |  |
| `tipo` | lista |  | `pdf` | valores: `pdf`, `xlsx`, `imagem`, `link`, `livro`, `aula`, `curso`, `outro` |
| `versao` | inteiro |  | `1` |  |
| `versao_de` | referência (id) |  |  | → `est_materiais` (versão anterior) |
| `data_ref` | data (aaaa-mm-dd) |  |  |  |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_ids` | texto longo |  |  |  |
| `concurso_ids` | texto longo |  |  |  |
| `tags` | texto (200) |  |  |  |
| `arquivo_id` | referência (id) |  |  | → `arquivos` |
| `url` | texto (500) |  |  |  |
| `hash` | texto (80) |  |  |  |
| `tamanho_bytes` | inteiro |  |  |  |
| `paginas` | inteiro |  |  |  |
| `situacao` | lista |  | `a_estudar` | valores: `a_estudar`, `estudando`, `concluido`, `arquivado` |
| `favorito` | sim/não |  | `false` |  |
| `origem` | lista |  | `app` | valores: `app`, `telegram` |
| `texto_json_id` | texto (80) |  |  |  |
| `texto_paginas` | inteiro |  |  |  |
| `tg_file_id` | texto (200) |  |  |  |
| `tg_file_hash` | texto (80) |  |  |  |
| `categoria` | lista |  | `outros` | valores: `questoes`, `revisoes`, `teoria`, `flashcards`, `outros` |
| `pasta` | texto (300) |  |  |  |

#### `est_leitura`

Posição de leitura por material (página, zoom) e páginas marcadas como lidas.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `material_id` | referência (id) | sim |  | → `est_materiais` |
| `pagina` | inteiro |  | `1` |  |
| `zoom` | número |  |  |  |
| `rolagem` | número |  |  |  |
| `paginas_lidas` | texto longo |  |  |  |
| `total_paginas` | inteiro |  |  |  |
| `atualizado` | data e hora (ISO) |  |  |  |

#### `est_pdf_anot`

Índice das anotações de cada PDF: arquivo JSON no Drive, revisão geral, revisão por página, total e favoritos.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `material_id` | referência (id) | sim |  | → `est_materiais` |
| `arquivo_id` | referência (id) | sim |  | → `arquivos` |
| `json_drive_id` | texto (80) |  |  |  |
| `revisao` | inteiro |  | `0` |  |
| `revisoes_json` | JSON |  |  |  |
| `total` | inteiro |  | `0` |  |
| `favoritos` | inteiro |  | `0` |  |
| `atualizado` | data e hora (ISO) |  |  |  |

#### `est_exportacoes`

Cópias geradas (PDF anotado com a revisão exata das anotações, relatórios, resumos), guardadas no Drive.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `material_id` | referência (id) |  |  | → `est_materiais` |
| `tipo` | lista |  | `anotado` | valores: `anotado`, `relatorio`, `resumo`, `erros`, `questoes` |
| `revisao` | inteiro |  |  |  |
| `arquivo_id` | referência (id) | sim |  | → `arquivos` |
| `hash` | texto (80) |  |  |  |
| `tamanho_bytes` | inteiro |  |  |  |
| `titulo` | texto (200) |  |  |  |
| `tg_file_id` | texto (200) |  |  |  |

#### `est_anotacoes`

Resumos, fichamentos, Cornell, mapas, notas, lei seca e dúvidas, com versão, vínculos, fonte e marca de rascunho de IA.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (200) | sim |  |  |
| `tipo` | lista |  | `resumo` | valores: `resumo`, `fichamento`, `cornell`, `memoria`, `nota`, `lei_seca`, `duvida`, `trecho` |
| `conteudo` | texto longo |  |  |  |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `material_id` | referência (id) |  |  | → `est_materiais` |
| `pagina` | inteiro |  |  |  |
| `trecho` | texto longo |  |  |  |
| `tags` | texto (200) |  |  |  |
| `favorito` | sim/não |  | `false` |  |
| `versao` | inteiro |  | `1` |  |
| `ligadas` | texto longo |  |  |  |
| `norma` | texto (160) |  |  |  |
| `artigo` | texto (60) |  |  |  |
| `fonte` | texto (300) |  |  |  |
| `fonte_data` | data (aaaa-mm-dd) |  |  |  |
| `gerado_ia` | sim/não |  | `false` |  |
| `aprovado` | sim/não |  | `true` |  |
| `ia_meta` | JSON |  |  |  |

#### `est_versoes`

Versões anteriores de anotações, discursivas e questões (histórico).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `entidade` | texto (40) | sim |  |  |
| `entidade_id` | referência (id) | sim |  | → `(conforme `entidade`)` |
| `versao` | inteiro | sim |  |  |
| `conteudo` | texto longo |  |  |  |
| `titulo` | texto (200) |  |  |  |

#### `est_questoes`

Banco de questões: tipo, alternativas, gabarito com situação (preliminar, definitivo, anulada, sem gabarito) e histórico, banca, ano, assunto, versão.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `codigo` | texto (40) |  |  |  |
| `tipo` | lista |  | `multipla` | valores: `multipla`, `certo_errado`, `curta`, `discursiva` |
| `enunciado` | texto longo | sim |  |  |
| `alternativas_json` | JSON |  |  |  |
| `imagem_arquivo_id` | referência (id) |  |  | → `arquivos` |
| `gabarito` | texto (40) |  |  |  |
| `gabarito_status` | lista |  | `sem_gabarito` | valores: `preliminar`, `definitivo`, `anulada`, `sem_gabarito` |
| `gabarito_hist_json` | JSON |  |  |  |
| `explicacao` | texto longo |  |  |  |
| `fonte` | texto (300) |  |  |  |
| `banca` | texto (80) |  |  |  |
| `orgao` | texto (120) |  |  |  |
| `concurso_id` | referência (id) |  |  | → `est_concursos` |
| `cargo` | texto (120) |  |  |  |
| `ano` | inteiro |  |  |  |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `dificuldade` | inteiro |  | `3` |  |
| `favorita` | sim/não |  | `false` |  |
| `duvida` | sim/não |  | `false` |  |
| `versao` | inteiro |  | `1` |  |
| `tags` | texto (200) |  |  |  |
| `material_id` | referência (id) |  |  | → `est_materiais` |
| `pagina` | inteiro |  |  |  |
| `area` | texto (60) |  |  |  |
| `comentario` | texto longo |  |  |  |
| `comentario_ia` | sim/não |  | `false` |  |
| `comentario_em` | data e hora (ISO) |  |  |  |
| `gerada_ia` | sim/não |  | `false` |  |
| `revisar` | sim/não |  | `false` |  |
| `texto_base` | texto longo |  |  |  |

#### `est_tentativas`

Cada resposta: resultado original e resultado atual (recalculado se o gabarito mudar), tempo, confiança, modo.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `questao_id` | referência (id) | sim |  | → `est_questoes` |
| `questao_versao` | inteiro |  |  |  |
| `resposta` | texto (40) |  |  |  |
| `gabarito_usado` | texto (40) |  |  |  |
| `resultado` | lista | sim |  | valores: `certa`, `errada`, `branco`, `anulada`, `sem_gabarito` |
| `resultado_atual` | lista |  |  | valores: `certa`, `errada`, `branco`, `anulada`, `sem_gabarito` |
| `recalc_em` | data e hora (ISO) |  |  |  |
| `tempo_s` | inteiro |  |  |  |
| `confianca` | inteiro |  |  |  |
| `modo` | lista |  | `treino` | valores: `treino`, `avaliacao`, `simulado`, `telegram` |
| `simulado_id` | referência (id) |  |  | → `est_simulados` |
| `sessao_id` | referência (id) |  |  | → `est_sessoes` |
| `primeira` | sim/não |  | `false` |  |
| `op_key` | texto (80) |  |  |  |

#### `est_listas`

Listas de questões (manual, aleatória, dificuldades ou filtro salvo).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `nome` | texto (160) | sim |  |  |
| `tipo` | lista |  | `manual` | valores: `manual`, `aleatoria`, `dificuldades`, `filtro` |
| `filtros_json` | JSON |  |  |  |
| `questao_ids` | texto longo |  |  |  |

#### `est_simulados`

Simulados e provas reais: regras de pontuação informadas pelo usuário, composição por blocos, resultado.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (160) | sim |  |  |
| `concurso_id` | referência (id) |  |  | → `est_concursos` |
| `tipo` | lista |  | `simulado` | valores: `simulado`, `prova_real` |
| `duracao_min` | inteiro |  |  |  |
| `regras_json` | JSON |  |  |  |
| `composicao_json` | JSON |  |  |  |
| `status` | lista |  | `rascunho` | valores: `rascunho`, `em_andamento`, `finalizado` |
| `inicio` | data e hora (ISO) |  |  |  |
| `fim` | data e hora (ISO) |  |  |  |
| `tempo_s` | inteiro |  |  |  |
| `resultado_json` | JSON |  |  |  |
| `equivalente_a` | referência (id) |  |  |  |

#### `est_simulado_itens`

Questões de cada simulado com o gabarito congelado no início, resposta, marcação e tempo.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `simulado_id` | referência (id) | sim |  | → `est_simulados` |
| `questao_id` | referência (id) | sim |  | → `est_questoes` |
| `ordem` | inteiro |  |  |  |
| `bloco` | texto (80) |  |  |  |
| `peso` | número |  | `1` |  |
| `questao_versao` | inteiro |  |  |  |
| `gabarito_snapshot` | texto (40) |  |  |  |
| `status_snapshot` | texto (20) |  |  |  |
| `resposta` | texto (40) |  |  |  |
| `marcada` | sim/não |  | `false` |  |
| `tempo_s` | inteiro |  |  |  |
| `resultado` | texto (20) |  |  |  |

#### `est_revisoes`

Revisões espaçadas agendadas (assunto, material, questão, erro, nota, cartão), com resultado e sequência.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `alvo_tipo` | lista | sim |  | valores: `assunto`, `material`, `questao`, `erro`, `nota`, `flashcard` |
| `alvo_id` | referência (id) | sim |  | → `(conforme `alvo_tipo`)` |
| `titulo` | texto (200) |  |  |  |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `paginas` | texto (60) |  |  |  |
| `vencimento` | data (aaaa-mm-dd) | sim |  |  |
| `feita_em` | data e hora (ISO) |  |  |  |
| `resultado` | lista |  |  | valores: `errei`, `dificil`, `bom`, `facil` |
| `seq` | inteiro |  | `0` |  |
| `intervalo_dias` | inteiro |  |  |  |
| `status` | lista |  | `pendente` | valores: `pendente`, `feita`, `cancelada` |
| `origem` | texto (30) |  |  |  |

#### `est_flashcards`

Cartões (básico, lacuna, imagem, áudio) com agendamento SM-2.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `baralho` | texto (80) |  | `Geral` |  |
| `frente` | texto longo | sim |  |  |
| `verso` | texto longo |  |  |  |
| `tipo` | lista |  | `basico` | valores: `basico`, `lacuna`, `imagem`, `audio` |
| `imagem_arquivo_id` | referência (id) |  |  | → `arquivos` |
| `audio_arquivo_id` | referência (id) |  |  | → `arquivos` |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `tags` | texto (200) |  |  |  |
| `favorito` | sim/não |  | `false` |  |
| `suspenso` | sim/não |  | `false` |  |
| `origem_ref` | texto (300) |  |  |  |
| `facilidade` | número |  | `2.5` |  |
| `intervalo` | inteiro |  | `0` |  |
| `repeticoes` | inteiro |  | `0` |  |
| `lapsos` | inteiro |  | `0` |  |
| `vencimento` | data (aaaa-mm-dd) |  |  |  |
| `novo` | sim/não |  | `true` |  |

#### `est_flashcard_revisoes`

Histórico das respostas aos cartões.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `card_id` | referência (id) | sim |  | → `est_flashcards` |
| `nota` | lista | sim |  | valores: `errei`, `dificil`, `bom`, `facil` |
| `data` | data e hora (ISO) | sim |  |  |
| `intervalo_antes` | inteiro |  |  |  |
| `intervalo_depois` | inteiro |  |  |  |
| `op_key` | texto (80) |  |  |  |

#### `est_erros`

Caderno de erros: causa, raciocínio, explicação, ação, recorrência e status.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (200) | sim |  |  |
| `questao_id` | referência (id) |  |  | → `est_questoes` |
| `disciplina_id` | referência (id) |  |  | → `est_disciplinas` |
| `assunto_id` | referência (id) |  |  | → `est_assuntos` |
| `causa` | lista |  | `conteudo` | valores: `conteudo`, `interpretacao`, `atencao`, `tempo`, `chute`, `pegadinha`, `outro` |
| `raciocinio` | texto longo |  |  |  |
| `explicacao` | texto longo |  |  |  |
| `fonte` | texto (300) |  |  |  |
| `acao` | texto longo |  |  |  |
| `proxima_tentativa` | data (aaaa-mm-dd) |  |  |  |
| `status` | lista |  | `aberta` | valores: `aberta`, `em_estudo`, `aguardando_pratica`, `resolvida` |
| `recorrencias` | inteiro |  | `1` |  |

#### `est_discursivas`

Discursivas e redações: proposta, critérios, texto com versões e avaliações (autoavaliação, humana, oficial ou IA identificada).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `titulo` | texto (200) | sim |  |  |
| `concurso_id` | referência (id) |  |  | → `est_concursos` |
| `proposta` | texto longo |  |  |  |
| `tipo` | lista |  | `dissertativa` | valores: `dissertativa`, `peca`, `estudo_caso`, `parecer`, `redacao`, `outra` |
| `limite_linhas` | inteiro |  |  |  |
| `limite_palavras` | inteiro |  |  |  |
| `tempo_min` | inteiro |  |  |  |
| `criterios_json` | JSON |  |  |  |
| `texto` | texto longo |  |  |  |
| `versao` | inteiro |  | `1` |  |
| `avaliacoes_json` | JSON |  |  |  |
| `status` | lista |  | `rascunho` | valores: `rascunho`, `escrita`, `corrigida`, `reescrita` |
| `gerado_ia` | sim/não |  | `false` |  |
| `ia_meta` | JSON |  |  |  |

#### `est_jobs`

Fila de trabalhos do Telegram (envio de PDF, relatório, resumo): estado, tentativas, erro, entrega.

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `codigo` | texto (12) |  |  |  |
| `tipo` | lista | sim |  | valores: `enviar_material`, `enviar_exportacao`, `enviar_nota`, `enviar_relatorio`, `enviar_erros`, `enviar_texto`, `gerar_resumo`, `receber_arquivo`, `ia_chat`, `ia_resumo`, `ia_questoes`, `enviar_quiz`, `enviar_arquivo` |
| `status` | lista |  | `na_fila` | valores: `na_fila`, `processando`, `pronto`, `enviando`, `enviado`, `falhou`, `entrega_incerta`, `cancelado` |
| `origem` | lista |  | `app` | valores: `app`, `telegram`, `gatilho` |
| `params_json` | JSON |  |  |  |
| `chave` | texto (120) |  |  |  |
| `tentativas` | inteiro |  | `0` |  |
| `proxima` | data e hora (ISO) |  |  |  |
| `resultado_json` | JSON |  |  |  |
| `erro` | texto (500) |  |  |  |
| `arquivo_id` | referência (id) |  |  | → `arquivos` |
| `revisao` | inteiro |  |  |  |

#### `tg_updates`

Atualizações recebidas do Telegram já processadas (evita processar a mesma mensagem duas vezes).

| Coluna | Tipo | Obrigatória | Padrão | Observação |
|---|---|---|---|---|
| `update_id` | texto (30) | sim |  |  |
| `chat_id` | texto (30) |  |  |  |
| `tipo` | texto (30) |  |  |  |
| `texto` | texto longo |  |  |  |
| `status` | lista |  | `recebido` | valores: `recebido`, `processado`, `ignorado`, `erro` |
| `erro` | texto (300) |  |  |  |


---

## 6. API do servidor

Chamada do cliente: `google.script.run.api(rota, dados, aparelho, token)`.

- **Envelope:** `{ ok, data, error: { code, message, field }, meta: { ms } }`.
- **Códigos de erro:** `VALIDATION` (com o `field`), `NOT_FOUND`, `FORBIDDEN`, `AUTH` (sessão vencida, e o app volta ao login), `LOCKED`, `QUOTA`, `OCR_FAILED`, `UNKNOWN`. Erros inesperados vão para o log com a pilha de chamadas, e o usuário vê uma mensagem amigável.
- **Lote:** `apiBatch([{route, payload}, …], aparelho, token)`, até 20 chamadas por ida.
- **GET público** `?push=<pid>`: usado pelo service worker para buscar o conteúdo das notificações ([seção 9](#9-app-instalável-pwa-e-notificações-push)).
- **GET** `?hub.mode=subscribe&…` e **POST** `?wa=<chave>`: webhook opcional do WhatsApp ([seção 9A](#9a-whatsapp-api-oficial-da-meta)).

### Rotas (129)

| Rota | Acesso | O que faz |
|---|---|---|
| `auth.login` | pública | Entra com e-mail + senha e devolve o token da sessão. |
| `auth.logout` | logado | Encerra a sessão atual. |
| `boot` | logado | Carga inicial: perfil, preferências e dados recentes de todos os módulos. |
| `db.list` | logado | Lista registros de uma tabela (com filtros). |
| `db.save` | logado | Cria/atualiza um registro (tabelas liberadas ao cliente). |
| `db.saveMany` | logado | Grava vários registros de uma vez. |
| `db.remove` | logado | Exclusão lógica (com desfazer). |
| `db.restore` | logado | Restaura um registro excluído. |
| `profile.save` | logado | Salva o perfil. |
| `settings.save` | logado | Salva preferências. |
| `auth.setPin` | logado | Define/remove o PIN. |
| `auth.verifyPin` | logado | Confere o PIN no desbloqueio. |
| `push.config` | logado | Chave pública VAPID para o navegador criar a inscrição. |
| `push.subscribe` | logado | Registra o aparelho para push. |
| `push.unsubscribe` | logado | Remove o aparelho do push. |
| `push.status` | logado | Aparelhos com push ativo. |
| `push.test` | logado | Envia uma notificação de teste. |
| `tg.status` | logado | Situação do Telegram (token só mascarado), uso e histórico. |
| `tg.saveConfig` | só o dono | Salva e confere o token do bot (getMe) e liga/desliga o bot. |
| `tg.linkCode` | logado | Gera o link t.me/<bot>?start=<código> para conectar o Telegram (30 min). |
| `tg.poll` | logado | Lê as mensagens novas do bot na hora (conexão e comandos). |
| `tg.saveUser` | logado | Ligar, avisos automáticos, resumo das 7h, tipos e limite diário. |
| `tg.unlink` | logado | Desconecta o Telegram da pessoa. |
| `tg.sendTest` | logado | Mensagem de teste. |
| `tg.commands` | logado | Registro único dos comandos do bot (grupos Geral, Estudos, IA, Arquivos e relatórios), o mesmo usado pelo roteador, /ajuda, /funcoes e o menu. |
| `tg.setCommands` | só o dono | Publica os comandos no menu "/" do bot (setMyCommands). |
| `wa.status` | logado | Situação do WhatsApp (token só mascarado), uso e histórico. |
| `wa.saveConfig` | só o dono | Salva token, ID do número, versão, limite mensal e o interruptor geral. |
| `wa.testConnection` | só o dono | Lê os dados do número na Meta (sem enviar nada). |
| `wa.saveUser` | logado | Número, ligar, modo de teste, envios automáticos, tipos e limite diário. |
| `wa.markWindow` | logado | Marca a janela de 24 h como aberta (sem webhook). |
| `wa.sendTest` | logado | Mensagem de teste (respeita simulação, janela e limites). |
| `files.upload` | logado | Envia arquivo ao Drive (base64) e registra metadados. |
| `files.data` | logado | Devolve o arquivo/miniatura como data URL. |
| `files.rename` | logado | Renomeia o arquivo. |
| `files.trash` | logado | Manda o arquivo para a lixeira do Drive. |
| `files.link` | logado | Link do arquivo no Drive. |
| `ocr.extract` | logado | OCR de cupom, comprovante Pix ou rótulo nutricional. |
| `fin.saveTx` | logado | Salva lançamento com parcelas, fatura do cartão e recorrência. |
| `fin.removeGroup` | logado | Exclui um parcelamento inteiro. |
| `fin.payInvoice` | logado | Paga a fatura (gera a saída na conta). |
| `fin.reconcile` | logado | Ajusta o saldo da conta ao valor real do banco. |
| `fin.aporte` | logado | Aporte/resgate em reserva. |
| `fin.generateRecurring` | logado | Gera os lançamentos recorrentes do período. |
| `fin.copyBudget` | logado | Copia o orçamento de um mês para outro. |
| `fin.import` | logado | Importa extrato (CSV/OFX) sem duplicar. |
| `fin.exportCsv` | logado | Exporta lançamentos em CSV. |
| `fit.saveSession` | logado | Fecha a sessão de treino (volume, kcal, e1RM e recordes). |
| `nut.barcode` | logado | Busca produto pelo código de barras. |
| `nut.saveGoal` | logado | Salva a meta alimentar revalidando os limites seguros. |
| `alarm.ack` | logado | O app tocou o alarme na tela: marca o disparo para o gatilho não mandar push/Telegram repetido. |
| `tasks.calendar` | só o dono | Envia evento ao Google Agenda. |
| `logs.list` | logado | Consulta os logs. |
| `logs.client` | logado | Recebe erros do navegador. |
| `logs.purge` | logado | Apaga logs antigos. |
| `logs.export` | logado | Exporta logs em CSV. |
| `sys.diagnostics` | logado | Diagnóstico (abas, pastas, cache, cotas). |
| `sys.backup` | só o dono | Cópia de segurança da planilha agora. |
| `sys.exportAll` | logado | Exporta todos os seus dados (JSON). |
| `sys.importAll` | logado | Restaura a partir do JSON exportado. |
| `sys.seedDemo` | logado | Carrega dados de demonstração. |
| `sys.clearDemo` | logado | Remove os dados de demonstração. |
| `sys.setupTriggers` | só o dono | Reinstala os gatilhos. |
| `sys.clearCache` | logado | Limpa o cache do servidor. |
| `est.boot` | logado | Carrega as tabelas de Estudos sob demanda (fora da carga inicial do app) e a situação da IA. |
| `est.sessionStart` | logado | Abre a sessão de estudo (uma por vez; avisa se já houver outra). |
| `est.sessionPause` | logado | Pausa a sessão. |
| `est.sessionResume` | logado | Retoma a sessão. |
| `est.sessionEnd` | logado | Encerra: tempo líquido, páginas estudadas, questões, teoria do assunto, 1ª revisão, conclui a tarefa. |
| `est.sessionManual` | logado | Registra uma sessão feita fora do app. |
| `est.sessionEdit` | logado | Corrige horários de uma sessão (exige motivo). |
| `est.sessionCancel` | logado | Cancela a sessão aberta. |
| `est.fromFocus` | logado | Pomodoro de tarefa de estudo vira sessão (sem duplicar). |
| `est.questionSave` | logado | Cria/edita questão; muda versão e, se o gabarito mudar, registra histórico e recalcula. |
| `est.questionDelete` | logado | Exclui uma ou várias questões (`ids`; exclusão lógica). |
| `est.questionRestore` | logado | Desfaz a exclusão (uma ou várias). |
| `est.questionComment` | logado | Salva o comentário da questão (marca quando veio da IA). |
| `est.questionsAdd` | logado | Inclui questões geradas pela IA no banco (gabarito preliminar, "a revisar", concurso e área). |
| `est.questionGabarito` | logado | Muda gabarito/situação com motivo; recalcula ou mantém as tentativas. |
| `est.answer` | logado | Registra a resposta (idempotente) e corrige pelo gabarito vigente. |
| `est.simStart` | logado | Monta o simulado e congela os gabaritos. |
| `est.simSave` | logado | Salva respostas parciais (retomada). |
| `est.simFinish` | logado | Finaliza e pontua pelas regras do usuário. |
| `est.reviewDone` | logado | Conclui revisão e agenda a próxima. |
| `est.reviewSchedule` | logado | Agenda revisões. |
| `est.cardAnswer` | logado | Responde flashcard (SM-2). |
| `est.noteSave` | logado | Salva anotação com versão (detecta edição concorrente). |
| `est.noteVersions` | logado | Versões anteriores. |
| `est.entityDelete` | logado | Exclui (lixeira) anotação ou discursiva. |
| `est.entityRestore` | logado | Desfaz a exclusão de anotação ou discursiva. |
| `est.discSave` | logado | Salva discursiva e avaliações. |
| `est.materialSave` | logado | Cria/edita material da biblioteca. |
| `est.readingSave` | logado | Posição de leitura e páginas lidas. |
| `est.editalApply` | logado | Prévia e gravação do edital verticalizado (versões). |
| `est.importRows` | logado | Importação de planilha ou de PDF lido no app (questões, flashcards, edital) com prévia e erros por linha; aceita texto de apoio, página, material e imagem. |
| `est.planSuggest` | logado | Sugestão de plano com a conta explicada. |
| `est.planApply` | logado | Transforma a sugestão em tarefas (sem duplicar). |
| `est.stats` | logado | Indicadores de desempenho com denominadores. |
| `est.report` | logado | Relatório em PDF ou CSV. |
| `est.errorFromAttempt` | logado | Leva a questão errada ao caderno de erros. |
| `est.upStart` | logado | Inicia envio retomável ao Drive (detecta duplicado pelo hash; com `substituir`, atualiza o arquivo existente do material). |
| `est.upChunk` | logado | Envia um bloco do arquivo. |
| `est.fileChunk` | logado | Lê um bloco do arquivo do Drive. |
| `est.annGet` | logado | Anotações do PDF (JSON no Drive). |
| `est.annSave` | logado | Salva páginas alteradas com revisão por página (CONFLICT se mudou em outro aparelho). |
| `est.textSave` | logado | Guarda o texto das páginas (camada do PDF ou OCR, com motor, confiança e posição das palavras) num JSON por material. |
| `est.textGet` | logado | Lê o texto das páginas (com ocr:true, também as palavras do OCR); reaproveita o de outro material com o mesmo arquivo. |
| `est.ocrPage` | logado | OCR de uma página pelo Google Drive (PNG da página; só texto; até 300 por dia). |
| `est.exportRegister` | logado | Registra a cópia anotada com a revisão exata (atualiza o registro único do material). |
| `est.dupScan` | logado | Lista arquivos duplicados de Estudos (cópias antigas e conteúdo igual sem uso) e o espaço a liberar. |
| `est.libReorg` | logado | Reorganiza a biblioteca na estrutura Tipo/Concurso/Data/Categoria (prévia com dry). |
| `est.materialBatch` | logado | Edição em lote de materiais (categoria, concurso, disciplina, situação), movendo os arquivos. |
| `est.dupClean` | logado | Manda os duplicados escolhidos para a lixeira (Drive e app). |
| `est.dupRestore` | logado | Desfaz a limpeza de duplicados. |
| `est.materialVersion` | logado | Nova versão do arquivo do material. |
| `est.materialTrash` | logado | Manda material para a lixeira. |
| `est.trashList` | logado | Materiais na lixeira. |
| `est.exportCards` | logado | Exporta cartões em CSV (rota antiga; o app usa o relatório em planilha XLSX). |
| `est.aiStatus` | logado | Provedores (sem segredos), modelo padrão, uso e limite do dia. |
| `est.aiConfig` | só o dono | Provedores de IA: salvar, excluir, padrão, limite, buscar modelos e testar (chaves só no servidor). |
| `est.aiRun` | logado | Assistente: conversa, resumo, questões, flashcards e resposta de questão, com fontes e o modelo escolhido. |
| `est.aiResumoStart` | logado | Começa um resumo de PDF com IA (modo, foco, páginas): divide em blocos e cria o pedido ia_resumo na fila. |
| `est.aiResumoStep` | logado | Processa o próximo bloco (ou a junção) do resumo e devolve o progresso; no fim, o rascunho da anotação. |
| `est.aiResumoCancel` | logado | Cancela o resumo em andamento. |
| `est.aiDisc` | logado | Discursivas com IA: corrigir (a–e, avaliação "sugestão de IA"), temas e propostas, texto de exemplo. |
| `est.tgSend` | logado | Põe na fila um envio para o seu Telegram (material, cópia anotada, nota, relatório, texto, série de questões). |
| `est.jobs` | logado | Fila de trabalhos do Telegram. |
| `est.jobCancel` | logado | Cancela um trabalho. |
| `est.checkFiles` | logado | Confere se os arquivos da biblioteca ainda estão no Drive (e restaura do backup). |

A rota `db.save` só grava as tabelas listadas em `CONFIG.CLIENT_WRITABLE`. As regras que mexem em vários registros (parcelas, faturas, aportes, importação) têm rotas próprias.

---

## 7. Gatilhos automáticos

Criados pelo `setup()` (ou por `setupTriggers()`). Rodam para **cada usuário** cadastrado.

| Gatilho | Quando | O que faz |
|---|---|---|
| `triggerReminders` | a cada 15 min | Lembretes de tarefas (notificação + e-mail), avisos de rotinas que vão começar e de eventos com lembrete, envio do **push** e, se autorizado, do **Telegram** e do **WhatsApp** (uma mensagem com os avisos novos). |
| `triggerFrequente` | a cada 5 min | **Alarmes** que venceram (notificação, push e, se autorizado, Telegram) e leitura das mensagens novas do bot (`getUpdates`): conexão de contas e comandos `/hoje`, `/parar`, `/ajuda`. Sem alarme ativo, só confere o Telegram. Substitui o antigo `triggerTelegram` (a função continua existindo para gatilhos antigos). |
| `triggerDaily` | todo dia às 7h | Gera os lançamentos recorrentes, fecha faturas vencidas, cria notificações (contas a vencer, faturas, tarefas atrasadas, metas em risco), envia o push, o **resumo do dia** no Telegram (para quem ligou) e por e-mail. |
| `triggerWeekly` | domingo às 3h | Backup da planilha (mantém as 8 últimas), limpeza dos temporários do OCR e das sessões vencidas (uma vez), retenção de logs e limpeza das notificações lidas antigas (por usuário). |

---

## 8. Login, usuários e segurança

### Como funciona o login

- O Web App é publicado como **"Executar como: Eu"** e **"Quem pode acessar: Qualquer pessoa"**. Qualquer um abre a página, mas sem login não vê dado nenhum: toda rota, menos `auth.login`, exige um token válido.
- A tela de entrada pede **e-mail** e **senha de acesso**. A senha é a mesma para todos e só existe como hash SHA-256 com sal: em `CONFIG.LOGIN.SENHA_SHA256` ou na propriedade `LOGIN_SENHA_SHA256` do script, se você trocar.
- No acerto, o servidor cria um **token aleatório** (64 caracteres) válido por 30 dias. O token fica no aparelho e o servidor guarda só o hash dele, com o e-mail e a validade (Script Properties, com cache na frente).
- **O e-mail digitado é o usuário.** Tudo que a pessoa cadastra recebe `user_id` = e-mail, e os logs também. Cada e-mail vê **só os próprios dados**. No primeiro acesso, o e-mail ganha categorias, exercícios, alimentos, timers, modelos de rotina e a conta "Carteira".
- **Bloqueio por tentativas:** 5 senhas erradas para o mesmo e-mail travam por 15 minutos. Cada tentativa errada vai para o log daquele e-mail.
- **Sair** (Configurações ou Perfil) apaga o token do aparelho e do servidor.

### Proteções

| Item | Como |
|---|---|
| Isolamento | Toda consulta filtra pelo e-mail da sessão. Gravar em registro de outra pessoa resulta em "não encontrado". |
| Rotas do dono | `sys.backup`, `sys.setupTriggers`, `tasks.calendar`, `wa.saveConfig`, `wa.testConnection` e `tg.saveConfig` mexem no Drive, nos gatilhos, na Agenda, na conta da Meta ou no bot do Telegram da conta dona, então só o e-mail dono do script pode usá-las. |
| Tokens (Meta e Telegram) | Ficam só nas propriedades do script. Nunca vão para a planilha, para o navegador (só os 4 últimos caracteres) nem para os logs; erros do Telegram têm o token apagado antes de registrar. |
| XSS | Todo texto entra no HTML escapado pelo `P.h`. Valores crus só por `raw()` explícito. |
| Fórmulas | Texto que começa com `=`, `+`, `-` ou `@` é gravado como texto literal. |
| Arquivos | Ficam privados no Drive do dono. O app entrega o conteúdo pelo servidor, sem link público. |
| PIN | Hash SHA-256 por usuário. Bloqueio por inatividade. |
| Senha | `definirSenha('nova')` troca a senha, `encerrarSessoes()` derruba todo mundo. |

> **Atenção:** como a senha é compartilhada e não há confirmação de e-mail, quem sabe a senha consegue entrar digitando o e-mail de outra pessoa. Passe a senha só para quem você confia e troque-a se ela vazar.

---

## 9. App instalável (PWA) e notificações push

### Por que existe a pasta `pwa/`

Página de Apps Script não pode ter manifesto nem service worker, porque o Google serve o HTML dentro de iframes no domínio dele. Por isso o "Adicionar à tela inicial" do link `/exec` cria só um atalho, e o navegador não deixa receber push.

A pasta `pwa/` é uma **casca** publicada num endereço próprio (GitHub Pages, gratuito). Ela tem:

- `manifest.webmanifest`: nome, ícones (inclusive *maskable* para Android), cor, tela cheia (`standalone`) e atalhos para Finanças, Tarefas, Fitness e Rotinas.
- `sw.js`: service worker que guarda a casca para abrir rápido, recebe o push e mostra a notificação.
- `index.html`: abre o Prumo (`/exec`) em tela cheia num iframe, com:
  - splash com a marca;
  - tela de erro com "tentar de novo" e "trocar o link";
  - convite de instalação (Android/desktop) e instrução para iPhone;
  - painel de permissão de notificações.

### Fluxo do push

1. Em **Configurações › Notificações**, dentro do app instalado, toque em **Ativar notificações**.
2. A casca pede a permissão do sistema e cria a inscrição de push com a **chave pública VAPID** do seu script. As chaves são geradas no primeiro uso e guardadas nas propriedades do script.
3. O app registra a inscrição (`push.subscribe`) no nome do usuário (aba `push_inscricoes`) e envia uma notificação de teste.
4. Os gatilhos criam notificações (lembretes, rotinas, eventos, contas, metas). Quando há algo novo para um aparelho, o servidor manda um **push sem conteúdo**, assinado com JWT **ES256**. A assinatura ECDSA P-256 é feita no próprio Apps Script, com BigInt.
5. O service worker acorda, calcula o `pid` (SHA-256 do endpoint) e busca `…/exec?push=<pid>`. O servidor devolve só o que ainda não foi entregue àquele aparelho e mostra a notificação.
6. Tocar na notificação abre o app (ou traz para frente) **na tela certa**.

Inscrições que o serviço de push recusa (404/410) são desativadas sozinhas.

| Plataforma | Instalar | Push com app fechado |
|---|---|---|
| Android (Chrome, Edge, Samsung) | botão "Instalar o Prumo" ou menu › Instalar app | sim |
| iPhone/iPad (iOS 16.4+) | Safari › Compartilhar › Adicionar à Tela de Início | sim, só com o app instalado |
| Computador (Chrome/Edge) | ícone de instalar na barra de endereço | sim |

> O Google sempre mostra a faixa "Este aplicativo foi criado por um usuário do Google Apps Script" em apps de contas pessoais. Ela aparece no topo, também dentro do app instalado, e não pode ser removida.

---

## 9A. WhatsApp (API oficial da Meta)

> **Situação real em 30/10/2026:** a conta de teste criada para o Prumo foi **restringida pela Meta logo após a criação**. Ela recebeu o erro `131031` (*Business Account locked*), com o aviso *"Before you can begin messaging, you will need to verify your business"* e a restrição marcada como **permanente**. A verificação da empresa é gratuita, mas no Brasil exige **Cartão CNPJ, contrato social ou CCMEI**, e não aceita só o CPF. Sem CNPJ/MEI, o WhatsApp oficial **não fica disponível de graça**. Por isso o canal recomendado é o **Telegram** ([9B](#9b-telegram-grátis-recomendado)). O módulo do WhatsApp continua pronto (rota `#/cfg/whatsapp`) para quando houver verificação.

### O que a Meta cobra (regras em vigor desde 01/10/2026)

O resumo abaixo vem da página oficial *Pricing on the WhatsApp Business Platform*:

| Tipo de mensagem | Quando pode ser enviada | Custo |
|---|---|---|
| **Texto livre** (não-template, "mensagem de serviço") | Só dentro da **janela de atendimento de 24 h**, que abre ou renova quando a **pessoa** escreve para o número comercial. | **1.000 grátis por mês por número comercial.** Da 1.001ª em diante, é cobrada. **Sem forma de pagamento na Meta, as que passam da faixa não são entregues (e não são cobradas).** |
| Template de utilidade | A qualquer hora | Grátis dentro da janela, **pago fora dela** |
| Template de marketing ou autenticação | A qualquer hora | **Pago** |
| Mensagem que a pessoa manda para o número | — | Grátis |

O **número de teste** que a Meta cria ao adicionar o WhatsApp a um app:

- manda para até **5 números verificados** (WhatsApp › API Setup › *To*);
- **não exige forma de pagamento**;
- foi feito para desenvolvimento, e a Meta pode mudar as regras dele.

Para usar um número próprio, é preciso um portfólio empresarial e um número que ainda não esteja no WhatsApp.

### Como o Prumo garante custo zero

1. **Nunca envia templates.** O módulo só manda texto livre (`type: "text"`), o tipo que a Meta não cobra até 1.000 por mês.
2. **Só envia com a janela aberta.** A janela é registrada pelo webhook (quando você escreve) ou pelo botão **"Já mandei a mensagem"**. Se a janela estiver fechada, a Meta recusa com o erro `131047`. O Prumo registra a falha, considera a janela fechada e para de tentar.
3. **Limite mensal global**: padrão 900, no máximo 1.000. A folga cobre a diferença de fuso do corte da Meta e as respostas do webhook.
4. **Limite diário por pessoa**: padrão 20.
5. **Vários avisos viram uma mensagem só**, com chave de deduplicação. Rodar o gatilho de novo não reenvia, e a reentrega do webhook pela Meta não duplica respostas.
6. **Desligado por padrão, em camadas:**
   - o dono precisa ligar **"Permitir envios reais"**;
   - cada pessoa precisa ligar o WhatsApp e desligar o **modo de teste (simulação)**, que vem ligado e só registra no histórico;
   - os avisos automáticos exigem uma **autorização explícita** com confirmação.
7. **Token inválido (erro `190`) desliga os envios reais** sozinho, e o motivo aparece no histórico e nos logs. Em uma emergência, a função `whatsappDesligar()` corta tudo.
8. **Recomendação forte:** **não cadastre forma de pagamento** na Meta. Assim, mesmo um erro de configuração não gera cobrança, porque a Meta só deixa de entregar.

> Regras e preços são definidos pela Meta e podem mudar. Confira a página oficial de preços antes de mudar os limites.

### Limitações honestas

- **Você precisa escrever para o Prumo pelo menos uma vez a cada 24 h** (um "oi" ou **hoje**) para receber lembretes. Sem isso, só template, que é pago. Não há como contornar de graça.
- **Webhook pelo Apps Script não é garantido.** O Apps Script responde por redirecionamento 302 (`script.googleusercontent.com`), e algumas plataformas recusam isso na verificação.
  - Se a Meta aceitar: a janela abre sozinha, o histórico mostra entregue/lido e o comando **hoje** responde com o resumo do dia.
  - Se recusar: tudo funciona do mesmo jeito com o botão **"Já mandei a mensagem"**, sem confirmação de entrega.
- **Assinatura do webhook:** o Apps Script não lê cabeçalhos, então não dá para conferir o `X-Hub-Signature-256`. Em troca, a URL leva uma chave secreta (`?wa=…`), e só são aceitos eventos do `phone_number_id` configurado e de números cadastrados no Prumo.
- Sem webhook, o Prumo sabe que a Meta **aceitou** a mensagem, mas não que ela foi **entregue**.

### Configuração passo a passo

1. Em <https://developers.facebook.com>, vá em **Meus apps › Criar app** (tipo Empresa) e adicione o produto **WhatsApp**. A Meta cria a conta de teste, o **número de teste** e um token temporário.
2. Em **WhatsApp › API Setup**:
   - copie o **Phone number ID**;
   - em **To › Manage phone number list**, adicione e verifique o seu WhatsApp (até 5 números).
3. Crie um **token permanente**: em **Configurações do negócio › Usuários › Usuários do sistema**, crie um usuário (Admin), atribua o app e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, com validade **Nunca**. O token temporário da tela de API Setup vence em cerca de 24 h.
4. No Prumo, entre com o **e-mail dono do script** e vá em **Configurações › WhatsApp › Conta da Meta**:
   - cole o *Phone number ID* e o token, e clique em **Salvar**;
   - clique em **Testar conexão**. É só uma leitura, sem custo, e mostra o número do Prumo.
5. Em **Seu WhatsApp**:
   - informe o seu número com DDD e ligue **Usar o WhatsApp**;
   - clique em **Enviar teste**. Em modo de teste aparece "Simulado" no histórico.
6. Para enviar de verdade:
   - toque em **Abrir conversa** e mande "oi" para o número do Prumo;
   - toque em **Já mandei a mensagem**;
   - desligue o **modo de teste** (com confirmação);
   - como dono, ligue **Permitir envios reais**;
   - clique em **Enviar teste**.
7. (Opcional) Para os lembretes automáticos, ligue **Enviar avisos automaticamente** e escolha os tipos.
8. (Opcional) Webhook: em **Conta da Meta › Webhook**, copie a URL e o token de verificação e cole em **WhatsApp › Configuration › Webhook › Edit** na Meta. Depois assine o campo **messages**. Se a Meta recusar a URL, ignore este passo.

### Mensagens de erro mais comuns

| Código da Meta | O que o Prumo mostra | O que fazer |
|---|---|---|
| `131047` | Janela de 24 h fechada | Mande uma mensagem para o número do Prumo. |
| `131030` | Número fora da lista do número de teste | Adicione o número em API Setup › To. |
| `190` | Token venceu ou foi revogado (os envios reais são desligados) | Gere um token de usuário do sistema e salve de novo. |
| `130429` / `131056` | Limite de velocidade da Meta | O Prumo tenta de novo depois. |
| `131026` | Não foi possível entregar | Confira se o número tem WhatsApp e está atualizado. |
| `131031` | Conta do WhatsApp Business bloqueada pela Meta | Verificação da empresa (CNPJ/MEI) ou pedido de revisão. |
| *(sem erro, não chega)* | Celular brasileiro com o 9º dígito | Fora dos DDDs 11–19, 21, 22, 24, 27 e 28, o WhatsApp usa o ID sem o 9. O Prumo já converte. Na lista de destinatários da Meta, cadastre o número **sem o 9**. |
| `10` / `200` | Token sem permissão | Gere de novo com `whatsapp_business_messaging`. |

---

## 9B. Telegram (grátis, recomendado)

A Bot API do Telegram é oficial e **gratuita**:

- não pede CNPJ, cartão nem verificação;
- não tem janela de 24 h: o bot pode avisar a qualquer hora, desde que a pessoa tenha tocado em **Iniciar** uma vez;
- o Apps Script fala com ela só com `UrlFetchApp`.

### Como funciona no Prumo

1. **Bot (dono, uma vez):**
   - no Telegram, fale com o **@BotFather**, mande `/newbot`, escolha o nome e um usuário terminado em `bot`, e copie o token (`123456789:AAH…`);
   - cole o token em **Configurações › Telegram › Bot do Telegram**;
   - o Prumo confere com `getMe`, desliga qualquer webhook antigo (`deleteWebhook`) e cria o gatilho de leitura.
2. **Cada pessoa:**
   - toca em **Conectar meu Telegram**. Abre `t.me/<bot>?start=<código>`, com um código de uso único que vale 30 min;
   - toca em **Iniciar** no Telegram e depois em **Verificar** no Prumo;
   - o chat fica ligado ao e-mail dela (`tg.chat_id`) e recebe a confirmação.
3. **Avisos automáticos (opcional):** com autorização explícita, os avisos novos (alarmes, tarefas, rotinas, eventos, contas, faturas, metas) são juntados numa mensagem só (alarmes em até 5 min, demais a cada 15 min), até o **limite diário** (padrão 30).
4. **Resumo do dia às 7h (opcional):** rotinas, tarefas e contas a vencer.
5. **Comandos no Telegram:**
   - `/hoje`: resumo do dia;
   - `/parar`: desliga os avisos automáticos;
   - `/ajuda`.

   As respostas chegam em até 5 min, ou na hora com **Verificar**.

### Comandos: registro único, `/ajuda` e `/funcoes`

Todos os comandos ficam num **registro único** (`Telegram.gs`, `COMANDOS`): o roteador resolve apelidos por ele (`/help` → `/ajuda`, `/comandos` → `/funcoes`, `/gerarquestoes` → `/gerar_questoes`, `/comando@bot`), e a mesma lista gera `/ajuda` (curta), `/funcoes` (completa), o menu "/" do Telegram (`setMyCommands`, só o dono publica) e a tela **Configurações › Comandos do Telegram**.

| Grupo | Comandos |
|---|---|
| Geral | `/start`, `/hoje`, `/parar`, `/ajuda` (`/help`), `/funcoes` (`/comandos`) |
| Estudos | `/estudos`, `/estudos_hoje`, `/concursos`, `/plano`, `/progresso`, `/revisoes`, `/erros`, `/flashcards`, `/questoes`, `/parar_estudos` |
| IA | `/ia`, `/gerar_questoes`, `/resumo_ia`, `/resumir` |
| Arquivos e relatórios | `/materiais`, `/pdf`, `/resumo`, `/relatorio`, `/status`, `/cancelar`, envio de PDF/planilha/foto |

- `/funcoes` responde em HTML (só `<b>`, `<i>` e `<code>`; o resto é escapado), com descrição, apelidos e exemplo de cada comando, dividido em partes quando passa de 4.096 caracteres.
- Chat que não está conectado continua recebendo **só a instrução de conexão**, qualquer que seja o comando.
- `/parar` e `/parar_estudos` não mudaram. Comando desconhecido recebe "Não conheço o comando…" e a lista curta.

### Decisões de projeto

- **Leitura por consulta (`getUpdates`) a cada 5 min, sem webhook.** O Apps Script responde por redirecionamento 302, e isso faz o Telegram reenviar updates. A posição de leitura (`offset`) é salva a cada update, então nada é tratado duas vezes. Uma trava (`LockService`) impede duas leituras ao mesmo tempo.
- **Segurança:**
  - o token fica só nas propriedades do script e é apagado de qualquer mensagem de erro antes do log;
  - quem não conectou recebe só instruções;
  - o link de conexão é de uso único.
- **Falhas:**
  - `403` (bot bloqueado): desliga para aquela pessoa;
  - `401` (token inválido): desliga o bot;
  - `429`: tenta de novo depois.

  O motivo aparece no histórico e nos logs.
- **Mensagens em HTML**, com escape de `& < >` nos textos do usuário.

---

## 9C. Alarmes

Onde ficam: **Tarefas › Mais › Alarmes**, **Alimentação › Mais › Alarmes** ou **Configurações › Alarmes**. Nas tarefas, também direto no editor (campo **Alarme**).

| Repetição | Como funciona | Exemplo |
|---|---|---|
| **Todo dia** | Na hora escolhida, nos dias da semana marcados (nenhum marcado = todos). | Remédio às 08:00, só dias úteis |
| **A cada…** | De uma hora até outra, a cada 30 min a 4 h. | Água das 08:00 às 20:00, a cada 2 h |
| **Uma vez** | Numa data e hora. | Alarme de tarefa |

**Modelos rápidos:** água a cada 2 h, café da manhã, almoço, lanche, jantar e remédio.

### Como toca

- **Com o Prumo aberto** (navegador ou app instalado): na hora exata, em tela cheia, com som e vibração por até 2 minutos. Botões:
  - **Bebi 250 ml** (alarme de água): registra a água;
  - **Concluir tarefa** (alarme de tarefa);
  - **Adiar 10 min**;
  - **Parar**.

  O navegador só libera som depois do primeiro toque na página. Se o app foi aberto e nunca tocado, o alarme aparece e vibra, mas pode ficar mudo. O som pode ser desligado em cada alarme ou para todos, na tela de alarmes.
- **Com o app fechado:** o gatilho `triggerFrequente` (a cada 5 min) cria uma notificação do tipo *alarme*, que sai:
  - por **push** no celular, para quem ativou as notificações. No Android, o aviso fica na tela até ser tocado;
  - pelo **Telegram**, para quem ligou os avisos automáticos (o tipo "Alarmes" vem marcado e pode ser desmarcado).

  Atraso máximo nesse caminho: cerca de 5 min. É o menor intervalo de gatilho do Apps Script gratuito.
- **Sem repetição:** quando o alarme toca no app aberto, o app avisa o servidor (`alarm.ack`), e o gatilho não manda push nem Telegram daquele horário.
- **Regras:**
  - alarme de tarefa não toca se a tarefa já foi concluída ou cancelada;
  - alarme de água com "Não tocar depois de bater a meta" para quando o total do dia chega à meta.

**Custo:** zero. Um gatilho de 5 min usa poucos segundos por execução, bem abaixo dos 90 min diários de gatilhos de uma conta pessoal.

---

## 9D. Estudos: leitor de PDF e Telegram

### Leitor e editor de anotações

- **Ferramentas:** ler/selecionar texto, selecionar e mover, marca-texto (por seleção de texto), destaque de área, sublinhado, riscado, caneta, pincel, linha, seta, retângulo, elipse, caixa de texto, comentário e borracha (apaga a marcação tocada inteira). Cor, traço e opacidade. Duplicar, trazer à frente, excluir, desfazer e refazer (Ctrl+Z / Ctrl+Shift+Z).
- **Navegação:** páginas contínuas com renderização sob demanda, zoom (botões e Ctrl+roda), ajustar à largura ou à página, girar a visualização, ir para a página, miniaturas, favoritos, busca no texto, modo leitura, mostrar/ocultar marcações e lista lateral de marcações com filtro por tipo, cor e texto.
- **Do trecho para o estudo:** o texto selecionado ou marcado vira **resumo**, **dúvida**, **flashcard** ou **questão**, já ligado ao material e à página.
- **Coordenadas:** cada marcação é guardada em **pontos do PDF, no espaço da própria página** (inclusive em páginas com rotação), então fica no mesmo lugar com qualquer zoom, tela ou aparelho.
- **Gravação:** primeiro no aparelho (IndexedDB), depois no servidor, em um JSON versionado no seu Drive (`estudos/u-…/anotacoes`). O estado aparece no topo: *salvo neste aparelho*, *aguardando envio*, *salvando*, *salvo*, *falha ao salvar*. Sem conexão, as alterações ficam na fila do aparelho e são enviadas quando a conexão volta ou quando o material é reaberto.
- **Dois aparelhos:** a revisão é controlada por página. Se a mesma página mudou em outro lugar, nada é sobrescrito: o app pergunta se você quer **juntar**, manter as suas ou usar as do outro aparelho.
- **Posição de leitura:** guarda a página e o zoom. Passar por uma página **não** a marca como lida; no encerramento da sessão você informa as páginas estudadas (o app mostra as visitadas como referência).
- **Cópia anotada:** o app desenha as marcações sobre o original (pdf-lib), acrescenta páginas com os comentários e favoritos, guarda em `exportacoes` no Drive e registra **a revisão exata** das anotações. Se nada mudou, a cópia existente é reaproveitada. Com a preferência ligada, isso acontece sozinho ao fechar o leitor, para o Telegram poder enviar a versão atual com o app fechado.
- **Um arquivo por material, sem duplicar:** as anotações ficam num único JSON por material (cada gravação atualiza o conteúdo) e a cópia anotada é **um único PDF por material** (`M2_Título_anotado.pdf`): a revisão nova substitui o conteúdo do mesmo arquivo no Drive (upload retomável da API v3 sobre o arquivo existente) e atualiza a mesma linha de `est_exportacoes` e `arquivos` (revisão, hash, tamanho). Conteúdo idêntico (mesmo hash) não é enviado de novo. Arquivo novo só em: material novo, nova versão do original e outros tipos de exportação. O backup semanal copia cada revisão do JSON uma vez só.
- **Limpar duplicados antigos:** *Estudos › Preferências › Procurar duplicados* lista as cópias anotadas antigas do mesmo material (fica a da revisão mais nova) e arquivos de conteúdo igual que nada usa, com o espaço a liberar; manda para a lixeira (do Drive, 30 dias, e do app) com confirmação e **desfazer**. Original de material e cópia atual nunca entram na lista. `sys.diagnostics` mostra duplicados, registros sem uso e arquivos nas pastas de Estudos que o app não conhece.

### Imprimir e baixar

No leitor (menu ⋯ › *Imprimir ou baixar*) e na Biblioteca (menu do material): **original** ou **com as marcações** (desenhada na hora com a revisão atual, nunca uma cópia antiga; o nome do arquivo leva `_anotado_revN`), **todas as páginas** ou um **intervalo** (`3-7, 10`). *Imprimir* usa um iframe oculto com `print()`; se o navegador bloquear, o PDF abre numa aba (ou é baixado) para imprimir de lá.

### Pastas no Drive e categorias

Arquivos da biblioteca ficam em `Prumo/<usuário>/<Tipo>/<Concurso>/<AAAA-MM-DD>/<Categoria>/arquivo` (Tipo: PDFs, Planilhas, Imagens, Outros; sem concurso: `Geral`). A **categoria** (Questões, Revisões, Teoria, Flashcards, Outros) é obrigatória no envio, junto com o concurso; mudar a categoria ou o concurso move o arquivo. *Reorganizar biblioteca* mostra a prévia e move os antigos; dá para editar em lote. Pelo Telegram, o bot pergunta a categoria (lista numerada, 30 min; sem resposta, fica em Outros). Planilha em Questões ou Flashcards: o app oferece importar.

### Um arquivo por material (sem duplicar)

As anotações ficam num JSON por material e a **cópia anotada** é uma só por material: a revisão nova substitui o conteúdo do mesmo arquivo no Drive (upload de atualização da API v3); conteúdo igual (mesmo hash) não é reenviado. *Preferências › Procurar duplicados* lista cópias antigas e arquivos repetidos (nunca o original nem a cópia atual), manda para a lixeira com desfazer, e o diagnóstico mostra duplicados e órfãos.

### Comandos de Estudos no Telegram

Usa o mesmo bot e a mesma conexão da seção 9B. O destinatário é sempre o chat ligado ao seu e-mail no servidor.

| Comando | O que faz |
|---|---|
| `/estudos` | Menu de Estudos. |
| `/estudos_hoje` | Atividades e revisões de hoje. |
| `/concursos` | Escolhe o concurso do contexto. |
| `/plano` · `/plano semana` | Plano do dia ou da semana. |
| `/progresso` | Indicadores dos últimos 7 dias (com denominadores). |
| `/revisoes` | Revisões pendentes. |
| `/materiais termo` | Busca na biblioteca. |
| `/pdf M12` · `/pdf M12 anotado` | Envia o original ou a cópia anotada. |
| `/resumo crase` | Suas anotações salvas sobre o assunto. |
| `/resumir M12 10-20` | Resumo novo: pela IA, se configurada (rascunho identificado); senão, compilação das suas marcações. |
| `/relatorio semana` · `/relatorio mes pdf` | Relatório em texto ou PDF. |
| `/erros termo` · `/flashcards termo` | Caderno de erros e cartões. |
| `/questoes termo` | Série de até 5 questões do banco: responda com a letra; o placar sai no fim. |
| `/ia pergunta` | Pergunta ao assistente (modelo padrão). |
| `/gerar_questoes tema 5` | A IA cria questões (até 10), guarda no banco como "geradas por IA, a revisar" e começa a série. |
| `/resumo_ia tema` | Resumo pela IA a partir das suas anotações e PDFs sobre o tema; vira anotação (rascunho). |
| `/status J3` · `/cancelar J3` | Situação ou cancelamento de um pedido da fila. |
| Lista completa | **Configurações › Comandos do Telegram** mostra todos os comandos com descrição e exemplo (com busca), as respostas aceitas no meio da conversa, as frases em português e o envio de arquivos. O dono pode publicar a lista no menu "/" do Telegram. Um teste manda cada exemplo ao bot e confere que ele é tratado. |
| `/parar_estudos` | Desliga só os avisos de Estudos (o `/parar` geral continua desligando todos os avisos automáticos). |

Também entende frases como "me envie o PDF de Português" ou "quero meu relatório da semana". Quando há mais de uma opção, o bot lista números e guarda a escolha por 30 minutos. **Enviar um PDF, planilha ou foto** ao bot guarda o arquivo na biblioteca.

### Decisões e limites

- **Fila de trabalhos:** cada pedido vira um trabalho com código (J1, J2…) e estados *na fila → processando → pronto → enviando → enviado*, ou *falhou*, *entrega incerta*, *cancelado*. O processamento roda no gatilho `triggerFrequente` (5 min); não é tempo real. Reenvios usam o `file_id` do Telegram quando o mesmo arquivo já foi enviado.
- **Cópia anotada pelo Telegram:** o Apps Script não desenha PDF; a cópia é gerada pelo app. Se a cópia guardada é de uma revisão antiga, o bot **diz que é antiga** (revisão X, atual Y) e oferece o original; nunca a apresenta como atual.
- **Tamanho:** o bot envia até 50 MB por arquivo e só consegue **baixar** arquivos de até 20 MB enviados a ele (limite da Bot API). Arquivos maiores: pelo app (até 50 MB).
- **"Enviado" não é "lido":** o Telegram confirma que aceitou a mensagem, não que você leu.
- **Avisos de Estudos:** horário, dias, silêncio, tipos (plano, revisões, prazos, metas), limite diário próprio e resumo diário ou semanal (com PDF opcional no domingo). Desligados por padrão.
- **Arquivos privados:** ficam no seu Drive sem link público; quem envia é o servidor.
- **IA (opcional, desligada por padrão):** ver [9E](#9e-estudos-assistente-de-ia). Pelo Telegram, as respostas da IA também entram na fila (até 5 minutos).

### Limitações honestas

- O login com senha compartilhada + e-mail digitado **não é** autenticação forte para várias pessoas: serve para uso pessoal/familiar. Os dados são separados por e-mail no servidor, mas quem souber a senha e o e-mail de outra pessoa entra como ela.
- PDF digitalizado (só imagem) não tem camada de texto: marca-texto por seleção, busca e resumo pela IA não funcionam nele; use **destaque de área**.
- PDF protegido por senha/permissões abre para leitura (se o PDF.js conseguir), mas a cópia anotada não é gerada.
- A borracha apaga a marcação inteira, não um pedaço do traço.
- Grupos de estudo e uso offline completo **não** foram implementados.

## 9E. Estudos: assistente de IA

### Provedores e modelos

Em **Estudos › Mais › Assistente de IA › Provedores** (ou Preferências), o dono do app cadastra um ou mais provedores. O formulário tem:

| Campo | Para que serve |
|---|---|
| **Nome de exibição** | Como o provedor aparece na escolha do modelo. |
| **URL base** | Ex.: `https://api.groq.com/openai/v1` (sem `/chat/completions`). Só `https://`. |
| **Formato da API** | Compatível com OpenAI (`/chat/completions`) ou Anthropic (`/messages`). |
| **Chave da API** | Opcional (deixe vazio se a autenticação for por cabeçalho). Fica só nas propriedades do script; o navegador vê `••••` + 4 últimos caracteres. Editar sem redigitar mantém a chave. |
| **Modelos** | Linhas *id do modelo* + *nome de exibição*, com **+ Adicionar modelo**, lixeira e **Buscar modelos** (lista o `/models` do provedor, antes mesmo de salvar). |
| **Cabeçalhos (opcional)** | Linhas *Header-Name* + *valor* (ex.: `HTTP-Referer` e `X-Title` do OpenRouter). Nomes com auth, key, token ou secret são tratados como segredo. |
| **Testar** | Manda "Responda apenas: OK" ao primeiro modelo e mostra o tempo de resposta (não conta no limite). |

Também ficam aí o **modelo padrão** (usado pelo Telegram), o **limite diário por pessoa** e **Desligar o assistente** (apaga provedores e chaves). Cada pessoa escolhe **provedor · modelo** no topo da tela do assistente; a escolha fica lembrada no aparelho.

**Modelos prontos** (um clique preenche nome, URL e modelos; você só cola a chave):

| Provedor | URL base | Modelos sugeridos | Observação |
|---|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-flash-latest`, `gemini-flash-lite-latest` | Chave grátis no Google AI Studio, sem cartão. |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Chave grátis, sem cartão. |
| OpenRouter | `https://openrouter.ai/api/v1` | `openrouter/free` e modelos `:free` | Sem créditos: cerca de 50 pedidos por dia. |
| Cerebras | `https://api.cerebras.ai/v1` | `gpt-oss-120b` | Chave grátis. |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` | Plano "Experiment" (verificação por telefone). |
| Pollinations | `https://gen.pollinations.ai/v1` | `openai` (confira com Buscar modelos) | Precisa de chave. |
| Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-5-5` | Pago por uso. |

**Sem chave não há IA gratuita confiável:** todos pedem uma chave criada por você. Limites e nomes de modelos mudam; use **Buscar modelos** e **Testar**. Erros 401/403 (chave), 402 (sem créditos), 404 (modelo/URL) e 429 (limite gratuito) aparecem com mensagem clara. Modelos que exigem `max_completion_tokens` ou não aceitam `temperature` são tratados automaticamente; blocos `<think>` de raciocínio são removidos.

### Tela do assistente

- **Conversar:** perguntas livres com histórico da conversa. Cada resposta pode virar **anotação** (rascunho da IA), ir para o **Telegram** ou ser copiada.
- **Resumo:** tema, disciplina/assunto e instruções → resumo estruturado em Markdown.
- **Questões:** quantidade (até 20), múltipla escolha ou certo/errado, dificuldade, estilo da banca, concurso e área. As questões chegam como rascunho editável; **Incluir no banco** grava com gabarito **preliminar**, etiqueta `ia` e "a revisar". Depois: **Treinar agora** ou **Treinar no Telegram**.
- **Flashcards:** rascunhos editáveis → baralho "IA".
- **Fontes:** material da biblioteca (com páginas), **arquivo enviado do computador** (vai para a biblioteca), **arquivo do Drive por link** (só o dono: o app roda com a conta dele), anotações, questões do banco (ex.: só as que errei), edital verticalizado e **meus dados** (horas, precisão, erros, revisões e cobertura dos últimos 7/30/90 dias, lidos da planilha). PDF com texto extraído usa o texto por página; planilhas XLSX/CSV, Google Docs/Planilhas e **imagens/PDFs digitalizados** são lidos no servidor (imagens e PDFs sem texto passam pela conversão/OCR do Drive, que precisa do serviço avançado "Drive API" ativo). O texto extraído fica 6 h em cache.

### Resumos de PDF em blocos

*Resumir com IA* (leitor, Biblioteca): **Objetivo**, **Direcionado** (com foco) ou **Detalhado**, páginas e modelo. Antes, o app garante o texto das páginas (camada do PDF ou OCR). O servidor divide em blocos contínuos de até 20 mil caracteres ou 30 páginas e cria o pedido na fila `est_jobs` (`ia_resumo`); o app avança um bloco por vez (`est.aiResumoStep`) com progresso e **Cancelar** (`est.aiResumoCancel`), e quem fecha a tela deixa o resto para o gatilho de 5 minutos. Com mais de um bloco, uma chamada final junta os parciais. Antes de começar, o app avisa quantas chamadas usa e recusa se passar do limite diário. O resultado é uma anotação `resumo` em rascunho com o rótulo "Gerado por IA · provedor · modelo · confira"; regenerar grava nova versão na mesma nota.

### Discursivas

*Revisar e corrigir* devolve a saída estruturada a–e, registrada como avaliação **"Sugestão de IA"** na versão atual (a nota por critério é limitada ao máximo da prova; trechos que não existem no texto são marcados e não podem ser aplicados). Só os trechos que você marcar viram uma **nova versão** do texto. *Temas* e *texto de exemplo* proíbem estatísticas, leis e citações inventadas (o modelo escreve `[dado a conferir]`).

### Proteções

- O conteúdo das fontes vai à IA **delimitado como dado**; instruções escondidas no material são ignoradas pelo pedido do sistema.
- A planilha do próprio Prumo **não** pode ser enviada inteira; use as fontes "Meus dados", "Questões" e "Edital", que mandam só o resumo necessário.
- Tudo que a IA gera aparece marcado "Gerado por IA · provedor · modelo · confira". Gabarito sugerido pela IA nunca vira definitivo sozinho; na **Resposta por IA** a questão vai **sem o gabarito** e o resultado é comparado depois.
- Limite diário por pessoa (padrão 40 usos). O que você envia vai para o provedor escolhido, sujeito à política dele: não mande dados que não quer compartilhar.

---

## 9F. Estudos: OCR de PDF digitalizado

Página sem camada de texto (menos de 40 letras) passa pelo OCR **só quando precisa**: no leitor, a página aberta primeiro e as demais em segundo plano, com progresso e **Cancelar**; na leitura de edital e no PDF de questões, com confirmação. O resultado (texto, motor, confiança e **posição de cada palavra**) fica no JSON de texto do material (`est.textSave`, `texto_json_id`) e **nunca é refeito**: ao reabrir, a camada vem do que foi guardado, e outro material com o mesmo arquivo (hash) reaproveita o mesmo OCR. O texto melhorado alimenta a busca do leitor, a IA, a busca do Telegram, a leitura do edital e `est.textGet`. As palavras viram uma **camada de texto invisível** sobre a página (selecionar, buscar, marca-texto).

**Pipeline:** página renderizada em 200 dpi → tons de cinza → contraste esticado entre os percentis 1 e 99 → correção de inclinação pelo perfil de projeção **só a partir de 3°** → Tesseract.js 7.0.0 com o idioma `por` (modelo `4.0.0_best_int`, carregado do jsDelivr, worker em blob) → pós-processamento conservador (ligaduras, hifenização no fim da linha entre minúsculas, espaços, cabeçalho e rodapé repetidos na leitura do edital). **Sem correção por dicionário.** Alternativa: OCR do **Google Drive** no servidor (`est.ocrPage`, só texto, até 300 páginas por dia por pessoa), escolhida em *Preferências de Estudos*; o menu do leitor tem *Comparar OCR: aparelho × Google Drive* na página aberta.

**Medição** (`harness/bench_ocr.js`, Node, CPU do ambiente de testes, uma página por amostra). Referência: a camada de texto original da mesma página (pdftotext), conferida por amostragem. "Palavras faltando" compara o conjunto de palavras (não depende da ordem); o WER depende da ordem de leitura e fica alto em páginas de duas colunas mesmo com o texto nativo, porque a referência e o OCR leem as colunas em ordens diferentes.

| Amostra | Precisa de OCR | Antes: tempo | Antes: WER | Antes: palavras faltando | Depois: tempo | Depois: WER | Depois: palavras faltando | Inclinação achada / corrigida |
|---|---|---|---|---|---|---|---|---|
| texto nativo (caderno BB p. 9, duas colunas) | não | 0,2 s | 21,1% | 1,9% | 0,2 s | 21,1% | 1,9% | — |
| escaneado nítido 200 dpi (caderno BB p. 9) | sim | 7,4 s | 79,9% | 9,5% | 13,5 s | 80,8% | 4,3% | 0° / não |
| escaneado nítido 200 dpi (caderno BB p. 146) | sim | 8,4 s | 84,0% | 10,5% | 15,0 s | 81,6% | 5,5% | 0° / não |
| escaneado nítido 200 dpi (edital BB 2022 p. 33) | sim | 5,6 s | 1,3% | 1,1% | 10,9 s | 1,0% | 1,0% | 0° / não |
| escaneado ruim 120 dpi, 1,8° torto, ruído, JPEG 30 (caderno p. 9) | sim | 7,6 s | 80,7% | 24,6% | 11,0 s | 79,8% | 17,7% | 1,6° / não |
| escaneado ruim 120 dpi, 1,8° torto, ruído, JPEG 30 (edital p. 33) | sim | 5,2 s | 13,1% | 11,5% | 9,7 s | 4,4% | 4,2% | 1,8° / não |
| escaneado 150 dpi, 4° torto, JPEG 60 (edital p. 33) | sim | 5,7 s | 5,2% | 4,8% | 11,5 s | 1,0% | 1,0% | 4° / sim |

Decisões tiradas desses números: **200 dpi** (250 e 300 dpi pioraram ou empataram e demoraram mais); **inclinação corrigida só a partir de 3°** (abaixo disso o próprio Tesseract corrige, e girar a imagem piorou o escaneado ruim de duas colunas de 16,7% para 22% de palavras faltando); contraste ligado (neutro no nítido, ajuda no edital ruim). O OCR do Google Drive **não pôde ser medido** aqui (os serviços do Google não rodam no ambiente de testes); por isso ele fica como alternativa e o app tem a comparação na própria página.

## 10. Instalação passo a passo

### 10.1 Apps Script

1. Crie (ou use) a planilha e o projeto do Apps Script e uma pasta no Drive. Coloque os IDs em `CONFIG` (`SHEET_ID`, `SCRIPT_ID`, `DRIVE_FOLDER_ID`).
2. No editor do Apps Script, em **Configurações do projeto**, marque "Mostrar arquivo de manifesto appsscript.json".
3. Cole os 3 arquivos de `dist3/`:
   - `appsscript.json` no arquivo de mesmo nome;
   - `Codigo.gs` num arquivo de script chamado `Codigo`;
   - `Index.html` num arquivo HTML chamado **`Index`**, exatamente assim.
4. Salve, escolha a função **`setup`** e clique em **Executar**. Autorize os acessos (planilha, Drive, documentos, e-mail, Agenda, serviços externos). O `setup` cria e formata as abas, cria as pastas, carrega os dados de referência e instala os gatilhos.
5. Clique em **Implantar › Nova implantação › App da Web**, com **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**. Copie a URL que termina em `/exec`.
6. Para atualizar depois: cole os arquivos novos, rode `setup` de novo (é seguro) e vá em **Implantar › Gerenciar implantações** › lápis › **Nova versão**. A URL não muda.

### 10.2 App instalável (GitHub Pages)

1. Em `pwa/config.js`, coloque a URL `/exec` em `EXEC_URL`.
2. Suba a pasta `pwa/` para um repositório do GitHub, por exemplo `prumo`.
3. No repositório, vá em **Settings › Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve. Em 1 ou 2 minutos fica no ar em `https://<seu-usuario>.github.io/prumo/`.
4. Em `CONFIG.PWA_URL` (Config.gs), coloque esse endereço. O app mostra o link em Configurações › Notificações.
5. No celular, abra o endereço, instale e ative as notificações em **Configurações › Notificações**.

Se a URL do Web App mudar (nova implantação em vez de nova versão), a casca mostra "Trocar o link" para colar a nova. Ela também guarda sozinha a URL que o app informa.

### 10.3 Dados de exemplo (opcional)

Rode `seedDemo()` no editor ou use **Configurações › Dados e backup › Carregar exemplo**. São cerca de 1.700 registros com ids `demo-…`. Para remover, use `clearDemoData()`; os seus dados ficam intactos.

---

## 11. Configuração

Tudo em `CONFIG` (Config.gs):

| Chave | Para que serve |
|---|---|
| `SHEET_ID`, `SCRIPT_ID`, `DRIVE_FOLDER_ID` | Recursos do Google usados pelo app. |
| `TIMEZONE` | Fuso (padrão `America/Sao_Paulo`). |
| `PWA_URL` | Endereço do app instalável (GitHub Pages). |
| *(propriedades do script)* `TG_TOKEN`, `TG_BOT_USERNAME`, `TG_ATIVO`, `TG_OFFSET` | Telegram: configurados pela tela, nunca no código. |
| *(propriedades do script)* `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERSAO`, `WA_LIMITE_MES`, `WA_ATIVO` | WhatsApp: configurados pela tela, **nunca no código**. O padrão da versão é `v26.0` e o do limite é 900/mês. |
| `LOGIN.SENHA_SHA256`, `LOGIN.SALT` | Hash da senha padrão. Para trocar a senha, use `definirSenha()`. |
| `LOGIN.SESSAO_DIAS` | Validade do login (30 dias). |
| `LOGIN.MAX_TENTATIVAS`, `LOGIN.BLOQUEIO_MIN` | Bloqueio por senha errada (5 tentativas, 15 min). |
| `UPLOAD.MAX_BYTES`, `UPLOAD.MIME` | Tamanho (10 MB) e tipos de arquivo aceitos. |
| `CACHE_TTL_S`, `CACHE_CHUNK` | Cache do servidor. |
| `LOCK_WAIT_MS` | Espera pela trava de gravação. |
| `LOG_RETENTION_DAYS` | Dias de log guardados (90). |
| `BACKUP_KEEP` | Backups semanais mantidos (8). |
| `RECURRING_HORIZON_DAYS` | Quantos dias à frente as recorrências são geradas. |
| `DIGEST_HOUR` | Hora do resumo diário (7). |
| `BOOT_WINDOW` | Janela de dados carregada no início para as tabelas grandes. |
| `CLIENT_WRITABLE` | Tabelas que a rota genérica `db.save` pode gravar. |

As preferências de cada usuário (metas diárias, notificações, PIN, tema) ficam na aba `configuracoes` e são editadas pelo app.

---

## 12. Funções para rodar no editor

| Função | O que faz |
|---|---|
| `setup()` | Instala ou atualiza: abas, formatos, validações, pastas, dados de referência e gatilhos. Pode rodar quantas vezes quiser. |
| `setupTriggers()` | Recria os 3 gatilhos. |
| `seedDemo()` / `clearDemoData()` | Carrega ou remove os dados de demonstração. |
| `backupNow()` | Faz a cópia da planilha agora. |
| `definirSenha('nova')` | Troca a senha de acesso (mínimo de 6 caracteres). |
| `encerrarSessoes()` | Desconecta todos os aparelhos. |
| `chavePush()` | Mostra (ou gera) a chave pública VAPID. |
| `telegramStatus()` | Situação do bot do Telegram (sem mostrar o token). |
| `triggerTelegram()` ou `triggerFrequente()` | Lê as mensagens novas do bot na hora (o segundo também confere os alarmes). |
| `whatsappStatus()` | Situação da integração com o WhatsApp (sem mostrar o token). |
| `whatsappDesligar()` | Corta todos os envios pelo WhatsApp na hora. |
| `triggerDaily()`, `triggerReminders()`, `triggerWeekly()` | Rodam a rotina do gatilho na hora, para testar. |
| `Calc.selfTest()` | Confere as fórmulas com casos conhecidos. |

---

## 13. Cálculos e fórmulas

As fórmulas ficam em `Calc.gs` (servidor), com uma cópia idêntica em `js_calc` (cliente).

| Cálculo | Fórmula |
|---|---|
| TMB (Mifflin-St Jeor) | 10·peso + 6,25·altura − 5·idade + 5 (homens) ou − 161 (mulheres) |
| TMB (Katch-McArdle) | 370 + 21,6 · massa magra |
| Gasto diário (TDEE) | TMB × fator de atividade (1,2 · 1,375 · 1,55 · 1,725 · 1,9) |
| Meta calórica | TDEE + ritmo(kg/sem) × 7.700 / 7, com alertas abaixo da TMB e mínimos de segurança |
| Macros | proteína = g/kg × peso; gordura = máx(% das kcal, 0,8 g/kg); carboidrato = o restante |
| Água | 35 ml/kg + 12 ml por minuto de treino |
| IMC e faixa saudável | peso / altura²; faixa = 18,5 a 24,9 × altura² |
| % de gordura (Marinha) | fórmulas log10 de cintura, pescoço (e quadril para mulheres) e altura |
| 1RM | Epley: carga × (1 + reps/30); Brzycki: carga × 36 / (37 − reps) |
| Gasto do exercício | MET × peso × horas |
| FC máxima e zonas | 208 − 0,7 × idade; zonas de 50% a 100% |
| TDEE adaptativo | média móvel exponencial do peso + regressão linear contra as calorias consumidas |
| Fatura do cartão | a compra feita no dia do fechamento ou depois entra na fatura seguinte; vencimento no mês de fechamento ou no seguinte |
| Progresso de meta | (atual − inicial) / (alvo − inicial), de 0% a 100%. Funciona para aumentar e para reduzir. |
| Ritmo da meta | progresso esperado pela data contra o progresso real → no ritmo / pede atenção / atrasada |

---

## 14. Design

- **Paleta:** `#1A1A1A` · `#3A3A3A` · `#F2B705` (dourado da marca) · `#F6D365` · `#FFF3D6`, mais cores de apoio discretas para sucesso, erro e informação.
- **Tema escuro** (padrão): fundo `#1A1A1A`, texto creme.
- **Tema claro:** fundo e superfícies **brancos**, neutros em cinza e dourado só nos destaques. O dourado do texto foi escurecido (`#8F6A00`) para ter contraste ≥ 4,5:1.
- **Tipografia:** Plus Jakarta Sans (400 a 800), números tabulares nos valores.
- **Marca:** um "P" cuja haste termina na ponta de um prumo, pendurado no fio e apontando para a marca no chão. As versões estão em `logo/` e `pwa/icons/`.
- **Componentes:** cartões de 20 px de raio, painéis inferiores no celular e laterais no computador, toasts com ação, anel de progresso, gráficos com as cores do tema.

---

**Design compacto (1.9.0):** texto de 13 px, títulos de página com 22 px, cartões com raio de 12 px e respiro de 14–16 px, listas com 48 px de altura, grade com espaço de 12 px (16 px no computador). Tema claro com **fundo cinza e cartões brancos**; a cor fica para estado (selecionado, sucesso, erro, aviso). No celular, botões, chips, abas e campos têm pelo menos **44 px** de altura. Contraste mínimo de 4,5:1 nos dois temas (conferido por teste). Capturas antes/depois em 390 e 1.280 px: `docs/design/`.

## 15. Limites do Google

Valores para contas Google pessoais (gratuitas):

| Recurso | Limite aproximado | Impacto no Prumo |
|---|---|---|
| Tempo por execução | 6 min | Requisições levam de 0,3 a 3 s. Os gatilhos têm orçamento de 4,5 min. |
| Gatilhos (tempo total por dia) | 90 min | Lembretes a cada 15 min e alarmes/Telegram a cada 5 min ficam bem abaixo. Sem alarme ativo, o gatilho de 5 min só faz uma leitura rápida. |
| E-mails por dia | 100 destinatários | Lembretes e resumo. Desligue o e-mail se usar só o push. |
| Telegram | Cerca de 30 mensagens/s por bot, sem custo | Sem impacto. O Prumo limita a 30 por pessoa por dia (ajustável). |
| WhatsApp (Meta) | 1.000 textos grátis/mês por número | O Prumo limita a 900. Sem cartão na Meta, o excedente não é entregue nem cobrado. |
| UrlFetch por dia | 20.000 | Push e Open Food Facts. |
| Células por planilha | 10 milhões | Anos de uso pessoal. |
| Propriedades do script | 500 KB | Sessões e chaves (poucos KB). |

---

## 16. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Um módulo some do menu | Erro de sintaxe no script daquele módulo. O app registra o erro na aba `logs` (módulo `cliente`) com linha e coluna. | Cole de novo o `Index.html` da versão atual. Use sempre o `dist3/`, que já protege os scripts contra o pré-processamento do Google. |
| "Sua sessão terminou" | Token vencido (30 dias), senha trocada com `encerrarSessoes()` ou outro aparelho saiu. | Entre de novo. |
| "Muitas tentativas" | 5 senhas erradas. | Aguarde 15 minutos. |
| "A aba X não existe" | Faltou o `setup()` depois de atualizar. | Rode `setup()`. |
| App instalado não abre o Prumo | URL `/exec` errada ou implantação nova. | Toque em "Trocar o link" e cole a URL atual. |
| Não aparece "Ativar notificações" | O app foi aberto pelo link do Google, não pelo app instalado. | Abra pelo app instalado (endereço do GitHub Pages). |
| "Notificações bloqueadas" | A permissão foi negada no sistema. | Libere nas configurações do celular (Apps › Prumo/Chrome › Notificações). |
| Push não chega no iPhone | O app não está instalado pela Tela de Início ou o iOS é anterior ao 16.4. | Instale pelo Safari e ative de novo. |
| Push atrasado | Os avisos rodam a cada 15 min; os alarmes, a cada 5 min. | É o esperado. Com o app aberto, o alarme toca na hora exata. |
| Alarme sem som | O navegador bloqueia som até o primeiro toque na página, ou o som está desligado no alarme. | Toque em qualquer lugar do app depois de abrir. Confira "Tocar som" no alarme e "Som nos alarmes" na tela de alarmes. |
| Alarme não chega com o app fechado | Push não ativado neste aparelho, Telegram sem avisos automáticos ou gatilhos antigos. | Ative em Configurações › Notificações e rode `setup()` (ou `setupTriggers()`) para criar o `triggerFrequente`. |
| Agenda do Google não sincroniza | Só a conta dona pode usar. | Entre com o e-mail dono do script. |
| Telegram não conecta | O /start ainda não foi lido, ou o link venceu (30 min). | Toque em **Verificar**. Se não resolver, gere outro link em **Conectar meu Telegram**. |
| Telegram parou de receber | Bot bloqueado no Telegram (403) ou token trocado (401). | Desbloqueie o bot e conecte de novo. Se o token mudou, salve o novo. |
| WhatsApp não chega | Modo de teste ligado, janela fechada, envios reais desligados pelo dono ou número fora da lista do número de teste. | Veja o histórico em Configurações › WhatsApp: cada tentativa mostra o motivo. |

---

## 17. Testes

A pasta de testes (fora do pacote) simula os serviços do Apps Script em Node (planilha, Drive, cache, propriedades, e-mail, UrlFetch) e roda a interface no Chromium (Playwright):

- **Servidor:** fluxos de todos os módulos, parcelas e faturas, recorrências, importação sem duplicar, OCR, backup e restauração, demonstração e limpeza.
- **Login:** senha certa e errada, bloqueio, isolamento entre usuários, rotas do dono, saída, troca de senha, sessão vencida.
- **Push:** a chave pública conferida pelo OpenSSL, 20 de 20 assinaturas ES256 válidas, JWT VAPID, inscrição, envio, entrega única por aparelho e desativação no 410.
- **Interface:** todas as telas no celular (390 px) e no computador sem erro de JS, nenhuma rolagem horizontal em 360 px, navegação pelo painel de módulos e pelo menu "Mais", registro de progresso de meta e marcos, PIN, tema claro branco.
- **Alarmes:** 29 verificações com relógio simulado (toca na hora, não repete, dia seguinte, dias da semana, "uma vez", desligado, meta de água batida, tarefa concluída, intervalo, `alarm.ack` evita push repetido, Telegram com o tipo "alarme", aba criada sozinha), além da interface no celular e no computador: tela cheia, "Bebi 250 ml", adiar, chave liga/desliga, alarme da tarefa (criar, mostrar, remover) e meta de água.
- **Filtros:** 23 telas no celular e no computador, todos os modos de período, chips e busca sem erro, nenhuma rolagem horizontal em 360 px, contagem da lista igual ao filtro, intervalo de datas e busca sem perder o foco.
- **Telegram:** 27 verificações com a Bot API simulada (token conferido e nunca exposto, link de uso único, leitura idempotente por offset, comandos, junção e deduplicação de avisos, resumo diário sem repetir, limite diário, erros 401/403) e tela no celular e no computador.
- **WhatsApp:** 39 verificações com a API da Meta simulada: simulação, credenciais nunca expostas (navegador, planilha, logs), só texto livre e nunca template, endpoint oficial, janela de 24 h, deduplicação, limites diário e mensal, erros 131047 e 190, webhook (challenge, chave secreta, 9º dígito, reentrega, status lido) e tela de configuração no celular e no computador.
- **Estudos (servidor):** 108 verificações: migração aditiva sem duplicar, carga sob demanda, edital com prévia e versões, sessões (uma aberta por vez, tempo líquido, edição com motivo, Foco sem contar duas vezes), questões (validação, versões, gabarito com histórico e recálculo mantendo o original, exclusão e desfazer), tentativas idempotentes, simulados (gabarito congelado, regras do usuário, mínimos, divisão por zero → sem dados), revisões, SM-2, importação com erros por linha, plano, envio em blocos com hash, anotações com conflito por página e `op_id`, exportação com revisão exata, isolamento entre usuários.
- **Estudos no Telegram:** 54 verificações: vínculo pelo servidor (chat não ligado só recebe instruções), comandos, contexto de 30 min, fila de trabalhos e estados, `sendDocument` e reaproveitamento do `file_id`, cópia antiga avisada como antiga, arquivos recebidos (limite de 20 MB), avisos com limite próprio, `/parar_estudos` × `/parar`, token nunca no log.
- **Estudos — IA (servidor):** 44 verificações: provedores com nome, URL, chave, modelos e cabeçalhos; chave e cabeçalho secreto nunca voltam ao navegador; editar sem redigitar mantém os segredos; só o dono configura; `https://` obrigatório; Buscar modelos e Testar antes de salvar sem gravar nada; formato OpenAI (Bearer, cabeçalhos, nova tentativa com `max_completion_tokens`, `<think>` removido) e Anthropic (`x-api-key`, `system`); modelo escolhido na hora; fontes (anotação, edital, dados da planilha, questões erradas, CSV e imagem do Drive com OCR; link do Drive só para o dono; planilha do app bloqueada); questões geradas em JSON (com cerca de código, inválida descartada, C/E normalizado) e incluídas como preliminares a revisar; resposta por IA sem ver o gabarito; comentário; limite diário; exclusão e restauração em lote; importação por concurso (nome inexistente vira erro) e área; simulado por área e "só as que errei"; Telegram `/ia`, `/gerar_questoes` (série com placar) e série enviada pelo app.
- **PDF de questões:** 37 verificações no Node com o caderno real (contagens por disciplina, gabarito, texto de apoio, alternativas em várias linhas e em imagem, números impressos errados, títulos no meio da questão, o pacote gerado lendo igual ao código-fonte) e PDFs sintéticos ("Questão 1" com (A)…(E) e "Gabarito: B", A–D, anulada, CEBRASPE certo/errado com texto para os itens, "Ano: … Banca: …"), além da importação no servidor (texto de apoio, imagem, material, página, reimportar sem duplicar). Interface (computador): leitura com progresso, resumo, avisos, conferência com a página do PDF, XLSX baixado e conferido, importação de 1.198 questões com 42 imagens recortadas e o treino mostrando texto de apoio, imagem e "Abrir no PDF".
- **Comandos do Telegram:** 9 verificações (cada comando e apelido do catálogo é tratado pelo bot, menu "/" só pelo dono, questão com texto de apoio dentro do limite de 4.096 caracteres) e a subtela no celular e no computador.
- **Estudos — IA (interface):** 71 verificações no celular e no computador: formulário do provedor igual ao modelo (nome, URL, chave opcional, modelos e cabeçalhos com adicionar/remover, Buscar modelos, Testar), chave fora da página, escolha do modelo, conversa com a fonte "Meus dados", questões geradas → banco → treino, resposta por IA → comentário, resposta anterior oculta, nova resposta valendo, cartões de assertividade, filtro por concurso e área, selecionar todas e excluir com desfazer, simulado com tempo, gráficos do painel e meta semanal, sem rolagem horizontal e sem erros de JavaScript (também no pacote gerado).
- **Estudos (interface):** 114 verificações no celular e no computador: editor de questão, treino e avaliação, mudança de gabarito com motivo, exclusão e desfazer, lista aleatória, simulado com erro −1, importação XLSX (só linhas válidas), biblioteca sem duplicar, leitor (coordenadas em pontos do PDF, zoom, caneta, desfazer/refazer, marca-texto por seleção → flashcard, comentário, favorito, conflito com "juntar", falha de rede com fila local e reenvio, exportação de 2 páginas + apêndice, reaproveitamento, página com rotação 90), posição de leitura e páginas visitadas sem marcar como lidas, sem rolagem horizontal e sem erros de JavaScript.
- **Leitura do edital:** 38 verificações: PDF real do Banco do Brasil 2022 lido pelo PDF.js (cargos, 8 disciplinas, itens em sequência, subassuntos, páginas 33 a 35, peso e questões do quadro de provas por cargo), o mesmo leitor depois do build, tabela colada (134 linhas), CSV, texto estilo CEBRASPE e FCC, servidor (vírgula decimal, linha repetida) e a tela no celular e no computador (PDF → cargo → conferir → gravar).
- **OCR (bloco 8):** 34 verificações no Node (pós-processamento, cabeçalho repetido, taxa de erro, inclinação achada e corrigida, servidor com texto e coordenadas, reaproveitamento por hash, OCR do Drive com limite, OCR real com Tesseract.js `por` numa página escaneada a 4° com menos de 3% de erro, leitores de edital e de questões) e 20 na interface (página aberta primeiro, fila em segundo plano, Cancelar, camada de texto invisível, busca, reabrir sem refazer).
- **Arquivos no Drive (blocos 1 e 2):** 17 + 16 verificações no servidor e 26 na interface (um JSON e uma cópia anotada depois de anotar 10 vezes e fechar 3, duplicados com lixeira e desfazer, pastas por tipo/concurso/data/categoria, mover ao mudar categoria, reorganizar com prévia, lote, Telegram perguntando a categoria).
- **Resumos de PDF e discursivas com IA (blocos 4 e 3):** 31 verificações no servidor e 39 na interface (blocos, progresso, cancelar, fila continuando, rótulo, regenerar com versão, limite; correção a–e, aplicar trechos como nova versão, temas, texto de exemplo, Treinar, excluir com desfazer).
- **Relatórios e impressão (blocos 5 e 6):** 19 verificações do motor (PDF com sumário e páginas certas, rodapé, cabeçalho repetido, gabarito, XLSX com números e datas como valores) e 76 na interface (todas as telas, filtros ativos, imprimir, Telegram, Estudos › Relatórios a–d, original/anotado e intervalo de páginas).
- **Telegram /funcoes (bloco 9):** 21 verificações (cada comando e apelido tratado, grupos na ordem, HTML escapado e dividido, /comandos, menu "/", chat não conectado, /parar e /parar_estudos).
- **Design (bloco 7):** contraste ≥ 4,5:1 nos dois temas, alvos de 44 px no celular em 16 telas, raio e fonte, 360 px sem rolagem.
- **Pacote para o Apps Script:** o build confere que nenhum `<script>` contém `//` ou `/*` (nada para o Google remover), que todos passam no `node --check` e roda a interface de Estudos em cima do pacote gerado.
- **PWA:** manifesto instalável, service worker ativo, app dentro da casca, permissão, inscrição de ponta a ponta, clique na notificação e tela de configuração do link.

---

## 18. Histórico de versões

| Versão | O que mudou |
|---|---|
| **1.9.0** | **Drive sem duplicar** (um JSON e uma cópia anotada por material, conteúdo igual não é reenviado, limpar duplicados com lixeira e desfazer). **Pastas por tipo/concurso/data/categoria**, categoria obrigatória no envio, reorganizar biblioteca, lote e categoria pelo Telegram. **OCR de PDF digitalizado** medido (Tesseract.js `por` no aparelho, Drive como alternativa), guardado e nunca refeito, com camada de texto. **Resumos de PDF com IA** em três modos e em blocos. **Discursivas com IA** (correção a–e, temas, texto de exemplo, Treinar). **Imprimir/Baixar** original ou anotado, todas as páginas ou intervalo. **Motor único de relatórios** (PDF A4 e XLSX) em todas as telas, Telegram e Estudos › Relatórios (a–d); CSV só para importação. **Telegram `/funcoes`** (`/comandos`) com registro único. **Design compacto** e tema claro cinza com cartões brancos. Correção: excluir anotação e discursiva (o app usava uma rota que o servidor recusa). Migração aditiva (rode `setup()`). |
| **1.8.0** | **Importar questões de PDF**: enunciados, textos de apoio, alternativas (A–E, A–D, certo/errado), gabarito, banca, ano, órgão, cargo, disciplina e assunto, com recorte das figuras/fórmulas/tabelas, conferência antes de gravar, XLSX no formato do modelo e importação ligada à página do PDF. Questões ganham **texto de apoio** (no editor, no treino, no simulado, no Telegram e na IA) e o botão "Abrir no PDF". **Configurações › Comandos do Telegram** com todos os comandos e publicação no menu do bot. Migração aditiva (rode `setup()`). |
| **1.7.0** | **Assistente de IA** com vários provedores (formulário com nome, URL base, chave opcional, formato, modelos e cabeçalhos; Buscar modelos e Testar), modelos prontos com nível gratuito (Gemini, Groq, OpenRouter, Cerebras, Mistral, Pollinations) e escolha do modelo na hora. Tela do assistente: conversar, resumo, questões e flashcards com fontes da biblioteca, do Drive (PDF, XLSX, imagens com OCR), anotações, questões, edital e dados da planilha. **Questões:** excluir em lote (todas ou uma a uma), concurso e tipo de concurso (área) no cadastro, na importação e nos filtros, cartões de assertividade × erro, simulado com tempo, resposta anterior oculta, comentário e resposta por IA. **Painel** com gráficos (assertividade, certas × erradas, horas × meta, precisão por disciplina). **Telegram:** `/ia`, `/gerar_questoes`, `/resumo_ia` e séries de questões com placar. Migração aditiva (rode `setup()`). |
| **1.6.1** | Correção: algumas telas de Estudos voltavam para o Início no Apps Script. Causa: o Google remove comentários do HTML de um jeito que cortava um trecho válido do código (um `//` dentro de um texto), e o script das telas não carregava. Agora o pacote sai sem nenhum comentário nem `//`/`/*` no código (verificado no build) e uma tela que não abrir mostra o aviso em vez de cair no Início. **Leitura do edital** refeita: PDF (biblioteca ou computador), texto ou tabela colada preenchem disciplina, assunto, subassunto, item, página, peso e questões, com escolha do cargo; peso com vírgula e linhas repetidas tratados no servidor. |
| **1.6.0** | **Estudos — concursos públicos**: concursos e etapas, edital verticalizado com versões, planejamento com a conta explicada, biblioteca (envio em blocos até 50 MB, sem duplicar), **leitor de PDF com anotações** (marca-texto, caneta, formas, texto, comentários, favoritos, desfazer, busca, miniaturas; coordenadas no espaço da página; gravação no aparelho e no Drive com conflito por página; cópia anotada com revisão exata), sala de estudo com tempo canônico, banco de questões com histórico de gabarito e recálculo, listas, simulados com regras do usuário, revisões espaçadas, flashcards SM-2, caderno de erros, anotações e discursivas com versões, desempenho com denominadores, importação XLSX/CSV com prévia, **comandos e envio de arquivos pelo Telegram** com fila de trabalhos, IA opcional. Integração com Início, busca, Tarefas, Foco, Metas, Rotinas e Backup. Migração aditiva (rode `setup()`). |
| **1.5.0** | **Alarmes** para tarefas, água, refeições e remédios: toque na hora com o app aberto (tela cheia, som, vibração, "Bebi 250 ml", "Concluir tarefa", adiar) e push/Telegram com o app fechado (gatilho `triggerFrequente`, 5 min). **Meta de água** editável. **Filtros** de mês, ano, intervalo de datas, últimos dias, tipo, conta, projeto, prioridade, área, categoria e busca em todas as listas e relatórios, com busca automática do histórico antigo. Correção: lançar **receita** ou **transferência** recarregava a página. Abas novas são criadas sozinhas na primeira vez. |
| **1.4.0** | **Telegram** como canal de mensagens gratuito e sem servidor: bot próprio, conexão por link, avisos automáticos, resumo das 7h, comandos `/hoje` e `/parar`, limites e histórico. O WhatsApp sai do menu: a Meta restringiu a conta e exige verificação com CNPJ/MEI. Correção do 9º dígito para celulares brasileiros no WhatsApp. |
| 1.3.0 | **WhatsApp** pela Cloud API oficial da Meta, desenhado para custo zero: só texto livre dentro da janela de 24 h, limites diário e mensal, modo de teste, autorização explícita, deduplicação, webhook opcional com o comando *hoje*, token só nas propriedades do script e tela em Configurações › WhatsApp. |
| 1.2.0 | App instalável (PWA) e **push no celular** com VAPID. Avisos de rotinas e eventos. Login só com e-mail e senha. **Tema claro branco.** Correção da navegação no celular (painéis não usam mais o histórico do navegador). Correção do "Registrar progresso" e dos marcos de meta (o id da meta não era enviado). |
| 1.1.0 | Tela de login com senha de acesso, dados por usuário (e-mail), sessões, bloqueio por tentativas, rotas do dono, nova marca. |
| 1.0.1 | Scripts protegidos contra o pré-processamento do Google (`/*` dentro de texto e caracteres especiais), o que corrigiu o módulo de Finanças sumindo. |
| 1.0.0 | Primeira versão: seis módulos, OCR, gatilhos, backup, PIN e modo demonstração. |
