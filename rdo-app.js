/* ============================================================================
   rdo-app.js — RDOs enviados pelo app de campo, dentro do rdo.html
   ----------------------------------------------------------------------------
   Incluído no fim do rdo.html (uma linha). Depois do login:
   - cria a seção "RDO pelo app" com o que chegou no dia mostrado na tela;
   - marca com "app" o card da equipe que mandou RDO pelo celular;
   - abre o RDO completo com as fotos, e imprime (ou salva em PDF);
   - atualiza sozinho quando um RDO novo chega (tempo real do Supabase);
   - mostra o QR code para o encarregado instalar o app (pasta campo/).
   Lê a tabela rdo_campo e o bucket rdo-fotos criados pelo rdo_campo.sql.
   Não altera nada do que a tela já faz.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__rdoApp) return;
  window.__rdoApp = true;

  var TABELA = 'rdo_campo', BUCKET = 'rdo-fotos';
  var CLIMA = { bom: 'Bom', nublado: 'Nublado', chuva: 'Chuva', impraticavel: 'Impraticável' };
  var ETAPA = { antes: 'Antes', durante: 'Durante', depois: 'Depois' };
  var SVG_CEL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/></svg>';
  var st = { sb: null, data: '', dataPagina: '', linhas: [], erro: '', carregando: false, canal: null, urls: {}, aberta: null };

  // ─── utilidades ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function isoDeTexto(t) {
    var s = String(t || ''), m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : '';
  }
  function br(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function hora(t) { return t ? String(t).slice(0, 5) : ''; }
  function quando(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' às ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function num(n) { return n == null || n === '' ? '' : String(n).replace('.', ','); }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function unidadeTx(u) {
    var x = String(u || '').trim(), m = { UN: 'un', UND: 'un', M: 'm', M2: 'm²', KG: 'kg', TKM: 't·km', KM: 'km', H: 'h', VB: 'vb' };
    return m[x.toUpperCase()] || x.toLowerCase();
  }
  function normTx(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }
  function numCodigo(c) { var m = String(c || '').match(/(\d+)\s*$/); return m ? +m[1] : 1e9; }

  // ─── ligação com a tela RDO (funções e variáveis do rdo.html) ───────────
  function dataDaPagina() {
    try {
      if (typeof rdoModoHistorico !== 'undefined' && rdoModoHistorico) {
        var h = $('rdo-hist-date'); if (h && h.value) return h.value;
      }
    } catch (e) {}
    try { if (typeof rdoDate !== 'undefined' && rdoDate) { var d = isoDeTexto(rdoDate); if (d) return d; } } catch (e) {}
    return hojeISO();
  }
  function codigoInterno(c) {
    try { if (typeof rdoResolverEquipe === 'function') return rdoResolverEquipe(c) || c; } catch (e) {}
    return c;
  }
  function nomeEquipe(c) {
    try { if (typeof rdoDisplayName === 'function') return rdoDisplayName(codigoInterno(c)) || c; } catch (e) {}
    return c;
  }
  function passaFiltro(c) {
    try { if (typeof rdoFilter === 'function') return rdoFilter([codigoInterno(c)]).length > 0; } catch (e) {}
    return true;
  }
  function visiveis() { return st.linhas.filter(function (r) { return passaFiltro(r.equipe_codigo); }); }

  // ─── estilos ────────────────────────────────────────────────────────────
  function injetarCss() {
    if (document.getElementById('rdoapp-css')) return;
    var css = [
      '#rdoapp .section-header{flex-wrap:wrap;gap:10px}',
      '#rdoapp .rdoapp-ic{width:26px;height:26px;border-radius:6px;background:#2b6cb0;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '#rdoapp .rdoapp-ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto}',
      '#rdoapp .rdoapp-ctl input[type=date]{height:32px;padding:0 8px;border:1px solid #c5d3e0;border-radius:8px;font-family:"Barlow",sans-serif;font-weight:700;font-size:.85rem;color:#1f2a35;background:#fff}',
      '.rdoapp-bt{height:32px;padding:0 12px;border-radius:8px;border:1px solid #c5d3e0;background:#fff;color:#1f4f7a;font-family:"Barlow",sans-serif;font-weight:700;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}',
      '.rdoapp-bt:hover{border-color:#2b6cb0}',
      '.rdoapp-bt:focus-visible,.rdoapp-card:focus-visible,.rdoapp-badge:focus-visible{outline:2px solid #0d7377;outline-offset:2px}',
      '.rdoapp-bt.forte{background:#0d7377;border-color:#0d7377;color:#fff}',
      '#rdoapp .section-count{color:#2b6cb0}',
      '.rdoapp-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:8px;padding:12px 22px}',
      '.rdoapp-card{display:flex;flex-direction:column;gap:3px;text-align:left;padding:10px 12px;border:1px solid #dfe6ec;border-left:4px solid #2b6cb0;border-radius:6px;background:#fff;cursor:pointer;font-family:"Barlow",sans-serif;color:#1f2a35;min-width:0}',
      '.rdoapp-card:hover{background:#f5f9fd}',
      '.rdoapp-card .l1{display:flex;align-items:baseline;gap:8px}',
      '.rdoapp-card .eq{font-weight:800;font-size:.92rem;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rdoapp-card .hr{font-size:.75rem;font-weight:700;color:#718096;white-space:nowrap}',
      '.rdoapp-card .ob{font-size:.84rem;font-weight:600;color:#2d3748;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.rdoapp-card .mt{font-size:.78rem;font-weight:600;color:#718096}',
      '.rdoapp-card .pr{align-self:flex-start;margin-top:2px;padding:2px 8px;border-radius:5px;background:#fff3e0;color:#8a4b00;font-size:.74rem;font-weight:800}',
      '.rdoapp-vazio{grid-column:1/-1;padding:4px 0;font-size:.85rem;font-weight:600;color:#8a96a3}',
      '.rdoapp-erro{grid-column:1/-1;padding:10px 12px;border-radius:8px;background:#fff5f5;color:#9b2c2c;font-size:.85rem;font-weight:700}',
      '.rdoapp-badge{display:inline-flex;align-items:center;gap:3px;flex-shrink:0;margin-left:6px;padding:1px 6px 1px 4px;border-radius:5px;background:#2b6cb0;color:#fff;font-size:.68rem;font-weight:800;line-height:1.5;cursor:pointer;letter-spacing:.2px}',
      '.rdoapp-badge svg{width:12px;height:12px}',
      // modal
      '.rdoapp-fundo{position:fixed;inset:0;z-index:1300;background:rgba(10,20,30,.68);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow-y:auto;backdrop-filter:blur(3px)}',
      '.rdoapp-modal{width:100%;max-width:860px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.3);font-family:"Barlow",sans-serif;color:#1f2a35}',
      '.rdoapp-cab{display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(135deg,#0b5e62,#0d7377);color:#fff;border-bottom:3px solid #ff6b35}',
      '.rdoapp-cab h2{font-size:1.1rem;font-weight:800;margin:0;line-height:1.2}',
      '.rdoapp-cab p{font-size:.78rem;font-weight:600;opacity:.8;margin:2px 0 0}',
      '.rdoapp-cab .tx{flex:1;min-width:0}',
      '.rdoapp-cab .rdoapp-bt{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);color:#fff}',
      '.rdoapp-corpo{padding:16px 18px 20px}',
      '.rdoapp-ficha{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 18px;margin-bottom:6px}',
      '.rdoapp-ficha div{min-width:0}',
      '.rdoapp-ficha dt{font-size:.72rem;font-weight:700;color:#718096}',
      '.rdoapp-ficha dd{margin:1px 0 0;font-size:.92rem;font-weight:700;overflow-wrap:anywhere}',
      '.rdoapp-sec{font-size:.95rem;font-weight:800;color:#0b5e62;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0}',
      '.rdoapp-tab{width:100%;border-collapse:collapse;font-size:.88rem}',
      '.rdoapp-tab th{text-align:left;font-size:.72rem;color:#718096;font-weight:700;padding:4px 8px 6px 0}',
      '.rdoapp-tab td{padding:6px 8px 6px 0;border-top:1px solid #edf2f7;font-weight:600}',
      '.rdoapp-tab td.n{white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.rdoapp-tx{white-space:pre-wrap;font-size:.9rem;font-weight:600;background:#f7fafc;border-radius:8px;padding:10px 12px;margin:0}',
      '.rdoapp-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}',
      '.rdoapp-foto{min-width:0}',
      '.rdoapp-foto{margin:0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f7fafc}',
      '.rdoapp-foto a{display:block;aspect-ratio:3/4;background:#dfe5ea}',
      '.rdoapp-foto img{width:100%;height:100%;object-fit:contain;display:block}',   // inteira, com o carimbo à vista
      '.rdoapp-foto figcaption{padding:6px 8px;font-size:.76rem;font-weight:600;color:#4a5568}',
      '.rdoapp-foto figcaption b{color:#1f2a35}',
      '.rdoapp-rodape{margin-top:18px;font-size:.78rem;font-weight:600;color:#718096}',
      '.rdoapp-rodape a{color:#0d7377;font-weight:800}',
      '.rdoapp-qr{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}',
      '.rdoapp-qr #rdoapp-qrcode{padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;line-height:0}',
      '.rdoapp-qr ol{margin:0;padding-left:20px;font-size:.92rem;font-weight:600;line-height:1.6;flex:1;min-width:220px}',
      '.rdoapp-link{display:flex;gap:8px;margin-top:14px}',
      '.rdoapp-link input{flex:1;min-width:0;height:34px;padding:0 10px;border:1px solid #c5d3e0;border-radius:8px;font-family:"Barlow",sans-serif;font-weight:700;font-size:.85rem;color:#1f2a35;background:#fff}',
      '.rdoapp-fora{display:inline-block;padding:1px 6px;border-radius:5px;background:#fff3e0;color:#8a4b00;font-size:.74rem;font-weight:800;white-space:nowrap}',
      '.rdoapp-grp{display:block;font-size:.72rem;font-weight:700;color:#8a96a3}',
      '.rdoapp-cat-st{margin:0 0 12px;font-size:.92rem;font-weight:700}',
      '.rdoapp-cat-imp{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
      '.rdoapp-cat-imp span{flex:1;min-width:240px;font-size:.82rem;font-weight:600;color:#718096}',
      '.rdoapp-cat-prev{margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#f0f7f7;border:1px solid #cfe3e3;font-size:.9rem;font-weight:600;line-height:1.5}',
      '.rdoapp-cat-prev.erro{background:#fff5f5;border-color:#fed7d7;color:#9b2c2c}',
      '.rdoapp-cat-prev.ok{background:#f0fff4;border-color:#c6f6d5;color:#22543d}',
      '.rdoapp-cat-prev .bts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}',
      '.rdoapp-cat-tab{max-height:46vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;margin-top:10px}',
      '.rdoapp-cat-tab .rdoapp-tab th{position:sticky;top:0;background:#fff;padding:8px 8px 6px}',
      '.rdoapp-cat-tab .rdoapp-tab td{padding:6px 8px}',
      'body.dark .rdoapp-cat-prev{background:var(--e-elev,#1a1a1a);border-color:var(--e-linha2,#303030);color:var(--e-texto,#f2f2f2)}',
      'body.dark .rdoapp-cat-tab{border-color:var(--e-linha,#222)}',
      'body.dark .rdoapp-cat-tab .rdoapp-tab th{background:var(--e-painel,#0a0a0a)}',
      // modo escuro do sistema (nav.js)
      'body.dark #rdoapp .section-header{background:color-mix(in srgb,#2b6cb0 14%,var(--e-cartao,#111)) !important;border-bottom-color:color-mix(in srgb,#2b6cb0 38%,var(--e-cartao,#111)) !important}',
      'body.dark #rdoapp .section-count{color:#90cdf4 !important}',
      'body.dark .rdoapp-bt,body.dark #rdoapp .rdoapp-ctl input[type=date],body.dark .rdoapp-link input{background:var(--e-elev,#1a1a1a);border-color:var(--e-linha2,#303030);color:var(--e-texto,#f2f2f2);color-scheme:dark}',
      'body.dark .rdoapp-bt.forte{background:#14a085;border-color:#14a085;color:#fff}',
      'body.dark .rdoapp-cab .rdoapp-bt{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);color:#fff}',
      'body.dark .rdoapp-card{background:var(--e-cartao,#111);border-color:var(--e-linha,#222);border-left-color:#4f8fd6;color:var(--e-texto,#f2f2f2)}',
      'body.dark .rdoapp-card:hover{background:var(--e-elev,#1a1a1a)}',
      'body.dark .rdoapp-card .ob{color:var(--e-texto,#f2f2f2)}',
      'body.dark .rdoapp-card .hr,body.dark .rdoapp-card .mt,body.dark .rdoapp-vazio{color:var(--e-texto2,#b8b8b8)}',
      'body.dark .rdoapp-modal{background:var(--e-painel,#0a0a0a);color:var(--e-texto,#f2f2f2)}',
      'body.dark .rdoapp-ficha dt,body.dark .rdoapp-tab th,body.dark .rdoapp-rodape{color:var(--e-texto2,#b8b8b8)}',
      'body.dark .rdoapp-sec{color:#5eead4;border-bottom-color:var(--e-linha,#222)}',
      'body.dark .rdoapp-tab td{border-top-color:var(--e-linha,#222)}',
      'body.dark .rdoapp-foto a{background:#000}',
      'body.dark .rdoapp-tx,body.dark .rdoapp-foto{background:var(--e-elev,#1a1a1a);border-color:var(--e-linha,#222)}',
      'body.dark .rdoapp-foto figcaption,body.dark .rdoapp-foto figcaption b{color:var(--e-texto,#f2f2f2)}'
    ].join('\n');
    var s = document.createElement('style'); s.id = 'rdoapp-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  // ─── seção na tela ──────────────────────────────────────────────────────
  function montarSecao() {
    var pagina = $('rdo-page'); if (!pagina || $('rdoapp')) return !!$('rdoapp');
    var sec = document.createElement('div');
    sec.className = 'section'; sec.id = 'rdoapp';
    sec.innerHTML =
      '<div class="section-header blue">' +
        '<div class="section-label"><div class="rdoapp-ic">' + SVG_CEL + '</div> RDO pelo app</div>' +
        '<span class="section-count" id="rdoapp-n">0</span>' +
        '<div class="rdoapp-ctl">' +
          '<input type="date" id="rdoapp-data" aria-label="Dia dos RDOs do app">' +
          '<button type="button" class="rdoapp-bt" id="rdoapp-atualizar">Atualizar</button>' +
          '<button type="button" class="rdoapp-bt" id="rdoapp-catalogo">Lista de serviços</button>' +
          '<button type="button" class="rdoapp-bt forte" id="rdoapp-instalar">' + SVG_CEL + ' Instalar no celular</button>' +
        '</div>' +
      '</div>' +
      '<div class="rdoapp-lista" id="rdoapp-lista"><div class="rdoapp-vazio">Carregando…</div></div>';
    pagina.appendChild(sec);
    $('rdoapp-data').addEventListener('change', function () { if (this.value) { st.data = this.value; carregar(); } });
    $('rdoapp-atualizar').addEventListener('click', carregar);
    $('rdoapp-instalar').addEventListener('click', abrirInstalar);
    $('rdoapp-catalogo').addEventListener('click', abrirCatalogo);
    $('rdoapp-lista').addEventListener('click', function (e) {
      var c = e.target.closest('[data-rdoapp]'); if (c) abrir(c.dataset.rdoapp);
    });
    return true;
  }

  function renderLista() {
    var box = $('rdoapp-lista'); if (!box) return;
    $('rdoapp-data').value = st.data;
    var vis = visiveis();
    $('rdoapp-n').textContent = vis.length;
    if (st.erro) { box.innerHTML = '<div class="rdoapp-erro">' + esc(st.erro) + '</div>'; return; }
    if (st.carregando && !st.linhas.length) { box.innerHTML = '<div class="rdoapp-vazio">Carregando…</div>'; return; }
    if (!vis.length) {
      box.innerHTML = '<div class="rdoapp-vazio">' + (st.linhas.length
        ? 'Nenhum RDO do app no filtro selecionado.'
        : 'Nenhum RDO enviado pelo app em ' + esc(br(st.data)) + '.') + '</div>';
      return;
    }
    box.innerHTML = vis.slice().sort(function (a, b) {
      return String(nomeEquipe(a.equipe_codigo)).localeCompare(String(nomeEquipe(b.equipe_codigo)));
    }).map(function (r) {
      var obra = [r.pep, r.nome_obra].filter(Boolean).join(', ') || 'Obra não informada';
      var nf = lista(r.fotos).length;
      var meta = [hora(r.hora_inicio) ? hora(r.hora_inicio) + (r.hora_fim ? ' às ' + hora(r.hora_fim) : '') : '',
                  (r.efetivo || 0) + ' pessoas', nf + (nf === 1 ? ' foto' : ' fotos')].filter(Boolean).join(', ');
      var par = r.paralisacao ? '<span class="pr">Paralisação: ' + esc(r.paralisacao.motivo || '') +
        (r.paralisacao.horas ? ' (' + esc(num(r.paralisacao.horas)) + ' h)' : '') + '</span>' : '';
      return '<button type="button" class="rdoapp-card" data-rdoapp="' + esc(r.id) + '">' +
        '<span class="l1"><span class="eq">' + esc(nomeEquipe(r.equipe_codigo)) + '</span>' +
        '<span class="hr">chegou ' + esc(quando(r.recebido_em).split(' às ')[1] || '') + '</span></span>' +
        '<span class="ob">' + esc(obra) + '</span><span class="mt">' + esc(meta) + '</span>' + par + '</button>';
    }).join('');
  }

  // Marca "app" no card da equipe nas grades Lançou / Justificada / Não lançou
  function marcarCards() {
    document.querySelectorAll('#rdo-page .rdoapp-badge').forEach(function (b) { b.remove(); });
    if (st.data !== st.dataPagina || !st.linhas.length) return;
    var porNome = {};
    st.linhas.forEach(function (r) { var n = String(nomeEquipe(r.equipe_codigo)); (porNome[n] = porNome[n] || []).push(r); });
    document.querySelectorAll('#rdo-page .grid .card-name').forEach(function (el) {
      var rs = porNome[el.getAttribute('title') || el.textContent];
      if (!rs) return;
      var b = document.createElement('span');
      b.className = 'rdoapp-badge'; b.tabIndex = 0; b.setAttribute('role', 'button');
      b.title = rs.length === 1 ? 'Mandou RDO pelo app. Clique para ver.' : 'Mandou ' + rs.length + ' RDOs pelo app. Clique para ver.';
      b.innerHTML = SVG_CEL + 'app' + (rs.length > 1 ? ' ' + rs.length : '');
      var ir = function (e) {
        e.stopPropagation(); e.preventDefault();
        if (rs.length === 1) abrir(rs[0].id);
        else { var s = $('rdoapp'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
      b.addEventListener('click', ir);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') ir(e); });
      el.parentNode.appendChild(b);
    });
  }

  // ─── dados ──────────────────────────────────────────────────────────────
  function traduzErro(e) {
    var m = String((e && (e.message || e.error)) || e || '');
    if (/rdo_campo|could not find the table|schema cache|does not exist/i.test(m))
      return 'A tabela do app ainda não existe no banco. Rode o arquivo rdo_campo.sql no Supabase (SQL Editor → New query → Run).';
    if (/jwt|permission|row-level/i.test(m)) return 'Sem permissão para ler os RDOs do app. Entre de novo no sistema.';
    if (/fetch|network|load failed/i.test(m)) return 'Sem conexão com o banco agora. Toque em Atualizar quando a internet voltar.';
    return 'Não deu para ler os RDOs do app: ' + m;
  }

  async function carregar() {
    if (!st.sb || !st.data) return;
    var dia = st.data;
    st.carregando = true; st.erro = ''; renderLista();
    try {
      var r = await st.sb.from(TABELA).select('*').eq('data', dia).order('recebido_em', { ascending: false });
      if (dia !== st.data) return;                 // trocou de dia no meio da busca
      if (r.error) throw r.error;
      st.linhas = Array.isArray(r.data) ? r.data : [];
    } catch (e) {
      st.linhas = []; st.erro = traduzErro(e);
    } finally {
      if (dia === st.data) { st.carregando = false; renderLista(); marcarCards(); }
    }
  }

  async function urlsAssinadas(paths) {
    var agora = Date.now(), falta = paths.filter(function (p) { var u = st.urls[p]; return !u || u.vence < agora; });
    if (falta.length) {
      var r = await st.sb.storage.from(BUCKET).createSignedUrls(falta, 3600);
      if (r.error) throw r.error;
      lista(r.data).forEach(function (x) { if (x && x.signedUrl) st.urls[x.path] = { url: x.signedUrl, vence: agora + 50 * 60 * 1000 }; });
    }
    var out = {}; paths.forEach(function (p) { if (st.urls[p]) out[p] = st.urls[p].url; });
    return out;
  }

  // ─── RDO aberto ─────────────────────────────────────────────────────────
  function fecharModal() {
    var f = $('rdoapp-fundo'); if (f) f.remove();
    document.removeEventListener('keydown', escFecha);
    if (st.voltarFoco) { try { st.voltarFoco.focus(); } catch (e) {} st.voltarFoco = null; }
    st.aberta = null;
  }
  function escFecha(e) { if (e.key === 'Escape') fecharModal(); }
  function abrirModal(html, rotulo) {
    fecharModal();
    st.voltarFoco = document.activeElement;
    var f = document.createElement('div');
    f.className = 'rdoapp-fundo'; f.id = 'rdoapp-fundo';
    f.innerHTML = '<div class="rdoapp-modal" role="dialog" aria-modal="true" aria-label="' + esc(rotulo) + '">' + html + '</div>';
    f.addEventListener('click', function (e) { if (e.target === f || e.target.closest('[data-rdoapp-fechar]')) fecharModal(); });
    document.body.appendChild(f);
    document.addEventListener('keydown', escFecha);
    var bt = f.querySelector('[data-rdoapp-fechar]'); if (bt) bt.focus();
    return f;
  }

  function climaTx(v) { return CLIMA[v] || 'não informado'; }

  function corpoRdo(r, urls) {
    var serv = lista(r.servicos), nomes = lista(r.efetivo_nomes), fotos = lista(r.fotos);
    var item = function (rot, val) { return val ? '<div><dt>' + esc(rot) + '</dt><dd>' + esc(val) + '</dd></div>' : ''; };
    var h = '<dl class="rdoapp-ficha">' +
      item('PEP / obra', r.pep) + item('Nome da obra', r.nome_obra) + item('Município', r.municipio) +
      item('Atividade programada', r.atividade) +
      item('Horário', hora(r.hora_inicio) ? hora(r.hora_inicio) + (r.hora_fim ? ' às ' + hora(r.hora_fim) : '') : '') +
      item('Clima', 'Manhã ' + climaTx(r.clima_manha).toLowerCase() + ', tarde ' + climaTx(r.clima_tarde).toLowerCase()) +
      item('Pessoas', String(r.efetivo || 0)) + item('Encarregado', r.encarregado) +
      '</dl>';
    if (serv.length) {
      h += '<h3 class="rdoapp-sec">Serviços executados</h3><table class="rdoapp-tab"><thead><tr><th>Código</th><th>Serviço</th><th>Feito</th></tr></thead><tbody>' +
        serv.map(function (s) {
          return '<tr><td class="n">' + (s.codigo ? '<b>' + esc(s.codigo) + '</b>' : '<span class="rdoapp-fora">fora da lista</span>') + '</td>' +
            '<td>' + esc(s.descricao) + (s.grupo ? '<span class="rdoapp-grp">' + esc(s.grupo) + '</span>' : '') + '</td>' +
            '<td class="n">' + (s.qtd != null ? esc(num(s.qtd)) + ' ' + esc(unidadeTx(s.unidade)) : '—') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    if (r.paralisacao) {
      h += '<h3 class="rdoapp-sec">Paralisação</h3><p class="rdoapp-tx">' + esc(r.paralisacao.motivo || 'Sem motivo') +
        ', ' + esc(num(r.paralisacao.horas || 0)) + ' h parado.' + (r.paralisacao.descricao ? '\n' + esc(r.paralisacao.descricao) : '') + '</p>';
    }
    if (nomes.length) {
      h += '<h3 class="rdoapp-sec">Quem trabalhou</h3><table class="rdoapp-tab"><tbody>' + nomes.map(function (p) {
        return '<tr><td>' + esc(p.nome || '—') + '</td><td>' + esc(p.funcao || '') + '</td><td class="n">' + esc(p.matricula || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    if (r.observacoes) h += '<h3 class="rdoapp-sec">Observações</h3><p class="rdoapp-tx">' + esc(r.observacoes) + '</p>';
    h += '<h3 class="rdoapp-sec">Fotos (' + fotos.length + ')</h3>';
    h += fotos.length ? '<div class="rdoapp-fotos">' + fotos.map(function (f, i) {
      var u = urls && urls[f.path];
      var leg = '<b>' + esc(ETAPA[f.etapa] || f.etapa || '') + '</b>' + (f.legenda ? ', ' + esc(f.legenda) : '') +
        '<br>' + esc(quando(f.tirada_em)) + (f.origem === 'galeria' ? ', da galeria' : '') +
        (f.lat != null ? ', ±' + esc(f.precisao || '?') + ' m' : ', sem GPS');
      return '<figure class="rdoapp-foto">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="Abrir foto ' + (i + 1) + ' em tamanho real"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + '" loading="lazy"></a>'
        : '<a aria-hidden="true"></a>') + '<figcaption>' + leg + '</figcaption></figure>';
    }).join('') + '</div>' : '<p class="rdoapp-tx">Sem fotos.</p>';
    var mapa = r.lat != null ? ' <a href="https://www.google.com/maps?q=' + encodeURIComponent(r.lat + ',' + r.lng) + '" target="_blank" rel="noopener">Abrir no mapa</a>' : '';
    h += '<p class="rdoapp-rodape">Enviado por ' + esc(r.autor_email || 'usuário sem e-mail') + ', finalizado no celular em ' + esc(quando(r.finalizado_em) || '—') +
      ' e recebido em ' + esc(quando(r.recebido_em)) + '. ' +
      (r.lat != null ? 'Local: ' + esc(Number(r.lat).toFixed(6)) + ', ' + esc(Number(r.lng).toFixed(6)) + ' (±' + esc(r.precisao_m || '?') + ' m).' : 'Sem localização.') + mapa + '</p>';
    return h;
  }

  function abrir(id) {
    var r = st.linhas.filter(function (x) { return x.id === id; })[0];
    if (r) abrirLinha(r);
  }
  async function abrirLinha(r) {
    if (!r) return;
    st.sb = st.sb || window.MARIUA_SB;
    injetarCss();
    var cab = '<div class="rdoapp-cab"><div class="tx"><h2>' + esc(nomeEquipe(r.equipe_codigo)) + '</h2>' +
      '<p>RDO de ' + esc(br(r.data)) + ', enviado pelo app</p></div>' +
      '<button type="button" class="rdoapp-bt" id="rdoapp-imprimir">Imprimir</button>' +
      '<button type="button" class="rdoapp-bt" data-rdoapp-fechar aria-label="Fechar">Fechar</button></div>';
    var f = abrirModal(cab + '<div class="rdoapp-corpo" id="rdoapp-corpo">' + corpoRdo(r, null) + '</div>', 'RDO de ' + nomeEquipe(r.equipe_codigo));
    st.aberta = r;   // depois de abrirModal, que limpa o anterior
    $('rdoapp-imprimir').addEventListener('click', function () { imprimir(r); });
    var paths = lista(r.fotos).map(function (x) { return x.path; }).filter(Boolean);
    if (!paths.length) return;
    try {
      var urls = await urlsAssinadas(paths);
      if (st.aberta === r && document.body.contains(f)) $('rdoapp-corpo').innerHTML = corpoRdo(r, urls);
    } catch (e) {
      if (st.aberta === r) {
        var p = document.createElement('p'); p.className = 'rdoapp-erro'; p.style.marginTop = '12px';
        p.textContent = 'Não deu para carregar as fotos: ' + (e.message || e);
        $('rdoapp-corpo').appendChild(p);
      }
    }
  }

  async function imprimir(r) {
    // A janela abre já no clique (senão o navegador bloqueia) e depois recebe a
    // página pronta, que se imprime sozinha quando todas as fotos carregaram.
    var w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return; }
    try { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">Preparando o RDO para imprimir…</p>'; } catch (e) {}
    var urls = {};
    try { urls = await urlsAssinadas(lista(r.fotos).map(function (x) { return x.path; }).filter(Boolean)); } catch (e) {}
    var logo = ''; try { logo = new URL('logo-mariua.png', window.MARIUA_BASE || location.href).href; } catch (e) {}
    var css = '@page{size:A4;margin:14mm}body{font-family:Barlow,Arial,sans-serif;color:#1f2a35;margin:0}' +
      '.topo{display:flex;align-items:center;gap:12px;border-bottom:3px solid #ff6b35;padding-bottom:8px;margin-bottom:12px}' +
      '.topo img{height:40px}.topo h1{font-size:18px;margin:0}.topo p{margin:2px 0 0;font-size:12px;color:#555}' +
      '.rdoapp-ficha{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;margin:0}' +
      '.rdoapp-ficha dt{font-size:10px;color:#666;font-weight:700}.rdoapp-ficha dd{margin:0;font-size:12.5px;font-weight:700}' +
      '.rdoapp-sec{font-size:13px;color:#0b5e62;border-bottom:1px solid #ccc;padding-bottom:3px;margin:14px 0 6px;break-after:avoid}' +
      '.rdoapp-tab{width:100%;border-collapse:collapse;font-size:11.5px}.rdoapp-tab th{text-align:left;font-size:10px;color:#666;padding:2px 6px 4px 0}' +
      '.rdoapp-tab td{padding:4px 6px 4px 0;border-top:1px solid #e5e5e5}.rdoapp-tx{white-space:pre-wrap;font-size:11.5px;margin:0}' +
      '.rdoapp-fotos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rdoapp-foto{margin:0;min-width:0;break-inside:avoid;border:1px solid #ddd}' +
      '.rdoapp-foto a{display:block}.rdoapp-foto img{width:100%;height:auto;max-height:105mm;object-fit:contain;background:#f2f2f2;display:block}.rdoapp-foto figcaption{font-size:10px;padding:4px 6px}' +
      '.rdoapp-rodape{font-size:10px;color:#555;margin-top:12px}.rdoapp-rodape a{display:none}';
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>RDO ' + esc(nomeEquipe(r.equipe_codigo)) + ' ' + esc(br(r.data)) +
      '</title><style>' + css + '</style></head><body>' +
      '<div class="topo">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<div><h1>Relatório Diário de Obra, ' + esc(nomeEquipe(r.equipe_codigo)) + '</h1>' +
      '<p>' + esc(br(r.data)) + ', enviado pelo app de campo</p></div></div>' +
      corpoRdo(r, urls).replace(/ loading="lazy"/g, '') +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},300);});<\/script>' +
      '</body></html>';
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    try { w.location.replace(url); } catch (e) { w.location.href = url; }
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }

  // ─── lista de serviços do app (precificação) ────────────────────────────
  // O escritório exporta a precificação de serviços do sistema da concessionária
  // e importa aqui. Só gestor grava (a função do banco confere). Preço não é guardado.
  var CATS = { linhas: [], itens: null, resumo: null };

  function lerArquivo(file) {
    return file.arrayBuffer().then(function (buf) {
      var t = new TextDecoder('utf-8').decode(buf);
      if (t.indexOf('\uFFFD') >= 0) t = new TextDecoder('windows-1252').decode(buf);   // CSV salvo pelo Excel
      return t.replace(/^\uFEFF/, '');
    });
  }
  function parseCsv(t) {
    var l1 = t.split(/\r?\n/, 1)[0] || '';
    var sep = l1.split(';').length >= l1.split(',').length ? ';' : ',';
    var linhas = [], reg = [], campo = '', aspas = false;
    var fecha = function () { reg.push(campo); campo = ''; if (reg.some(function (c) { return c.trim(); })) linhas.push(reg); reg = []; };
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (aspas) {
        if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { reg.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fecha(); }
      else campo += ch;
    }
    fecha();
    return linhas;
  }
  function itensDoCsv(linhas) {
    var cab = (linhas[0] || []).map(normTx);
    var col = function () { for (var k = 0; k < arguments.length; k++) { var i = cab.indexOf(arguments[k]); if (i >= 0) return i; } return -1; };
    var ix = {
      codigo: col('CODIGO SERVICO'), descricao: col('DESCRICAO SERVICO'), contrato: col('CONTRATO'),
      unidade: col('UNIDADE'), grupo: col('GRUPO'), casas: col('N CASAS DECIMAIS', 'NO CASAS DECIMAIS', 'CASAS DECIMAIS'),
      fator: col('FATOR K'), permite: col('PERMITE MAIOR PREV'), zona: col('ZONA'),
      ini: col('DATA VIGENCIA INICIAL'), fim: col('DATA VIGENCIA FINAL')
    };
    var faltam = [];
    if (ix.codigo < 0) faltam.push('Código Serviço');
    if (ix.descricao < 0) faltam.push('Descrição Serviço');
    if (ix.contrato < 0) faltam.push('Contrato');
    if (faltam.length) throw new Error('Este arquivo não parece a precificação de serviços. Faltam as colunas: ' + faltam.join(', ') + '.');
    var v = function (r, i) { return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; };
    var dt = function (t) { var m = String(t || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : ''; };
    return linhas.slice(1).map(function (r) {
      return {
        contrato: v(r, ix.contrato), codigo: v(r, ix.codigo), descricao: v(r, ix.descricao),
        unidade: v(r, ix.unidade), casas: v(r, ix.casas).replace(/\D/g, '') || '0', grupo: v(r, ix.grupo),
        fator_k: v(r, ix.fator).replace(/\./g, '').replace(',', '.'),
        permite_maior_prev: ix.permite >= 0 ? (/^s/i.test(v(r, ix.permite)) ? 'true' : 'false') : '',
        zona: v(r, ix.zona), vigencia_ini: dt(v(r, ix.ini)), vigencia_fim: dt(v(r, ix.fim))
      };
    }).filter(function (x) { return x.codigo && x.descricao && x.contrato; });
  }
  function compararComAtual(itens) {
    var atual = {}; CATS.linhas.forEach(function (x) { if (x.ativo) atual[x.contrato + '|' + x.codigo] = x; });
    var vistos = {}, contratos = {}, grupos = {}, novos = 0, mudados = 0;
    itens.forEach(function (x) {
      var k = x.contrato + '|' + x.codigo; if (vistos[k]) return; vistos[k] = 1;
      contratos[x.contrato] = 1; grupos[x.grupo || 'Sem grupo'] = (grupos[x.grupo || 'Sem grupo'] || 0) + 1;
      var a = atual[k];
      if (!a) novos++;
      else if (a.descricao !== x.descricao || (a.unidade || '') !== x.unidade || String(a.casas_decimais) !== String(+x.casas) || (a.grupo || '') !== x.grupo) mudados++;
    });
    var saem = Object.keys(atual).filter(function (k) { return contratos[k.split('|')[0]] && !vistos[k]; }).length;
    return { total: Object.keys(vistos).length, novos: novos, mudados: mudados, saem: saem, contratos: Object.keys(contratos), grupos: grupos };
  }

  async function carregarCatalogoAtual() {
    var r = await st.sb.from('servicos_catalogo')
      .select('contrato,codigo,descricao,unidade,grupo,casas_decimais,ativo,atualizado_em,atualizado_por').range(0, 4999);
    if (r.error) throw r.error;
    CATS.linhas = r.data || [];
  }
  function statusCatalogo() {
    var ativos = CATS.linhas.filter(function (x) { return x.ativo; });
    if (!ativos.length) return 'Nenhuma lista importada ainda. Enquanto isso, o encarregado aponta escrevendo o serviço.';
    var porCt = {}; ativos.forEach(function (x) { porCt[x.contrato] = (porCt[x.contrato] || 0) + 1; });
    var ult = ativos.reduce(function (a, b) { return (b.atualizado_em || '') > (a.atualizado_em || '') ? b : a; });
    return Object.keys(porCt).map(function (ct) { return porCt[ct] + ' serviços em uso no contrato ' + ct; }).join('; ') +
      '. Última importação em ' + quando(ult.atualizado_em) + (ult.atualizado_por ? ' por ' + ult.atualizado_por : '') + '.';
  }
  function renderTabelaCatalogo() {
    var box = $('rdoapp-cat-tab'); if (!box) return;
    var q = normTx($('rdoapp-cat-busca').value);
    var ativos = CATS.linhas.filter(function (x) { return x.ativo && (!q || normTx(x.codigo + ' ' + x.descricao + ' ' + (x.grupo || '')).indexOf(q) >= 0); })
      .sort(function (a, b) { return numCodigo(a.codigo) - numCodigo(b.codigo) || String(a.codigo).localeCompare(String(b.codigo)); });
    if (!ativos.length) { box.innerHTML = '<p class="rdoapp-vazio" style="padding:12px">' + (q ? 'Nada encontrado.' : 'A lista está vazia.') + '</p>'; return; }
    var mostra = ativos.slice(0, 300);
    box.innerHTML = '<table class="rdoapp-tab"><thead><tr><th>Código</th><th>Serviço</th><th>Unidade</th><th>Grupo</th></tr></thead><tbody>' +
      mostra.map(function (x) {
        return '<tr><td class="n"><b>' + esc(x.codigo) + '</b></td><td>' + esc(x.descricao) + '</td><td class="n">' + esc(unidadeTx(x.unidade)) +
          (x.casas_decimais > 0 ? ' <span class="rdoapp-grp" style="display:inline">(' + x.casas_decimais + ' casas)</span>' : '') + '</td><td>' + esc(x.grupo || '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (ativos.length > mostra.length ? '<p class="rdoapp-vazio" style="padding:8px 12px">Mostrando 300 de ' + ativos.length + '. Procure para filtrar.</p>' : '');
  }

  async function abrirCatalogo() {
    abrirModal('<div class="rdoapp-cab"><div class="tx"><h2>Lista de serviços do app</h2><p>O que o encarregado escolhe ao apontar o RDO no celular</p></div>' +
      '<button type="button" class="rdoapp-bt" data-rdoapp-fechar>Fechar</button></div>' +
      '<div class="rdoapp-corpo">' +
        '<p class="rdoapp-cat-st" id="rdoapp-cat-st">Carregando a lista atual…</p>' +
        '<div class="rdoapp-cat-imp"><label class="rdoapp-bt forte" style="cursor:pointer">Importar precificação (.csv)' +
          '<input type="file" id="rdoapp-cat-arq" accept=".csv,text/csv" hidden></label>' +
          '<span>Exporte a precificação de serviços no sistema da concessionária e escolha o arquivo. A lista nova substitui a do mesmo contrato; só gestor pode importar.</span></div>' +
        '<div id="rdoapp-cat-prev"></div>' +
        '<div class="rdoapp-link"><input type="search" id="rdoapp-cat-busca" placeholder="Procurar na lista por código, nome ou grupo" aria-label="Procurar serviço"></div>' +
        '<div class="rdoapp-cat-tab" id="rdoapp-cat-tab"></div>' +
      '</div>', 'Lista de serviços do app');
    $('rdoapp-cat-busca').addEventListener('input', renderTabelaCatalogo);
    $('rdoapp-cat-arq').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) prepararImportacao(f); });
    try {
      await carregarCatalogoAtual();
      $('rdoapp-cat-st').textContent = statusCatalogo();
    } catch (e) {
      $('rdoapp-cat-st').textContent = /servicos_catalogo|schema cache|does not exist/i.test(String(e && e.message))
        ? 'O banco ainda não tem a lista de serviços. Rode o rdo_campo.sql atualizado no Supabase.' : traduzErro(e);
    }
    renderTabelaCatalogo();
  }

  async function prepararImportacao(file) {
    var box = $('rdoapp-cat-prev'); if (!box) return;
    box.className = 'rdoapp-cat-prev'; box.textContent = 'Lendo ' + file.name + '…';
    try {
      var itens = itensDoCsv(parseCsv(await lerArquivo(file)));
      if (!itens.length) throw new Error('O arquivo não tem nenhum serviço com código, descrição e contrato.');
      var c = compararComAtual(itens);
      CATS.itens = itens;
      var grupos = Object.keys(c.grupos).sort(function (a, b) { return c.grupos[b] - c.grupos[a]; })
        .map(function (g) { return c.grupos[g] + ' ' + (g.length <= 3 ? g : g.toLowerCase()); }).join(', ');
      box.innerHTML = '<b>' + esc(file.name) + '</b><br>' + c.total + ' serviços do contrato ' + esc(c.contratos.join(', ')) + ': ' + esc(grupos) + '.<br>' +
        'Comparado com a lista atual: ' + c.novos + ' novos, ' + c.mudados + ' alterados e ' + c.saem + ' saem da lista.' +
        '<div class="bts"><button type="button" class="rdoapp-bt forte" id="rdoapp-cat-ok">Atualizar a lista do app</button>' +
        '<button type="button" class="rdoapp-bt" id="rdoapp-cat-nao">Cancelar</button></div>';
      $('rdoapp-cat-ok').addEventListener('click', confirmarImportacao);
      $('rdoapp-cat-nao').addEventListener('click', function () { CATS.itens = null; box.className = ''; box.innerHTML = ''; });
    } catch (e) {
      box.className = 'rdoapp-cat-prev erro'; box.textContent = e.message || String(e);
    }
  }

  async function confirmarImportacao() {
    var box = $('rdoapp-cat-prev'), bt = $('rdoapp-cat-ok');
    if (!CATS.itens || !bt) return;
    bt.disabled = true; bt.textContent = 'Gravando…';
    try {
      var r = await st.sb.rpc('rdo_campo_importar_servicos', { p_itens: CATS.itens });
      if (r.error) throw r.error;
      var res = r.data || {};
      CATS.itens = null;
      box.className = 'rdoapp-cat-prev ok';
      box.textContent = 'Lista atualizada: ' + (res.gravados || 0) + ' serviços gravados' + (res.inativos ? ' e ' + res.inativos + ' tirados da lista' : '') +
        '. Os celulares pegam a lista nova na próxima vez que abrirem o app com internet.';
      await carregarCatalogoAtual();
      $('rdoapp-cat-st').textContent = statusCatalogo();
      renderTabelaCatalogo();
    } catch (e) {
      var m = String((e && e.message) || e);
      box.className = 'rdoapp-cat-prev erro';
      box.textContent = /importar_servicos|could not find the function/i.test(m) ? 'O banco ainda não tem a função de importação. Rode o rdo_campo.sql atualizado no Supabase.'
        : /gestor/i.test(m) ? m : 'Não deu para gravar a lista: ' + m;
      bt.disabled = false; bt.textContent = 'Atualizar a lista do app';
    }
  }

  // ─── instalar no celular (QR code) ──────────────────────────────────────
  function urlApp() { try { return new URL('campo/', window.MARIUA_BASE || location.href).href; } catch (e) { return 'campo/'; } }
  function carregarQr() {
    if (window.QRCode) return Promise.resolve();
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = ok; s.onerror = falha; document.head.appendChild(s);
    });
  }
  function abrirInstalar() {
    var url = urlApp();
    abrirModal('<div class="rdoapp-cab"><div class="tx"><h2>Instalar o app de RDO no celular</h2><p>Para os encarregados das equipes</p></div>' +
      '<button type="button" class="rdoapp-bt" data-rdoapp-fechar>Fechar</button></div>' +
      '<div class="rdoapp-corpo"><div class="rdoapp-qr"><div id="rdoapp-qrcode" aria-label="QR code com o link do app"></div><ol>' +
      '<li>Aponte a câmera do celular para o código ou abra o link abaixo (Chrome no Android, Safari no iPhone).</li>' +
      '<li>Entre com o usuário (o começo do e-mail, antes do @) e a senha do sistema. Cada encarregado precisa de uma conta, criada no Admin do sistema Mariuá.</li>' +
      '<li>No Android, toque em Instalar. No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início.</li>' +
      '</ol></div><div class="rdoapp-link"><input id="rdoapp-url" readonly value="' + esc(url) + '" aria-label="Link do app">' +
      '<button type="button" class="rdoapp-bt forte" id="rdoapp-copiar">Copiar link</button></div></div>', 'Instalar o app no celular');
    $('rdoapp-copiar').addEventListener('click', function () {
      var bt = this, inp = $('rdoapp-url');
      var feito = function () { bt.textContent = 'Copiado'; setTimeout(function () { bt.textContent = 'Copiar link'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(feito, function () { inp.select(); document.execCommand('copy'); feito(); });
      else { inp.select(); document.execCommand('copy'); feito(); }
    });
    carregarQr().then(function () {
      var el = $('rdoapp-qrcode'); if (!el || !window.QRCode) return;
      new window.QRCode(el, { text: url, width: 180, height: 180, colorDark: '#0a4a4d', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    }).catch(function () {
      var el = $('rdoapp-qrcode'); if (el) { el.style.display = 'none'; }
    });
  }

  // ─── início ─────────────────────────────────────────────────────────────
  function embrulharRender() {
    var orig = window.rdoRender;
    if (typeof orig !== 'function' || orig.__rdoApp) return;
    var novo = function () {
      var out = orig.apply(this, arguments);
      try {
        var d = dataDaPagina();
        if (d !== st.dataPagina) { st.dataPagina = d; st.data = d; carregar(); }
        else { renderLista(); marcarCards(); }
      } catch (e) { console.warn('[rdo-app]', e); }
      return out;
    };
    novo.__rdoApp = true;
    window.rdoRender = novo;
  }

  function ouvir() {
    if (st.canal || !st.sb.channel) return;
    try {
      st.canal = st.sb.channel('rdoapp-' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: TABELA }, function (p) {
          var d = (p.new && p.new.data) || (p.old && p.old.data);
          if (!d || d === st.data) carregar();
        })
        .subscribe();
    } catch (e) { st.canal = null; }
  }

  function iniciar() {
    st.sb = window.MARIUA_SB;
    injetarCss();
    if (!montarSecao()) return;
    embrulharRender();
    st.dataPagina = st.data = dataDaPagina();
    carregar();
    ouvir();
    setInterval(function () { if (document.visibilityState === 'visible') carregar(); }, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') carregar(); });
  }

  // Usado também pela página "App de campo" (gestao-app.html): abre o RDO,
  // a lista de serviços e o QR code de instalação.
  function comBanco(fn) {
    return function () {
      st.sb = st.sb || window.MARIUA_SB;
      injetarCss();
      return fn.apply(this, arguments);
    };
  }
  window.RDOAPP = {
    abrirLinha: comBanco(abrirLinha),
    abrirCatalogo: comBanco(abrirCatalogo),
    abrirInstalar: comBanco(abrirInstalar),
    unidadeTx: unidadeTx,
    nomeEquipe: nomeEquipe
  };

  (function esperarLogin(n) {
    if (window.MARIUA_SB && window.MARIUA_USER) {
      if (document.getElementById('rdo-page')) iniciar();
      return;
    }
    setTimeout(function () { esperarLogin((n || 0) + 1); }, n > 40 ? 2000 : 500);
  })(0);
})();
