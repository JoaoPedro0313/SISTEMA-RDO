/* ============================================================================
   gestao-app.js — página "App de campo" (gestao-app.html)
   ----------------------------------------------------------------------------
   Gestão do app dos encarregados: RDOs recebidos, produção por serviço,
   equipes, celulares e configurações do app. Lê o que o rdo_campo.sql criou:
   rdo_campo, rdo_campo_aparelhos, rdo_campo_config, servicos_catalogo e as
   funções rdo_campo_equipes, rdo_campo_programados e rdo_campo_salvar_config.
   O RDO aberto, a lista de serviços e o QR code vêm do rdo-app.js (RDOAPP).
   ========================================================================== */
(function () {
  'use strict';

  var VERSAO_APP = '1.2.1';   // reserva: a versão publicada é lida do campo/sw.js ao abrir a página
  var MOTIVOS_PADRAO = ['Chuva', 'Falta de material', 'Desligamento não liberado', 'Interferência de terceiros',
    'Veículo ou equipamento', 'Acidente ou incidente', 'Outro'];
  var CLIMA = { bom: 'Bom', nublado: 'Nublado', chuva: 'Chuva', impraticavel: 'Impraticável' };
  var DIA = 864e5;

  var G = {
    sb: null, p: '7', de: '', ate: '', equipe: '', aba: 'geral',
    rdos: [], ultimos: [], aparelhos: [], equipes: [], prog: [],
    config: {}, cfgQuem: null, gestor: false, catalogo: null,
    filtros: {}, agrupar: 'servico', erros: {}, carregando: false
  };

  // ─── utilidades ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function hojeISO() { return iso(new Date()); }
  function dataDe(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function somaDias(s, n) { var d = dataDe(s); d.setDate(d.getDate() + n); return iso(d); }
  function brCurto(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
  function br(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function quando(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' às ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function haQuanto(ts) {
    if (!ts) return '';
    var m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 2) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    var h = Math.round(m / 60); if (h < 48) return 'há ' + h + ' h';
    return 'há ' + Math.round(h / 24) + ' dias';
  }
  function hora(t) { return t ? String(t).slice(0, 5) : ''; }
  function num(n) { return n == null || n === '' ? '' : String(Math.round(n * 100) / 100).replace('.', ','); }
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function nc(t) { return norm(t).replace(/\s+/g, ''); }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function numCodigo(c) { var m = String(c || '').match(/(\d+)\s*$/); return m ? +m[1] : 1e9; }
  function cmpVersao(a, b) {
    var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  function unidade(u) { return window.RDOAPP ? window.RDOAPP.unidadeTx(u) : String(u || '').toLowerCase(); }
  function nomeEquipe(c) { return c || '—'; }
  function selo(tx, tipo) { return '<span class="m-selo' + (tipo ? ' ' + tipo : '') + '">' + esc(tx) + '</span>'; }
  function vazio(tx, icone) { return '<div class="m-vazio"><i class="ti ti-' + (icone || 'mood-smile') + '" aria-hidden="true"></i>' + esc(tx) + '</div>'; }
  var toastT;
  function toast(tx) {
    var t = $('ga-toast'); t.textContent = tx; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3800);
  }
  function erroBanco(e, oQue) {
    var m = String((e && (e.message || e.error)) || e || '');
    if (/rdo_campo|servicos_catalogo|could not find|schema cache|does not exist/i.test(m))
      return 'O banco ainda não tem ' + oQue + '. Rode o rdo_campo.sql atualizado no Supabase (SQL Editor → Run).';
    if (/fetch|network|load failed/i.test(m)) return 'Sem conexão com o banco. Toque em Atualizar quando a internet voltar.';
    return 'Não deu para carregar ' + oQue + ': ' + m;
  }
  function caixaErro(tx) { return '<div class="m-erro"><i class="ti ti-alert-circle" aria-hidden="true"></i>' + esc(tx) + '</div>'; }

  // ─── período e filtros ──────────────────────────────────────────────────
  function aplicarPeriodo(p) {
    G.p = p;
    var hoje = hojeISO();
    if (p === '0') { G.de = hoje; G.ate = hoje; }
    else if (p === '7') { G.de = somaDias(hoje, -6); G.ate = hoje; }
    else if (p === '30') { G.de = somaDias(hoje, -29); G.ate = hoje; }
    else {
      G.de = $('ga-de').value || G.de || somaDias(hoje, -6);
      G.ate = $('ga-ate').value || G.ate || hoje;
      if (G.de > G.ate) { var t = G.de; G.de = G.ate; G.ate = t; }
    }
    $('ga-de').value = G.de; $('ga-ate').value = G.ate;
    $('ga-datas').hidden = p !== 'x';
    document.querySelectorAll('#ga-periodos [data-p]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.p === p)); });
  }
  function textoPeriodo() {
    if (G.de === G.ate) return G.de === hojeISO() ? 'hoje' : 'em ' + br(G.de);
    return 'de ' + brCurto(G.de) + ' a ' + brCurto(G.ate);
  }
  function daEquipe(cod, enc) {
    if (!G.equipe) return true;
    var alvo = G.equipes.filter(function (q) { return nc(q.codigo) === G.equipe; })[0];
    if (nc(cod) === G.equipe) return true;
    return !!(alvo && enc && norm(enc) === norm(alvo.encarregado));
  }
  function rdosDaEquipe() { return G.rdos.filter(function (r) { return daEquipe(r.equipe_codigo, r.encarregado); }); }
  function aparelhosDaEquipe() { return G.aparelhos.filter(function (a) { return daEquipe(a.equipe_codigo, a.encarregado); }); }
  function filaParada(a) {
    if (!(a.fila > 0)) return false;
    var desde = a.fila_desde ? new Date(a.fila_desde).getTime() : 0, contato = new Date(a.ultimo_contato).getTime();
    return (desde && Date.now() - desde > DIA) || Date.now() - contato > DIA;
  }
  function foraDaLista(s) { return s && (s.fora_da_lista || !s.codigo); }
  function semGps(r) { return r.lat == null || lista(r.fotos).some(function (f) { return f.origem === 'galeria' || f.lat == null; }); }
  function versaoReferencia() {
    var v = G.config.versao_minima || VERSAO_APP;
    G.aparelhos.forEach(function (a) { if (!G.config.versao_minima && cmpVersao(a.versao_app, v) > 0) v = a.versao_app; });
    return v;
  }

  // ─── carga ──────────────────────────────────────────────────────────────
  function selo_banco(estado, texto) {
    var el = $('db-badge'); if (!el) return;
    el.classList.remove('syncing', 'online', 'offline', 'local');
    el.classList.add(estado);
    var tx = $('db-text'); if (tx) tx.textContent = texto;
  }
  function montarSelectEquipes() {
    var sel = $('ga-equipe'), atual = G.equipe;
    var vistos = {}, ops = [];
    G.equipes.forEach(function (q) { var k = nc(q.codigo); if (k && !vistos[k]) { vistos[k] = 1; ops.push({ k: k, t: q.codigo + (q.encarregado ? ' · ' + q.encarregado : '') }); } });
    G.ultimos.forEach(function (r) { var k = nc(r.equipe_codigo); if (k && !vistos[k]) { vistos[k] = 1; ops.push({ k: k, t: r.equipe_codigo }); } });
    ops.sort(function (a, b) { return a.t.localeCompare(b.t); });
    sel.innerHTML = '<option value="">Todas as equipes</option>' + ops.map(function (o) { return '<option value="' + esc(o.k) + '">' + esc(o.t) + '</option>'; }).join('');
    sel.value = vistos[atual] ? atual : '';
    G.equipe = sel.value;
  }

  async function carregar() {
    if (G.carregando) return;
    G.carregando = true;
    $('ga-carregado').textContent = 'Carregando…';
    selo_banco('syncing', 'Atualizando…');
    var sb = G.sb, hoje = hojeISO();
    var pedidos = {
      rdos: sb.from('rdo_campo').select('*').gte('data', G.de).lte('data', G.ate)
        .order('data', { ascending: false }).order('recebido_em', { ascending: false }).range(0, 4999),
      ultimos: sb.from('rdo_campo').select('id,equipe_codigo,encarregado,data,recebido_em').gte('data', somaDias(hoje, -90))
        .order('data', { ascending: false }).range(0, 9999),
      aparelhos: sb.from('rdo_campo_aparelhos').select('*').order('ultimo_contato', { ascending: false }).range(0, 999),
      equipes: sb.rpc('rdo_campo_equipes'),
      prog: sb.rpc('rdo_campo_programados', { p_data: hoje }),
      config: sb.from('rdo_campo_config').select('*').eq('id', 1).maybeSingle(),
      gestor: sb.rpc('is_gestor'),
      catalogo: sb.from('servicos_catalogo').select('codigo,atualizado_em', { count: 'exact' }).eq('ativo', true)
        .order('atualizado_em', { ascending: false }).limit(1)
    };
    var nomes = Object.keys(pedidos);
    var res = await Promise.all(nomes.map(function (n) {
      return Promise.resolve(pedidos[n]).then(function (r) { return r; }, function (e) { return { error: e }; });
    }));
    G.erros = {};
    nomes.forEach(function (n, i) {
      var r = res[i] || {};
      if (r.error) { G.erros[n] = r.error; return; }
      if (n === 'config') { G.config = (r.data && r.data.dados) || {}; G.cfgQuem = r.data ? { em: r.data.atualizado_em, por: r.data.atualizado_por } : null; }
      else if (n === 'gestor') G.gestor = r.data === true;
      else if (n === 'catalogo') G.catalogo = { n: r.count || 0, em: r.data && r.data[0] ? r.data[0].atualizado_em : null };
      else G[n] = lista(r.data);
    });
    if (G.erros.gestor) G.gestor = false;
    montarSelectEquipes();
    G.carregando = false;
    var falhou = G.erros.rdos || G.erros.aparelhos;
    selo_banco(falhou ? 'offline' : 'online', falhou ? 'Banco com erro' : 'Banco conectado');
    $('ga-carregado').textContent = 'Atualizado às ' + p2(new Date().getHours()) + ':' + p2(new Date().getMinutes());
    renderTudo();
  }

  function renderTudo() {
    renderGeral(); renderRdos(); renderProducao(); renderEquipes(); renderCelulares(); renderConfig();
  }

  // ─── visão geral ────────────────────────────────────────────────────────
  function stat(rot, val, ext, cor) {
    return '<div class="m-stat"' + (cor ? ' style="border-top-color:' + cor + '"' : '') + '><span class="m-stat-rot">' + esc(rot) + '</span>' +
      '<span class="m-stat-val">' + val + '</span><span class="m-stat-ext">' + esc(ext || '') + '</span></div>';
  }

  function rdosDeHoje() {
    var hoje = hojeISO();
    return G.ultimos.filter(function (r) { return r.data === hoje; });
  }
  function semRdoHoje() {
    var hoje = rdosDeHoje();
    var cods = {}, encs = [];
    hoje.forEach(function (r) { cods[nc(r.equipe_codigo)] = 1; if (r.encarregado) encs.push(norm(r.encarregado)); });
    return G.prog.filter(function (p) {
      if (G.equipe && nc(p.codigo) !== G.equipe) return false;
      if (p.codigo && cods[nc(p.codigo)]) return false;
      var n = norm(p.encarregado);
      return !encs.some(function (e) { return e === n || e.indexOf(n + ' ') === 0 || n.indexOf(e + ' ') === 0; });
    });
  }

  function renderGeral() {
    if (G.erros.rdos) { $('ga-kpis').innerHTML = caixaErro(erroBanco(G.erros.rdos, 'os RDOs do app')); }
    else {
      var rs = rdosDaEquipe(), eqs = {};
      rs.forEach(function (r) { eqs[nc(r.equipe_codigo)] = 1; });
      var fotos = 0, horas = 0, paradas = 0, fora = 0, foraRdos = 0;
      rs.forEach(function (r) {
        fotos += lista(r.fotos).length;
        if (r.paralisacao) { paradas++; horas += +r.paralisacao.horas || 0; }
        var f = lista(r.servicos).filter(foraDaLista).length; fora += f; if (f) foraRdos++;
      });
      var total = G.equipe ? 1 : G.equipes.length;
      var parados = aparelhosDaEquipe().filter(filaParada).length;
      $('ga-kpis').innerHTML =
        stat('RDOs recebidos', rs.length, textoPeriodo()) +
        stat('Equipes que mandaram', Object.keys(eqs).length + (total ? ' <small>de ' + total + '</small>' : ''), 'pelo app, ' + textoPeriodo()) +
        stat('Fotos', fotos, rs.length ? 'média de ' + num(fotos / rs.length) + ' por RDO' : '') +
        stat('Horas paradas', num(horas) + ' <small>h</small>', paradas + (paradas === 1 ? ' RDO com paralisação' : ' RDOs com paralisação'), horas ? '#dd6b20' : null) +
        stat('Fora da lista', fora, fora ? 'em ' + foraRdos + (foraRdos === 1 ? ' RDO, para conferir' : ' RDOs, para conferir') : 'todos os serviços com código', fora ? '#d69e2e' : null) +
        stat('Celulares com fila parada', parados, parados ? 'RDO esperando há mais de um dia' : 'nenhum RDO preso', parados ? '#c53030' : null);
    }
    renderGrafico();
    renderSemRdo();
    renderAlertas();
  }

  function renderGrafico() {
    var box = $('ga-graf'), rs = rdosDaEquipe(), cols = [];
    if (G.de === G.ate) {
      $('ga-graf-tit').textContent = 'RDOs por hora de chegada, ' + (G.de === hojeISO() ? 'hoje' : br(G.de));
      var porHora = {}; rs.forEach(function (r) { var h = new Date(r.recebido_em).getHours(); porHora[h] = (porHora[h] || 0) + 1; });
      for (var h = 5; h <= 22; h++) cols.push({ t: h + 'h', n: porHora[h] || 0 });
    } else {
      var dias = Math.round((dataDe(G.ate) - dataDe(G.de)) / DIA) + 1;
      var porDia = {}; rs.forEach(function (r) { porDia[r.data] = (porDia[r.data] || 0) + 1; });
      if (dias <= 45) {
        $('ga-graf-tit').textContent = 'RDOs por dia';
        for (var i = 0; i < dias; i++) { var d = somaDias(G.de, i); cols.push({ t: brCurto(d), n: porDia[d] || 0, fds: [0, 6].indexOf(dataDe(d).getDay()) >= 0 }); }
      } else {
        $('ga-graf-tit').textContent = 'RDOs por semana';
        for (var s = 0; s < dias; s += 7) {
          var n = 0; for (var k = 0; k < 7 && s + k < dias; k++) n += porDia[somaDias(G.de, s + k)] || 0;
          cols.push({ t: brCurto(somaDias(G.de, s)), n: n });
        }
      }
    }
    var max = Math.max.apply(null, cols.map(function (c) { return c.n; }).concat([1]));
    var poucos = cols.length <= 18;
    box.innerHTML = cols.map(function (c, i) {
      var mostra = poucos || i % Math.ceil(cols.length / 12) === 0 || i === cols.length - 1;
      return '<div class="ga-col' + (c.n ? '' : ' zero') + (c.fds ? ' fds' : '') + '" title="' + esc(c.t + ': ' + c.n + ' RDO' + (c.n === 1 ? '' : 's')) + '">' +
        '<b>' + (c.n || '') + '</b><i style="height:' + Math.max(2, Math.round(c.n / max * 100)) + '%"></i><span>' + (mostra ? esc(c.t) : '&nbsp;') + '</span></div>';
    }).join('');
  }

  function renderSemRdo() {
    var box = $('ga-sem');
    if (G.erros.prog) { box.innerHTML = caixaErro(erroBanco(G.erros.prog, 'a programação do dia')); $('ga-sem-n').textContent = '—'; return; }
    var sem = semRdoHoje();
    $('ga-sem-n').textContent = sem.length;
    $('ga-sem-n').className = 'm-selo' + (sem.length ? ' aviso' : ' ga-ok');
    if (!G.prog.length) { box.innerHTML = vazio('Ninguém programado para hoje na Programação Diária.', 'calendar'); return; }
    if (!sem.length) { box.innerHTML = vazio('Todas as equipes programadas hoje já mandaram RDO pelo app.'); return; }
    box.innerHTML = '<ul class="ga-lista">' + sem.map(function (p) {
      var cel = G.aparelhos.filter(function (a) { return p.codigo && nc(a.equipe_codigo) === nc(p.codigo); })[0];
      var info = cel ? 'App aberto ' + haQuanto(cel.ultimo_contato) + (cel.fila ? ', ' + cel.fila + ' na fila do celular' : '') : 'Sem contato do app';
      return '<li><div><b>' + esc(p.codigo || 'Sem código no cadastro') + '</b> <span class="ga-pequeno">' + esc(p.encarregado) + '</span></div>' +
        '<div class="ga-pequeno">' + p.obras + (p.obras === 1 ? ' obra programada' : ' obras programadas') + '. ' + esc(info) + '</div></li>';
    }).join('') + '</ul>';
  }

  function alerta(tipo, icone, html, acao) {
    return '<div class="ga-al ' + tipo + '"><i class="ti ti-' + icone + '" aria-hidden="true"></i><div>' + html + '</div>' +
      (acao ? '<button type="button" class="m-bt m-bt-peq" data-acao="' + acao.id + '">' + esc(acao.t) + '</button>' : '') + '</div>';
  }

  function renderAlertas() {
    var box = $('ga-alertas'), h = '';
    var cels = aparelhosDaEquipe();
    cels.filter(filaParada).forEach(function (a) {
      h += alerta('erro', 'cloud-off', '<b>' + esc(a.equipe_codigo || a.usuario) + '</b>: ' + a.fila + (a.fila === 1 ? ' RDO na fila' : ' RDOs na fila') +
        (a.fila_desde ? ' desde ' + esc(quando(a.fila_desde)) : '') + '. Último contato ' + esc(haQuanto(a.ultimo_contato)) +
        '. Peça para o encarregado abrir o app com internet.');
    });
    cels.filter(function (a) { return a.com_erro > 0; }).forEach(function (a) {
      h += alerta('erro', 'alert-octagon', '<b>' + esc(a.equipe_codigo || a.usuario) + '</b>: ' + a.com_erro + (a.com_erro === 1 ? ' RDO recusado pelo banco' : ' RDOs recusados pelo banco') +
        '. No app, ele toca no aviso vermelho e em Tentar de novo; se continuar, confira as permissões.');
    });
    var rs = rdosDaEquipe();
    var fora = rs.filter(function (r) { return lista(r.servicos).some(foraDaLista); });
    if (fora.length) h += alerta('av', 'list-search', '<b>' + fora.length + (fora.length === 1 ? ' RDO' : ' RDOs') + '</b> com serviço apontado fora da lista. Confira e, se for o caso, inclua o serviço na precificação.', { id: 'ver-fora', t: 'Ver RDOs' });
    var gps = rs.filter(semGps);
    if (gps.length) h += alerta('av', 'map-pin-off', '<b>' + gps.length + (gps.length === 1 ? ' RDO' : ' RDOs') + '</b> com foto da galeria ou sem localização.', { id: 'ver-gps', t: 'Ver RDOs' });
    var ref = versaoReferencia();
    var velhos = cels.filter(function (a) { return a.versao_app && cmpVersao(a.versao_app, ref) < 0; });
    if (velhos.length) h += alerta('av', 'refresh-alert', '<b>' + velhos.length + (velhos.length === 1 ? ' celular' : ' celulares') + '</b> com versão do app anterior à ' + esc(ref) + '. A atualização chega ao abrir o app com internet.', { id: 'ver-cel', t: 'Ver celulares' });
    if (G.catalogo && !G.catalogo.n && !G.erros.catalogo) h += alerta('info', 'list-details', 'A lista de serviços ainda não foi importada. Sem ela, o encarregado aponta escrevendo o serviço.', { id: 'catalogo', t: 'Importar lista' });
    box.innerHTML = h || vazio('Nada para conferir ' + textoPeriodo() + '.');
  }

  // ─── RDOs ───────────────────────────────────────────────────────────────
  function rdosDaLista() {
    var q = norm($('ga-busca').value), f = G.filtros;
    return rdosDaEquipe().filter(function (r) {
      if (f.parada && !r.paralisacao) return false;
      if (f.fora && !lista(r.servicos).some(foraDaLista)) return false;
      if (f.gps && !semGps(r)) return false;
      if (!q) return true;
      var tx = norm([r.data, br(r.data), r.equipe_codigo, r.encarregado, r.pep, r.nome_obra, r.municipio, r.atividade, r.autor_email,
        lista(r.servicos).map(function (s) { return (s.codigo || '') + ' ' + s.descricao; }).join(' ')].join(' '));
      return q.split(' ').every(function (w) { return tx.indexOf(w) >= 0; });
    });
  }

  function renderRdos() {
    var corpo = $('ga-rdos-corpo');
    if (G.erros.rdos) { corpo.innerHTML = '<tr><td colspan="7">' + caixaErro(erroBanco(G.erros.rdos, 'os RDOs do app')) + '</td></tr>'; $('ga-rdos-n').textContent = ''; return; }
    var rs = rdosDaLista(), mostra = rs.slice(0, 500);
    corpo.innerHTML = mostra.length ? mostra.map(function (r) {
      var serv = lista(r.servicos), nf = lista(r.fotos).length;
      var selos = [];
      if (r.paralisacao) selos.push(selo('Paralisação ' + num(r.paralisacao.horas || 0) + ' h', 'aviso'));
      if (serv.some(foraDaLista)) selos.push(selo('Fora da lista', 'atencao'));
      if (semGps(r)) selos.push(selo('Sem GPS ou galeria', 'atencao'));
      if (!selos.length) selos.push(selo('Ok', 'ga-ok'));
      return '<tr data-id="' + esc(r.id) + '" tabindex="0">' +
        '<td><span class="m-cod">' + esc(brCurto(r.data)) + '</span><div class="m-sub">chegou ' + esc(quando(r.recebido_em).split(' às ')[1] || '') + '</div></td>' +
        '<td><span class="m-tit">' + esc(nomeEquipe(r.equipe_codigo)) + '</span><div class="m-sub">' + esc(r.encarregado || '') + '</div></td>' +
        '<td><span class="m-tit">' + esc([r.pep, r.nome_obra].filter(Boolean).join(', ') || 'Obra não informada') + '</span><div class="m-sub">' + esc(r.municipio || '') + '</div></td>' +
        '<td class="ga-nw">' + esc(hora(r.hora_inicio) + (r.hora_fim ? ' às ' + hora(r.hora_fim) : '')) + '</td>' +
        '<td>' + serv.length + '<div class="m-sub">' + esc(serv.slice(0, 3).map(function (s) { return s.codigo || 'fora da lista'; }).join(', ') + (serv.length > 3 ? '…' : '')) + '</div></td>' +
        '<td class="m-num">' + nf + '</td><td><div class="ga-selos">' + selos.join('') + '</div></td></tr>';
    }).join('') : '<tr><td colspan="7">' + vazio(G.rdos.length ? 'Nenhum RDO com esses filtros.' : 'Nenhum RDO enviado pelo app ' + textoPeriodo() + '.', 'file-off') + '</td></tr>';
    $('ga-rdos-n').textContent = rs.length > mostra.length ? 'Mostrando 500 de ' + rs.length + ' RDOs. Use a busca ou os filtros, ou baixe o CSV com todos.'
      : rs.length + (rs.length === 1 ? ' RDO' : ' RDOs') + ' ' + textoPeriodo() + '. Clique num RDO para ver tudo, com as fotos.';
  }

  // ─── produção ───────────────────────────────────────────────────────────
  function producao() {
    var grupos = {};
    rdosDaEquipe().forEach(function (r) {
      lista(r.servicos).forEach(function (s) {
        var fora = foraDaLista(s);
        var chaveServ = fora ? 'FORA|' + norm(s.descricao) + '|' + norm(s.unidade) : s.codigo;
        var k = (G.agrupar === 'equipe' ? nc(r.equipe_codigo) + '#' : '') + chaveServ;
        var g = grupos[k] || (grupos[k] = { equipe: r.equipe_codigo, codigo: fora ? '' : s.codigo, descricao: s.descricao, unidade: s.unidade, grupo: s.grupo, fora: fora, qtd: 0, rdos: {}, equipes: {} });
        g.qtd += +s.qtd || 0; g.rdos[r.id] = 1; g.equipes[nc(r.equipe_codigo)] = 1;
      });
    });
    return Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) {
      if (G.agrupar === 'equipe' && a.equipe !== b.equipe) return String(a.equipe).localeCompare(String(b.equipe));
      if (a.fora !== b.fora) return a.fora ? 1 : -1;
      return numCodigo(a.codigo) - numCodigo(b.codigo) || String(a.descricao).localeCompare(String(b.descricao));
    });
  }

  function renderProducao() {
    var porEq = G.agrupar === 'equipe';
    $('ga-prod-cab').innerHTML = '<tr>' + (porEq ? '<th>Equipe</th>' : '') + '<th>Código</th><th>Serviço</th><th>Quantidade</th><th>RDOs</th>' + (porEq ? '' : '<th>Equipes</th>') + '</tr>';
    var corpo = $('ga-prod-corpo');
    if (G.erros.rdos) { corpo.innerHTML = '<tr><td colspan="6">' + caixaErro(erroBanco(G.erros.rdos, 'os RDOs do app')) + '</td></tr>'; return; }
    var linhas = producao();
    corpo.innerHTML = linhas.length ? linhas.map(function (g) {
      return '<tr>' + (porEq ? '<td class="m-cod">' + esc(g.equipe) + '</td>' : '') +
        '<td>' + (g.fora ? selo('Fora da lista', 'atencao') : '<span class="m-cod">' + esc(g.codigo) + '</span>') + '</td>' +
        '<td><span class="m-tit">' + esc(g.descricao) + '</span>' + (g.grupo ? '<div class="m-sub">' + esc(g.grupo) + '</div>' : '') + '</td>' +
        '<td class="m-num ga-nw">' + esc(num(g.qtd)) + ' ' + esc(unidade(g.unidade)) + '</td>' +
        '<td>' + Object.keys(g.rdos).length + '</td>' + (porEq ? '' : '<td>' + Object.keys(g.equipes).length + '</td>') + '</tr>';
    }).join('') : '<tr><td colspan="6">' + vazio('Nenhum serviço apontado ' + textoPeriodo() + '.', 'list') + '</td></tr>';
  }

  // ─── equipes ────────────────────────────────────────────────────────────
  function renderEquipes() {
    var corpo = $('ga-eq-corpo');
    if (G.erros.equipes && !G.equipes.length) { corpo.innerHTML = '<tr><td colspan="6">' + caixaErro(erroBanco(G.erros.equipes, 'o Cadastro de Equipes')) + '</td></tr>'; return; }
    var base = G.equipes.map(function (q) { return { codigo: q.codigo, encarregado: q.encarregado }; });
    var vistos = {}; base.forEach(function (q) { vistos[nc(q.codigo)] = 1; });
    G.ultimos.forEach(function (r) { var k = nc(r.equipe_codigo); if (!vistos[k]) { vistos[k] = 1; base.push({ codigo: r.equipe_codigo, encarregado: r.encarregado, foraCadastro: true }); } });
    var q = norm($('ga-busca-eq').value), hoje = hojeISO();
    var semHoje = {}; semRdoHoje().forEach(function (p) { if (p.codigo) semHoje[nc(p.codigo)] = 1; });
    var usaram = 0;
    var linhas = base.filter(function (e) { return daEquipe(e.codigo, e.encarregado) && (!q || norm(e.codigo + ' ' + e.encarregado).indexOf(q) >= 0); }).map(function (e) {
      var k = nc(e.codigo);
      var doPeriodo = G.rdos.filter(function (r) { return nc(r.equipe_codigo) === k; }).length;
      var ult = G.ultimos.filter(function (r) { return nc(r.equipe_codigo) === k; })[0];
      var cel = G.aparelhos.filter(function (a) { return nc(a.equipe_codigo) === k; })[0];
      var sit;
      if (cel && filaParada(cel)) sit = selo('Fila parada', 'critico');
      else if (ult && ult.data === hoje) sit = selo('Mandou hoje', 'ga-ok');
      else if (semHoje[k]) sit = selo('Programada sem RDO', 'aviso');
      else if (!ult && !cel) sit = selo('Ainda não usa');
      else sit = selo('Usa o app');
      if (ult || cel) usaram++;
      return { ordem: (ult ? ult.data : '0000') + (cel ? cel.ultimo_contato : ''), html: '<tr>' +
        '<td><span class="m-cod">' + esc(e.codigo) + '</span>' + (e.foraCadastro ? '<div class="m-sub">fora do cadastro</div>' : '') + '</td>' +
        '<td>' + esc(e.encarregado || '') + '</td><td class="m-num">' + doPeriodo + '</td>' +
        '<td>' + (ult ? esc(br(ult.data)) : '<span class="m-sub">nunca</span>') + '</td>' +
        '<td>' + (cel ? esc(haQuanto(cel.ultimo_contato)) + '<div class="m-sub">versão ' + esc(cel.versao_app || '?') + (cel.fila ? ', ' + cel.fila + ' na fila' : '') + '</div>' : '<span class="m-sub">sem contato</span>') + '</td>' +
        '<td>' + sit + '</td></tr>' };
    });
    linhas.sort(function (a, b) { return b.ordem.localeCompare(a.ordem); });
    corpo.innerHTML = linhas.length ? linhas.map(function (l) { return l.html; }).join('') : '<tr><td colspan="6">' + vazio('Nenhuma equipe encontrada.', 'users') + '</td></tr>';
    $('ga-eq-resumo').textContent = usaram + ' de ' + linhas.length + (linhas.length === 1 ? ' equipe usou' : ' equipes usaram') + ' o app nos últimos 90 dias.';
  }

  // ─── celulares ──────────────────────────────────────────────────────────
  function renderCelulares() {
    var corpo = $('ga-cel-corpo');
    if (G.erros.aparelhos) { corpo.innerHTML = '<tr><td colspan="7">' + caixaErro(erroBanco(G.erros.aparelhos, 'a lista de celulares')) + '</td></tr>'; $('ga-cel-resumo').textContent = ''; return; }
    var cels = aparelhosDaEquipe(), ref = versaoReferencia(), recentes = 0;
    corpo.innerHTML = cels.length ? cels.map(function (a) {
      if (Date.now() - new Date(a.ultimo_contato).getTime() < DIA) recentes++;
      var velho = a.versao_app && cmpVersao(a.versao_app, ref) < 0;
      var fila = a.com_erro > 0 ? selo(a.com_erro + ' com erro', 'critico')
        : a.fila > 0 ? selo(a.fila + ' na fila', filaParada(a) ? 'critico' : 'aviso') + (a.fila_desde ? '<div class="m-sub">desde ' + esc(quando(a.fila_desde)) + '</div>' : '')
        : selo('Vazia', 'ga-ok');
      return '<tr><td><span class="m-tit">' + esc(String(a.usuario || '').split('@')[0]) + '</span><div class="m-sub">' + esc(a.usuario || '') + '</div></td>' +
        '<td><span class="m-cod">' + esc(a.equipe_codigo || '—') + '</span><div class="m-sub">' + esc(a.encarregado || '') + '</div></td>' +
        '<td>' + esc(a.versao_app || '?') + (velho ? ' ' + selo(G.config.versao_minima ? 'abaixo da mínima' : 'antiga', G.config.versao_minima ? 'critico' : 'atencao') : '') + '<div class="m-sub">' + esc(a.plataforma || '') + '</div></td>' +
        '<td>' + esc(haQuanto(a.ultimo_contato)) + '<div class="m-sub">' + esc(quando(a.ultimo_contato)) + '</div></td>' +
        '<td>' + fila + '</td><td>' + (a.instalado ? 'Sim' : '<span class="m-sub">no navegador</span>') + '</td>' +
        '<td>' + (a.catalogo_em ? esc(quando(a.catalogo_em)) : '<span class="m-sub">não baixada</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="7">' + vazio('Nenhum celular abriu o app ainda. Use o botão Instalar no celular para mandar o link aos encarregados.', 'device-mobile-off') + '</td></tr>';
    var atualizados = cels.filter(function (a) { return a.versao_app && cmpVersao(a.versao_app, VERSAO_APP) >= 0; }).length;
    $('ga-cel-resumo').textContent = cels.length ? cels.length + (cels.length === 1 ? ' celular' : ' celulares') + ', ' + recentes + ' com contato nas últimas 24 h. Versão publicada: ' + VERSAO_APP +
      ' (' + atualizados + ' já ' + (atualizados === 1 ? 'atualizou' : 'atualizaram') + ').' : 'Versão publicada: ' + VERSAO_APP + '.';
  }

  // ─── configurações ──────────────────────────────────────────────────────
  function renderConfig() {
    var c = G.config || {};
    $('ga-aviso').value = c.aviso || '';
    $('ga-aviso-ativo').checked = !!c.aviso_ativo;
    $('ga-fotos').value = c.fotos_minimas != null ? c.fotos_minimas : 1;
    $('ga-termino').checked = !!c.exigir_termino;
    $('ga-versao').value = c.versao_minima || '';
    $('ga-motivos').value = (lista(c.motivos).length ? c.motivos : MOTIVOS_PADRAO).join('\n');
    $('ga-cfg-quem').textContent = G.cfgQuem && G.cfgQuem.por ? 'Alterado em ' + quando(G.cfgQuem.em) + ' por ' + G.cfgQuem.por : '';
    var trava = !G.gestor;
    $('ga-cfg-trava').hidden = !trava || !!G.erros.config;
    $('ga-form-config').querySelectorAll('input,textarea,button[type=submit]').forEach(function (el) { el.disabled = trava; });
    if (G.erros.config) $('ga-cfg-quem').textContent = erroBanco(G.erros.config, 'as configurações do app');
    var cat = G.catalogo;
    $('ga-cat-status').textContent = G.erros.catalogo ? erroBanco(G.erros.catalogo, 'a lista de serviços')
      : cat && cat.n ? cat.n + ' serviços em uso no app, importados em ' + quando(cat.em) + '.' : 'A lista de serviços ainda não foi importada.';
  }

  async function salvarConfig(ev) {
    ev.preventDefault();
    if (!G.gestor) return;
    var motivos = $('ga-motivos').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var v = $('ga-versao').value.trim();
    if (v && !/^\d+(\.\d+){0,3}$/.test(v)) { toast('Versão mínima no formato 1.1.2, ou deixe em branco.'); $('ga-versao').focus(); return; }
    var dados = {
      aviso: $('ga-aviso').value.trim(), aviso_ativo: $('ga-aviso-ativo').checked,
      fotos_minimas: parseInt($('ga-fotos').value, 10), exigir_termino: $('ga-termino').checked,
      versao_minima: v, motivos: motivos.length ? motivos : MOTIVOS_PADRAO
    };
    if (isNaN(dados.fotos_minimas)) dados.fotos_minimas = 1;
    var bt = $('ga-salvar'); bt.disabled = true;
    try {
      var r = await G.sb.rpc('rdo_campo_salvar_config', { p_dados: dados });
      if (r.error) throw r.error;
      G.config = r.data || dados;
      G.cfgQuem = { em: new Date().toISOString(), por: (window.MARIUA_USER && window.MARIUA_USER.email) || '' };
      renderConfig(); renderAlertas();
      toast('Configurações salvas. Os celulares aplicam ao abrir o app com internet.');
    } catch (e) {
      var m = String((e && e.message) || e);
      toast(/gestor/i.test(m) ? m : /salvar_config|could not find/i.test(m) ? 'O banco ainda não tem as configurações do app. Rode o rdo_campo.sql atualizado.' : 'Não deu para salvar: ' + m);
    } finally { bt.disabled = !G.gestor; }
  }

  // ─── CSV ────────────────────────────────────────────────────────────────
  function baixarCsv(nome, linhas) {
    var csv = '\uFEFF' + linhas.map(function (l) {
      return l.map(function (c) { var t = c == null ? '' : String(c); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(';');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function sufixo() { return (G.de === G.ate ? G.de : G.de + '_a_' + G.ate) + (G.equipe ? '_' + G.equipe : ''); }
  function csvRdos() {
    var rs = rdosDaLista();
    if (!rs.length) { toast('Nada para baixar com esses filtros.'); return; }
    baixarCsv('rdos-app_' + sufixo() + '.csv', [['Data', 'Equipe', 'Encarregado', 'PEP', 'Obra', 'Município', 'Atividade programada', 'Início', 'Término',
      'Clima manhã', 'Clima tarde', 'Pessoas', 'Serviços', 'Fotos', 'Paralisação', 'Horas paradas', 'Observações', 'Latitude', 'Longitude', 'Enviado por', 'Recebido em']]
      .concat(rs.map(function (r) {
        return [br(r.data), r.equipe_codigo, r.encarregado, r.pep, r.nome_obra, r.municipio, r.atividade, hora(r.hora_inicio), hora(r.hora_fim),
          CLIMA[r.clima_manha] || '', CLIMA[r.clima_tarde] || '', r.efetivo, lista(r.servicos).length, lista(r.fotos).length,
          r.paralisacao ? r.paralisacao.motivo : '', r.paralisacao ? num(r.paralisacao.horas || 0) : '', r.observacoes,
          r.lat != null ? String(r.lat).replace('.', ',') : '', r.lng != null ? String(r.lng).replace('.', ',') : '', r.autor_email, quando(r.recebido_em)];
      })));
  }
  function csvServicos() {
    var linhas = [];
    rdosDaLista().forEach(function (r) {
      lista(r.servicos).forEach(function (s) {
        linhas.push([br(r.data), r.equipe_codigo, r.encarregado, r.pep, r.nome_obra, r.municipio, s.codigo || '', s.descricao, num(s.qtd), s.unidade, s.grupo || '', foraDaLista(s) ? 'Sim' : 'Não']);
      });
    });
    if (!linhas.length) { toast('Nenhum serviço para baixar com esses filtros.'); return; }
    baixarCsv('servicos-app_' + sufixo() + '.csv', [['Data', 'Equipe', 'Encarregado', 'PEP', 'Obra', 'Município', 'Código', 'Serviço', 'Quantidade', 'Unidade', 'Grupo', 'Fora da lista']].concat(linhas));
  }
  function csvProducao() {
    var porEq = G.agrupar === 'equipe', ls = producao();
    if (!ls.length) { toast('Nenhum serviço apontado no período.'); return; }
    baixarCsv('producao-app_' + sufixo() + '.csv', [(porEq ? ['Equipe'] : []).concat(['Código', 'Serviço', 'Unidade', 'Quantidade', 'RDOs']).concat(porEq ? [] : ['Equipes'])]
      .concat(ls.map(function (g) {
        return (porEq ? [g.equipe] : []).concat([g.fora ? 'fora da lista' : g.codigo, g.descricao, g.unidade, num(g.qtd), Object.keys(g.rdos).length])
          .concat(porEq ? [] : [Object.keys(g.equipes).length]);
      })));
  }

  // ─── abas e eventos ─────────────────────────────────────────────────────
  function abrirAba(aba) {
    G.aba = aba;
    document.querySelectorAll('.ga-abas [role=tab]').forEach(function (t) {
      var on = t.id === 'ga-t-' + aba; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.ga-painel').forEach(function (p) { p.hidden = p.id !== 'ga-' + aba; });
    try { history.replaceState(null, '', '#' + aba); } catch (e) {}
  }
  function filtrarRdos(f) {
    G.filtros = {}; G.filtros[f] = true;
    document.querySelectorAll('#ga-filtros-rdo [data-f]').forEach(function (b) { b.setAttribute('aria-pressed', String(!!G.filtros[b.dataset.f])); });
    $('ga-busca').value = '';
    renderRdos(); abrirAba('rdos');
  }

  function ligar() {
    $('ga-periodos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      aplicarPeriodo(b.dataset.p);
      if (b.dataset.p !== 'x') carregar(); else $('ga-de').focus();
    });
    ['ga-de', 'ga-ate'].forEach(function (id) { $(id).addEventListener('change', function () { aplicarPeriodo('x'); carregar(); }); });
    $('ga-equipe').addEventListener('change', function () { G.equipe = this.value; renderTudo(); });
    document.querySelector('.ga-abas').addEventListener('click', function (e) { var t = e.target.closest('[role=tab]'); if (t) abrirAba(t.id.replace('ga-t-', '')); });
    document.querySelector('.ga-abas').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(this.querySelectorAll('[role=tab]')), i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
    });
    var busca; $('ga-busca').addEventListener('input', function () { clearTimeout(busca); busca = setTimeout(renderRdos, 150); });
    var buscaEq; $('ga-busca-eq').addEventListener('input', function () { clearTimeout(buscaEq); buscaEq = setTimeout(renderEquipes, 150); });
    $('ga-filtros-rdo').addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      G.filtros[b.dataset.f] = !G.filtros[b.dataset.f];
      b.setAttribute('aria-pressed', String(!!G.filtros[b.dataset.f]));
      renderRdos();
    });
    function abrirRdoDaLinha(tr) { var r = G.rdos.filter(function (x) { return x.id === tr.dataset.id; })[0]; if (r && window.RDOAPP) window.RDOAPP.abrirLinha(r); }
    $('ga-rdos-corpo').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) abrirRdoDaLinha(tr); });
    $('ga-rdos-corpo').addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirRdoDaLinha(tr); } });
    $('ga-agrupar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      G.agrupar = b.dataset.a;
      this.querySelectorAll('[data-a]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      renderProducao();
    });
    $('ga-csv-rdos').addEventListener('click', csvRdos);
    $('ga-csv-serv').addEventListener('click', csvServicos);
    $('ga-csv-prod').addEventListener('click', csvProducao);
    $('ga-alertas').addEventListener('click', function (e) {
      var b = e.target.closest('[data-acao]'); if (!b) return;
      var a = b.dataset.acao;
      if (a === 'ver-fora') filtrarRdos('fora');
      else if (a === 'ver-gps') filtrarRdos('gps');
      else if (a === 'ver-cel') abrirAba('celulares');
      else if (a === 'catalogo' && window.RDOAPP) window.RDOAPP.abrirCatalogo();
    });
    $('ga-form-config').addEventListener('submit', salvarConfig);
    $('ga-atualizar').addEventListener('click', carregar);
    window.gaAtualizar = carregar;
    var instalar = function () { if (window.RDOAPP) window.RDOAPP.abrirInstalar(); };
    $('ga-instalar').addEventListener('click', instalar);
    $('ga-instalar2').addEventListener('click', instalar);
    $('ga-catalogo').addEventListener('click', function () { if (window.RDOAPP) window.RDOAPP.abrirCatalogo(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && G.sb) carregar(); });
  }

  // A versão publicada é a do campo/sw.js (o único lugar onde ela muda).
  function lerVersaoPublicada() {
    return fetch('campo/sw.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var m = String(t).match(/var VERSAO = '([\d.]+)'/);
      if (m && m[1] !== VERSAO_APP) { VERSAO_APP = m[1]; if (G.aparelhos.length) { renderCelulares(); renderAlertas(); renderEquipes(); } }
    }).catch(function () {});
  }

  function iniciar() {
    G.sb = window.MARIUA_SB;
    lerVersaoPublicada();
    ligar();
    aplicarPeriodo('7');
    var aba = (location.hash || '').replace('#', '');
    abrirAba(['geral', 'rdos', 'producao', 'equipes', 'celulares', 'config'].indexOf(aba) >= 0 ? aba : 'geral');
    carregar();
    setInterval(function () { if (document.visibilityState === 'visible') carregar(); }, 3 * 60 * 1000);
  }

  (function esperar(n) {
    if (window.MARIUA_SB && window.MARIUA_USER) { iniciar(); return; }
    setTimeout(function () { esperar((n || 0) + 1); }, n > 40 ? 2000 : 400);
  })(0);
})();
