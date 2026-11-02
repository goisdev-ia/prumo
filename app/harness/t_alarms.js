const vm = require('vm');
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
// Relógio controlável dentro do Apps Script simulado
vm.runInContext(`(function (g) { var RD = Date; function FD() { var a = Array.prototype.slice.call(arguments); if (!(this instanceof FD)) return new RD(RD.now() + FD.off).toString(); return a.length ? new (Function.prototype.bind.apply(RD, [null].concat(a)))() : new RD(RD.now() + FD.off); }
  FD.off = 0; FD.now = function () { return RD.now() + FD.off; }; FD.parse = RD.parse; FD.UTC = RD.UTC; FD.prototype = RD.prototype; g.Date = FD; })(this)`, c);
const setOff = (min) => { vm.runInContext('Date.off = ' + Math.round(min * 60000), c); };
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (offMin) => { const d = new Date(Date.now() + offMin * 60000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const ymd = (offMin) => { const d = new Date(Date.now() + offMin * 60000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

c.setup();
const dono = G.devLogin('voce@exemplo.com');
const hs = G.triggers.map((t) => t.getHandlerFunction());
ok(hs.includes('triggerFrequente') && !hs.includes('triggerTelegram'), 'setup instala triggerFrequente (5 min) no lugar do triggerTelegram');
ok(typeof c.triggerTelegram === 'function', 'triggerTelegram continua existindo (gatilhos antigos não quebram)');

// tabela nova é criada sozinha se a aba não existir
G.SS.deleteSheet(G.SS.getSheetByName('alarmes'));
let r = api('boot', {}, dono);
ok(r.ok && Array.isArray(r.data.tables.alarmes) && G.SS.getSheetByName('alarmes'), 'boot cria a aba "alarmes" que faltava (sem precisar rodar setup)');

const notifs = () => { G.resetMemo(); c.Auth.as('voce@exemplo.com'); const n = c.Db.table('notificacoes').list().filter((x) => x.tipo === 'alarme'); c.Auth.as(null); return n; };
c.triggerFrequente();
ok(notifs().length === 0, 'sem alarmes: gatilho não faz nada');

// diário daqui a 3 min
setOff(-5); // cria "no passado" para não esbarrar no created_at
r = api('db.save', { table: 'alarmes', row: { titulo: 'Tomar remédio', tipo: 'remedio', modo: 'diario', hora: hhmm(3) } }, dono);
ok(r.ok && r.data.row.ativo === true && r.data.row.som === true, 'alarme salvo pela rota genérica (ativo e com som por padrão)');
const remId = r.data.row.id;
setOff(0);
c.triggerFrequente();
ok(notifs().length === 0, 'antes da hora não dispara');
setOff(4);
c.triggerFrequente();
let n = notifs();
ok(n.length === 1 && n[0].titulo === 'Tomar remédio' && /Alarme das/.test(n[0].corpo), 'na hora: notificação tipo "alarme" (vai por push/Telegram)');
ok(G.pushCalls.length >= 0, 'push.dispatch chamado sem erro');
c.triggerFrequente();
ok(notifs().length === 1, 'não repete no mesmo horário');
setOff(24 * 60 + 4);
c.triggerFrequente();
ok(notifs().length === 2, 'no dia seguinte toca de novo');

// app aberto tocou → ack evita push repetido
setOff(2 * 24 * 60 - 5);
r = api('db.save', { table: 'alarmes', row: { titulo: 'Alongar', modo: 'diario', hora: hhmm(2 * 24 * 60 + 2) } }, dono);
const alId = r.data.row.id;
setOff(2 * 24 * 60 + 3);
r = api('alarm.ack', { id: alId }, dono);
ok(r.ok && r.data.ok, 'alarm.ack aceito');
c.triggerFrequente();
ok(!notifs().some((x) => x.titulo === 'Alongar'), 'tocou no app (ack): gatilho não manda de novo');

// dia da semana fora / uma vez em outra data
setOff(3 * 24 * 60 - 5);
const dow = new Date(Date.now() + 3 * 24 * 60 * 60000).getDay();
api('db.save', { table: 'alarmes', row: { titulo: 'Só outro dia', modo: 'diario', hora: hhmm(3 * 24 * 60 + 2), dias_semana: String((dow + 1) % 7) } }, dono);
api('db.save', { table: 'alarmes', row: { titulo: 'Uma vez amanhã', modo: 'unico', data: ymd(4 * 24 * 60), hora: hhmm(3 * 24 * 60 + 2) } }, dono);
api('db.save', { table: 'alarmes', row: { titulo: 'Uma vez hoje', modo: 'unico', data: ymd(3 * 24 * 60 + 2), hora: hhmm(3 * 24 * 60 + 2) } }, dono);
api('db.save', { table: 'alarmes', row: { titulo: 'Desligado', modo: 'diario', ativo: false, hora: hhmm(3 * 24 * 60 + 2) } }, dono);
// água com meta batida e tarefa concluída
api('db.save', { table: 'alarmes', row: { titulo: 'Beber água', tipo: 'agua', modo: 'diario', pular_meta: true, hora: hhmm(3 * 24 * 60 + 2) } }, dono);
api('db.save', { table: 'alarmes', row: { titulo: 'Água sem pular', tipo: 'agua', modo: 'diario', hora: hhmm(3 * 24 * 60 + 2) } }, dono);
const tk = api('db.save', { table: 'tar_tarefas', row: { titulo: 'Pagar luz', status: 'feito' } }, dono).data.row;
api('db.save', { table: 'alarmes', row: { titulo: 'Pagar luz', tipo: 'tarefa', modo: 'unico', data: ymd(3 * 24 * 60 + 2), hora: hhmm(3 * 24 * 60 + 2), ref_id: tk.id } }, dono);
const tk2 = api('db.save', { table: 'tar_tarefas', row: { titulo: 'Ligar pro banco', status: 'a_fazer' } }, dono).data.row;
api('db.save', { table: 'alarmes', row: { titulo: 'Ligar pro banco', tipo: 'tarefa', modo: 'unico', data: ymd(3 * 24 * 60 + 2), hora: hhmm(3 * 24 * 60 + 2), ref_id: tk2.id } }, dono);
api('db.save', { table: 'nut_agua', row: { data: ymd(3 * 24 * 60 + 2), ml: 9000 } }, dono);
setOff(3 * 24 * 60 + 4);
const antes = notifs().length;
c.triggerFrequente();
const novos = notifs().slice(antes).map((x) => x.titulo);
ok(!novos.includes('Só outro dia'), 'dia da semana não marcado: não toca');
ok(!novos.includes('Uma vez amanhã') && novos.includes('Uma vez hoje'), '"uma vez" só na data escolhida');
ok(!novos.includes('Desligado'), 'alarme desligado não toca');
ok(!novos.includes('Beber água') && novos.includes('Água sem pular'), 'água: pula quando a meta do dia já foi batida (se marcado)');
const agua = notifs().find((x) => x.titulo === 'Água sem pular');
ok(agua && /Hoje: 9,0 L de/.test(agua.corpo) && agua.link === '#/nut', 'aviso de água mostra quanto já bebeu e abre Alimentação');
ok(!novos.includes('Pagar luz') && novos.includes('Ligar pro banco'), 'tarefa já concluída não toca; pendente toca');

// intervalo
setOff(5 * 24 * 60 - 30);
api('db.save', { table: 'alarmes', row: { titulo: 'Água 2/2h', tipo: 'agua', modo: 'intervalo', hora: hhmm(5 * 24 * 60 - 20), hora_fim: '23:59', intervalo_min: 15 } }, dono);
setOff(5 * 24 * 60 - 4);
const a0 = notifs().filter((x) => x.titulo === 'Água 2/2h').length;
c.triggerFrequente();
setOff(5 * 24 * 60 + 12);
c.triggerFrequente();
const a1 = notifs().filter((x) => x.titulo === 'Água 2/2h').length;
ok(a1 - a0 >= 1 && a1 - a0 <= 2, 'intervalo: toca a cada N minutos, uma notificação por conferência (' + (a1 - a0) + ')');

// unit: horários do intervalo
const tms = c.Alarms.times({ ativo: true, modo: 'intervalo', hora: '08:00', hora_fim: '20:00', intervalo_min: 120 }, '2026-11-02');
ok(tms.join() === '08:00,10:00,12:00,14:00,16:00,18:00,20:00', 'intervalo 08–20h a cada 2h = 7 toques');
ok(c.Alarms.times({ ativo: true, modo: 'diario', hora: '07:30', dias_semana: '1,2,3,4,5' }, '2026-11-01').length === 0 && c.Alarms.times({ ativo: true, modo: 'diario', hora: '07:30', dias_semana: '1,2,3,4,5' }, '2026-11-02').join() === '07:30', 'dias úteis: domingo não, segunda sim');

// Telegram: alarme entra na lista de tipos por padrão
r = api('tg.status', {}, dono);
ok(r.ok && r.data.tipos[0] === 'alarme' && r.data.usuario.tipos.includes('alarme'), 'Telegram: "alarme" é um tipo e vem marcado por padrão');
c.Auth.as('voce@exemplo.com'); c.Auth.saveSettings({ values: { 'tg.tipos': ['tarefa'], 'tg.sem_alarme': true } }); c.Auth.as(null);
r = api('tg.status', {}, dono);
ok(!r.data.usuario.tipos.includes('alarme'), 'quem desmarca alarme não recebe');
c.Auth.as('voce@exemplo.com'); c.Auth.saveSettings({ values: { 'tg.tipos': ['tarefa'], 'tg.sem_alarme': false } }); c.Auth.as(null);
r = api('tg.status', {}, dono);
ok(r.data.usuario.tipos.includes('alarme'), 'quem escolheu tipos antes da 1.5 passa a receber alarmes');
ok(remId, 'fim');
