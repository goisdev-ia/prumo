// Estudos — servidor: sessões, questões, simulados, revisões, cartões, edital, importação, plano, arquivos, anotações, isolamento.
const vm = require('vm');
const crypto = require('crypto');
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste · 390px', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
vm.runInContext(`(function (g) { var RD = Date; function FD() { var a = Array.prototype.slice.call(arguments); if (!(this instanceof FD)) return new RD(RD.now() + FD.off).toString(); return a.length ? new (Function.prototype.bind.apply(RD, [null].concat(a)))() : new RD(RD.now() + FD.off); }
  FD.off = 0; FD.now = function () { return RD.now() + FD.off; }; FD.parse = RD.parse; FD.UTC = RD.UTC; FD.prototype = RD.prototype; g.Date = FD; })(this)`, c);
const setOff = (min) => vm.runInContext('Date.off = ' + Math.round(min * 60000), c);

c.setup();
const r1 = c.setup();
const abas = G.SS.getSheets().map((s) => s.getName());
ok(['est_concursos', 'est_questoes', 'est_tentativas', 'est_jobs', 'tg_updates', 'est_pdf_anot'].every((n) => abas.includes(n)), 'setup cria as abas de Estudos');
ok(abas.filter((n) => n === 'est_questoes').length === 1, 'setup repetido não duplica abas');
const eu = G.devLogin('voce@exemplo.com'), ana = G.devLogin('ana@exemplo.com');

// boot leve e carga sob demanda
let b = must(api('boot', {}, eu), 'boot');
ok(!('est_questoes' in b.tables) && !('est_tentativas' in b.tables) && 'est_concursos' in b.tables, 'boot do app não carrega as tabelas pesadas de Estudos');
let eb = must(api('est.boot', {}, eu), 'est.boot');
ok(Array.isArray(eb.tables.est_questoes) && eb.ia && eb.ia.configurado === false, 'est.boot carrega Estudos sob demanda; IA desligada por padrão');

// concurso, disciplinas, edital (prévia e gravação, reaproveitando assuntos)
const conc = must(api('db.save', { table: 'est_concursos', row: { nome: 'TRT 5ª Região', cargo: 'Analista Judiciário', banca: 'FCC', principal: true, data_prova: '2027-03-14', data_prova_status: 'estimada', data_fonte: 'Notícia do órgão' } }, eu), 'concurso').row;
const itens = [
  { disciplina: 'Língua Portuguesa', assunto: 'Crase', item_ref: '1.1', peso: 2 },
  { disciplina: 'Língua Portuguesa', assunto: 'Concordância', subassunto: 'Concordância verbal', item_ref: '1.2', peso: 1 },
  { disciplina: 'Língua Portuguesa', assunto: 'Concordância', subassunto: 'Concordância nominal', item_ref: '1.3', peso: 1 },
  { disciplina: 'Direito Constitucional', assunto: 'Direitos fundamentais', item_ref: '2.1', peso: 3, qtd_questoes: 6 }
];
let pv = must(api('est.editalApply', { concurso_id: conc.id, itens, dry: true }, eu), 'prévia edital').previa;
ok(pv.novas_disciplinas.length === 2 && pv.novos_assuntos === 5 && pv.versao === 1, 'prévia do edital: 2 disciplinas e 5 assuntos novos (pai + subassuntos)');
ok(!G.SS.getSheetByName('est_editais').getLastRow() || G.SS.getSheetByName('est_editais').getLastRow() < 2, 'prévia não grava nada');
const ed1 = must(api('est.editalApply', { concurso_id: conc.id, itens, dry: false, edital: { titulo: 'Edital 01/2026' } }, eu), 'grava edital');
ok(ed1.edital.versao === 1 && ed1.itens === 4, 'edital v1 gravado com 4 itens');
eb = must(api('est.boot', {}, eu), 'boot2');
const assunto = (t) => eb.tables.est_assuntos.find((a) => a.titulo === t);
const crase = assunto('Crase'), df = assunto('Direitos fundamentais'), cv = assunto('Concordância verbal');
ok(crase && cv && cv.pai_id === assunto('Concordância').id, 'hierarquia disciplina → assunto → subassunto');
// retificação: remove crase, altera peso de DF, adiciona novo
const itens2 = [itens[1], itens[2], Object.assign({}, itens[3], { peso: 4 }), { disciplina: 'Direito Constitucional', assunto: 'Controle de constitucionalidade', item_ref: '2.2' }];
pv = must(api('est.editalApply', { concurso_id: conc.id, itens: itens2, dry: true }, eu), 'prévia retificação').previa;
ok(pv.versao === 2 && pv.adicionados === 1 && pv.alterados === 1 && pv.retirados === 1 && pv.retirados_lista[0] === 'Crase' && pv.reaproveitados === 3, 'retificação: prévia mostra adicionado, alterado e retirado; reaproveita assuntos');
const ed2 = must(api('est.editalApply', { concurso_id: conc.id, itens: itens2, dry: false }, eu), 'grava v2');
eb = must(api('est.boot', {}, eu), 'boot3');
ok(eb.tables.est_editais.filter((e) => e.ativo).length === 1 && eb.tables.est_editais.find((e) => e.ativo).versao === 2, 'só a versão nova fica ativa; a antiga é preservada');
ok(eb.tables.est_assuntos.filter((a) => a.titulo === 'Direitos fundamentais').length === 1, 'assunto reaproveitado entre versões (histórico não duplica)');
let cov = c.StudyReports.coverage(conc.id);
ok(cov.total === 4 && cov.concluidos === 0 && cov.pct === 0, 'cobertura conta só folhas e ignora retirados (4 itens)');

// sessões: início, pausa, retomada, fim (tempo líquido), conflito entre aparelhos, idempotência
setOff(0);
let s = must(api('est.sessionStart', { disciplina_id: df.disciplina_id, assunto_id: df.id, tipo: 'teoria', op_key: 'k1', aparelho: 'mobile · 390px' }, eu), 'start').sessao;
ok(s.status === 'aberta', 'sessão aberta');
ok(must(api('est.sessionStart', { op_key: 'k1' }, eu), 'repete').repetido, 'repetir o início com a mesma chave não cria outra sessão');
let r = api('est.sessionStart', { assunto_id: crase.id, op_key: 'k2' }, eu);
ok(!r.ok && r.error.code === 'CONFLICT' && r.error.data && r.error.data.sessao.id === s.id, 'segunda sessão em outro aparelho: CONFLICT com a sessão aberta');
setOff(10); must(api('est.sessionPause', { id: s.id }, eu), 'pausa');
setOff(15); must(api('est.sessionResume', { id: s.id }, eu), 'retoma');
setOff(40);
const fim = must(api('est.sessionEnd', { id: s.id, questoes_n: 10, acertos_n: 7, dificuldade: 4, teoria: 'concluida', proximo_passo: 'Fazer questões' }, eu), 'fim');
ok(Math.abs(fim.sessao.liquido_s - 35 * 60) <= 2, 'tempo líquido = 40 min − 5 min de pausa (' + fim.sessao.liquido_s + ' s)');
ok(must(api('est.sessionEnd', { id: s.id }, eu), 'fim2').repetido, 'encerrar de novo é idempotente');
eb = must(api('est.boot', {}, eu), 'boot4');
ok(eb.tables.est_assuntos.find((a) => a.id === df.id).teoria === 'concluida', 'assunto marcado como teoria concluída');
const rv1 = b && c.Db; // noop
const revs = must(api('boot', {}, eu), 'boot5').tables.est_revisoes;
ok(revs.some((x) => x.alvo_tipo === 'assunto' && x.alvo_id === df.id && x.status === 'pendente'), 'primeira revisão do assunto agendada');
cov = c.StudyReports.coverage(conc.id);
ok(cov.concluidos === 1 && cov.pct === 25 && cov.ponderada > 25, 'cobertura simples 25 % e ponderada pelo peso (' + cov.ponderada + ' %)');
r = api('est.sessionEdit', { id: s.id, inicio: fim.sessao.inicio, fim: fim.sessao.fim }, eu);
ok(!r.ok && r.error.field === 'motivo', 'corrigir horário exige motivo');
const ed = must(api('est.sessionEdit', { id: s.id, inicio: fim.sessao.inicio, fim: fim.sessao.fim, pausa_min: 10, motivo: 'Pausa maior que a registrada' }, eu), 'edit');
ok(Math.abs(ed.sessao.liquido_s - 30 * 60) <= 2, 'correção recalcula o líquido (30 min)');
const man = must(api('est.sessionManual', { inicio: new Date(Date.now() - 3 * 3600e3).toISOString(), minutos: 90, pausa_min: 10, assunto_id: crase.id, tipo: 'aula', op_key: 'man1' }, eu), 'manual');
ok(man.sessao.liquido_s === 80 * 60 && man.sessao.origem === 'manual', 'estudo externo lançado manualmente (80 min líquidos)');
r = api('est.sessionManual', { inicio: new Date(Date.now() + 3600e3).toISOString(), minutos: 30 }, eu);
ok(!r.ok, 'não aceita estudo no futuro');

// Foco → sessão (sem contar duas vezes)
setOff(60);
const tk = must(api('db.save', { table: 'tar_tarefas', row: { titulo: 'Estudar crase', est_disciplina_id: crase.disciplina_id, est_assunto_id: crase.id, est_tipo: 'teoria' } }, eu), 'tarefa est').row;
const foco = must(api('db.save', { table: 'tar_foco', row: { tarefa_id: tk.id, inicio: new Date(Date.now() - 25 * 60e3).toISOString(), duracao_s: 1500, tipo: 'pomodoro' } }, eu), 'foco').row;
const ff = must(api('est.fromFocus', { foco_id: foco.id }, eu), 'fromFocus');
ok(ff.sessao && ff.sessao.liquido_s === 1500 && ff.sessao.origem === 'foco', 'Pomodoro numa tarefa de estudo vira sessão');
ok(must(api('est.fromFocus', { foco_id: foco.id }, eu), 'ff2').repetido, 'o mesmo Pomodoro não gera duas sessões');

// questões: cadastro, validação, tentativa, gabarito, recálculo rastreável
r = api('est.questionSave', { tipo: 'multipla', enunciado: 'Assinale a correta.', alternativas_json: [{ letra: 'A', texto: 'x' }, { letra: 'B', texto: 'y' }], gabarito: 'D' }, eu);
ok(!r.ok && r.error.field === 'gabarito', 'gabarito fora das alternativas é recusado');
const q1 = must(api('est.questionSave', { tipo: 'multipla', enunciado: 'Sobre crase, assinale a correta.', alternativas_json: 'ABCDE'.split('').map((l) => ({ letra: l, texto: 'Alternativa ' + l })), gabarito: 'B', banca: 'FCC', ano: 2024, disciplina_id: crase.disciplina_id, assunto_id: crase.id }, eu), 'q1').questao;
ok(q1.codigo === 'Q1' && q1.gabarito_status === 'preliminar' && q1.versao === 1, 'questão Q1 criada com gabarito preliminar');
const q2 = must(api('est.questionSave', { tipo: 'certo_errado', enunciado: 'A crase é facultativa antes de pronome possessivo feminino.', gabarito: 'certo', disciplina_id: crase.disciplina_id, assunto_id: crase.id, banca: 'CEBRASPE' }, eu), 'q2').questao;
ok(q2.gabarito === 'C' && q2.alternativas_json.length === 2, 'certo/errado normaliza o gabarito');
let a1 = must(api('est.answer', { questao_id: q1.id, resposta: 'c', tempo_s: 40, confianca: 2, modo: 'treino', op_key: 'a1' }, eu), 'a1');
ok(a1.tentativa.resultado === 'errada' && a1.tentativa.primeira === true && a1.gabarito === 'B', 'tentativa errada, primeira, com gabarito usado');
ok(must(api('est.answer', { questao_id: q1.id, resposta: 'c', op_key: 'a1' }, eu), 'dup').repetido, 'mesma tentativa repetida não duplica (op_key)');
let a2 = must(api('est.answer', { questao_id: q1.id, resposta: 'B', op_key: 'a2' }, eu), 'a2');
ok(a2.tentativa.resultado === 'certa' && a2.tentativa.primeira === false, 'segunda tentativa: certa, marcada como repetição');
must(api('est.answer', { questao_id: q2.id, resposta: '', op_key: 'a3' }, eu), 'branco');
const bootR = must(api('boot', {}, eu), 'b6').tables.est_revisoes;
ok(bootR.some((x) => x.alvo_tipo === 'questao' && x.alvo_id === q1.id), 'questão errada entra na fila de revisão');
const gb = must(api('est.questionGabarito', { questao_id: q1.id, gabarito: 'C', status: 'definitivo', motivo: 'gabarito definitivo alterou', regra: 'atual' }, eu), 'gab');
ok(gb.recalculadas === 2 && gb.questao.gabarito_hist_json.length === 2, 'gabarito definitivo diferente: 2 tentativas recalculadas, histórico preservado');
eb = must(api('est.boot', {}, eu), 'boot7');
const t1 = eb.tables.est_tentativas.find((t) => t.op_key === 'a1');
ok(t1.resultado === 'errada' && t1.resultado_atual === 'certa' && t1.recalc_em, 'resultado original fica; o atual é recalculado com data');
must(api('est.questionGabarito', { questao_id: q1.id, status: 'anulada', motivo: 'anulada pela banca' }, eu), 'anula');
eb = must(api('est.boot', {}, eu), 'boot8');
ok(eb.tables.est_tentativas.filter((t) => t.questao_id === q1.id).every((t) => t.resultado_atual === 'anulada'), 'anulação recalcula como anulada');
const q1e = must(api('est.questionSave', { id: q1.id, enunciado: 'Sobre crase (texto revisado), assinale a correta.' }, eu), 'edit q').questao;
ok(q1e.versao === 2, 'editar o enunciado sobe a versão');
const vers = must(api('est.noteVersions', { entidade: 'questao', id: q1.id }, eu), 'versoes').versoes;
ok(vers.length === 1 && /Sobre crase, assinale/.test(vers[0].conteudo), 'versão anterior da questão guardada');
const err = must(api('est.errorFromAttempt', { questao_id: q2.id, causa: 'atencao' }, eu), 'erro');
const err2 = must(api('est.errorFromAttempt', { questao_id: q2.id }, eu), 'erro2');
ok(err.erro.status === 'aberta' && err2.recorrente && err2.erro.recorrencias === 2, 'caderno de erros detecta recorrência');

// importação (prévia, erros por linha, reimportação idempotente)
const rows = [
  { codigo: 'FCC-001', tipo: 'multipla', enunciado: 'Pergunta 1', a: 'um', b: 'dois', c: 'três', gabarito: 'A', banca: 'FCC', ano: 2023, disciplina: 'Língua Portuguesa', assunto: 'Crase' },
  { codigo: 'FCC-002', tipo: 'C/E', enunciado: 'Pergunta 2', gabarito: 'E', disciplina: 'Raciocínio Lógico', assunto: 'Proposições' },
  { codigo: 'FCC-003', tipo: 'multipla', enunciado: 'Pergunta 3', a: 'x', b: 'y', gabarito: 'D' },
  { codigo: 'FCC-001', tipo: 'multipla', enunciado: 'Repetida', a: '1', b: '2', gabarito: 'A' },
  { codigo: 'FCC-004', tipo: 'multipla', enunciado: '', a: '1', b: '2' }
];
let imp = must(api('est.importRows', { tabela: 'questoes', rows, dry: true }, eu), 'imp dry').previa;
ok(imp.novos === 2 && imp.total_erros === 3 && imp.erros.map((e) => e.linha).join() === '4,5,6' && imp.novas_disciplinas.includes('Raciocínio Lógico'), 'prévia da importação: 2 válidas, erros com número da linha');
r = api('est.importRows', { tabela: 'questoes', rows, dry: false }, eu);
ok(!r.ok, 'com erros, só importa se marcar "só as linhas válidas"');
imp = must(api('est.importRows', { tabela: 'questoes', rows, dry: false, ignorar_erros: true }, eu), 'imp');
ok(imp.inseridos === 2, 'importa as 2 válidas');
const rows2 = [Object.assign({}, rows[0], { enunciado: 'Pergunta 1 revisada', gabarito: 'B' }), rows[1]];
imp = must(api('est.importRows', { tabela: 'questoes', rows: rows2, dry: false }, eu), 'reimp');
eb = must(api('est.boot', {}, eu), 'boot9');
const fcc1 = eb.tables.est_questoes.filter((q) => q.codigo === 'FCC-001');
ok(imp.inseridos === 0 && imp.atualizados === 2 && fcc1.length === 1 && fcc1[0].enunciado === 'Pergunta 1 revisada' && fcc1[0].gabarito === 'B' && fcc1[0].versao === 2, 'reimportação atualiza pelo código, mantém o id, versiona e registra o gabarito novo');

// simulado: regras, anulada, brancos, mínimos, snapshot
for (let i = 0; i < 6; i++) must(api('est.questionSave', { tipo: 'multipla', enunciado: 'Simulado ' + i, alternativas_json: 'ABCD'.split('').map((l) => ({ letra: l, texto: l })), gabarito: 'A', gabarito_status: 'definitivo', disciplina_id: df.disciplina_id, assunto_id: df.id }, eu), 'qs' + i);
const sim = must(api('db.save', { table: 'est_simulados', row: { titulo: 'Simulado 1', concurso_id: conc.id, duracao_min: 60, regras_json: { acerto: 1, erro: -0.5, branco: 0, anulada: 'pontua', minimo_total: 2 }, composicao_json: { blocos: [{ nome: 'Constitucional', disciplina_id: df.disciplina_id, qtd: 4, peso: 2, minimo: 3 }] } } }, eu), 'sim').row;
r = api('est.simStart', { simulado_id: must(api('db.save', { table: 'est_simulados', row: { titulo: 'Grande', composicao_json: { blocos: [{ nome: 'X', disciplina_id: df.disciplina_id, qtd: 50 }] } } }, eu), 'sg').row.id }, eu);
ok(!r.ok && /pediu 50/.test(r.error.message), 'simulado avisa quando o banco não tem questões suficientes');
let st = must(api('est.simStart', { simulado_id: sim.id }, eu), 'simStart');
ok(st.itens.length === 4 && st.questoes.every((q) => !('gabarito' in q) && !('explicacao' in q)), 'prova montada: 4 questões, sem gabarito no navegador');
const st2 = must(api('est.simStart', { simulado_id: sim.id }, eu), 'retoma');
ok(st2.itens.map((i) => i.id).join() === st.itens.map((i) => i.id).join(), 'retomar devolve a mesma prova');
// anula uma das questões DEPOIS de começar: o simulado usa o snapshot
must(api('est.questionGabarito', { questao_id: st.itens[3].questao_id, status: 'anulada', motivo: 'teste' }, eu), 'anula pós');
const resp = {}; resp[st.itens[0].id] = { resposta: 'A', tempo_s: 30 }; resp[st.itens[1].id] = { resposta: 'B', tempo_s: 50, marcada: true }; resp[st.itens[2].id] = { resposta: '', tempo_s: 10 };
must(api('est.simSave', { simulado_id: sim.id, respostas: resp }, eu), 'save');
const fin = must(api('est.simFinish', { simulado_id: sim.id }, eu), 'finish');
const rj = fin.simulado.resultado_json, tot = rj.total;
// item0 certa +2, item1 errada −1, item2 branco 0, item3 resposta vazia → branco 0 (snapshot não estava anulada)
ok(tot.acertos === 1 && tot.erros === 1 && tot.brancos === 2 && tot.nota === 1 && tot.max === 8 && tot.pct === 12.5, 'nota com peso 2, erro −0,5 e brancos: 1 de 8 (12,5 %)');
ok(rj.blocos[0].atingiu_minimo === false && tot.atingiu_minimo_total === false && tot.aprovado_criterios === false, 'mínimos do bloco e total verificados');
ok(fin.gabaritos[st.itens[3].questao_id].status_atual === 'anulada' && fin.itens[3].status_snapshot !== 'anulada', 'anulação posterior não altera a prova histórica (snapshot), mas aparece como informação');
eb = must(api('est.boot', {}, eu), 'boot10');
ok(eb.tables.est_tentativas.filter((t) => t.simulado_id === sim.id).length === 4, 'tentativas do simulado entram no histórico (uma por questão)');
ok(must(api('est.simFinish', { simulado_id: sim.id }, eu), 'fin2').repetido, 'finalizar de novo não duplica');
// regra de anulada "pontua"
const sim2 = must(api('db.save', { table: 'est_simulados', row: { titulo: 'Com anulada', regras_json: { acerto: 1, erro: 0, anulada: 'pontua' }, composicao_json: { questao_ids: [st.itens[3].questao_id, st.itens[0].questao_id] } } }, eu), 'sim2').row;
const s2 = must(api('est.simStart', { simulado_id: sim2.id }, eu), 's2');
const f2 = must(api('est.simFinish', { simulado_id: sim2.id }, eu), 'f2').simulado.resultado_json.total;
ok(f2.anuladas === 1 && f2.nota === 1 && f2.max === 2, 'anulada "pontua para todos": conta como acerto');

// revisões e cartões
const revA = must(api('boot', {}, eu), 'b11').tables.est_revisoes.find((x) => x.alvo_tipo === 'assunto' && x.status === 'pendente');
const d1 = must(api('est.reviewDone', { id: revA.id, resultado: 'bom' }, eu), 'rev bom');
ok(d1.proxima.seq === 1 && d1.proxima.intervalo_dias === 7, 'revisão "bom": próxima em 7 dias (sequência 1, 7, 15…)');
const d2 = must(api('est.reviewDone', { id: d1.proxima.id, resultado: 'errei' }, eu), 'rev errei');
ok(d2.proxima.seq === 0 && d2.proxima.intervalo_dias === 1, 'revisão "errei": volta para 1 dia');
ok(must(api('est.reviewDone', { id: d1.proxima.id, resultado: 'bom' }, eu), 'rev dup').repetido, 'revisão já feita não reagenda de novo');
const card = must(api('db.save', { table: 'est_flashcards', row: { baralho: 'Português', frente: 'Crase antes de masculino?', verso: 'Não' } }, eu), 'card').row;
let ca = must(api('est.cardAnswer', { card_id: card.id, nota: 'bom', op_key: 'c1' }, eu), 'c1');
ok(ca.card.intervalo === 1 && ca.card.novo === false, 'cartão novo "bom": 1 dia');
ca = must(api('est.cardAnswer', { card_id: card.id, nota: 'bom', op_key: 'c2' }, eu), 'c2');
ok(ca.card.intervalo === 3, 'segunda "bom": 3 dias');
ca = must(api('est.cardAnswer', { card_id: card.id, nota: 'errei', op_key: 'c3' }, eu), 'c3');
ok(ca.card.intervalo === 1 && ca.card.lapsos === 1 && ca.card.facilidade < 2.5, '"errei": volta a 1 dia, conta lapso e reduz facilidade');
ok(must(api('est.cardAnswer', { card_id: card.id, nota: 'facil', op_key: 'c3' }, eu), 'c3dup').repetido, 'resposta de cartão idempotente');

// notas com versões e conflito
const n1 = must(api('est.noteSave', { titulo: 'Crase — regras', tipo: 'resumo', conteudo: 'Antes de palavra feminina…', assunto_id: crase.id }, eu), 'nota').nota;
const n2 = must(api('est.noteSave', { id: n1.id, conteudo: 'Antes de palavra feminina, com artigo.', base_versao: 1 }, eu), 'nota2').nota;
ok(n2.versao === 2, 'editar o conteúdo cria versão 2');
r = api('est.noteSave', { id: n1.id, conteudo: 'edição antiga', base_versao: 1 }, eu);
ok(!r.ok && r.error.code === 'CONFLICT' && r.error.data.atual.versao === 2, 'edição a partir de versão velha: CONFLICT (não sobrescreve)');

// discursiva com avaliação por critério
const dsc = must(api('est.discSave', { titulo: 'Redação 1', proposta: 'Tema X', criterios_json: [{ nome: 'Conteúdo', max: 10 }, { nome: 'Língua', max: 5 }], texto: 'Texto inicial' }, eu), 'disc').discursiva;
r = api('est.discSave', { id: dsc.id, avaliacao: { tipo: 'humana', notas: [11, 3] } }, eu);
ok(!r.ok, 'nota acima do máximo do critério é recusada');
const dav = must(api('est.discSave', { id: dsc.id, avaliacao: { tipo: 'autoavaliacao', notas: [7, 4], comentario: 'ok' } }, eu), 'aval').discursiva;
const drw = must(api('est.discSave', { id: dsc.id, texto: 'Texto reescrito' }, eu), 'reescrita').discursiva;
ok(dav.status === 'corrigida' && dav.avaliacoes_json[0].total === 11 && drw.versao === 2 && drw.status === 'reescrita', 'avaliação por critério e reescrita como nova versão');

// plano: sugestão explicável e aplicação idempotente
const plano = must(api('db.save', { table: 'est_planos', row: { nome: 'Plano TRT', concurso_id: conc.id, disponibilidade_json: { 0: 0, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 240 }, sessao_min: 50, pausa_min: 10, folga_pct: 15 } }, eu), 'plano').row;
const sug = must(api('est.planSuggest', { plano_id: plano.id, dias: 7 }, eu), 'sugest');
ok(sug.capacidade_semana_min === 840 && sug.capacidade_util_min === 714 && sug.distribuicao.length === 2 && sug.distribuicao.every((d) => d.f_dificuldade && d.f_pendencia && d.minutos_semana > 0), 'distribuição com fatores visíveis e capacidade com folga de 15 %');
ok(sug.cronograma.length > 0 && sug.cronograma.every((x) => x.data > c.Utils.today()) && /peso no edital/.test(sug.criterio), 'cronograma só no futuro e critério explicado');
const ap = must(api('est.planApply', { plano_id: plano.id, itens: sug.cronograma.slice(0, 5) }, eu), 'apply');
const ap2 = must(api('est.planApply', { plano_id: plano.id, itens: sug.cronograma.slice(0, 5) }, eu), 'apply2');
ok(ap.criadas === 5 && ap2.criadas === 0 && ap2.puladas === 5, 'aplicar o plano cria tarefas uma vez só (chave idempotente)');

// biblioteca: upload em partes, duplicata exata, leitura por faixas, anotações com revisão e conflito
const bytes = Buffer.alloc(5 * 1024 * 1024 + 12345, 7); bytes.write('%PDF-1.4', 0);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const upS = must(api('est.upStart', { nome: 'Constitucional.pdf', mime: 'application/pdf', tamanho: bytes.length, hash }, eu), 'upStart');
ok(upS.upload_id && upS.chunk === 2 * 1024 * 1024, 'envio aberto com partes de 2 MB');
let off = 0, last;
while (off < bytes.length) { const part = bytes.slice(off, off + upS.chunk); last = must(api('est.upChunk', { upload_id: upS.upload_id, offset: off, base64: part.toString('base64') }, eu), 'chunk ' + off); off += part.length; }
ok(last.concluido && last.arquivo.tamanho_bytes === bytes.length && last.arquivo.modulo === 'estudos', 'arquivo de 5 MB enviado em 3 partes');
const drvFile = G.files.get(last.arquivo.drive_id);
ok(drvFile && drvFile.blob.bytes.equals(bytes), 'conteúdo no Drive idêntico ao original');
r = api('est.upChunk', { upload_id: upS.upload_id, offset: 0, base64: 'AA==' }, eu);
ok(!r.ok, 'envio concluído não aceita mais partes');
const mat = must(api('est.materialSave', { titulo: 'Constitucional esquematizado', arquivo_id: last.arquivo.id, disciplina_id: df.disciplina_id, assunto_ids: df.id }, eu), 'mat').material;
ok(mat.codigo === 'M1' && mat.tipo === 'pdf' && mat.hash === hash, 'material M1 cadastrado com hash');
const dup = must(api('est.upStart', { nome: 'copia.pdf', mime: 'application/pdf', tamanho: bytes.length, hash }, eu), 'dup');
ok(dup.duplicado && dup.material.id === mat.id, 'duplicata exata detectada pelo hash (aponta para M1)');
const ch = must(api('est.fileChunk', { arquivo_id: last.arquivo.id, start: 2 * 1024 * 1024, len: 1024 }, eu), 'read');
ok(ch.total === bytes.length && Buffer.from(ch.base64, 'base64').length === 1024, 'leitura por faixa de bytes');
r = api('est.fileChunk', { arquivo_id: last.arquivo.id, start: 0, len: 10 }, ana);
ok(!r.ok && r.error.code === 'NOT_FOUND', 'outra pessoa não lê o arquivo');
let ag = must(api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, eu), 'annGet');
ok(ag.doc.revisao === 0 && Object.keys(ag.doc.paginas).length === 0, 'sem anotações ainda');
const ann = (id, tipo, extra) => Object.assign({ id, tipo, cor: '#F2B705', opacidade: 0.4 }, extra);
let sv = must(api('est.annSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, base_revs: {}, paginas: { 1: [ann('a1', 'marca', { rects: [[10, 20, 100, 30]], trecho: 'direitos e garantias' }), ann('a2', 'texto', { rect: [50, 50, 200, 80], texto: 'Atenção: cláusula pétrea', fonte: 12 })] }, op_id: 'op1' }, eu), 'save1');
ok(sv.revisao === 1 && sv.revs['1'] === 1, 'anotações salvas: revisão 1');
ok(must(api('est.annSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, base_revs: {}, paginas: { 1: [] }, op_id: 'op1' }, eu), 'dup op').repetido, 'mesmo envio repetido (op_id) não grava duas vezes');
r = api('est.annSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, base_revs: { 1: 0 }, paginas: { 1: [ann('b1', 'caneta', { pts: [1, 2, 3, 4] })] }, op_id: 'op2' }, eu);
ok(!r.ok && r.error.code === 'CONFLICT' && r.error.data.conflitos['1'].itens.length === 2, 'outro aparelho com revisão antiga: CONFLICT com as anotações do servidor');
sv = must(api('est.annSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, base_revs: { 1: 1, 3: 0 }, paginas: { 1: [ann('a1', 'marca', { rects: [[10, 20, 100, 30]] }), ann('b1', 'caneta', { pts: [1, 2, 3, 4], espessura: 3 })], 3: [ann('c1', 'comentario', { rect: [5, 5, 20, 20], texto: 'Dúvida aqui' })] }, favoritos: { base_rev: 0, lista: [{ pagina: 3, titulo: 'Remédios constitucionais' }] }, op_id: 'op3' }, eu), 'save2');
ok(sv.revisao === 2 && sv.revs['1'] === 2 && sv.revs['3'] === 1, 'segunda gravação: revisão por página');
ag = must(api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, eu), 'annGet2');
ok(ag.doc.formato === 'prumo-anotacoes' && ag.doc.versao_formato === 1 && ag.doc.paginas['1'].itens[1].pts.length === 4 && ag.doc.favoritos[0].titulo === 'Remédios constitucionais', 'JSON versionado no Drive com geometria e favoritos');
ok(ag.indice.total === 3 && ag.indice.revisao === 2, 'índice na planilha (total de marcações e revisão)');
r = api('est.annSave', { material_id: mat.id, arquivo_id: 'outro', base_revs: {}, paginas: {} }, eu);
ok(!r.ok, 'anotação precisa da versão certa do original');
r = api('est.annGet', { material_id: mat.id, arquivo_id: mat.arquivo_id }, ana);
ok(!r.ok, 'outra pessoa não vê as anotações');
// texto extraído
must(api('est.textSave', { material_id: mat.id, arquivo_id: mat.arquivo_id, paginas: { 1: 'Dos direitos e garantias fundamentais. Art. 5º', 2: '' }, total: 3 }, eu), 'text');
const tx = must(api('est.textGet', { material_id: mat.id, paginas: '1-2' }, eu), 'textget');
ok(tx.disponivel && /garantias/.test(tx.paginas['1']) && tx.sem_texto.includes(2), 'texto por página guardado; páginas sem texto identificadas');
// exportação: revisão exata
r = api('est.exportRegister', { material_id: mat.id, arquivo_id: last.arquivo.id, revisao: 5 }, eu);
ok(!r.ok, 'não registra exportação de revisão que não existe no servidor');
const exp = must(api('est.exportRegister', { material_id: mat.id, arquivo_id: last.arquivo.id, revisao: 2 }, eu), 'exp');
ok(exp.atual === true && exp.exportacao.revisao === 2, 'exportação registrada com a revisão 2 (atual)');
// leitura
const lt = must(api('est.readingSave', { material_id: mat.id, pagina: 3, total_paginas: 3, marcar_lidas: '1-2' }, eu), 'leitura').leitura;
ok(lt.pagina === 3 && lt.paginas_lidas === '1-2', 'posição e páginas lidas guardadas');
must(api('est.readingSave', { material_id: mat.id, marcar_lidas: '3' }, eu), 'leitura2');
eb = must(api('est.boot', {}, eu), 'boot12');
ok(eb.tables.est_materiais.find((m) => m.id === mat.id).situacao === 'concluido', 'todas as páginas lidas: material concluído');
// nova versão sem migrar anotações
const up2 = must(api('est.upStart', { nome: 'v2.pdf', mime: 'application/pdf', tamanho: 10, hash: 'b'.repeat(64) }, eu), 'up2');
const l2 = must(api('est.upChunk', { upload_id: up2.upload_id, offset: 0, base64: Buffer.from('%PDF-1.4 x').toString('base64') }, eu), 'c2');
const nv = must(api('est.materialVersion', { material_id: mat.id, arquivo_id: l2.arquivo.id }, eu), 'nv');
ok(nv.material.versao === 2 && nv.material.versao_de === mat.id && nv.material.codigo === 'M2', 'nova versão do material (M2, v2)');
ag = must(api('est.annGet', { material_id: nv.material.id, arquivo_id: l2.arquivo.id }, eu), 'ann v2');
ok(ag.doc.revisao === 0, 'anotações da versão antiga não são deslocadas para a nova');

// isolamento entre usuários
r = api('est.sessionStart', { assunto_id: crase.id }, ana);
ok(!r.ok && r.error.code === 'NOT_FOUND', 'ana não usa assunto de outra pessoa');
r = api('est.answer', { questao_id: q2.id, resposta: 'C' }, ana);
ok(!r.ok, 'ana não responde questão de outra pessoa');
ok(must(api('est.boot', {}, ana), 'boot ana').tables.est_questoes.length === 0, 'ana não vê questões de outra pessoa');

// métricas e relatórios
const S = must(api('est.stats', { de: c.Utils.addDays(c.Utils.today(), -30) }, eu), 'stats');
ok(S.tempo.sessoes >= 3 && S.tempo.total_s > 0 && S.tempo.por_tipo.teoria > 0, 'tempo líquido por tipo');
ok(S.questoes.geral.total >= 8 && S.questoes.geral.respondidas === S.questoes.geral.certas + S.questoes.geral.erradas && S.questoes.geral.amostra_pequena === true, 'questões: respondidas = certas + erradas; amostra pequena sinalizada');
ok(S.questoes.primeira.total + S.questoes.repeticoes.total === S.questoes.geral.total, 'primeira tentativa × repetições');
ok(S.revisoes.feitas === 2 && S.cobertura.total === 4, 'revisões feitas e cobertura no relatório');
const vazio = must(api('est.stats', {}, ana), 'stats vazio');
ok(vazio.questoes.geral.precisao === null && vazio.plano.pct === null && vazio.cobertura.pct === null, 'sem dados: indicadores nulos (não 0 % inventado)');
const rep = must(api('est.report', { formato: 'pdf', de: c.Utils.addDays(c.Utils.today(), -7) }, eu), 'pdf');
ok(rep.arquivo && rep.arquivo.mime === 'application/pdf' && G.createdDocs.length && G.createdDocs[G.createdDocs.length - 1].trashed, 'relatório em PDF gerado no servidor (Docs temporário apagado)');
const csv = must(api('est.report', { formato: 'csv' }, eu), 'csv');
ok(/estudos_.*\.csv/.test(csv.arquivo.nome), 'relatório CSV');
// metas automáticas
const meta = must(api('db.save', { table: 'met_metas', row: { titulo: '20 h de estudo', medicao: 'automatica', origem_metrica: 'est_horas', valor_alvo: 20, data_inicio: c.Utils.addDays(c.Utils.today(), -10) } }, eu), 'meta').row;
c.Auth.as('voce@exemplo.com'); const v = c.Goals.currentValue(c.Db.table('met_metas').get(meta.id)); c.Auth.as(null);
ok(v > 2 && v < 4, 'meta de horas de estudo medida pelas sessões (' + v + ' h), sem somar o Foco duas vezes');

// migração repetida preserva dados
G.resetMemo(); c.setup();
ok(must(api('est.boot', {}, eu), 'boot final').tables.est_questoes.length >= 10, 'rodar setup de novo não apaga dados');

// edição pelo app: só a situação do gabarito muda (preliminar → definitivo) e exclusão com desfazer
{
  const q = must(api('est.questionSave', { tipo: 'certo_errado', enunciado: 'Teste de situação do gabarito.', gabarito: 'E' }, eu), 'q sit').questao;
  ok(q.gabarito_status === 'preliminar', 'questão nova com gabarito nasce preliminar');
  const q2b = must(api('est.questionSave', { id: q.id, gabarito: 'E', gabarito_status: 'definitivo', motivo: 'gabarito definitivo publicado' }, eu), 'q sit2').questao;
  ok(q2b.gabarito_status === 'definitivo' && q2b.gabarito_hist_json.length === 2 && q2b.gabarito_hist_json[1].motivo === 'gabarito definitivo publicado', 'mudar só a situação (preliminar → definitivo) registra no histórico');
  must(api('est.questionDelete', { id: q.id }, eu), 'del q');
  ok(!must(api('est.boot', {}, eu), 'b del').tables.est_questoes.some((x) => x.id === q.id), 'excluir questão some do banco');
  ok(!api('est.questionDelete', { id: q.id }, ana).ok, 'outra pessoa não exclui a questão');
  must(api('est.questionRestore', { id: q.id }, eu), 'restore q');
  ok(must(api('est.boot', {}, eu), 'b res').tables.est_questoes.some((x) => x.id === q.id), 'desfazer a exclusão devolve a questão');
  ok(!api('est.questionRestore', { id: q.id }, ana).ok, 'outra pessoa não restaura a questão alheia');
}
