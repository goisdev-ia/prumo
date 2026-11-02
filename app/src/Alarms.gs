/**
 * Alarmes (tarefas, água, refeições, remédios e livres).
 *
 * Dois caminhos tocam o mesmo alarme:
 *  - Com o app aberto: o navegador confere a cada 15 s e toca na hora (som, vibração e tela cheia).
 *    Ao tocar, avisa o servidor (alarm.ack) para não mandar push/Telegram repetido.
 *  - Com o app fechado: o gatilho triggerFrequente (a cada 5 min) cria uma notificação do tipo
 *    "alarme", que sai por push no celular e, se a pessoa autorizou, pelo Telegram.
 *    Atraso máximo nesse caminho: ~5 min (limite do Apps Script gratuito).
 *
 * Modos: unico (data + hora), diario (hora, nos dias escolhidos) e intervalo (de hora até hora_fim,
 * a cada intervalo_min, nos dias escolhidos). dias_semana usa 0 = domingo … 6 = sábado (vazio = todos).
 */
function triggerFrequente() {
  try { Telegram.poll_(); } catch (e) { console.error('Telegram poll', e); }
  var alarmes = false, jobs = false;
  try { alarmes = Alarms.anyActive_(); } catch (e) { console.error('alarmes', e); }
  try { jobs = StudyTelegram.anyPending_(); } catch (e) { console.error('jobs', e); }
  Triggers.run_('frequente', function () {
    if (alarmes) {
      var n = Alarms.fire();
      if (n) { try { Push.dispatch(); } catch (e) { AppLog.error('push', 'alarme', e); } Triggers.tg_(); }
    }
    if (jobs) { try { StudyTelegram.processJobs(); } catch (e) { AppLog.error('estudos', 'fila', e); } }
    try { StudyTelegram.notices(); } catch (e) { AppLog.error('estudos', 'avisos', e); }
  });
}

var Alarms = (function () {
  var JANELA_MIN = 10;

  function hm_(s) { var p = String(s || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  function pad_(n) { return (n < 10 ? '0' : '') + n; }
  function fmtHm_(m) { return pad_(Math.floor(m / 60)) + ':' + pad_(m % 60); }

  /** Horários (HH:mm) em que o alarme toca na data (yyyy-MM-dd). */
  function times(a, date) {
    if (!a || a.ativo === false || !a.hora) return [];
    if (a.modo === 'unico') return a.data === date ? [String(a.hora).slice(0, 5)] : [];
    var dias = String(a.dias_semana || '').split(',').filter(function (x) { return x !== ''; });
    if (dias.length && dias.indexOf(String(Utils.parseDate(date).getDay())) < 0) return [];
    if (a.modo !== 'intervalo') return [String(a.hora).slice(0, 5)];
    var ini = hm_(a.hora), fim = a.hora_fim ? hm_(a.hora_fim) : 22 * 60, passo = Math.max(15, Number(a.intervalo_min) || 120), out = [];
    for (var m = ini; m <= fim && m < 1440 && out.length < 96; m += passo) out.push(fmtHm_(m));
    return out;
  }

  function key_(d) { return Utils.fmt(d, 'yyyy-MM-dd HH:mm:ss'); }

  /** Há algum alarme ativo de qualquer usuário? (leitura barata, evita rodar o gatilho à toa) */
  function anyActive_() {
    var sh = Db.ss().getSheetByName('alarmes');
    if (!sh || sh.getLastRow() < 2) return false;
    var v = sh.getDataRange().getValues(), head = v[0].map(String), ia = head.indexOf('ativo'), id = head.indexOf('deleted_at');
    for (var i = 1; i < v.length; i++) if (!v[i][id] && (v[i][ia] === true || String(v[i][ia]).toUpperCase() === 'TRUE')) return true;
    return false;
  }

  function texto_(a, hora) {
    var t = a.titulo || 'Alarme';
    switch (a.tipo) {
      case 'agua': {
        var feito = Nutrition.waterToday(), meta = Nutrition.waterGoal();
        return { titulo: t || 'Hora de beber água', corpo: 'Hoje: ' + (feito / 1000).toFixed(1).replace('.', ',') + ' L de ' + (meta / 1000).toFixed(1).replace('.', ',') + ' L', link: '#/nut' };
      }
      case 'refeicao': return { titulo: t, corpo: 'Alarme das ' + hora + (a.observacao ? ' · ' + a.observacao : ''), link: '#/nut' };
      case 'tarefa': return { titulo: t, corpo: 'Tarefa · ' + hora + (a.observacao ? ' · ' + a.observacao : ''), link: '#/tar' };
      default: return { titulo: t, corpo: 'Alarme das ' + hora + (a.observacao ? ' · ' + a.observacao : ''), link: '#/tar/alarmes' };
    }
  }

  /** Motivo para não tocar agora (tarefa concluída, meta de água batida). */
  function skip_(a) {
    if (a.tipo === 'tarefa' && a.ref_id) {
      var tk = Db.table('tar_tarefas').get(a.ref_id);
      if (!tk || tk.deleted_at || tk.status === 'feito' || tk.status === 'cancelada') return 'tarefa_encerrada';
    }
    if (a.tipo === 'agua' && a.pular_meta && Nutrition.waterToday() >= Nutrition.waterGoal()) return 'meta_agua';
    return '';
  }

  /** Cria as notificações dos alarmes que venceram desde a última conferência. Devolve quantas criou. */
  function fire() {
    var t = Db.table('alarmes'), lista = t.list().filter(function (a) { return a.ativo !== false; });
    if (!lista.length) return 0;
    var agora = new Date(), agoraKey = key_(agora), minKey = key_(new Date(agora.getTime() - JANELA_MIN * 60000));
    var dias = [Utils.fmt(new Date(agora.getTime() - JANELA_MIN * 60000)), Utils.fmt(agora)].filter(function (d, i, arr) { return arr.indexOf(d) === i; });
    var notifs = [], marcar = [];
    lista.forEach(function (a) {
      var desde = minKey;
      [a.ultimo_disparo, a.created_at].forEach(function (iso) { if (!iso) return; var d = new Date(iso); if (!isNaN(d) && key_(d) > desde) desde = key_(d); });
      var occ = [];
      dias.forEach(function (d) { times(a, d).forEach(function (h) { var k = d + ' ' + h + ':00'; if (k > desde && k <= agoraKey) occ.push(k); }); });
      if (!occ.length) return;
      occ.sort();
      marcar.push(a.id);
      if (skip_(a)) return;
      var hora = occ[occ.length - 1].slice(11, 16), tx = texto_(a, hora);
      notifs.push({ tipo: 'alarme', titulo: tx.titulo, corpo: tx.corpo, link: tx.link, data_ref: Utils.today(), lida: false });
    });
    var now = Utils.nowIso();
    marcar.forEach(function (id) { try { t.update(id, { ultimo_disparo: now }, { silent: true }); } catch (e) { /* removido no meio */ } });
    if (notifs.length) Db.table('notificacoes').insertMany(notifs, { silent: true });
    return notifs.length;
  }

  /** Rota: o app tocou o alarme na tela; marca para o gatilho não repetir por push/Telegram. @param {{id:string}} p */
  function ack(p) {
    if (!p || !p.id) throw Utils.error('VALIDATION', 'Alarme não informado.');
    var a = Db.table('alarmes').get(p.id);
    if (!a || a.deleted_at) return { ok: false };
    Db.table('alarmes').update(p.id, { ultimo_disparo: Utils.nowIso() }, { silent: true });
    return { ok: true };
  }

  return { times: times, fire: fire, ack: ack, anyActive_: anyActive_ };
})();
