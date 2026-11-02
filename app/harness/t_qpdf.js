// Leitura de PDF de questões: caderno real (1.200 Questões BB, CESGRANRIO, duas colunas, 9 disciplinas, gabarito por
// disciplina, textos de apoio, figuras), formatos sintéticos (Questão 1 com (A)…(E) e "Gabarito: C", CEBRASPE certo/errado
// com texto para vários itens, "Ano: … Banca: …", alternativas A–D, anulada, comentário), o pacote gerado e a importação no servidor.
const fs = require('fs'), path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const load = (file) => { const src = fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<script>|<\/script>[\s\S]*$/g, ''); const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const Q = load(path.join(__dirname, '..', 'src', 'js_estudos_qpdf.html'));
const ler = async (bytes, o) => { const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise; const pages = await Q.readPdf(doc, pdfjs.OPS, {}); return Q.parse(pages, o || {}); };
const get = (res, c) => res.rows.find((r) => r.codigo === c);

// PDF sintético: linhas [texto, x, size?] por página, uma coluna
async function mkPdf(pages) {
  const pdf = await PDFDocument.create(), f = await pdf.embedFont(StandardFonts.Helvetica);
  const W = (s) => String(s).replace(/[“”]/g, '"').replace(/[–—]/g, '-');
  for (const lines of pages) {
    const pg = pdf.addPage([595, 842]); let y = 800;
    for (const l of lines) { if (l === '') { y -= 14; continue; } const [t, x, sz] = Array.isArray(l) ? l : [l, 60, 10]; pg.drawText(W(t), { x, y, size: sz || 10, font: f }); y -= (sz || 10) * 1.35; }
    pg.drawText(String(pdf.getPageCount()), { x: 290, y: 25, size: 9, font: f });
  }
  return Buffer.from(await pdf.save());
}

(async () => {
  // ---------------- caderno real ----------------
  const t0 = Date.now();
  const bb = await ler(fs.readFileSync(path.join(__dirname, 'fixtures', 'questoes_bb_1200.pdf')), { prefixo: 'BB', fonte: 'Caderno BB' });
  const R = bb.resumo, cont = {}; bb.rows.forEach((r) => { cont[r.disciplina] = (cont[r.disciplina] || 0) + 1; });
  console.log('# leitura do caderno em', Date.now() - t0, 'ms');
  ok(R.questoes === 1199 && R.paginas === 186, 'caderno BB: 1.199 questões lidas em 186 páginas (o livro não tem a 166 de Português; a tabela de gabarito tem)');
  ok(cont['Vendas e Negociação'] === 73 && cont['Probabilidade e Estatística'] === 60 && cont['Matemática'] === 140 && cont['Informática'] === 100 && cont['Língua Inglesa'] === 150 && cont['Conhecimentos Bancários'] === 200 && cont['Matemática Financeira'] === 150 && cont['Tecnologia da Informação'] === 127 && cont['Língua Portuguesa'] === 199, 'disciplina de cada questão pelo sumário (73, 60, 140, 100, 150, 200, 150, 127, 199)');
  ok(R.com_gabarito === 1199 && R.gabaritos === 9, 'gabarito das 9 tabelas aplicado a todas as questões');
  const quatro = bb.rows.filter((r) => !r.e).map((r) => r.codigo).sort().join(',');
  ok(bb.rows.every((r) => r.tipo === 'multipla' && r.a && r.b && r.c && r.d && r.enunciado) && quatro === 'BB-CB-015,BB-CB-113,BB-CB-118', 'todas de múltipla escolha com enunciado e alternativas; só 3 com A–D, como no livro (CB-015, CB-113, CB-118)');
  const semAno = bb.rows.filter((r) => !r.ano).map((r) => r.codigo).sort().join(',');
  ok(bb.rows.every((r) => r.banca === 'CESGRANRIO') && semAno === 'BB-CB-045,BB-TI-079', 'banca e ano tirados de "(CESGRANRIO – 2015)"; só 2 sem ano, impressos errados no livro ("201")');
  ok(bb.cobertura.aproveitadas >= bb.cobertura.linhas - 1, `conferência: ${bb.cobertura.aproveitadas} de ${bb.cobertura.linhas} linhas do PDF foram para algum campo (a única fora é um "3" solto)`);
  let q = get(bb, 'BB-VN-001');
  ok(q.enunciado === 'O planejamento de vendas no setor bancário tem-se baseado na segmentação de mercado como forma de obter mais sucesso nos negócios. Um objetivo da segmentação de mercado é' && q.a === 'adotar uma abordagem única de vendas para toda carteira de clientes.' && q.e === 'selecionar os serviços bancários em função do grau de dificuldade.' && q.gabarito === 'C', 'Q1 de Vendas: enunciado e alternativas completos, linhas e hifenização juntadas, gabarito C');
  q = get(bb, 'BB-VN-004');
  ok(q.c === 'analisar o ambiente mercadológico no momento.' && q.d === 'aumentar o conhecimento dos produtos comercializados.' && q.e === 'levantar os fatores externos que interferem nas negociações.', 'alternativas que continuam na outra coluna depois do título grande da disciplina');
  q = get(bb, 'BB-VN-015');
  ok(/Alice – A época do vendedor esperto/.test(q.enunciado) && /É \(São\) correta\(s\) a\(s\) afirmação\(ões\) de$/.test(q.enunciado) && q.d === 'Alice e Antônio, apenas.', 'enunciado longo com afirmações e a pergunta final');
  ok(get(bb, 'BB-VN-033') && /As empresas, diante da concorrência/.test(get(bb, 'BB-VN-033').enunciado) && bb.avisos.some((a) => /impressa como 3 entre 32 e 34/.test(a.msg)), 'número impresso errado no livro (3 entre 32 e 34) lido como 33, com aviso');
  q = get(bb, 'BB-VN-067');
  ok(q && q.e === 'proposta de maior rendimento financeiro no mercado', 'alternativa impressa sem o parêntese ("e proposta…") reconhecida');
  q = get(bb, 'BB-CB-123');
  ok(q.c === 'elevada taxa de juros incidente sobre os recursos captados pelos bancos' && /^elevado percentual dos depósitos compulsórios/.test(q.d) && q.e === 'elevado custo de tributação bancária', 'alternativa "d)" impressa no meio da linha anterior separada');
  q = get(bb, 'BB-CB-003');
  ok(/^sociedades controladoras, controladas, coligadas/.test(q.e) && q.gabarito === 'E', 'título "CONHECIMENTOS BANCÁRIOS" no meio da questão não corta a alternativa E');
  q = get(bb, 'BB-TI-039');
  ok(/Responsavel varchar\(255\) , Status varchar\(10\)\)$/.test(q.e) && /^CREATE COMPUTADORES AS TABLE/.test(q.a), 'alternativas com código em várias linhas (SQL) completas');
  q = get(bb, 'BB-LP-003');
  ok(/^Leia o texto para responder às questões\.\nTexto II/.test(q.texto_base) && /O acendedor de lampiões e nós/.test(q.texto_base) && /SANT’ANNA, Affonso Romano de/.test(q.texto_base) && /^No Texto II, na passagem/.test(q.enunciado), 'Português: texto de apoio separado da pergunta (com título e fonte)');
  q = get(bb, 'BB-LP-001');
  ok(/A negação do meio ambiente/.test(q.texto_base) && /Acesso em: 02 jul\. 2014\.\nAdaptado\.$/.test(q.texto_base) && /^No trecho/.test(q.enunciado), 'texto com "Disponível em … Adaptado." fica inteiro no texto de apoio');
  q = get(bb, 'BB-LI-001');
  ok(/Bank Clerk Job Description/.test(q.texto_base) && /^In “Candidates can also check/.test(q.enunciado), 'Inglês: "Adapted." vai para o texto e a pergunta começa limpa');
  ok(get(bb, 'BB-LI-002').texto_base === get(bb, 'BB-LI-001').texto_base && get(bb, 'BB-LP-004').texto_base === '', 'questões seguintes sobre o mesmo texto recebem o texto; a de outro assunto (conjunção) não');
  q = get(bb, 'BB-PE-035');
  ok(q._crop && q._crop.motivo === 'imagem' && q._crop.partes.length >= 2 && /na imagem da questão/.test(q.a), 'alternativas que são gráficos: recorte da questão (várias partes) e aviso nas alternativas');
  ok(get(bb, 'BB-PE-056')._crop && /Intersecção \| 50,7/.test(get(bb, 'BB-PE-056').enunciado), 'tabela em texto mantida (colunas separadas) e recorte para conferir');
  ok(get(bb, 'BB-CB-113').c && get(bb, 'BB-CB-113')._avisos.some((a) => /sem letra/.test(a)), 'questão com alternativas sem letra no PDF: separadas por linha e marcadas para conferir');
  ok(R.com_texto >= 280 && R.com_recorte >= 40, `${R.com_texto} questões com texto de apoio e ${R.com_recorte} com recorte (figura, fórmula ou tabela)`);
  ok(bb.rows.every((r) => r.assunto) && get(bb, 'BB-VN-012').assunto.startsWith('Noções de Administração de Vendas'), 'assunto pelos títulos "Æ …" (e subtítulos)');

  // ---------------- formatos sintéticos ----------------
  const s1 = await ler(await mkPdf([[
    'PROVA DE CONHECIMENTOS - TRIBUNAL', '',
    'Questão 1', 'De acordo com a Constituição, a casa é asilo inviolável do indivíduo, salvo', '(A) por ordem do delegado.', '(B) em caso de flagrante delito.', '(C) por decisão do síndico.', '(D) à noite, por ordem judicial.', '(E) a qualquer hora, sem exceção.', 'Gabarito: B', 'Comentário: art. 5º, XI, da CF.', '',
    'Questão 2', 'Assinale a alternativa correta sobre crase:', '(A) Vou a pé.', '(B) Refiro-me a você.', '(C) Fui à praia.', '(D) Chegou a uma conclusão.', 'Gabarito: C', '',
    'Questão 3', 'Questão anulada pela banca: marque qualquer item.', '(A) um', '(B) dois', '(C) três', '(D) quatro', '(E) cinco', 'Gabarito: ANULADA'
  ]]), { prefixo: 'TRT', fonte: 'Prova TRT' });
  ok(s1.rows.length === 3 && s1.rows[0].enunciado === 'De acordo com a Constituição, a casa é asilo inviolável do indivíduo, salvo' && s1.rows[0].b === 'em caso de flagrante delito.' && s1.rows[0].gabarito === 'B' && s1.rows[0].explicacao === 'art. 5º, XI, da CF.', '"Questão 1" com (A)…(E), "Gabarito: B" e comentário na própria questão');
  ok(s1.rows[1]._alts === 4 && s1.rows[1].d === 'Chegou a uma conclusão.' && !s1.rows[1].e && s1.rows[1].gabarito === 'C' && !s1.rows[1]._avisos.length, 'alternativas A–D (4 opções) sem aviso');
  ok(s1.rows[2].gabarito_status === 'anulada' && !s1.rows[2].gabarito, 'gabarito "ANULADA" vira questão anulada');
  const s2 = await ler(await mkPdf([[
    'Texto para os itens de 1 a 3', 'A administração pública direta é formada pelos entes federativos e seus órgãos.', 'As autarquias integram a administração indireta e têm personalidade jurídica própria.', '',
    'Com base no texto acima, julgue os itens a seguir.', '',
    '1 (CESPE/CEBRASPE - 2023 - PF - Agente) As autarquias integram a administração direta.', '',
    '2 (CESPE/CEBRASPE - 2023 - PF - Agente) Os órgãos públicos não têm personalidade jurídica.', '',
    '3 (CESPE/CEBRASPE - 2023 - PF - Agente) Os entes federativos compõem a administração direta.', '',
    'GABARITO', '1 E   2 C   3 C'
  ]]), {});
  ok(s2.rows.length === 3 && s2.rows.every((r) => r.tipo === 'C/E') && s2.rows.map((r) => r.gabarito).join('') === 'ECC', 'CEBRASPE: itens certo/errado com gabarito C/E do quadro final');
  ok(s2.rows[0].banca === 'CESPE/CEBRASPE' && s2.rows[0].orgao === 'PF' && s2.rows[0].cargo === 'Agente', 'parênteses "(CESPE/CEBRASPE - 2023 - PF - Agente)": banca, órgão e cargo');
  ok(s2.rows[0].ano === 2023 && s2.rows.every((r) => /Texto para os itens de 1 a 3/.test(r.texto_base) && /personalidade jurídica própria/.test(r.texto_base)), 'texto "para os itens de 1 a 3" aplicado aos 3 itens, com o ano');
  const s3 = await ler(await mkPdf([[
    '1. Ano: 2022 Banca: FGV Órgão: Banco do Brasil Prova: Escriturário', 'O índice que mede a inflação oficial no Brasil é o', 'a) IGP-M.', 'b) IPCA.', 'c) INCC.', 'd) INPC.', 'e) IPA.', '',
    '2. Ano: 2021 Banca: FGV Órgão: Banco do Brasil Prova: Escriturário', 'A taxa básica de juros da economia é a', 'a) TJLP.', 'b) TR.', 'c) Selic.', 'd) CDI.', 'e) TLP.', '',
    'Gabarito', '1-B 2-C'
  ]]), {});
  ok(s3.rows.length === 2 && s3.rows[0].banca === 'FGV' && s3.rows[0].ano === 2022 && /Banco do Brasil/.test(s3.rows[0].orgao) && s3.rows[0].cargo === 'Escriturário' && s3.rows[0].enunciado === 'O índice que mede a inflação oficial no Brasil é o' && s3.rows.map((r) => r.gabarito).join('') === 'BC', '"Ano: … Banca: … Órgão: … Prova: …" e gabarito "1-B 2-C"');

  // ---------------- o mesmo leitor depois do build ----------------
  const dist = path.join(__dirname, '..', 'dist3', 'Index.html');
  if (fs.existsSync(dist)) {
    const html = fs.readFileSync(dist, 'utf8'), sc = html.split('<script>').map((x) => x.split('</script>')[0]).find((x) => /estQPdf\s*=/.test(x));
    const mm = { exports: {} }; new Function('module', 'window', sc)(mm, undefined);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'questoes_bb_1200.pdf'))), verbosity: 0 }).promise;
    const r2 = mm.exports.parse(await mm.exports.readPdf(doc, pdfjs.OPS, {}), { prefixo: 'BB' });
    ok(r2.rows.length === 1199 && JSON.stringify(r2.rows.map((r) => [r.codigo, r.enunciado, r.a, r.e, r.gabarito, r.texto_base])) === JSON.stringify(bb.rows.map((r) => [r.codigo, r.enunciado, r.a, r.e, r.gabarito, r.texto_base])), 'pacote gerado (sem comentários, sem //) lê o caderno exatamente igual ao código-fonte');
  }

  // ---------------- importação no servidor ----------------
  const G = require('./gas'), c = G.context;
  const api = (route, payload, token) => { G.resetMemo(); return c.api(route, payload || {}, 'teste', token); };
  const must = (r, msg) => { if (!r.ok) { console.log('ERRO em', msg, JSON.stringify(r.error)); process.exitCode = 1; } return r.data; };
  c.setup(); const eu = G.devLogin('voce@exemplo.com');
  const conc = must(api('db.save', { table: 'est_concursos', row: { nome: 'Banco do Brasil', area: 'Bancária' } }, eu), 'conc').row;
  const img = must(api('files.upload', { nome: 'q.jpg', mime: 'image/jpeg', base64: Buffer.from('jpg').toString('base64'), modulo: 'estudos' }, eu), 'img').arquivo;
  const mat = must(api('est.materialSave', { titulo: 'Caderno BB', tipo: 'link', url: 'https://exemplo.com/a.pdf' }, eu), 'mat').material;
  const lote = bb.rows.slice(0, 300).map((r) => { const x = { ...r }; Object.keys(x).forEach((k) => { if (k[0] === '_') delete x[k]; }); return x; });
  lote[0].imagem_arquivo_id = img.id; lote[0].material_id = mat.id;
  let im = must(api('est.importRows', { tabela: 'questoes', rows: lote, dry: true, concurso_id: conc.id }, eu), 'dry');
  ok(im.previa.novos === 300 && im.previa.total_erros === 0, 'servidor confere 300 linhas lidas do PDF sem erro');
  im = must(api('est.importRows', { tabela: 'questoes', rows: lote, dry: false, concurso_id: conc.id }, eu), 'import');
  const tb = must(api('est.boot', {}, eu), 'boot').tables.est_questoes;
  const a = tb.find((x) => x.codigo === 'BB-VN-001'), lp = tb.find((x) => x.codigo === lote.find((r) => r.texto_base).codigo);
  ok(im.inseridos === 300 && a.gabarito === 'C' && a.gabarito_status === 'definitivo' && a.concurso_id === conc.id && a.area === 'Bancária' && a.imagem_arquivo_id === img.id && a.material_id === mat.id && a.pagina === 8, 'gravadas com gabarito definitivo, concurso, área, imagem, material e página');
  ok(lp && lp.texto_base && lp.texto_base.length > 500, 'texto de apoio gravado na questão');
  im = must(api('est.importRows', { tabela: 'questoes', rows: lote, dry: false, concurso_id: conc.id }, eu), 'reimport');
  ok(im.inseridos === 0 && im.atualizados === 300, 'reimportar o mesmo PDF atualiza pelo código, sem duplicar');
  const an = must(api('est.importRows', { tabela: 'questoes', dry: false, rows: [{ codigo: 'X-1', tipo: 'multipla', enunciado: 'Anulada', a: '1', b: '2', gabarito_status: 'anulada' }] }, eu), 'anulada');
  ok(must(api('est.boot', {}, eu), 'b').tables.est_questoes.find((x) => x.codigo === 'X-1').gabarito_status === 'anulada', 'situação "anulada" importada');
  const bad = must(api('est.importRows', { tabela: 'questoes', dry: true, rows: [{ codigo: 'X-2', enunciado: 'x', a: '1', b: '2', imagem_arquivo_id: 'nao-existe' }] }, eu), 'bad');
  ok(bad.previa.total_erros === 1 && /imagem/.test(bad.previa.erros[0].mensagem), 'imagem inexistente é recusada na conferência');
})();
