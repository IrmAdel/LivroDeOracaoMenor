/* Importador de PDF → data/indice.json + data/secoes/*.json
   Roda inteiro no navegador. O PDF não é enviado a nenhum servidor. */
(function (raiz) {
  'use strict';

  // ------------------------------------------------------------ funções puras (testáveis)
  const ROMANO = /^[ivxlc]{1,6}$/i, NUMERO = /^\d{1,3}$/;

  function razaoMaiuscula(s) {
    const L = [...s].filter(c => /\p{L}/u.test(c));
    if (!L.length) return 0;
    return L.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length / L.length;
  }

  /** Itens do pdf.js (camada de texto) → linhas {text,left,right,top,h}, de cima para baixo. */
  function linhasDeItens(items, x0, x1) {
    const its = items
      .filter(i => i.str && i.str.trim() && i.transform[4] >= x0 && i.transform[4] < x1)
      .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 10 }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of its) {
      const l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) < 0.5 * Math.max(l.h, it.h)) l.its.push(it);
      else linhas.push({ y: it.y, h: it.h, its: [it] });
    }
    return linhas.map(l => {
      l.its.sort((a, b) => a.x - b.x);
      let t = '', fim = null;
      for (const it of l.its) {
        if (fim !== null && it.x - fim > 0.12 * l.h && !t.endsWith(' ') && !it.s.startsWith(' ')) t += ' ';
        t += it.s; fim = it.x + it.w;
      }
      return { text: t.replace(/\s+/g, ' ').trim(), left: l.its[0].x, right: Math.max(...l.its.map(i => i.x + i.w)), top: -l.y, h: l.h };
    }).filter(l => l.text);
  }

  const mediana = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const percentil = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

  /** Linhas de uma página → parágrafos classificados. */
  function paginaEmBlocos(linhas, larg, opcoes) {
    let ls = linhas.slice(), cab = null, num = null;
    if (opcoes.removerCab && ls.length) {
      const f = ls[0];
      if (razaoMaiuscula(f.text) > 0.7 && f.text.length >= 3 && f.text.length < 50) cab = ls.shift().text;
    }
    if (opcoes.removerCab && ls.length) {
      const t = ls[ls.length - 1].text.replace(/[.,—\-_ ]/g, '');
      if (t.length <= 5 && (NUMERO.test(t) || ROMANO.test(t))) { num = t; ls.pop(); }
    }
    if (!ls.length) return { cab, num, paras: [] };
    const passo = mediana(ls.slice(1).map((l, i) => l.top - ls[i].top)) || 12;
    const dir = percentil(ls.map(l => l.right), 0.85), esq = percentil(ls.map(l => l.left), 0.2);
    const recuoMin = 0.011 * larg;
    const paras = [];
    let cur = null;
    for (const l of ls) {
      const t = l.text; let novo = false;
      if (!cur) novo = true;
      else {
        const pv = cur.linhas[cur.linhas.length - 1];
        const salto = l.top - pv.top, recuo = l.left - pv.left;
        const curta = (dir - pv.right) > 0.10 * larg;
        if (salto > 1.55 * passo) novo = true;
        else if (recuo > recuoMin && (curta || recuo > 1.3 * recuoMin)) novo = true;
        else if (curta && /^[A-Z\[(‘“"0-9]/.test(t)) novo = true;
        else if (Math.abs(recuo) > 0.12 * larg && (pv.right - pv.left) < 0.7 * (dir - esq)) novo = true;
      }
      if (novo) { cur = { linhas: [l] }; paras.push(cur); } else cur.linhas.push(l);
    }
    for (const q of paras) {
      const L = q.linhas;
      q.textos = L.map(x => x.text);
      const a = Math.min(...L.map(x => x.left)), b = Math.max(...L.map(x => x.right));
      q.centro = Math.abs((a + b) / 2 - (esq + dir) / 2) / larg;
      q.estreito = (b - a) < 0.78 * (dir - esq);
      q.recuo = (a - esq) / larg;
    }
    return { cab, num, paras };
  }

  function classificar(q) {
    const txt = q.textos.join(' '), n = q.linhas.length, car = txt.length;
    const letras = [...txt].filter(c => /\p{L}/u.test(c)).length;
    if (letras < 2 || letras / Math.max(1, car) < 0.45) return 'lixo';
    if (razaoMaiuscula(txt) > 0.8 && car < 90 && n <= 2 && letras >= 4) return 'subtitulo';
    if (q.centro < 0.045 && q.estreito && n <= 2 && car < 80) return 'subsubtitulo';
    if (n === 1 && q.estreito && q.recuo > 0.10 && car < 70) return 'verso';
    return 'texto';
  }

  const RUBRICA = /^(Then (the )?(Priest|Minister|Bishop|People|Congregation|Curate|Clerk|Deacon|all|shall|may|said|is said|follow)|Here (followeth|endeth|ends|the)|Instead of|One of the|Or this|After (this|which|the)|Note[.:]|The (Priest|Minister|Bishop|People|Congregation) (shall|may|is|are|here|then|standing|kneeling))\b/;

  function limpar(s) {
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^[|\\_\-—~.•*]+\s*/, '');
    s = s.replace(/--/g, '—');
    s = s.replace(/^(Priest|People|Minister|Answer|Bishop|Deacon|Curate|Clerk|Congregation)[,;:]\s+(?=[A-Z\[‘“(])/, '$1. ');
    s = s.replace(/ '/g, ' ‘').replace(/'/g, '’').replace(/ "/g, ' “').replace(/"/g, '”');
    return s;
  }

  function juntarLinhas(linhas, vocab, hifenados) {
    let out = '';
    for (let t of linhas) {
      t = t.trim();
      if (!out) { out = t; continue; }
      if (out.endsWith('-') && /^\p{Ll}/u.test(t) && !out.endsWith(' -')) {
        const a = /([\p{L}’]+)-$/u.exec(out), b = /^[\p{L}’]+/u.exec(t);
        if (a && b) {
          const junto = (a[1] + b[0]).toLowerCase(), com = (a[1] + '-' + b[0]).toLowerCase();
          if (vocab.has(junto) || !hifenados.has(com)) { out = out.slice(0, -1) + t; continue; }
        }
        out += t; continue;
      }
      out += ' ' + t;
    }
    return out;
  }

  /**
   * metades: [{linhas, larg}]   (uma por página impressa, na ordem do livro)
   * defs: [{titulo, inicio}]    inicio = nº (base 1) da metade onde a seção começa
   * deslocamento: nº impresso = nº da metade - deslocamento (≤ 0 → sem número)
   */
  function montar(metades, defs, deslocamento, opcoes) {
    const pag = i => { const n = (i + 1) - deslocamento; return n > 0 ? n : null; };
    const seq = [];
    metades.forEach((m, i) => {
      const { paras } = paginaEmBlocos(m.linhas, m.larg, opcoes);
      for (const q of paras) { const k = classificar(q); if (k !== 'lixo') seq.push({ i, pagina: pag(i), tipo: k, textos: q.textos }); }
    });
    const vocab = new Set(), hifenados = new Set();
    for (const b of seq) for (const t of b.textos) {
      for (const w of t.match(/[\p{L}’]+-[\p{L}’]+/gu) || []) hifenados.add(w.toLowerCase());
      for (const w of t.match(/[\p{L}’]+/gu) || []) vocab.add(w.toLowerCase());
    }
    const ord = [...defs].sort((a, b) => a.inicio - b.inicio);
    const secoes = ord.map((d, k) => ({ titulo: d.titulo, inicio: d.inicio - 1, fim: k + 1 < ord.length ? ord[k + 1].inicio - 2 : metades.length - 1, blocos: [] }));
    for (const b of seq) {
      const s = secoes.find(x => b.i >= x.inicio && b.i <= x.fim);
      if (!s) continue;
      let tipo = b.tipo;
      const texto = limpar(tipo === 'verso' ? b.textos[0] : juntarLinhas(b.textos, vocab, hifenados));
      if (!texto) continue;
      if (tipo === 'texto' && RUBRICA.test(texto) && texto.length < 260) tipo = 'rubrica';
      const ant = s.blocos[s.blocos.length - 1];
      if (ant && tipo === 'verso' && ant.tipo === 'verso' && ant.pagina === b.pagina) { ant.texto += '\n' + texto; continue; }
      if (ant && tipo === 'texto' && ant.tipo === 'texto' && ant._i !== b.i && !/[.?!:;\]”’)]$/.test(ant.texto) && /^\p{Ll}/u.test(texto)) { ant.texto += ' ' + texto; ant._i = b.i; continue; }
      s.blocos.push({ tipo, pagina: b.pagina, texto, _i: b.i });
    }
    const usados = new Set();
    return secoes.map((s, k) => {
      let id = String(k + 1).padStart(2, '0') + '-' + (s.titulo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'secao');
      while (usados.has(id)) id += 'x';
      usados.add(id);
      const nums = s.blocos.map(b => b.pagina).filter(n => n != null);
      return { id, titulo: s.titulo, modo: 'prosa',
        paginaInicial: nums.length ? Math.min(...nums) : null, paginaFinal: nums.length ? Math.max(...nums) : null,
        blocos: s.blocos.map(({ tipo, pagina, texto }) => ({ tipo, pagina, texto })) };
    });
  }

  /** Mesmo formato do app.js (um bloco por linha). */
  function serializarSecao(s) {
    const j = JSON.stringify;
    const linhas = s.blocos.map(b => '    {"tipo":' + j(b.tipo) + ',"pagina":' + j(b.pagina) + ',"texto":' + j(b.texto) + '}');
    return '{\n  "id":' + j(s.id) + ',\n  "titulo":' + j(s.titulo) + ',\n  "modo":' + j(s.modo) +
      ',\n  "paginaInicial":' + j(s.paginaInicial) + ',\n  "paginaFinal":' + j(s.paginaFinal) +
      ',\n  "blocos":[\n' + linhas.join(',\n') + '\n  ]\n}\n';
  }
  function serializarIndice(lista) {
    const j = JSON.stringify;
    return '[\n' + lista.map(s => {
      let o = '  {"id":' + j(s.id) + ',"titulo":' + j(s.titulo);
      if (s.paginaInicial != null) o += ',"paginaInicial":' + j(s.paginaInicial);
      if (s.paginaFinal != null) o += ',"paginaFinal":' + j(s.paginaFinal);
      return o + '}';
    }).join(',\n') + '\n]\n';
  }

  const api = { linhasDeItens, paginaEmBlocos, montar, serializarSecao, serializarIndice, razaoMaiuscula };
  if (typeof module !== 'undefined') module.exports = api;
  raiz.Importador = api;

  // ------------------------------------------------------------------------- interface
  if (typeof document === 'undefined') return;
  const $ = s => document.querySelector(s);
  let pdf = null, metades = [], cancelar = false;
  const CORTE = 0.517;   // posição da dobra numa página dupla

  function status(msg, erro) { const e = $('#status'); e.textContent = msg; e.className = erro ? 'erro' : ''; }

  async function abrir(dados) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdf = await pdfjsLib.getDocument({ data: dados }).promise;
      $('#ate').value = pdf.numPages; $('#de').value = 1;
      $('#passo2').hidden = false;
      status(`PDF aberto: ${pdf.numPages} páginas.`);
    } catch (e) { status('Não consegui abrir o PDF: ' + e.message, true); }
  }

  async function extrair() {
    if (!pdf) return;
    cancelar = false; metades = [];
    const de = +$('#de').value, ate = +$('#ate').value, dupla = $('#dupla').checked, ocr = $('#modo').value === 'ocr';
    let worker = null;
    try {
      if (ocr) {
        status('Carregando o OCR (primeira vez baixa ~15 MB)…');
        worker = await Tesseract.createWorker($('#idioma').value);
        await worker.setParameters({ tessedit_pageseg_mode: '4' });
      }
      for (let n = de; n <= ate && !cancelar; n++) {
        status(`${ocr ? 'OCR' : 'Lendo'} página ${n} de ${ate}…`);
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 }), W = vp.width;
        const cortes = dupla ? [[0, W * CORTE], [W * CORTE, W]] : [[0, W]];
        if (!ocr) {
          const items = (await page.getTextContent()).items;
          for (const [a, b] of cortes) metades.push({ pdf: n, linhas: linhasDeItens(items, a, b), larg: b - a });
        } else {
          const esc = 3.5, v = page.getViewport({ scale: esc });
          const cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
          for (const [a, b] of cortes) {
            const x = Math.round(a * esc), w = Math.round((b - a) * esc);
            const parte = document.createElement('canvas'); parte.width = w; parte.height = cv.height;
            parte.getContext('2d').drawImage(cv, x, 0, w, cv.height, 0, 0, w, cv.height);
            const r = await worker.recognize(parte, {}, { blocks: true });
            const ls = (r.data.lines || (r.data.blocks || []).flatMap(bl => bl.paragraphs.flatMap(p => p.lines)))
              .map(l => ({ text: l.text.replace(/\s+/g, ' ').trim(), left: l.bbox.x0, right: l.bbox.x1, top: l.bbox.y0, h: l.bbox.y1 - l.bbox.y0 }))
              .filter(l => l.text);
            metades.push({ pdf: n, linhas: ls, larg: w });
          }
        }
      }
      status(cancelar ? 'Interrompido.' : `Pronto: ${metades.length} páginas lidas.`);
      mostrarPrevia();
    } catch (e) { status('Erro: ' + e.message, true); }
    finally { if (worker) await worker.terminate(); }
  }

  function mostrarPrevia() {
    const corpo = $('#previa tbody'); corpo.replaceChildren();
    const desl = +$('#desloc').value || 0;
    metades.forEach((m, i) => {
      const tr = document.createElement('tr');
      const f = m.linhas[0] ? m.linhas[0].text : '';
      const imp = (i + 1) - desl;
      [i + 1, imp > 0 ? imp : '—', f.slice(0, 60), m.linhas.length].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      corpo.appendChild(tr);
    });
    $('#passo3').hidden = !metades.length;
    if (!metades.length) return;
    const total = metades.reduce((s, m) => s + m.linhas.length, 0);
    if (total < metades.length * 3) status('Quase não saiu texto: este PDF provavelmente é só imagem. Use o modo OCR.', true);
  }

  function detectar() {
    const chave = s => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
    const linhas = []; let ult = '';
    metades.forEach((m, i) => {
      const f = m.linhas[0] && m.linhas[0].text;
      if (f && razaoMaiuscula(f) > 0.7 && f.length >= 3 && f.length < 50 && chave(f) !== ult) {
        ult = chave(f);
        const t = f.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
        linhas.push(`${i + 1}; ${t}`);
      }
    });
    $('#secoes').value = linhas.join('\n');
    status(`${linhas.length} seções sugeridas. Confira e corrija a lista antes de gerar.`);
  }

  function lerDefs() {
    return $('#secoes').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^(\d+)\s*[;|\t]\s*(.+)$/.exec(l);
      return m ? { inicio: +m[1], titulo: m[2].trim() } : null;
    }).filter(Boolean);
  }

  async function gerar() {
    const defs = lerDefs();
    if (!defs.length) { status('Defina ao menos uma seção (linha: nº da página; título).', true); return; }
    const secoes = montar(metades, defs, +$('#desloc').value || 0, { removerCab: $('#cab').checked });
    const zip = new JSZip();
    zip.file('data/indice.json', serializarIndice(secoes));
    for (const s of secoes) zip.file(`data/secoes/${s.id}.json`, serializarSecao(s));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data.zip'; a.click();
    $('#resumo').textContent = secoes.map(s => `${s.titulo}: ${s.blocos.length} blocos`).join(' · ');
    status('data.zip gerado. Extraia-o por cima da pasta do site e publique.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#arquivo').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await abrir(await f.arrayBuffer()); });
    $('#usar-local').addEventListener('click', async () => {
      try { const r = await fetch('shorter_PB.pdf'); if (!r.ok) throw new Error('HTTP ' + r.status); await abrir(await r.arrayBuffer()); }
      catch (e) { status('Não achei o PDF ao lado do site (precisa de servidor, não file://). Use o seletor acima. ' + e.message, true); }
    });
    $('#extrair').addEventListener('click', extrair);
    $('#parar').addEventListener('click', () => { cancelar = true; });
    $('#desloc').addEventListener('input', mostrarPrevia);
    $('#detectar').addEventListener('click', detectar);
    $('#gerar').addEventListener('click', gerar);
  });
})(typeof window !== 'undefined' ? window : globalThis);
