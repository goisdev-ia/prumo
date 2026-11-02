/**
 * Central de notificações (aba notificacoes) e resumo diário por e-mail.
 */
var Notifications = (function () {
  /** Moldura HTML de e-mail com a paleta do app (estilos inline, compatível com clientes de e-mail). */
  function wrap(title, inner) {
    return '<div style="background:#FFF3D6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #f0e3c0">' +
      '<div style="background:#1A1A1A;color:#FFF3D6;padding:18px 22px;font-size:15px"><span style="color:#F2B705;font-weight:800">Prumo</span> · ' + Utils.escapeHtml(title) + '</div>' +
      '<div style="padding:22px;color:#1A1A1A;font-size:14px;line-height:1.5">' + inner + '</div>' +
      '<div style="padding:12px 22px;color:#8a8a8a;font-size:12px;border-top:1px solid #f3ead4">Enviado automaticamente pelo Prumo. Ajuste em Configurações › Notificações.</div>' +
      '</div></div>';
  }

  function section_(title, items) {
    if (!items.length) return '';
    return '<p style="margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9A6F00;font-weight:700">' + Utils.escapeHtml(title) + '</p>' +
      '<table style="width:100%;border-collapse:collapse">' + items.map(function (it) {
        return '<tr><td style="padding:7px 0;border-bottom:1px solid #f3ead4">' + Utils.escapeHtml(it[0]) + '</td><td style="padding:7px 0;border-bottom:1px solid #f3ead4;text-align:right;color:#3A3A3A;white-space:nowrap">' + Utils.escapeHtml(it[1] || '') + '</td></tr>';
      }).join('') + '</table>';
  }

  /** Dados do dia: tarefas, contas a vencer, treino, rotinas e metas em risco. */
  function todayData_() {
    var hoje = Utils.today(), em3 = Utils.addDays(hoje, 3);
    var tarefas = Db.table('tar_tarefas').list().filter(function (t) { return t.status !== 'feito' && t.status !== 'cancelada' && t.data_vencimento && t.data_vencimento <= hoje; })
      .sort(function (a, b) { return (a.prioridade || 3) - (b.prioridade || 3); });
    var contas = Db.table('fin_lancamentos').list().filter(function (l) { return l.status !== 'pago' && l.tipo === 'despesa' && l.data <= em3; });
    var faturas = Db.table('fin_faturas').list().filter(function (f) { return f.status !== 'paga' && f.data_vencimento && f.data_vencimento <= em3 && f.data_vencimento >= Utils.addDays(hoje, -10) && f.valor_total > 0; });
    var dow = String(Utils.parseDate(hoje).getDay());
    var treinos = Db.table('fit_treinos').list({ where: { ativo: true } }).filter(function (t) { return String(t.dias_semana || '').split(',').indexOf(dow) >= 0; });
    var rotinas = Routines.forDate(hoje);
    var risco = Goals.atRisk();
    return { hoje: hoje, tarefas: tarefas, contas: contas, faturas: faturas, treinos: treinos, rotinas: rotinas, risco: risco };
  }

  /** Cria notificações no app (sem duplicar por tipo+link+data). */
  function generate() {
    var d = todayData_(), t = Db.table('notificacoes');
    var existing = {};
    t.list().forEach(function (n) { existing[n.tipo + '|' + n.link + '|' + n.data_ref] = 1; });
    var rows = [];
    function add(tipo, titulo, corpo, link, ref) {
      var k = tipo + '|' + link + '|' + ref;
      if (existing[k]) return; existing[k] = 1;
      rows.push({ tipo: tipo, titulo: titulo, corpo: corpo, link: link, data_ref: ref, lida: false });
    }
    d.contas.forEach(function (l) { add('conta', l.data < d.hoje ? 'Conta vencida: ' + l.descricao : 'Vence em breve: ' + l.descricao, Utils.money(l.valor) + ' · ' + Utils.brDate(l.data), '#/fin/lancamentos?id=' + l.id, l.data); });
    d.faturas.forEach(function (f) {
      var c = Db.table('fin_cartoes').get(f.cartao_id);
      add('fatura', 'Fatura ' + (c ? c.nome : '') + ' vence ' + Utils.brDate(f.data_vencimento), Utils.money(f.valor_total), '#/fin/cartoes?fatura=' + f.id, f.data_vencimento);
    });
    var atrasadas = d.tarefas.filter(function (x) { return x.data_vencimento < d.hoje; });
    if (atrasadas.length) add('tarefa', atrasadas.length + ' tarefa(s) atrasada(s)', atrasadas.slice(0, 3).map(function (x) { return x.titulo; }).join(' · '), '#/tar/pendencias', d.hoje);
    d.risco.forEach(function (r) { add('meta', 'Meta ' + (r.ritmo === 'atrasada' ? 'atrasada' : 'pede atenção') + ': ' + r.meta.titulo, Math.round(r.progresso) + '% concluído', '#/met/meta/' + r.meta.id, d.hoje); });
    if (rows.length) t.insertMany(rows, { silent: true });
    return rows.length;
  }

  /** Envia o resumo do dia por e-mail (se houver algo a dizer). */
  function sendDigest() {
    if (Auth.setting('notif.email', true) === false || Auth.setting('notif.resumo', true) === false) return false;
    var d = todayData_();
    var html = '';
    html += section_('Tarefas de hoje e atrasadas', d.tarefas.slice(0, 10).map(function (t) { return [t.titulo, t.data_vencimento < d.hoje ? 'atrasada' : (t.hora || 'hoje')]; }));
    html += section_('Contas a vencer', d.contas.slice(0, 10).map(function (l) { return [l.descricao, Utils.money(l.valor) + ' · ' + Utils.brDate(l.data)]; })
      .concat(d.faturas.map(function (f) { return ['Fatura do cartão', Utils.money(f.valor_total) + ' · ' + Utils.brDate(f.data_vencimento)]; })));
    html += section_('Treino planejado', d.treinos.map(function (t) { return [t.nome, (t.duracao_estimada_min || 60) + ' min']; }));
    html += section_('Rotinas do dia', d.rotinas.slice(0, 10).map(function (r) { return [r.titulo, r.hora_inicio || '']; }));
    html += section_('Metas que pedem atenção', d.risco.map(function (r) { return [r.meta.titulo, Math.round(r.progresso) + '%']; }));
    if (!html) return false;
    var prof = Auth.profile();
    var hello = '<p style="margin:0;font-size:20px;font-weight:700">Bom dia, ' + Utils.escapeHtml(String(prof.nome || '').split(' ')[0]) + '</p><p style="margin:4px 0 0;color:#6b6b6b">' + Utils.fmt(new Date(), 'dd/MM/yyyy') + '</p>';
    MailApp.sendEmail({ to: Auth.email(), subject: 'Seu dia no Prumo · ' + Utils.fmt(new Date(), 'dd/MM'), htmlBody: wrap('Resumo do dia', hello + html), name: CONFIG.APP_NAME });
    return true;
  }

  /**
   * Avisos com hora marcada (gatilho de 15 min): rotinas que começam agora e eventos com lembrete.
   * Viram notificações no app e, com o push ativo, no celular.
   */
  function soon() {
    var now = new Date(), hoje = Utils.today(), t = Db.table('notificacoes'), rows = [], existing = {};
    t.list().forEach(function (n) { existing[n.tipo + '|' + n.link + '|' + n.data_ref] = 1; });
    function add(tipo, titulo, corpo, link, ref) {
      var k = tipo + '|' + link + '|' + ref;
      if (existing[k]) return; existing[k] = 1;
      rows.push({ tipo: tipo, titulo: titulo, corpo: corpo, link: link, data_ref: ref, lida: false });
    }
    if (Auth.setting('notif.rotinas', true) !== false) {
      var feitas = {};
      Db.table('rot_execucoes').list().forEach(function (x) { if (x.data === hoje) feitas[x.rotina_id] = 1; });
      Routines.forDate(hoje).forEach(function (r) {
        if (!r.hora_inicio || feitas[r.id]) return;
        var hm = String(r.hora_inicio).split(':'), at = new Date(now); at.setHours(Number(hm[0]) || 0, Number(hm[1]) || 0, 0, 0);
        var diff = (at - now) / 60000;
        if (diff <= 15 && diff > -20) add('rotina', 'Hora de: ' + r.titulo, (r.hora_fim ? r.hora_inicio + '–' + r.hora_fim : 'Começa ' + r.hora_inicio), '#/rot?r=' + r.id, hoje);
      });
    }
    Db.table('tar_eventos').list().forEach(function (ev) {
      if (ev.lembrete_min === null || ev.lembrete_min === undefined || !ev.inicio) return;
      var ini = new Date(ev.inicio); if (isNaN(ini)) return;
      var at = new Date(ini.getTime() - ev.lembrete_min * 60000);
      if (now < at || now - at > 30 * 60000) return;
      add('evento', ev.titulo, 'Começa ' + Utils.fmt(ini, 'dd/MM HH:mm') + (ev.local ? ' · ' + ev.local : ''), '#/tar/agenda?e=' + ev.id, String(ev.inicio).slice(0, 10));
    });
    if (rows.length) t.insertMany(rows, { silent: true });
    return rows.length;
  }

  return { wrap: wrap, generate: generate, sendDigest: sendDigest, soon: soon };
})();
