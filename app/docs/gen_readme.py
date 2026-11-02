import re, json, os
SRC = '/home/claude/prumo/src'
cfg = open(f'{SRC}/Config.gs', encoding='utf-8').read()
api = open(f'{SRC}/Api.gs', encoding='utf-8').read()
ver = re.search(r"VERSION: '([^']+)'", cfg).group(1)

# ---------- schema ----------
sch = dict(re.findall(r"^  (\w+): '([^']*)',?\s*$", cfg[cfg.index('var SCHEMA'):], re.M))
TYPES = {'s': 'texto', 't': 'texto longo', 'i': 'inteiro', 'n': 'número', 'm': 'dinheiro (R$)', 'd': 'data (aaaa-mm-dd)', 'dt': 'data e hora (ISO)', 'b': 'sim/não', 'e': 'lista', 'j': 'JSON', 'r': 'referência (id)'}
def parse(spec, table=''):
    out = []
    for tok in spec.split():
        m = re.match(r"^(\w+):(dt|[stinmdbejr])(\d+)?(?:\(([^)]*)\))?(!)?(?:=(.*))?$", tok)
        if not m: out.append((tok, '?', '', '', '', '')); continue
        name, ty, ln, opts, req, de = m.groups()
        tipo = TYPES[ty] + (f' ({ln})' if ln else '')
        note = ('valores: ' + ', '.join(f'`{o}`' for o in opts.split(','))) if opts else ''
        if ty == 'r' and name.endswith('_id'):
            alvo = {'conta_id': 'fin_contas', 'conta_destino_id': 'fin_contas', 'conta_pagamento_id': 'fin_contas', 'cartao_id': 'fin_cartoes', 'fatura_id': 'fin_faturas',
                    'categoria_id': 'fin_categorias', 'recorrencia_id': 'fin_recorrencias', 'meta_id': 'met_metas', 'rotina_id': 'rot_rotinas', 'projeto_id': 'tar_projetos',
                    'treino_id': 'fit_treinos', 'exercicio_id': 'fit_exercicios', 'sessao_id': 'fit_sessoes', 'alimento_id': 'nut_alimentos', 'receita_id': 'nut_receitas',
                    'arquivo_id': 'arquivos', 'foto_arquivo_id': 'arquivos', 'reserva_id': 'fin_reservas', 'divida_id': 'fin_dividas', 'marco_id': 'met_marcos'}.get(name)
            EST = {'concurso_id': 'est_concursos', 'edital_id': 'est_editais', 'disciplina_id': 'est_disciplinas', 'assunto_id': 'est_assuntos', 'plano_id': 'est_planos', 'sessao_id': 'est_sessoes',
                   'material_id': 'est_materiais', 'questao_id': 'est_questoes', 'simulado_id': 'est_simulados', 'card_id': 'est_flashcards', 'tarefa_id': 'tar_tarefas', 'evento_id': 'tar_eventos',
                   'foco_id': 'tar_foco', 'imagem_arquivo_id': 'arquivos', 'audio_arquivo_id': 'arquivos', 'entidade_id': '(conforme `entidade`)', 'alvo_id': '(conforme `alvo_tipo`)', 'pai_id': 'est_assuntos'}
            if table.startswith('est_') and name in EST: alvo = EST[name]
            if alvo: note = (note + ' · ' if note else '') + f'→ `{alvo}`'
        if ty == 'r' and table.startswith('est_') and name == 'versao_de': note = '→ `est_materiais` (versão anterior)'
        out.append((name, tipo, 'sim' if req else '', f'`{de}`' if de not in (None, '') else '', note))
    return out
GROUPS = [
  ('Sistema e usuários', ['usuarios', 'configuracoes', 'logs', 'arquivos', 'notificacoes', 'alarmes', 'push_inscricoes', 'tg_mensagens', 'wa_mensagens']),
  ('Finanças', [n for n in sch if n.startswith('fin_')]),
  ('Fitness', [n for n in sch if n.startswith('fit_')]),
  ('Alimentação', [n for n in sch if n.startswith('nut_')]),
  ('Tarefas e agenda', [n for n in sch if n.startswith('tar_')]),
  ('Metas', [n for n in sch if n.startswith('met_')]),
  ('Rotinas', [n for n in sch if n.startswith('rot_')]),
  ('Estudos — concursos públicos', [n for n in sch if n.startswith('est_')] + ['tg_updates']),
]
DESC = {
 'est_concursos': 'Concursos acompanhados: órgão, cargo, banca, situação, data da prova com status (confirmada/estimada/indefinida) e fonte, concurso principal.',
 'est_etapas': 'Etapas do concurso (inscrição, isenção, pagamento, prova, gabaritos, recursos, resultado, nomeação…) com data, status, checklist, evento na agenda e lembrete.',
 'est_editais': 'Versões do edital de cada concurso (retificações); só uma ativa por concurso.',
 'est_disciplinas': 'Disciplinas (Língua Portuguesa, Direito Constitucional…), com cor e peso.',
 'est_assuntos': 'Assuntos e subassuntos (árvore por `pai_id`): teoria, dificuldade, prioridade, pré-requisitos, último estudo e próxima revisão.',
 'est_edital_itens': 'Itens do edital verticalizado de uma versão: assunto, referência do item, peso, nº de questões e o que mudou em relação à versão anterior.',
 'est_planos': 'Plano de estudos: disponibilidade por dia, tamanho da sessão, pausas, folga para imprevistos, pesos e posição no ciclo.',
 'est_ciclo_itens': 'Ordem e duração das disciplinas no ciclo de estudos.',
 'est_sessoes': 'Sessões de estudo com tempo canônico (início, fim, pausas, tempo líquido), origem (app, manual, Foco, Telegram), páginas, questões e edições com motivo.',
 'est_materiais': 'Biblioteca: PDFs, planilhas, imagens, links, livros, aulas; código Mn, versão, hash (sem duplicar), situação, texto extraído e file_id do Telegram.',
 'est_leitura': 'Posição de leitura por material (página, zoom) e páginas marcadas como lidas.',
 'est_pdf_anot': 'Índice das anotações de cada PDF: arquivo JSON no Drive, revisão geral, revisão por página, total e favoritos.',
 'est_exportacoes': 'Cópias geradas (PDF anotado com a revisão exata das anotações, relatórios, resumos), guardadas no Drive.',
 'est_anotacoes': 'Resumos, fichamentos, Cornell, mapas, notas, lei seca e dúvidas, com versão, vínculos, fonte e marca de rascunho de IA.',
 'est_versoes': 'Versões anteriores de anotações, discursivas e questões (histórico).',
 'est_questoes': 'Banco de questões: tipo, alternativas, gabarito com situação (preliminar, definitivo, anulada, sem gabarito) e histórico, banca, ano, assunto, versão.',
 'est_tentativas': 'Cada resposta: resultado original e resultado atual (recalculado se o gabarito mudar), tempo, confiança, modo.',
 'est_listas': 'Listas de questões (manual, aleatória, dificuldades ou filtro salvo).',
 'est_simulados': 'Simulados e provas reais: regras de pontuação informadas pelo usuário, composição por blocos, resultado.',
 'est_simulado_itens': 'Questões de cada simulado com o gabarito congelado no início, resposta, marcação e tempo.',
 'est_revisoes': 'Revisões espaçadas agendadas (assunto, material, questão, erro, nota, cartão), com resultado e sequência.',
 'est_flashcards': 'Cartões (básico, lacuna, imagem, áudio) com agendamento SM-2.',
 'est_flashcard_revisoes': 'Histórico das respostas aos cartões.',
 'est_erros': 'Caderno de erros: causa, raciocínio, explicação, ação, recorrência e status.',
 'est_discursivas': 'Discursivas e redações: proposta, critérios, texto com versões e avaliações (autoavaliação, humana, oficial ou IA identificada).',
 'est_jobs': 'Fila de trabalhos do Telegram (envio de PDF, relatório, resumo): estado, tentativas, erro, entrega.',
 'tg_updates': 'Atualizações recebidas do Telegram já processadas (evita processar a mesma mensagem duas vezes).',
 'usuarios': 'Perfil de cada e-mail que entrou: nome, foto, dados corporais, tema e PIN (hash).',
 'configuracoes': 'Preferências por usuário no formato módulo.chave → valor (JSON).',
 'logs': 'Auditoria (antes/depois de cada gravação), avisos, erros do servidor e do navegador, logins.',
 'arquivos': 'Metadados dos arquivos enviados ao Drive (comprovantes, fotos, rótulos) e texto do OCR.',
 'notificacoes': 'Central de notificações do app; também é a fila do push no celular.',
 'push_inscricoes': 'Aparelhos com push ativo (endpoint do navegador, controle de entrega e falhas).',
 'alarmes': 'Alarmes de água, refeições, remédios, tarefas e livres: uma vez, todo dia (dias da semana) ou a cada N minutos entre dois horários; último disparo evita repetição.',
 'tg_mensagens': 'Registro do Telegram: mensagens enviadas, bloqueadas (limite), com falha e recebidas (comandos), com chave de deduplicação.',
 'wa_mensagens': 'Registro do WhatsApp: mensagens enviadas, simuladas, bloqueadas e recebidas, com chave de deduplicação, id da Meta (wamid) e erro.',
 'fin_contas': 'Contas bancárias, carteira, poupança e corretora, com saldo inicial.',
 'fin_cartoes': 'Cartões de crédito com limite, dias de fechamento e vencimento e conta de pagamento.',
 'fin_categorias': 'Categorias e subcategorias de receita e despesa, com cor e ícone.',
 'fin_lancamentos': 'Receitas, despesas e transferências (à vista, parceladas, no cartão ou recorrentes).',
 'fin_faturas': 'Faturas de cartão por competência, com total, status e pagamento.',
 'fin_recorrencias': 'Modelos de lançamentos que se repetem (salário, aluguel, assinaturas).',
 'fin_orcamentos': 'Limite mensal por categoria.',
 'fin_reservas': 'Caixinhas e reservas (emergência, viagem), com meta e saldo.',
 'fin_investimentos': 'Aplicações (renda fixa, ações, fundos, cripto) com valor aplicado e atual.',
 'fin_dividas': 'Empréstimos e financiamentos, juros e parcelas.',
 'fin_regras': 'Regras de categorização automática por texto (estabelecimento → categoria).',
}
def schema_md():
    out = []
    for g, names in GROUPS:
        out.append(f'### {g}\n')
        for n in names:
            if n not in sch: continue
            out.append(f'#### `{n}`\n')
            if n in DESC: out.append(DESC[n] + '\n')
            out.append('| Coluna | Tipo | Obrigatória | Padrão | Observação |\n|---|---|---|---|---|')
            for r in parse(sch[n], n): out.append('| `%s` | %s | %s | %s | %s |' % r)
            out.append('')
    return '\n'.join(out)
known = set(sum([g[1] for g in GROUPS], []))
missing = [n for n in sch if n not in known]
assert not missing, missing

# ---------- rotas ----------
block = api[api.index('function routes_()'):api.index('// Rotas abertas')]
routes = re.findall(r"'([a-z]+\.[A-Za-z]+|boot)':\s*([^,\n]+)", block)
for fn in ('Studies.gs', 'StudyTelegram.gs'):
    t = open(f'{SRC}/{fn}', encoding='utf-8').read(); b = t[t.index('function routes()'):]; b = b[:b.index('\n  }\n')]
    routes += [(r, '') for r in re.findall(r"'(est\.[A-Za-z]+)':", b)]
public = re.search(r"var PUBLIC = \{([^}]*)\}", api).group(1)
owner = re.search(r"var OWNER_ONLY = \{([^}]*)\}", api).group(1)
RDESC = {
 'auth.login': 'Entra com e-mail + senha e devolve o token da sessão.', 'auth.logout': 'Encerra a sessão atual.',
 'boot': 'Carga inicial: perfil, preferências e dados recentes de todos os módulos.',
 'db.list': 'Lista registros de uma tabela (com filtros).', 'db.save': 'Cria/atualiza um registro (tabelas liberadas ao cliente).',
 'db.saveMany': 'Grava vários registros de uma vez.', 'db.remove': 'Exclusão lógica (com desfazer).', 'db.restore': 'Restaura um registro excluído.',
 'profile.save': 'Salva o perfil.', 'settings.save': 'Salva preferências.', 'auth.setPin': 'Define/remove o PIN.', 'auth.verifyPin': 'Confere o PIN no desbloqueio.',
 'push.config': 'Chave pública VAPID para o navegador criar a inscrição.', 'push.subscribe': 'Registra o aparelho para push.',
 'push.unsubscribe': 'Remove o aparelho do push.', 'push.status': 'Aparelhos com push ativo.', 'push.test': 'Envia uma notificação de teste.',
 'files.upload': 'Envia arquivo ao Drive (base64) e registra metadados.', 'files.data': 'Devolve o arquivo/miniatura como data URL.',
 'files.rename': 'Renomeia o arquivo.', 'files.trash': 'Manda o arquivo para a lixeira do Drive.', 'files.link': 'Link do arquivo no Drive.',
 'ocr.extract': 'OCR de cupom, comprovante Pix ou rótulo nutricional.',
 'fin.saveTx': 'Salva lançamento com parcelas, fatura do cartão e recorrência.', 'fin.removeGroup': 'Exclui um parcelamento inteiro.',
 'fin.payInvoice': 'Paga a fatura (gera a saída na conta).', 'fin.reconcile': 'Ajusta o saldo da conta ao valor real do banco.',
 'fin.aporte': 'Aporte/resgate em reserva.', 'fin.generateRecurring': 'Gera os lançamentos recorrentes do período.',
 'fin.copyBudget': 'Copia o orçamento de um mês para outro.', 'fin.import': 'Importa extrato (CSV/OFX) sem duplicar.', 'fin.exportCsv': 'Exporta lançamentos em CSV.',
 'fit.saveSession': 'Fecha a sessão de treino (volume, kcal, e1RM e recordes).', 'nut.barcode': 'Busca produto pelo código de barras.',
 'nut.saveGoal': 'Salva a meta alimentar revalidando os limites seguros.', 'tasks.calendar': 'Envia evento ao Google Agenda.',
 'logs.list': 'Consulta os logs.', 'logs.client': 'Recebe erros do navegador.', 'logs.purge': 'Apaga logs antigos.', 'logs.export': 'Exporta logs em CSV.',
 'sys.diagnostics': 'Diagnóstico (abas, pastas, cache, cotas).', 'sys.backup': 'Cópia de segurança da planilha agora.',
 'sys.exportAll': 'Exporta todos os seus dados (JSON).', 'sys.importAll': 'Restaura a partir do JSON exportado.',
 'sys.seedDemo': 'Carrega dados de demonstração.', 'sys.clearDemo': 'Remove os dados de demonstração.',
 'sys.setupTriggers': 'Reinstala os gatilhos.',
 'alarm.ack': 'O app tocou o alarme na tela: marca o disparo para o gatilho não mandar push/Telegram repetido.', 'tg.status': 'Situação do Telegram (token só mascarado), uso e histórico.', 'tg.saveConfig': 'Salva e confere o token do bot (getMe) e liga/desliga o bot.',
 'tg.linkCode': 'Gera o link t.me/<bot>?start=<código> para conectar o Telegram (30 min).', 'tg.poll': 'Lê as mensagens novas do bot na hora (conexão e comandos).',
 'tg.commands': 'Registro único dos comandos do bot (grupos Geral, Estudos, IA, Arquivos e relatórios), o mesmo usado pelo roteador, /ajuda, /funcoes e o menu.', 'tg.setCommands': 'Publica os comandos no menu "/" do bot (setMyCommands).', 'tg.saveUser': 'Ligar, avisos automáticos, resumo das 7h, tipos e limite diário.', 'tg.unlink': 'Desconecta o Telegram da pessoa.', 'tg.sendTest': 'Mensagem de teste.',
 'wa.status': 'Situação do WhatsApp (token só mascarado), uso e histórico.', 'wa.saveConfig': 'Salva token, ID do número, versão, limite mensal e o interruptor geral.',
 'wa.testConnection': 'Lê os dados do número na Meta (sem enviar nada).', 'wa.saveUser': 'Número, ligar, modo de teste, envios automáticos, tipos e limite diário.',
 'wa.markWindow': 'Marca a janela de 24 h como aberta (sem webhook).', 'wa.sendTest': 'Mensagem de teste (respeita simulação, janela e limites).', 'sys.clearCache': 'Limpa o cache do servidor.',
 'est.boot': 'Carrega as tabelas de Estudos sob demanda (fora da carga inicial do app) e a situação da IA.',
 'est.sessionStart': 'Abre a sessão de estudo (uma por vez; avisa se já houver outra).', 'est.sessionPause': 'Pausa a sessão.', 'est.sessionResume': 'Retoma a sessão.',
 'est.sessionEnd': 'Encerra: tempo líquido, páginas estudadas, questões, teoria do assunto, 1ª revisão, conclui a tarefa.', 'est.sessionManual': 'Registra uma sessão feita fora do app.',
 'est.sessionEdit': 'Corrige horários de uma sessão (exige motivo).', 'est.sessionCancel': 'Cancela a sessão aberta.', 'est.fromFocus': 'Pomodoro de tarefa de estudo vira sessão (sem duplicar).',
 'est.questionSave': 'Cria/edita questão; muda versão e, se o gabarito mudar, registra histórico e recalcula.', 'est.questionDelete': 'Exclui uma ou várias questões (`ids`; exclusão lógica).', 'est.questionRestore': 'Desfaz a exclusão (uma ou várias).', 'est.questionComment': 'Salva o comentário da questão (marca quando veio da IA).', 'est.questionsAdd': 'Inclui questões geradas pela IA no banco (gabarito preliminar, "a revisar", concurso e área).',
 'est.questionGabarito': 'Muda gabarito/situação com motivo; recalcula ou mantém as tentativas.', 'est.answer': 'Registra a resposta (idempotente) e corrige pelo gabarito vigente.',
 'est.simStart': 'Monta o simulado e congela os gabaritos.', 'est.simSave': 'Salva respostas parciais (retomada).', 'est.simFinish': 'Finaliza e pontua pelas regras do usuário.',
 'est.reviewDone': 'Conclui revisão e agenda a próxima.', 'est.reviewSchedule': 'Agenda revisões.', 'est.cardAnswer': 'Responde flashcard (SM-2).',
 'est.noteSave': 'Salva anotação com versão (detecta edição concorrente).', 'est.noteVersions': 'Versões anteriores.', 'est.discSave': 'Salva discursiva e avaliações.',
 'est.materialSave': 'Cria/edita material da biblioteca.', 'est.readingSave': 'Posição de leitura e páginas lidas.', 'est.editalApply': 'Prévia e gravação do edital verticalizado (versões).',
 'est.importRows': 'Importação de planilha ou de PDF lido no app (questões, flashcards, edital) com prévia e erros por linha; aceita texto de apoio, página, material e imagem.', 'est.planSuggest': 'Sugestão de plano com a conta explicada.', 'est.planApply': 'Transforma a sugestão em tarefas (sem duplicar).',
 'est.stats': 'Indicadores de desempenho com denominadores.', 'est.report': 'Relatório em PDF ou CSV.', 'est.errorFromAttempt': 'Leva a questão errada ao caderno de erros.',
 'est.upStart': 'Inicia envio retomável ao Drive (detecta duplicado pelo hash; com `substituir`, atualiza o arquivo existente do material).', 'est.upChunk': 'Envia um bloco do arquivo.', 'est.fileChunk': 'Lê um bloco do arquivo do Drive.',
 'est.annGet': 'Anotações do PDF (JSON no Drive).', 'est.annSave': 'Salva páginas alteradas com revisão por página (CONFLICT se mudou em outro aparelho).',
 'est.textSave': 'Guarda o texto das páginas (camada do PDF ou OCR, com motor, confiança e posição das palavras) num JSON por material.', 'est.textGet': 'Lê o texto das páginas (com ocr:true, também as palavras do OCR); reaproveita o de outro material com o mesmo arquivo.', 'est.ocrPage': 'OCR de uma página pelo Google Drive (PNG da página; só texto; até 300 por dia).', 'est.aiResumoStart': 'Começa um resumo de PDF com IA (modo, foco, páginas): divide em blocos e cria o pedido ia_resumo na fila.', 'est.aiResumoStep': 'Processa o próximo bloco (ou a junção) do resumo e devolve o progresso; no fim, o rascunho da anotação.', 'est.aiResumoCancel': 'Cancela o resumo em andamento.', 'est.aiDisc': 'Discursivas com IA: corrigir (a–e, avaliação "sugestão de IA"), temas e propostas, texto de exemplo.', 'est.entityDelete': 'Exclui (lixeira) anotação ou discursiva.', 'est.entityRestore': 'Desfaz a exclusão de anotação ou discursiva.', 'est.exportRegister': 'Registra a cópia anotada com a revisão exata (atualiza o registro único do material).', 'est.libReorg': 'Reorganiza a biblioteca na estrutura Tipo/Concurso/Data/Categoria (prévia com dry).', 'est.materialBatch': 'Edição em lote de materiais (categoria, concurso, disciplina, situação), movendo os arquivos.', 'est.dupScan': 'Lista arquivos duplicados de Estudos (cópias antigas e conteúdo igual sem uso) e o espaço a liberar.', 'est.dupClean': 'Manda os duplicados escolhidos para a lixeira (Drive e app).', 'est.dupRestore': 'Desfaz a limpeza de duplicados.',
 'est.materialVersion': 'Nova versão do arquivo do material.', 'est.materialTrash': 'Manda material para a lixeira.', 'est.trashList': 'Materiais na lixeira.', 'est.exportCards': 'Exporta cartões em CSV (rota antiga; o app usa o relatório em planilha XLSX).',
 'est.aiStatus': 'Provedores (sem segredos), modelo padrão, uso e limite do dia.', 'est.aiConfig': 'Provedores de IA: salvar, excluir, padrão, limite, buscar modelos e testar (chaves só no servidor).', 'est.aiRun': 'Assistente: conversa, resumo, questões, flashcards e resposta de questão, com fontes e o modelo escolhido.',
 'est.tgSend': 'Põe na fila um envio para o seu Telegram (material, cópia anotada, nota, relatório, texto, série de questões).', 'est.jobs': 'Fila de trabalhos do Telegram.', 'est.jobCancel': 'Cancela um trabalho.',
 'est.checkFiles': 'Confere se os arquivos da biblioteca ainda estão no Drive (e restaura do backup).'}
def routes_md():
    rows = ['| Rota | Acesso | O que faz |', '|---|---|---|']
    for r, _ in routes:
        acc = 'pública' if f"'{r}'" in public else ('só o dono' if f"'{r}'" in owner else 'logado')
        rows.append(f'| `{r}` | {acc} | {RDESC.get(r, "")} |')
    return '\n'.join(rows)

tpl = open('/home/claude/prumo/docs/README.tpl.md', encoding='utf-8').read()
out = tpl.replace('{{VERSION}}', ver).replace('{{SCHEMA}}', schema_md()).replace('{{ROUTES}}', routes_md()).replace('{{NTABLES}}', str(len(sch))).replace('{{NROUTES}}', str(len(routes)))
open('/home/claude/prumo/README.md', 'w', encoding='utf-8').write(out)
print('README', len(out), 'chars;', len(sch), 'tabelas;', len(routes), 'rotas')
