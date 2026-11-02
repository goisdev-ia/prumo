// Bloco 6 (motor): PDF A4 compacto e XLSX a partir da mesma especificação. Cabeçalho, filtros, rodapé "p. X de Y",
// cabeçalho da tabela repetido na quebra, sumário com páginas certas, grade de gabarito, números e datas pt-BR no PDF
// e como valores na planilha, texto em Markdown, tabela vazia com "sem dados", acentos e caracteres fora do WinAnsi.
const fs = require('fs'), path = require('path');
const PDFLib = require('pdf-lib'), XLSX = require('xlsx');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const ok = (cond, msg) => { console.log((cond ? 'ok - ' : 'FALHA - ') + msg); if (!cond) process.exitCode = 1; };
const load = (file) => { const src = fs.readFileSync(file, 'utf8').replace(/^[\s\S]*?<script>|<\/script>[\s\S]*$/g, ''); const m = { exports: {} }; new Function('module', 'window', src)(m, undefined); return m.exports; };
const R = load(path.join(__dirname, '..', 'src', 'js_reports.html'));
const texto = async (bytes) => { const d = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise, out = []; for (let i = 1; i <= d.numPages; i++) { const tc = await (await d.getPage(i)).getTextContent(); out.push(tc.items.map((x) => x.str).join(' ')); } return out; };

(async () => {
  ok(R.cellText(1234.5, 'brl') === 'R$ 1.234,50' && R.cellText(-12, 'brl') === 'R$ -12,00' && R.cellText(3, 'num') === '3' && R.cellText(2.5, 'num') === '2,50' && R.cellText(87.25, 'pct') === '87%' && R.cellText(4.25, 'pct') === '4,3%', 'números no padrão brasileiro');
  ok(R.cellText('2026-10-31', 'date') === '31/10/2026' && R.cellText(null, 'brl') === '' && R.cellText(true, 'bool') === 'sim', 'datas dd/mm/aaaa e vazios');
  ok(R.winAnsi('Ação “ok” — 5€ ✓ 😀') === 'Ação "ok" — 5€ ? ??', 'acentos ficam; caracteres fora da fonte viram "?" (sem quebrar o PDF)');
  const md = R.mdBlocks('# Título\n- item **forte**\n> citação\n| a | b |\n|---|---|\n| 1 | 2 |\n\ntexto [link](https://x.y)');
  ok(md[0].t === 'h1' && md[1].t === 'li' && md[1].s === 'item forte' && md[2].t === 'q' && md.some((b) => b.s === 'a  ·  b') && md.some((b) => b.s === 'texto link (https://x.y)'), 'Markdown simples: títulos, listas, citações, tabelas e links');

  const linhas = Array.from({ length: 140 }, (_, i) => ({ data: '2026-10-' + String((i % 28) + 1).padStart(2, '0'), desc: 'Lançamento número ' + (i + 1) + ' com descrição um pouco mais longa para quebrar a linha da coluna estreita', valor: -(i * 10.5) }));
  const spec = { titulo: 'Relatório de teste', subtitulo: 'Outubro de 2026', filtros: 'conta: Nubank · tipo: despesa', agora: '2026-11-02T15:00:00', sumario: true,
    secoes: [{ tipo: 'kpis', itens: [['Receitas', 'R$ 1.000,00'], ['Despesas', 'R$ 500,00'], ['Saldo', 'R$ 500,00']] },
      { tipo: 'capitulo', titulo: 'Capítulo um' },
      { tipo: 'tabela', titulo: 'Lançamentos', aba: 'Lançamentos', colunas: [{ k: 'data', l: 'Data', fmt: 'date' }, { k: 'desc', l: 'Descrição', w: 3 }, { k: 'valor', l: 'Valor', fmt: 'brl' }], linhas, total: { desc: 'Total', valor: -9999 } },
      { tipo: 'tabela', titulo: 'Vazia', colunas: [{ k: 'x', l: 'X' }], linhas: [] },
      { tipo: 'capitulo', titulo: 'Capítulo dois' },
      { tipo: 'texto', titulo: 'Resumo', md: '## Seção\n- ponto um\n- ponto dois' },
      { tipo: 'quebra' },
      { tipo: 'grade', titulo: 'Gabarito', colunas: 5, itens: Array.from({ length: 50 }, (_, i) => [i + 1, i === 7 ? 'sem gabarito' : 'ABCDE'[i % 5]]) }] };
  const pdf = await R.pdf(spec, PDFLib), pg = await texto(pdf), n = pg.length;
  ok(n >= 5 && R.pdf.last.paginas === n && R.pdf.last.sumario === 1, 'PDF A4 com várias páginas e uma página de sumário (' + n + ' páginas)');
  ok(/^Sumário/.test(pg[0].trim()) && /Capítulo um\s+2/.test(pg[0]) && new RegExp('Capítulo dois\\s+(\\d+)').test(pg[0]), 'sumário na primeira página com os capítulos e as páginas');
  const capDois = +pg[0].match(/Capítulo dois\s+(\d+)/)[1];
  ok(/Capítulo dois/.test(pg[capDois - 1]) && !/Capítulo dois/.test(pg[capDois - 2].replace(/Sumário[\s\S]*/, '')), 'a página indicada no sumário é a do capítulo');
  ok(/Relatório de teste/.test(pg[1]) && /Filtros: conta: Nubank · tipo: despesa/.test(pg[1]) && /Gerado em 02\/11\/2026 15:00/.test(pg[1]), 'cabeçalho com título, filtros e data de geração');
  ok(pg.every((t, i) => new RegExp('p\\. ' + (i + 1) + ' de ' + n).test(t) && /Prumo · Relatório de teste · gerado em/.test(t)), 'rodapé em todas as páginas: "Prumo · título" e "p. X de Y"');
  const comTabela = pg.filter((t) => /Lançamento número/.test(t));
  ok(comTabela.length >= 2 && comTabela.every((t) => /Data\s+Descrição\s+Valor/.test(t)), 'tabela longa quebra de página repetindo o cabeçalho');
  ok(/31\/10\/2026|28\/10\/2026/.test(pg.join(' ')) && /R\$ -1\.459,50/.test(pg.join(' ')) && /Total\s+R\$ -9\.999,00/.test(pg.join(' ')), 'datas e valores formatados no PDF, com linha de total');
  ok(/Sem dados no período e filtros escolhidos/.test(pg.join(' ')), 'tabela vazia diz "sem dados"');
  const ult = pg[n - 1];
  ok(/Gabarito/.test(ult) && /1\.\s+A/.test(ult) && /8\.\s+sem gabarito/.test(ult) && /50\.\s+E/.test(ult), 'grade de gabarito na última página');
  // XLSX
  const wb = XLSX.read(R.xlsx(spec, XLSX), { type: 'array', cellDates: true });
  ok(JSON.stringify(wb.SheetNames) === JSON.stringify(['Resumo', 'Lançamentos', 'Vazia', 'Gabarito', 'Texto']), 'planilha: aba Resumo, uma aba por tabela/grade e o texto');
  const res = XLSX.utils.sheet_to_json(wb.Sheets.Resumo, { header: 1 });
  ok(res[0][0] === 'Relatório de teste' && res.some((r) => r[0] === 'Filtros' && r[1] === 'conta: Nubank · tipo: despesa') && res.some((r) => r[0] === 'Saldo'), 'Resumo com título, filtros e indicadores');
  const L = wb.Sheets['Lançamentos'];
  ok(L.A2.t === 'd' && L.A2.v.getUTCDate() === 1 && L.C3.t === 'n' && L.C3.v === -10.5 && /R\$/.test(L.C3.z || L.C3.w || ''), 'datas como data e valores como número com formato R$ (dá para somar no Excel)');
  ok(XLSX.utils.sheet_to_json(L, { header: 1 }).length === 142 && L['!autofilter'], 'todas as 140 linhas + cabeçalho + total, com filtro automático');
  const nomes = XLSX.read(R.xlsx({ titulo: 'x', secoes: [{ tipo: 'tabela', titulo: 'A/B: C*?[1]', colunas: [{ k: 'a', l: 'A' }], linhas: [{ a: 1 }] }, { tipo: 'tabela', titulo: 'A/B: C*?[1]', colunas: [{ k: 'a', l: 'A' }], linhas: [] }] }, XLSX), { type: 'array' }).SheetNames;
  ok(nomes.length === 3 && nomes[1] !== nomes[2] && !/[/*?[\]:]/.test(nomes.join('')), 'nomes de aba válidos e sem repetir');
  ok(R.slug('Relatório de Finanças: Out/2026') === 'Relatorio_de_Financas_Out_2026', 'nome de arquivo sem acento nem símbolos');
})().catch((e) => { console.error(e); process.exit(1); });
