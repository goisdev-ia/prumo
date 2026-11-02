/**
 * Tarefas: lembretes por e-mail (gatilho de 15 min) e sincronização opcional com o Google Agenda.
 */
var Tasks = (function () {
  function dueAt_(t) {
    if (!t.data_vencimento) return null;
    var hm = String(t.hora || '09:00').split(':');
    var d = Utils.parseDate(t.data_vencimento);
    d.setHours(Number(hm[0]) || 9, Number(hm[1]) || 0, 0, 0);
    return d;
  }

  /** Envia lembretes vencidos e marca como enviados. Chamado pelo gatilho. */
  function sendReminders() {
    var now = new Date(), sent = 0;
    var t = Db.table('tar_tarefas');
    t.list().forEach(function (task) {
      if (task.lembrete_min_antes === null || task.lembrete_min_antes === undefined || task.lembrete_enviado) return;
      if (task.status === 'feito' || task.status === 'cancelada') return;
      var due = dueAt_(task);
      if (!due) return;
      var at = new Date(due.getTime() - task.lembrete_min_antes * 60000);
      if (at > now || now - at > 6 * 3600000) return;
      var when = Utils.fmt(due, 'dd/MM HH:mm');
      Db.table('notificacoes').insert({ tipo: 'tarefa', titulo: task.titulo, corpo: 'Vence ' + when, data_ref: task.data_vencimento, link: '#/tar' }, { silent: true });
      if (Auth.setting('notif.email', true) !== false) {
        try {
          MailApp.sendEmail({ to: Auth.email(), subject: 'Lembrete: ' + task.titulo, htmlBody: Notifications.wrap('Lembrete de tarefa', '<p style="margin:0 0 8px;font-size:18px;font-weight:700">' + Utils.escapeHtml(task.titulo) + '</p><p style="margin:0;color:#6b6b6b">Vence ' + when + '</p>'), name: CONFIG.APP_NAME });
        } catch (e) { AppLog.warn('tarefas', 'lembrete', 'Falha no e-mail: ' + e.message); }
      }
      t.update(task.id, { lembrete_enviado: true }, { silent: true });
      sent++;
    });
    return sent;
  }

  /** Rota: cria/atualiza evento no Google Agenda (se a integração estiver ligada). @param {{evento_id:string}} p */
  function syncCalendar(p) {
    if (Auth.setting('int.calendar', false) !== true) throw Utils.error('VALIDATION', 'Ative a integração com o Google Agenda em Configurações.');
    var ev = Db.table('tar_eventos').get(p.evento_id);
    if (!ev) throw Utils.error('NOT_FOUND', 'Evento não encontrado.');
    var cal = CalendarApp.getDefaultCalendar();
    var ini = new Date(ev.inicio), fim = ev.fim ? new Date(ev.fim) : new Date(ini.getTime() + 3600000);
    var gev = ev.calendar_event_id ? cal.getEventById(ev.calendar_event_id) : null;
    if (gev) { gev.setTitle(ev.titulo); if (ev.dia_inteiro) gev.setAllDayDate(ini); else gev.setTime(ini, fim); gev.setLocation(ev.local || ''); gev.setDescription(ev.descricao || ''); }
    else gev = ev.dia_inteiro ? cal.createAllDayEvent(ev.titulo, ini, { location: ev.local || '', description: ev.descricao || '' }) : cal.createEvent(ev.titulo, ini, fim, { location: ev.local || '', description: ev.descricao || '' });
    if (ev.lembrete_min) { try { gev.removeAllReminders(); gev.addPopupReminder(ev.lembrete_min); } catch (e) { /* opcional */ } }
    var row = Db.table('tar_eventos').update(ev.id, { calendar_event_id: gev.getId() });
    return { changes: { tar_eventos: [row] } };
  }

  return { sendReminders: sendReminders, syncCalendar: syncCalendar };
})();
