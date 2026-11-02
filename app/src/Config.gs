/**
 * Prumo — configuração central.
 * Único arquivo com IDs de recursos. Carregado primeiro; não depende de nenhum outro arquivo.
 */
var CONFIG = {
  APP_NAME: 'Prumo',
  VERSION: '1.9.0',
  SCHEMA_VERSION: 1,
  SHEET_ID: '1j2P-erYooziZF-7b8pMUAlvFO6bBlukgmJqIuSANW3I',
  SCRIPT_ID: '1eH3JGTb2MCTnUe6kx34WynQQ-I3PJ7Fq6nE0pshG_W5KN-dUNDE7K8_t',
  DRIVE_FOLDER_ID: '1XGLH_e6TDg8RANZdVaOOPDJgfS4f32QV',
  TIMEZONE: 'America/Sao_Paulo',
  FAVICON_URL: '',
  // Endereço do app instalável (pasta pwa/ publicada no GitHub Pages). Aparece em Configurações › Notificações.
  PWA_URL: 'https://goisdev-ia.github.io/prumo/',
  // Acesso: e-mail + senha compartilhada. Cada e-mail tem os próprios dados (user_id = e-mail).
  // Para trocar a senha rode definirSenha('nova senha') no editor (fica nas propriedades do script).
  LOGIN: {
    SENHA_SHA256: 'da8fea6cc418ac8f7e76da9d4a1d688e29efce34e9837b528bde43200d4a25a7', // padrão
    SALT: 'prumo-login-v1:',
    SESSAO_DIAS: 30,
    MAX_TENTATIVAS: 5,       // por e-mail, antes de bloquear
    BLOQUEIO_MIN: 15
  },
  SUBFOLDERS: ['comprovantes', 'perfil', 'progresso', 'rotulos', 'ocr_tmp', 'backups', 'exportacoes', 'outros', 'estudos'],
  // Estudos: arquivos grandes sobem em partes direto para o Drive (upload retomável) e são lidos por faixas.
  EST: { UPLOAD_MAX_BYTES: 50 * 1024 * 1024, CHUNK: 2 * 1024 * 1024, TG_SEND_MAX: 50 * 1024 * 1024, TG_GET_MAX: 20 * 1024 * 1024,
    MIME: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/plain', 'application/json'] },
  UPLOAD: {
    MAX_BYTES: 10 * 1024 * 1024,
    MIME: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/json', 'text/csv', 'text/plain']
  },
  CACHE_TTL_S: 21600,
  CACHE_CHUNK: 30000,
  LOCK_WAIT_MS: 25000,
  LOG_RETENTION_DAYS: 90,
  BACKUP_KEEP: 8,
  RECURRING_HORIZON_DAYS: 35,
  TIME_BUDGET_MS: 4.5 * 60 * 1000,
  OFF_URL: 'https://world.openfoodfacts.org/api/v2/product/',
  DIGEST_HOUR: 7,
  // Tabelas que o cliente pode gravar pela rota genérica db.save (as demais têm rotas próprias)
  CLIENT_WRITABLE: [
    'configuracoes', 'notificacoes',
    'fin_contas', 'fin_cartoes', 'fin_categorias', 'fin_lancamentos', 'fin_faturas', 'fin_recorrencias',
    'fin_orcamentos', 'fin_reservas', 'fin_investimentos', 'fin_dividas', 'fin_regras',
    'fit_exercicios', 'fit_treinos', 'fit_treino_itens', 'fit_sessoes', 'fit_series', 'fit_cardio',
    'fit_medidas', 'fit_passos', 'fit_timers_presets',
    'nut_alimentos', 'nut_receitas', 'nut_diario', 'nut_agua', 'nut_metas', 'nut_refeicoes_favoritas',
    'tar_projetos', 'tar_tarefas', 'tar_eventos', 'tar_foco', 'alarmes',
    'met_metas', 'met_marcos', 'met_checkins', 'met_vinculos',
    'rot_rotinas', 'rot_itens', 'rot_execucoes', 'rot_modelos',
    'est_concursos', 'est_etapas', 'est_editais', 'est_disciplinas', 'est_assuntos', 'est_edital_itens', 'est_planos', 'est_ciclo_itens',
    'est_materiais', 'est_leitura', 'est_listas', 'est_simulados', 'est_revisoes', 'est_flashcards', 'est_erros'
  ],
  // Estudos: tabelas gravadas só por rotas próprias (validação de negócio), mas incluídas em exportação e restauração
  EST_ROUTE_ONLY: ['est_sessoes', 'est_pdf_anot', 'est_exportacoes', 'est_anotacoes', 'est_versoes', 'est_questoes', 'est_tentativas',
    'est_simulado_itens', 'est_flashcard_revisoes', 'est_discursivas', 'est_jobs'],
  // Estudos: tabelas carregadas sob demanda (rota est.boot), fora da carga inicial do app
  EST_LAZY: ['est_editais', 'est_assuntos', 'est_edital_itens', 'est_ciclo_itens', 'est_sessoes', 'est_materiais', 'est_leitura', 'est_pdf_anot',
    'est_exportacoes', 'est_anotacoes', 'est_questoes', 'est_tentativas', 'est_listas', 'est_simulados', 'est_simulado_itens', 'est_flashcards',
    'est_flashcard_revisoes', 'est_erros', 'est_discursivas', 'est_jobs'],
  // Tabelas grandes: no boot só vem a janela recente (coluna de data, meses)
  BOOT_WINDOW: { fin_lancamentos: ['data', 25], nut_diario: ['data', 6], nut_agua: ['data', 6], rot_execucoes: ['data', 14], fit_series: null, notificacoes: ['data_ref', 3] }
};

/**
 * Schema do banco. Colunas comuns (id, user_id, created_at, updated_at, deleted_at) são adicionadas automaticamente.
 * Sintaxe por coluna: nome:tipo[tamanho][(opções)][!][=padrão]
 *   s=texto curto  t=texto longo  i=inteiro  n=número  m=dinheiro  d=data  dt=data/hora
 *   b=booleano  e=enum  j=JSON  r=referência (id)    ! = obrigatório
 */
var SCHEMA = {
  // NÚCLEO
  usuarios: 'email:s120! nome:s80 foto_arquivo_id:s60 nascimento:d sexo:e(masculino,feminino,outro) altura_cm:n tema:e(dark,light,auto)=dark moeda:s3=BRL idioma:s5=pt-BR inicio_semana:i=0 unidade_peso:e(kg,lb)=kg pin_hash:s100 ultimo_acesso:dt',
  configuracoes: 'modulo:s30! chave:s60! valor_json:j',
  logs: 'ts:dt! nivel:e(info,warn,error,audit)! modulo:s30 acao:s40 entidade:s40 entidade_id:s60 antes_json:j depois_json:j mensagem:t dispositivo:s160 duracao_ms:i',
  arquivos: 'drive_id:s80! nome:s200! mime:s80 tamanho_bytes:i modulo:s30 entidade:s40 entidade_id:s60 tipo:e(comprovante,foto_perfil,foto_progresso,rotulo,outro)=outro ocr_texto:t ocr_json:j hash:s80',
  notificacoes: 'tipo:s30 titulo:s140! corpo:t data_ref:d lida:b=false link:s200',
  alarmes: 'titulo:s120! tipo:e(tarefa,agua,refeicao,remedio,outro)=outro modo:e(unico,diario,intervalo)=diario data:d hora:s5! dias_semana:s20 hora_fim:s5 intervalo_min:i ativo:b=true som:b=true ref_id:r refeicao:s20 pular_meta:b=false ultimo_disparo:dt observacao:s200',
  tg_mensagens: 'direcao:e(saida,entrada)! status:e(enviado,falhou,bloqueado,recebido)! origem:s30 chave:s80 ref_ids:t chat_id:s30 corpo:t msg_id:s30 erro_codigo:s20 erro_msg:s300',
  wa_mensagens: 'direcao:e(saida,entrada)! status:e(simulado,enviando,enviado,entregue,lido,falhou,bloqueado,recebido)! origem:s30 chave:s80 ref_ids:t para:s20 corpo:t wamid:s120 erro_codigo:s20 erro_msg:s300 tentativas:i=0',
  push_inscricoes: 'pid:s60! endpoint:t! p256dh:s200 auth:s80 dispositivo:s160 ativo:b=true entregue_ate:dt entregues_json:j falhas:i=0 ultimo_envio:dt',

  // ESTUDOS — CONCURSOS (1.6). Textos grandes (anotações de PDF, texto extraído) ficam em JSON no Drive.
  est_concursos: 'nome:s160! orgao:s120 cargo:s120 especialidade:s120 banca:s80 escolaridade:e(fundamental,medio,tecnico,superior,pos)=superior localidade:s120 link:s300 observacoes:t prioridade:i=2 situacao:e(previsto,autorizado,edital_publicado,inscricoes_abertas,preparacao,prova_realizada,encerrado)=previsto principal:b=false arquivado:b=false data_prova:d data_prova_status:e(confirmada,estimada,indefinida)=indefinida data_fonte:s300 data_atualizada:d cor:s9 resultado:t area:s60',
  est_etapas: 'concurso_id:r! tipo:e(inscricao,pagamento,documentos,cartao,objetiva,discursiva,teste_fisico,titulos,pratica,resultado,outra)=outra titulo:s160! data:d data_fim:d hora:s5 data_status:e(confirmada,estimada,indefinida)=indefinida fonte:s300 fonte_em:d local:s200 status:e(pendente,feito,dispensado)=pendente checklist_json:j evento_id:r lembrete_min:i observacao:t arquivo_ids:t',
  est_editais: 'concurso_id:r! versao:i=1 titulo:s160 data_publicacao:d fonte:s300 arquivo_id:r observacao:t ativo:b=true',
  est_disciplinas: 'nome:s120! cor:s9 ordem:n=0',
  est_assuntos: 'disciplina_id:r! pai_id:r titulo:s300! ordem:n=0 teoria:e(nao_iniciada,em_andamento,concluida)=nao_iniciada dificuldade:i=3 prioridade:i=2 pre_requisitos:t esforco_min:i notas:t ultimo_estudo:dt ultima_revisao:dt proxima_revisao:d',
  est_edital_itens: 'edital_id:r! assunto_id:r! disciplina_id:r item_ref:s40 pagina:i descricao:t peso:n=1 qtd_questoes:i alteracao:e(mantido,adicionado,alterado,retirado)=mantido ordem:n=0',
  est_planos: 'concurso_id:r nome:s120! modo:e(ciclo,cronograma)=ciclo fase:e(pre_edital,pos_edital)=pre_edital edital_id:r disponibilidade_json:j sessao_min:i=50 pausa_min:i=10 folga_pct:i=15 inicio:d fim:d ciclo_pos:i=0 pesos_json:j ativo:b=true',
  est_ciclo_itens: 'plano_id:r! disciplina_id:r! assunto_id:r tipo:e(teoria,questoes,revisao,simulado,discursiva)=teoria minutos:i=60 ordem:n=0 fixo:b=false',
  est_sessoes: 'concurso_id:r disciplina_id:r assunto_id:r material_id:r tarefa_id:r foco_id:r tipo:e(teoria,questoes,revisao,simulado,discursiva,leitura,aula)=teoria objetivo:s300 inicio:dt! fim:dt pausas_json:j liquido_s:i=0 status:e(aberta,pausada,encerrada,cancelada)=aberta origem:e(app,manual,foco,telegram)=app aparelho:s160 pagina_ini:i pagina_fim:i paginas:s200 paginas_n:i questoes_n:i acertos_n:i dificuldade:i duvidas:t proximo_passo:t op_key:s80 edicao_motivo:s300',
  est_materiais: 'codigo:s12 titulo:s200! descricao:t autor:s160 tipo:e(pdf,xlsx,imagem,link,livro,aula,curso,outro)=pdf versao:i=1 versao_de:r data_ref:d disciplina_id:r assunto_ids:t concurso_ids:t tags:s200 arquivo_id:r url:s500 hash:s80 tamanho_bytes:i paginas:i situacao:e(a_estudar,estudando,concluido,arquivado)=a_estudar favorito:b=false origem:e(app,telegram)=app texto_json_id:s80 texto_paginas:i tg_file_id:s200 tg_file_hash:s80 categoria:e(questoes,revisoes,teoria,flashcards,outros)=outros pasta:s300',
  est_leitura: 'material_id:r! pagina:i=1 zoom:n rolagem:n paginas_lidas:t total_paginas:i atualizado:dt',
  est_pdf_anot: 'material_id:r! arquivo_id:r! json_drive_id:s80 revisao:i=0 revisoes_json:j total:i=0 favoritos:i=0 atualizado:dt',
  est_exportacoes: 'material_id:r tipo:e(anotado,relatorio,resumo,erros,questoes)=anotado revisao:i arquivo_id:r! hash:s80 tamanho_bytes:i titulo:s200 tg_file_id:s200',
  est_anotacoes: 'titulo:s200! tipo:e(resumo,fichamento,cornell,memoria,nota,lei_seca,duvida,trecho)=resumo conteudo:t disciplina_id:r assunto_id:r material_id:r pagina:i trecho:t tags:s200 favorito:b=false versao:i=1 ligadas:t norma:s160 artigo:s60 fonte:s300 fonte_data:d gerado_ia:b=false aprovado:b=true ia_meta:j',
  est_versoes: 'entidade:s40! entidade_id:r! versao:i! conteudo:t titulo:s200',
  est_questoes: 'codigo:s40 tipo:e(multipla,certo_errado,curta,discursiva)=multipla enunciado:t! alternativas_json:j imagem_arquivo_id:r gabarito:s40 gabarito_status:e(preliminar,definitivo,anulada,sem_gabarito)=sem_gabarito gabarito_hist_json:j explicacao:t fonte:s300 banca:s80 orgao:s120 concurso_id:r cargo:s120 ano:i disciplina_id:r assunto_id:r dificuldade:i=3 favorita:b=false duvida:b=false versao:i=1 tags:s200 material_id:r pagina:i area:s60 comentario:t comentario_ia:b=false comentario_em:dt gerada_ia:b=false revisar:b=false texto_base:t',
  est_tentativas: 'questao_id:r! questao_versao:i resposta:s40 gabarito_usado:s40 resultado:e(certa,errada,branco,anulada,sem_gabarito)! resultado_atual:e(certa,errada,branco,anulada,sem_gabarito) recalc_em:dt tempo_s:i confianca:i modo:e(treino,avaliacao,simulado,telegram)=treino simulado_id:r sessao_id:r primeira:b=false op_key:s80',
  est_listas: 'nome:s160! tipo:e(manual,aleatoria,dificuldades,filtro)=manual filtros_json:j questao_ids:t',
  est_simulados: 'titulo:s160! concurso_id:r tipo:e(simulado,prova_real)=simulado duracao_min:i regras_json:j composicao_json:j status:e(rascunho,em_andamento,finalizado)=rascunho inicio:dt fim:dt tempo_s:i resultado_json:j equivalente_a:r',
  est_simulado_itens: 'simulado_id:r! questao_id:r! ordem:i bloco:s80 peso:n=1 questao_versao:i gabarito_snapshot:s40 status_snapshot:s20 resposta:s40 marcada:b=false tempo_s:i resultado:s20',
  est_revisoes: 'alvo_tipo:e(assunto,material,questao,erro,nota,flashcard)! alvo_id:r! titulo:s200 disciplina_id:r assunto_id:r paginas:s60 vencimento:d! feita_em:dt resultado:e(errei,dificil,bom,facil) seq:i=0 intervalo_dias:i status:e(pendente,feita,cancelada)=pendente origem:s30',
  est_flashcards: 'baralho:s80=Geral frente:t! verso:t tipo:e(basico,lacuna,imagem,audio)=basico imagem_arquivo_id:r audio_arquivo_id:r disciplina_id:r assunto_id:r tags:s200 favorito:b=false suspenso:b=false origem_ref:s300 facilidade:n=2.5 intervalo:i=0 repeticoes:i=0 lapsos:i=0 vencimento:d novo:b=true',
  est_flashcard_revisoes: 'card_id:r! nota:e(errei,dificil,bom,facil)! data:dt! intervalo_antes:i intervalo_depois:i op_key:s80',
  est_erros: 'titulo:s200! questao_id:r disciplina_id:r assunto_id:r causa:e(conteudo,interpretacao,atencao,tempo,chute,pegadinha,outro)=conteudo raciocinio:t explicacao:t fonte:s300 acao:t proxima_tentativa:d status:e(aberta,em_estudo,aguardando_pratica,resolvida)=aberta recorrencias:i=1',
  est_discursivas: 'titulo:s200! concurso_id:r proposta:t tipo:e(dissertativa,peca,estudo_caso,parecer,redacao,outra)=dissertativa limite_linhas:i limite_palavras:i tempo_min:i criterios_json:j texto:t versao:i=1 avaliacoes_json:j status:e(rascunho,escrita,corrigida,reescrita)=rascunho gerado_ia:b=false ia_meta:j',
  est_jobs: 'codigo:s12 tipo:e(enviar_material,enviar_exportacao,enviar_nota,enviar_relatorio,enviar_erros,enviar_texto,gerar_resumo,receber_arquivo,ia_chat,ia_resumo,ia_questoes,enviar_quiz,enviar_arquivo)! status:e(na_fila,processando,pronto,enviando,enviado,falhou,entrega_incerta,cancelado)=na_fila origem:e(app,telegram,gatilho)=app params_json:j chave:s120 tentativas:i=0 proxima:dt resultado_json:j erro:s500 arquivo_id:r revisao:i',
  tg_updates: 'update_id:s30! chat_id:s30 tipo:s30 texto:t status:e(recebido,processado,ignorado,erro)=recebido erro:s300',
  // FINANÇAS
  fin_contas: 'nome:s80! tipo:e(carteira,corrente,poupanca,investimento,outro)=corrente instituicao:s80 saldo_inicial:m=0 cor:s9 icone:s30 incluir_no_total:b=true arquivada:b=false ordem:i=0',
  fin_cartoes: 'nome:s80! bandeira:e(visa,mastercard,elo,amex,hipercard,outro)=mastercard final:s4 limite:m! dia_fechamento:i! dia_vencimento:i! conta_pagamento_id:r cor:s9 arquivado:b=false',
  fin_categorias: 'nome:s60! tipo:e(receita,despesa)! pai_id:r cor:s9 icone:s30 ordem:i=0 arquivada:b=false',
  fin_lancamentos: 'tipo:e(receita,despesa,transferencia)! descricao:s140! valor:m! data:d! competencia:s7 status:e(pago,pendente,agendado)=pago conta_id:r conta_destino_id:r cartao_id:r fatura_id:r categoria_id:r parcela_num:i parcela_total:i grupo_parcela_id:r recorrencia_id:r forma_pagamento:e(pix,debito,credito,dinheiro,boleto,transferencia,outro) estabelecimento:s120 tags:s200 observacao:t arquivo_ids:s400 meta_id:r reserva_id:r origem:e(manual,ocr,importacao,recorrencia,demo,sistema)=manual import_hash:s80',
  fin_faturas: 'cartao_id:r! competencia:s7! data_fechamento:d data_vencimento:d valor_total:m=0 status:e(aberta,fechada,paga)=aberta lancamento_pagamento_id:r',
  fin_recorrencias: 'descricao:s140! modelo_json:j! frequencia:e(diaria,semanal,mensal,anual)=mensal intervalo:i=1 dia:i inicio:d! fim:d proxima_geracao:d ativa:b=true',
  fin_orcamentos: 'categoria_id:r! competencia:s7! valor_planejado:m! rollover:b=false',
  fin_reservas: 'nome:s80! meta_id:r conta_id:r valor_alvo:m saldo_atual:m=0 rendimento_pct:n cor:s9',
  fin_investimentos: 'nome:s80! tipo:e(renda_fixa,tesouro,acoes,fii,fundos,cripto,previdencia,outro)=renda_fixa instituicao:s80 valor_aplicado:m! valor_atual:m data_aplicacao:d vencimento:d rentabilidade:n',
  fin_dividas: 'credor:s80! valor_original:m saldo_devedor:m! juros_mensal_pct:n=0 parcelas:i valor_parcela:m proximo_vencimento:d status:e(ativa,negociando,quitada)=ativa',
  fin_regras: 'padrao:s80! categoria_id:r! conta_id:r',

  // FITNESS
  fit_exercicios: 'nome:s80! grupo_muscular:e(peito,costas,ombros,biceps,triceps,antebraco,quadriceps,posterior,gluteos,panturrilha,abdomen,corpo_todo,cardio)! musculos_secundarios:s120 equipamento:e(barra,halter,maquina,polia,peso_corporal,kettlebell,elastico,smith,nenhum,outro)=outro tipo:e(forca,cardio,mobilidade,funcional)=forca met:n=5 instrucoes:t midia_url:s300 personalizado:b=false',
  fit_treinos: 'nome:s80! objetivo:e(hipertrofia,forca,emagrecimento,resistencia,condicionamento,mobilidade)=hipertrofia nivel:e(iniciante,intermediario,avancado)=intermediario dias_semana:s20 duracao_estimada_min:i=60 cor:s9 ativo:b=true observacoes:t',
  fit_treino_itens: 'treino_id:r! exercicio_id:r! ordem:i=0 series:i=3 reps_min:i=8 reps_max:i=12 carga_sugerida:n descanso_s:i=90 tempo_s:i metodo:e(normal,dropset,biset,piramide,rest_pause,tempo)=normal observacao:s200',
  fit_sessoes: 'treino_id:r data:d! inicio:dt fim:dt duracao_s:i kcal_estimadas:n volume_total:n rpe:i humor:i observacao:t status:e(em_andamento,concluida,cancelada)=concluida',
  fit_series: 'sessao_id:r! exercicio_id:r! ordem:i reps:i carga:n concluida:b=true tempo_s:i e1rm:n eh_pr:b=false',
  fit_cardio: 'data:d! atividade:e(corrida,caminhada,bike,natacao,eliptico,remo,outro)=corrida distancia_km:n duracao_s:i! pace:s10 kcal:n fc_media:i passos:i observacao:s200',
  fit_medidas: 'data:d! peso_kg:n gordura_pct:n massa_magra_kg:n cintura:n quadril:n peito:n braco_d:n braco_e:n coxa_d:n coxa_e:n panturrilha:n pescoco:n foto_arquivo_ids:s400 observacao:s200',
  fit_passos: 'data:d! passos:i!',
  fit_timers_presets: 'nome:s60! tipo:e(cronometro,regressivo,intervalado,emom,tabata)=intervalado trabalho_s:i=40 descanso_s:i=20 rounds:i=8 series:i=1',

  // ALIMENTAÇÃO
  nut_alimentos: 'nome:s120! marca:s80 codigo_barras:s20 fonte:e(TACO,OFF,usuario,ocr)=usuario porcao_g:n=100 porcao_desc:s60 kcal:n! proteina_g:n=0 carbo_g:n=0 gordura_g:n=0 gord_sat_g:n gord_trans_g:n fibra_g:n acucar_g:n sodio_mg:n nutrientes_json:j favorito:b=false ultima_utilizacao:dt',
  nut_receitas: 'nome:s120! porcoes:n=1 ingredientes_json:j totais_json:j modo_preparo:t',
  nut_diario: 'data:d! hora:s5 refeicao:e(cafe,lanche_manha,almoco,lanche_tarde,jantar,ceia)! alimento_id:r receita_id:r nome:s120 quantidade_g:n porcoes:n kcal:n! proteina_g:n carbo_g:n gordura_g:n fibra_g:n sodio_mg:n nutrientes_json:j',
  nut_agua: 'data:d! hora:s5 ml:i!',
  nut_metas: 'vigencia_inicio:d! objetivo:e(perder,manter,ganhar)=manter kcal:n! proteina_g:n carbo_g:n gordura_g:n fibra_g:n=30 agua_ml:i tmb:n tdee:n ritmo_kg_semana:n formula:e(mifflin,katch)=mifflin nivel_atividade:e(sedentario,leve,moderado,intenso,muito_intenso)=moderado peso_alvo_kg:n data_alvo:d',
  nut_refeicoes_favoritas: 'nome:s80! refeicao:e(cafe,lanche_manha,almoco,lanche_tarde,jantar,ceia) itens_json:j!',

  // TAREFAS
  tar_projetos: 'nome:s80! cor:s9 icone:s30 arquivado:b=false',
  tar_tarefas: 'titulo:s160! descricao:t status:e(a_fazer,fazendo,feito,cancelada)=a_fazer prioridade:i=3 projeto_id:r pai_id:r data_vencimento:d hora:s5 duracao_estimada_min:i lembrete_min_antes:i recorrencia_json:j tags:s200 ordem:n=0 concluida_em:dt meta_id:r rotina_id:r lembrete_enviado:b=false est_concurso_id:r est_disciplina_id:r est_assunto_id:r est_material_id:r est_tipo:e(teoria,questoes,revisao,simulado,discursiva,leitura,aula,projeto) est_checklist_json:j est_criterio:s300 est_chave:s120',
  tar_eventos: 'titulo:s160! descricao:t inicio:dt! fim:dt dia_inteiro:b=false local:s120 cor:s9 lembrete_min:i recorrencia_json:j calendar_event_id:s200',
  tar_foco: 'tarefa_id:r inicio:dt! duracao_s:i! tipo:e(pomodoro,livre,pausa)=pomodoro',

  // METAS
  met_metas: 'titulo:s140! descricao:t motivo:t area:e(financeira,saude,fitness,alimentacao,carreira,estudos,pessoal,relacionamentos,lazer)=pessoal horizonte:e(curto,medio,longo)=medio data_inicio:d prazo:d medicao:e(manual,automatica,marcos)=manual origem_metrica:e(fin_reserva,fit_peso,nut_peso,tarefas,rotina,nut_agua,est_horas,est_questoes,est_precisao,est_revisoes,est_cobertura,est_redacoes) origem_id:r valor_inicial:n=0 valor_atual:n=0 valor_alvo:n unidade:s20 status:e(ativa,pausada,concluida,abandonada)=ativa prioridade:i=2 cor:s9',
  met_marcos: 'meta_id:r! titulo:s140! valor_alvo:n data_prevista:d concluido:b=false concluido_em:dt ordem:i=0',
  met_checkins: 'meta_id:r! data:d! valor:n nota:t humor:i',
  met_vinculos: 'meta_id:r! modulo:s30! entidade:s40! entidade_id:r! tipo_vinculo:s30',

  // ROTINAS
  rot_rotinas: 'titulo:s120! categoria:e(treino,estudo,trabalho,alimentacao,hobby,saude,lazer,casa,outro)=outro frequencia:e(diaria,semanal,mensal,anual,intervalo)=diaria dias_semana:s20 dia_mes:i mes:i intervalo_dias:i hora_inicio:s5 hora_fim:s5 duracao_min:i data_inicio:d data_fim:d cor:s9 icone:s30 ativa:b=true modo:e(bloco,habito,checklist)=habito vinculo_modulo:s30 vinculo_id:r meta_id:r',
  rot_itens: 'rotina_id:r! titulo:s120! ordem:i=0',
  rot_execucoes: 'rotina_id:r! data:d! status:e(feito,pulado,parcial,pendente)=feito hora_real:s5 nota:s200 itens_json:j',
  rot_modelos: 'nome:s80! descricao:s200 rotinas_json:j!'
};
