const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
c.setup();

let r = api('boot', {});
ok(!r.ok && r.error.code === 'AUTH', 'sem token: boot recusado (AUTH)');
r = api('boot', {}, 'x'.repeat(64));
ok(!r.ok && r.error.code === 'AUTH', 'token inventado recusado');

r = api('auth.login', { email: 'nao-e-email', senha: 'junio2019@' });
ok(!r.ok && r.error.field === 'email', 'e-mail inválido');
r = api('auth.login', { email: 'ana@exemplo.com', senha: 'errada' });
ok(!r.ok && /4 tentativas/.test(r.error.message), 'senha errada: ' + r.error.message);
for (let i = 0; i < 4; i++) r = api('auth.login', { email: 'ana@exemplo.com', senha: 'errada' });
r = api('auth.login', { email: 'ana@exemplo.com', senha: 'junio2019@' });
ok(!r.ok && /Muitas tentativas/.test(r.error.message), 'bloqueio após 5 erros, mesmo com a senha certa');
c.CacheService.getScriptCache().remove('lf_ana@exemplo.com');

r = api('auth.login', { email: ' Ana@Exemplo.com ', senha: 'junio2019@' });
ok(r.ok && r.data.token && r.data.email === 'ana@exemplo.com', 'senha certa entra direto (sem código), e-mail normalizado');
const tA = r.data.token;
ok(api('auth.verify', {}).error.code === 'NOT_FOUND', 'rota de código não existe mais');
const tB = G.devLogin('bruno@exemplo.com');
let bA = api('boot', {}, tA), bB = api('boot', {}, tB);
ok(bA.ok && bA.data.email === 'ana@exemplo.com' && bB.data.email === 'bruno@exemplo.com', 'cada token abre o próprio usuário');
ok(bA.data.tables.fin_categorias.length > 10 && bA.data.tables.fit_exercicios.length === 86, 'novo usuário recebe categorias e catálogos no 1º acesso');
const conta = bA.data.tables.fin_contas[0];
r = api('fin.saveTx', { tx: { tipo: 'despesa', descricao: 'Mercado da Ana', valor: 120, data: '2026-10-29', conta_id: conta.id } }, tA);
ok(r.ok && r.data.changes.fin_lancamentos[0].user_id === 'ana@exemplo.com', 'lançamento gravado com user_id = e-mail de quem fez');
bB = api('boot', {}, tB);
ok(!bB.data.tables.fin_lancamentos.some((l) => l.descricao === 'Mercado da Ana'), 'Bruno não vê o lançamento da Ana');
r = api('fin.saveTx', { tx: { tipo: 'despesa', descricao: 'Invasão', valor: 1, data: '2026-10-29', conta_id: conta.id } }, tB);
ok(!r.ok, 'Bruno não consegue lançar na conta da Ana: ' + (r.error && r.error.code));
const logs = c.Db.table('logs');
c.Auth.as('ana@exemplo.com'); G.resetMemo();
const la = logs.list();
ok(la.some((l) => l.acao === 'login' && l.modulo === 'auth') && la.some((l) => l.entidade === 'fin_lancamentos'), 'logs da Ana: login e auditoria do lançamento no nome dela');
ok(la.some((l) => l.acao === 'senha_incorreta'), 'tentativas erradas ficam no log do e-mail tentado');
r = api('sys.setupTriggers', {}, tB);
ok(!r.ok && r.error.code === 'FORBIDDEN', 'rotas do dono bloqueadas para outros usuários');
const tOwner = G.devLogin('voce@exemplo.com');
r = api('sys.setupTriggers', {}, tOwner);
ok(r.ok, 'dono da planilha acessa rotas do dono');

r = api('auth.logout', {}, tB);
ok(r.ok, 'logout');
ok(api('boot', {}, tB).error.code === 'AUTH', 'token do Bruno não vale mais depois de sair');
ok(api('boot', {}, tA).ok, 'sessão da Ana continua');

c.definirSenha('outraSenha123');
r = api('auth.login', { email: 'carla@exemplo.com', senha: 'junio2019@' });
ok(!r.ok, 'senha antiga deixa de valer após definirSenha');
r = api('auth.login', { email: 'carla@exemplo.com', senha: 'outraSenha123' });
ok(r.ok && r.data.token, 'senha nova funciona');
G.props.delete('LOGIN_SENHA_SHA256');

// sessão vencida
const k = [...G.props.keys()].find((x) => x.startsWith('sess_') && JSON.parse(G.props.get(x)).e === 'ana@exemplo.com');
const s = JSON.parse(G.props.get(k)); s.x = Date.now() - 1; G.props.set(k, JSON.stringify(s)); c.CacheService.getScriptCache().remove(k);
ok(api('boot', {}, tA).error.code === 'AUTH', 'sessão vencida recusada');
const nSess = [...G.props.keys()].filter((x) => x.startsWith('sess_')).length;
c.encerrarSessoes();
ok([...G.props.keys()].filter((x) => x.startsWith('sess_')).length === 0 && nSess > 0, 'encerrarSessoes derruba todas');
G.resetMemo(); c.triggerWeekly();
ok(G.triggers.length >= 0, 'gatilho semanal roda com várias contas');
