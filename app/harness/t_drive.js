// Bloco 1 — arquivos no Drive sem duplicar: um JSON de anotações e uma cópia anotada por material (revisão nova
// substitui o conteúdo do mesmo arquivo), conteúdo igual não é reenviado, limpeza dos duplicados antigos com
// lixeira e desfazer, diagnóstico com duplicados e órfãos, backup sem copiar a mesma revisão de novo.
const crypto = require('crypto'), vm = require('vm');
const G = require('./gas');
const c = G.context;
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
c.setup();
const eu = G.devLogin('voce@exemplo.com');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enviar = (nome, buf, extra) => { const s = must(api('est.upStart', Object.assign({ nome, mime: 'application/pdf', tamanho: buf.length, hash: sha(buf) }, extra || {}), eu), 'upStart'); if (s.duplicado) return s; return must(api('est.upChunk', { upload_id: s.upload_id, offset: 0, base64: buf.toString('base64') }, eu), 'upChunk'); };
const pasta = (sub) => vm.runInContext(`Auth.as('voce@exemplo.com'); StudyFiles.folder_('${sub}')`, c);
const vivos = (sub) => pasta(sub).files.filter((f) => !f.trashed);

const orig = Buffer.from('%PDF-1.4 original do material');
const a0 = enviar('Banco_do_Brasil.pdf', orig).arquivo;
const mat = must(api('est.materialSave', { titulo: 'Banco do Brasil', arquivo_id: a0.id }, eu), 'mat').material;
// 10 gravações de anotações
let revs = {};
for (let i = 1; i <= 10; i++) { const r = must(api('est.annSave', { material_id: mat.id, arquivo_id: a0.id, paginas: { 1: [{ id: 'a' + i, tipo: 'marca', rect: [10, 10, 50, 20 + i] }] }, base_revs: revs, op_id: 'op' + i }, eu), 'ann ' + i); revs = r.revs; }
ok(vivos('anotacoes').length === 1, '10 gravações de anotações: 1 JSON no Drive');
// 3 fechamentos do leitor (cópia anotada nova a cada revisão)
const exportar = (rev) => { const pdf = Buffer.from('%PDF-1.4 anotado revisao ' + rev); const up = enviar(mat.codigo + '_Banco_do_Brasil_anotado.pdf', pdf, { destino: 'exportacoes', substituir: { material_id: mat.id, tipo: 'anotado' } }); return { up, reg: must(api('est.exportRegister', { material_id: mat.id, arquivo_id: up.arquivo.id, revisao: rev, tipo: 'anotado' }, eu), 'reg') }; };
const e1 = exportar(10);
for (let i = 11; i <= 12; i++) { const r = must(api('est.annSave', { material_id: mat.id, arquivo_id: a0.id, paginas: { 2: [{ id: 'b' + i, tipo: 'caneta', pts: [1, 2, 3, i] }] }, base_revs: revs, op_id: 'op' + i }, eu), 'ann'); revs = r.revs; }
const e2 = exportar(11), e3 = exportar(12);
ok(vivos('exportacoes').length === 1 && vivos('anotacoes').length === 1, 'anotar 10+ vezes e fechar o leitor 3 vezes: 1 JSON e 1 cópia anotada no Drive');
ok(e2.up.substituido && e3.up.substituido && e3.up.arquivo.id === e1.up.arquivo.id, 'as revisões novas substituem o conteúdo do mesmo arquivo (mesmo registro)');
ok(G.driveCalls.filter((x) => x.op === 'start-update').length === 2, 'atualização pelo upload da API v3 no arquivo existente (PATCH)');
const exps = must(api('est.boot', {}, eu), 'boot').tables.est_exportacoes;
ok(exps.length === 1 && exps[0].revisao === 12 && exps[0].hash === sha(Buffer.from('%PDF-1.4 anotado revisao 12')), 'um registro de exportação, com a revisão e o hash atuais');
ok(vivos('exportacoes')[0].blob.bytes.toString() === '%PDF-1.4 anotado revisao 12' && !/_r\d+\.pdf$/.test(vivos('exportacoes')[0].name), 'o arquivo no Drive tem o conteúdo da revisão 12 e nome sem número de revisão');
const n0 = G.driveCalls.length;
const e4 = enviar(mat.codigo + '_Banco_do_Brasil_anotado.pdf', Buffer.from('%PDF-1.4 anotado revisao 12'), { destino: 'exportacoes', substituir: { material_id: mat.id, tipo: 'anotado' } });
ok(e4.duplicado && e4.mesmo_conteudo && G.driveCalls.length === n0, 'conteúdo idêntico (mesmo hash) não é gravado de novo');
ok(must(api('est.annGet', { material_id: mat.id, arquivo_id: a0.id }, eu), 'get').exportacoes.length === 1, 'leitor recebe uma cópia anotada só');
// nova versão do material e original novo continuam criando arquivo
const a1 = enviar('Banco_do_Brasil_v2.pdf', Buffer.from('%PDF-1.4 versao 2')).arquivo;
must(api('est.materialVersion', { material_id: mat.id, arquivo_id: a1.id }, eu), 'versao');
ok(a1.drive_id !== a0.drive_id && !G.files.get(a0.drive_id).trashed && !G.files.get(a1.drive_id).trashed, 'versão deliberada do original cria arquivo novo (os 2 originais ficam)');

// ---- duplicados antigos (como ficavam antes): r13, r16, r17 ----
const m2 = must(api('est.materialSave', { titulo: 'Caderno', arquivo_id: enviar('Caderno.pdf', Buffer.from('%PDF caderno')).arquivo.id }, eu), 'm2').material;
const a2 = m2.arquivo_id;
for (let i = 1; i <= 17; i++) { const r = must(api('est.annSave', { material_id: m2.id, arquivo_id: a2, paginas: { 1: [{ id: 'x' + i, tipo: 'marca', rect: [1, 1, 2, i] }] }, base_revs: i === 1 ? {} : { 1: i - 1 }, op_id: 'm2op' + i }, eu), 'ann2'); }
const velhos = [13, 16, 17].map((rv) => { const up = enviar('M2_Caderno_anotado_r' + rv + '.pdf', Buffer.from('%PDF anotado r' + rv), { destino: 'exportacoes' }); vm.runInContext(`Auth.as('voce@exemplo.com'); Db.table('est_exportacoes').insert({ material_id: '${m2.id}', tipo: 'anotado', revisao: ${rv}, arquivo_id: '${up.arquivo.id}', hash: '${up.arquivo.hash}', tamanho_bytes: ${up.arquivo.tamanho_bytes}, titulo: 'r${rv}' })`, c); return up.arquivo; });
const igual = enviar('copia_igual.pdf', Buffer.from('%PDF anotado r13'), { destino: 'exportacoes' }).arquivo;
const sc = must(api('est.dupScan', {}, eu), 'scan');
const ids = sc.itens.map((x) => x.id).sort();
ok(sc.itens.length === 3 && ids.includes(velhos[0].id) && ids.includes(velhos[1].id) && ids.includes(igual.id) && !ids.includes(velhos[2].id) && sc.bytes > 0, 'varredura: cópias r13 e r16 (fica a r17) e um arquivo de mesmo conteúdo, com o espaço a liberar');
ok(!sc.itens.some((x) => [a0.id, a1.id, a2, e1.up.arquivo.id].includes(x.id)), 'nunca lista original de material nem a cópia atual');
const diag = must(api('sys.diagnostics', {}, eu), 'diag').checks.find((x) => x.id === 'duplicados');
ok(diag && !diag.ok && /3 duplicado\(s\)/.test(diag.detail) && /arquivo\(s\) no Drive que o app não conhece/.test(diag.detail), 'diagnóstico informa duplicados e órfãos');
const cl = must(api('est.dupClean', { ids: ids.concat([a0.id]) }, eu), 'clean');
ok(cl.removidos.length === 3 && !cl.removidos.includes(a0.id), 'limpeza manda só os 3 duplicados para a lixeira (ignora o original pedido junto)');
ok([velhos[0], velhos[1], igual].every((a) => G.files.get(a.drive_id).trashed) && !G.files.get(velhos[2].drive_id).trashed, 'arquivos na lixeira do Drive; a cópia atual (r17) fica');
ok(must(api('est.dupScan', {}, eu), 's2').itens.length === 0, 'depois da limpeza não sobra duplicado');
const rs = must(api('est.dupRestore', { ids: cl.removidos }, eu), 'restore');
ok(rs.restaurados === 3 && !G.files.get(velhos[0].drive_id).trashed && must(api('est.dupScan', {}, eu), 's3').itens.length === 3, 'desfazer restaura os arquivos e os registros');
// backup: a mesma revisão não é copiada de novo
vm.runInContext("Auth.as('voce@exemplo.com'); StudyFiles.backup(60000); StudyFiles.backup(60000)", c);
const dirAnn = vm.runInContext("Setup.subfolder('backups', 'estudos-anotacoes')", c);
ok(dirAnn.files.length === 2, 'backup semanal repetido não duplica o JSON da mesma revisão (2 materiais, 2 arquivos)');
