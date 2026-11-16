/* ============================================================================
   RDO de campo · Mariuá — app do celular para o encarregado
   ----------------------------------------------------------------------------
   Como conversa com o site: pelo mesmo Supabase e com o mesmo login.
   - lê o Cadastro de Equipes e a Programação do dia (funções do rdo_campo.sql);
   - grava cada RDO na tabela rdo_campo e as fotos no bucket rdo-fotos;
   - o site mostra o que chegou no rdo.html (rdo-app.js).

   Funciona sem internet: tudo é salvo no celular (IndexedDB) enquanto o
   encarregado preenche. Ao tocar em Enviar, o RDO entra numa fila e sobe
   sozinho quando o celular pega sinal. Reenviar nunca duplica (o id nasce aqui).
   ========================================================================== */
(function () {
  'use strict';

  // ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────
  var CFG = {
    SUPA_URL: 'https://eqxejfoibebcbtsqymji.supabase.co',
    SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxeGVqZm9pYmViY2J0c3F5bWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjUzMTEsImV4cCI6MjA4NzQ0MTMxMX0.lwf7_EJ6UchEOpzhW3cVKztxDGy78gaQblRvgiEwWh8',
    TABELA: 'rdo_campo',
    BUCKET: 'rdo-fotos',
    VERSAO: '1.2.2',      // só reserva: a versão que vale é a do sw.js (o app pergunta a ele)
    FOTO_LADO: 1600,        // maior lado da foto enviada (px)
    FOTO_QUALIDADE: 0.72,   // JPEG: ~250–450 KB por foto
    MINI_LADO: 320,         // miniatura guardada no celular
    MAX_FOTOS: 40,
    DIAS_GUARDAR: 30,       // RDOs enviados ficam no celular por 30 dias
    CTX_VALIDADE: 30 * 60 * 1000
  };

  var CLIMAS = [
    { v: 'bom', t: 'Bom', i: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
    { v: 'nublado', t: 'Nublado', i: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/></svg>' },
    { v: 'chuva', t: 'Chuva', i: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></svg>' },
    { v: 'impraticavel', t: 'Impraticável', i: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 13z"/><path d="M13 13l-3 5h4l-3 4"/></svg>' }
  ];
  var ETAPAS = [{ v: 'antes', t: 'Antes' }, { v: 'durante', t: 'Durante' }, { v: 'depois', t: 'Depois' }];
  var MOTIVOS_PADRAO = ['Chuva', 'Falta de material', 'Desligamento não liberado', 'Interferência de terceiros',
                 'Veículo ou equipamento', 'Acidente ou incidente', 'Outro'];
  var MOTIVOS = MOTIVOS_PADRAO.slice();
  var GRUPO_NOME = { 'LINHA MORTA': 'Linha morta', 'LINHA VIVA': 'Linha viva', 'PODA': 'Poda', 'LC': 'LC', 'RETRO': 'Retro' };
  var PALAVRAS_VAZIAS = { DE: 1, DA: 1, DO: 1, DAS: 1, DOS: 1, E: 1, EM: 1, A: 1, O: 1, AS: 1, OS: 1, COM: 1, PARA: 1, POR: 1, NO: 1, NA: 1 };
  var PARTES = [
    { id: 'obra', t: 'Obra' }, { id: 'horario', t: 'Horário' }, { id: 'clima', t: 'Clima' },
    { id: 'equipe', t: 'Equipe' }, { id: 'servicos', t: 'Serviços' }, { id: 'fotos', t: 'Fotos' }, { id: 'obs', t: 'Obs.' }
  ];
  var ROTULO_STATUS = { rascunho: 'Rascunho', pendente: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', erro: 'Erro no envio' };
  var SVG_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var SVG_SETA = '<svg class="seta" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var SVG_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // ─── ESTADO ──────────────────────────────────────────────────────────────
  var S = {
    sb: null,
    conta: null,          // { id, email, nome, matricula }
    equipe: null,         // { codigo, encarregado, matricula, qtd_colab, ... }
    equipes: [],
    tela: '',
    rdo: null,            // RDO aberto no editor
    fotos: [],            // fotos do RDO aberto (registros do IndexedDB)
    ctx: null,            // programação + efetivo do dia do RDO aberto
    processando: 0,
    tentouEnviar: false,
    gps: null, gpsErro: null, gpsWatch: null,
    online: navigator.onLine,
    sincronizando: false,
    precisaLogin: false,
    ultimoErro: '',
    esperaSync: null, atrasoSync: 15000,
    instalarEvt: null,
    versao: ''
  };

  // ─── UTILIDADES ──────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function isoDe(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function hojeISO() { return isoDe(new Date()); }
  function dataDeISO(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function br(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function brCurto(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
  function dataLonga(iso) {
    try { return dataDeISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (e) { return br(iso); }
  }
  function horaAgora() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function quandoBR(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' às ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function norm(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function slug(t) { return norm(t).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'SEM-EQUIPE'; }
  function debounce(fn, ms) {
    var t; var f = function () { clearTimeout(t); t = setTimeout(fn, ms); };
    f.agora = function () { clearTimeout(t); return fn(); };
    return f;
  }
  function comPrazo(promessa, ms) {
    return Promise.race([promessa, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('Tempo esgotado')); }, ms);
    })]);
  }
  function numero(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
  function fmtNum(n) { return n == null ? '' : String(n).replace('.', ','); }
  function primeiroNome(t) { var s = String(t || '').trim().split(/\s+/)[0] || ''; return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

  // ─── AVISOS E CONFIRMAÇÕES ───────────────────────────────────────────────
  function aviso(tx, tipo, ms) {
    var box = $('avisos'); var el = document.createElement('div');
    el.className = 'aviso-t' + (tipo ? ' ' + tipo : ''); el.textContent = tx;
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();   // no máximo dois avisos na tela
    setTimeout(function () { el.remove(); }, ms || 3800);
  }
  function confirmar(titulo, texto, rotuloSim, perigo) {
    return new Promise(function (res) {
      var d = $('dlg-conf');
      $('dlg-conf-tit').textContent = titulo;
      $('dlg-conf-tx').textContent = texto || '';
      var bt = $('dlg-conf-sim'); bt.textContent = rotuloSim || 'Confirmar';
      bt.classList.toggle('perigo', !!perigo);
      d.returnValue = '';
      d.onclose = function () { res(d.returnValue === 'sim'); };
      d.showModal();
    });
  }

  // ─── BANCO LOCAL (IndexedDB) ─────────────────────────────────────────────
  var DB = (function () {
    var aberto = null;
    function abrir() {
      if (aberto) return aberto;
      aberto = new Promise(function (res, rej) {
        var r = indexedDB.open('mariua-rdo-campo', 1);
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains('rdos')) d.createObjectStore('rdos', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', { keyPath: 'id' }).createIndex('rdo', 'rdoId');
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return aberto;
    }
    function pedido(nome, modo, fazer) {
      return abrir().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(nome, modo); var r = fazer(t.objectStore(nome));
          t.oncomplete = function () { res(r ? r.result : undefined); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error || new Error('Gravação cancelada')); };
        });
      });
    }
    return {
      get: function (n, k) { return pedido(n, 'readonly', function (s) { return s.get(k); }); },
      put: function (n, v, k) { return pedido(n, 'readwrite', function (s) { return k === undefined ? s.put(v) : s.put(v, k); }); },
      del: function (n, k) { return pedido(n, 'readwrite', function (s) { return s.delete(k); }); },
      todos: function (n) { return pedido(n, 'readonly', function (s) { return s.getAll(); }); },
      porRdo: function (id) { return pedido('fotos', 'readonly', function (s) { return s.index('rdo').getAll(id); }); }
    };
  })();
  function kvGet(k) { return DB.get('kv', k).catch(function () { return undefined; }); }
  function kvSet(k, v) { return DB.put('kv', v, k).catch(function () {}); }
  function kvDel(k) { return DB.del('kv', k).catch(function () {}); }

  // ─── CONTA ───────────────────────────────────────────────────────────────
  function montarConta(user) {
    var md = (user && user.user_metadata) || {};
    var email = String(user.email || '').toLowerCase();
    return {
      id: user.id, email: email,
      nome: md.nome || md.full_name || md.name || email.split('@')[0],
      matricula: String(md.matricula || md.mat || '').trim()
    };
  }

  // ─── TELAS E NAVEGAÇÃO ───────────────────────────────────────────────────
  // Cada tela tem um endereço (#rdo/<id>…) para o botão Voltar do celular funcionar.
  function ir(hash) { history.pushState({ app: 1 }, '', hash); rota(); }
  function trocar(hash) { history.replaceState(history.state, '', hash); rota(); }
  function voltar() {
    if (history.state && history.state.app) history.back();
    else trocar('#');
  }

  function mostrar(nome, topo) {
    if (S.tela === 'rdo' && nome !== 'rdo') sairDoEditor();
    S.tela = nome;
    document.querySelectorAll('.tela').forEach(function (t) { t.hidden = t.id !== 'tela-' + nome; });
    topo = topo || {};
    $('topo-titulo').textContent = topo.titulo || 'RDO de campo';
    $('topo-sub').textContent = topo.sub || '';
    $('topo-voltar').hidden = !topo.voltar;
    $('selo').hidden = !topo.selo;
    window.scrollTo(0, 0);
    atualizarSelo();
  }

  function rota() {
    if (!S.conta) { abrirLogin(); return; }
    var h = location.hash.replace(/^#/, ''); var partes = h.split('/');
    if (partes[0] === 'equipe' || !S.equipe) { abrirEquipe(); return; }
    if (partes[0] === 'rdo' && partes[1]) { abrirEditor(partes[1]); return; }
    if (partes[0] === 'ver' && partes[1]) { abrirVer(partes[1]); return; }
    abrirInicio();
  }

  // ─── LOGIN (usuário e senha) ────────────────────────────────────────────
  // O usuário é o começo do e-mail (antes do @), como no sistema da
  // concessionária (JOAO.ARAUJO). O Supabase entra por e-mail: a função
  // rdo_campo_email_login acha o e-mail da conta. O e-mail inteiro também vale.
  function abrirLogin(msg) {
    mostrar('login');
    $('lg-msg').textContent = msg || '';
    $('lg-msg').className = 'msg';
    kvGet('ultimo-usuario').then(function (u) {
      var campo = $('lg-usuario');
      if (u && !campo.value) campo.value = u;
      setTimeout(function () { (campo.value ? $('lg-senha') : campo).focus(); }, 50);
    });
  }

  function traduzErroLogin(e) {
    var m = String((e && e.message) || e || '');
    if (/invalid login credentials|usuario-nao-encontrado/i.test(m)) return 'Usuário ou senha incorretos.';
    if (/mais de uma conta/i.test(m)) return m;
    if (/rdo_campo_email_login|could not find the function/i.test(m)) return 'Por enquanto, entre com o e-mail completo: o banco ainda não tem o login por usuário (rdo_campo.sql).';
    if (/email not confirmed/i.test(m)) return 'Esta conta ainda não foi confirmada. Fale com o escritório.';
    if (/fetch|network|load failed|tempo esgotado/i.test(m) || !navigator.onLine) return 'Sem internet. O primeiro acesso precisa de conexão.';
    return 'Não deu para entrar: ' + m;
  }

  async function emailDoUsuario(usuario) {
    var u = String(usuario || '').trim();
    if (u.indexOf('@') > 0) return u.toLowerCase();
    var r = await comPrazo(S.sb.rpc('rdo_campo_email_login', { p_usuario: u }), 15000);
    if (r.error) throw r.error;
    if (!r.data) throw new Error('usuario-nao-encontrado');
    return String(r.data).toLowerCase();
  }
  function emailEscondido(email) {
    var p = String(email).split('@'), n = p[0];
    return (n.length <= 2 ? n.charAt(0) + '•' : n.charAt(0) + '•••' + n.charAt(n.length - 1)) + '@' + (p[1] || '');
  }
  function usuarioDaConta(conta) { return conta && conta.email ? conta.email.split('@')[0] : ''; }

  async function entrar(ev) {
    ev.preventDefault();
    var usuario = $('lg-usuario').value.trim();
    var senha = $('lg-senha').value;
    var msg = $('lg-msg'); msg.className = 'msg';
    if (!usuario) { msg.textContent = 'Escreva seu usuário.'; $('lg-usuario').focus(); return; }
    if (!senha) { msg.textContent = 'Escreva sua senha.'; $('lg-senha').focus(); return; }
    var bt = $('lg-entrar'); bt.disabled = true; bt.textContent = 'Entrando…';
    try {
      var email = await emailDoUsuario(usuario);
      var r = await comPrazo(S.sb.auth.signInWithPassword({ email: email, password: senha }), 20000);
      if (r.error) throw r.error;
      S.conta = montarConta(r.data.user);
      S.precisaLogin = false;
      await kvSet('conta', S.conta);
      await kvSet('ultimo-usuario', usuario.indexOf('@') > 0 ? usuarioDaConta(S.conta) : usuario.toLowerCase());
      $('lg-senha').value = '';
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      if (!S.equipe) S.equipe = (await kvGet('equipe')) || null;
      trocar(S.equipe ? '#' : '#equipe');
      sincronizar();
      atualizarDoEscritorio(true);
    } catch (e) {
      msg.textContent = traduzErroLogin(e);
      $('lg-senha').select();
    } finally {
      bt.disabled = false; bt.textContent = 'Entrar';
    }
  }

  async function esqueciSenha() {
    var usuario = $('lg-usuario').value.trim();
    var msg = $('lg-msg');
    if (!usuario) { msg.className = 'msg'; msg.textContent = 'Escreva seu usuário acima e toque de novo em Esqueci a senha.'; $('lg-usuario').focus(); return; }
    try {
      var email = await emailDoUsuario(usuario);
      var r = await comPrazo(S.sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('../', location.href).href }), 20000);
      if (r.error) throw r.error;
      msg.className = 'msg ok';
      msg.textContent = 'Enviamos um link para ' + emailEscondido(email) + '. Crie a senha nova por ele e volte aqui para entrar.';
    } catch (e) {
      msg.className = 'msg';
      msg.textContent = /usuario-nao-encontrado/.test(String(e && e.message))
        ? 'Não achamos esse usuário. Confira como ele está escrito ou fale com o escritório.' : traduzErroLogin(e);
    }
  }

  // ─── EQUIPE ──────────────────────────────────────────────────────────────
  async function abrirEquipe() {
    mostrar('equipe', { titulo: 'Escolher equipe', voltar: !!S.equipe });
    $('eq-msg').textContent = '';
    if (!S.equipes.length) S.equipes = (await kvGet('equipes')) || [];
    renderEquipes();
    if (S.online) {
      try {
        await baixarEquipes();
        renderEquipes();
      } catch (e) {
        if (!S.equipes.length) $('eq-msg').textContent = mensagemErro(e, 'Não deu para carregar a lista de equipes.') + ' Você pode digitar a equipe abaixo.';
      }
    } else if (!S.equipes.length) {
      $('eq-msg').textContent = 'Sem internet para carregar a lista. Digite a equipe abaixo ou tente quando tiver sinal.';
    }
  }

  async function baixarEquipes() {
    var r = await comPrazo(S.sb.rpc('rdo_campo_equipes'), 15000);
    if (r.error) throw r.error;
    S.equipes = Array.isArray(r.data) ? r.data.filter(function (q) { return q && (q.codigo || q.encarregado); }) : [];
    await kvSet('equipes', S.equipes);
    return S.equipes;
  }

  function equipeSugerida(q) {
    var c = S.conta || {};
    if (c.matricula && q.matricula && String(q.matricula).trim() === c.matricula) return true;
    var a = norm(c.nome), b = norm(q.encarregado);
    return a.length >= 4 && b.length >= 4 && (a === b || b.indexOf(a + ' ') === 0 || a.indexOf(b + ' ') === 0);
  }

  function renderEquipes() {
    var termo = norm($('eq-busca').value);
    var lista = S.equipes.filter(function (q) {
      return !termo || norm(q.codigo + ' ' + q.encarregado + ' ' + (q.centro || '')).indexOf(termo) >= 0;
    });
    lista.sort(function (a, b) { return (equipeSugerida(b) ? 1 : 0) - (equipeSugerida(a) ? 1 : 0); });
    var ul = $('eq-lista');
    if (!S.equipes.length) { ul.innerHTML = ''; return; }
    if (!lista.length) { ul.innerHTML = '<li class="linha-vazia">Nenhuma equipe com esse nome.</li>'; return; }
    ul.innerHTML = lista.slice(0, 80).map(function (q, i) {
      var idx = S.equipes.indexOf(q);
      var detalhe = [q.encarregado, q.centro].filter(Boolean).join(', ');
      return '<li><button type="button" class="' + (equipeSugerida(q) ? 'sugerida' : '') + '" data-eq="' + idx + '">' +
        '<b>' + esc(q.codigo || q.encarregado) + '</b><span>' + esc(detalhe) + '</span></button></li>';
    }).join('');
  }

  async function escolherEquipe(q) {
    S.equipe = {
      codigo: String(q.codigo || '').trim() || String(q.encarregado || '').trim().toUpperCase(),
      encarregado: String(q.encarregado || '').trim(),
      matricula: q.matricula || '', qtd_colab: q.qtd_colab || '',
      centro: q.centro || '', supervisor: q.supervisor || ''
    };
    await kvSet('equipe', S.equipe);
    informarAparelho(true);
    aviso('Equipe ' + S.equipe.codigo + ' escolhida.', 'ok');
    contexto(hojeISO()).catch(function () {});
    if (history.state && history.state.app) history.back(); else trocar('#');
  }

  // ─── PROGRAMAÇÃO E EFETIVO (contexto do dia) ─────────────────────────────
  function chaveCtx(data) { return 'ctx|' + data + '|' + norm(S.equipe && S.equipe.encarregado); }
  function ctxVazio() { return { programacao: [], efetivo: [] }; }

  // Devolve o que estiver guardado e, com internet, busca de novo em segundo plano.
  async function contexto(data, aoAtualizar, forcar) {
    var k = chaveCtx(data);
    var guardado = await kvGet(k);
    var velho = !guardado || (Date.now() - guardado.em > CFG.CTX_VALIDADE);
    if (S.online && S.equipe && S.equipe.encarregado && (velho || forcar)) {
      var busca = comPrazo(S.sb.rpc('rdo_campo_contexto', { p_data: data, p_encarregado: S.equipe.encarregado }), 15000)
        .then(function (r) {
          if (r.error) throw r.error;
          var d = r.data || ctxVazio();
          d.programacao = Array.isArray(d.programacao) ? d.programacao : [];
          d.efetivo = Array.isArray(d.efetivo) ? d.efetivo : [];
          kvSet(k, { em: Date.now(), dados: d });
          if (aoAtualizar) aoAtualizar(d);
          return d;
        });
      if (!guardado) return busca.catch(function () { return ctxVazio(); });
      busca.catch(function () {});
    }
    return guardado ? guardado.dados : ctxVazio();
  }

  // ─── LISTA DE SERVIÇOS (precificação) ────────────────────────────────────
  // A mesma lista do sistema da concessionária, importada pelo escritório na
  // tela RDO. Fica guardada no celular: o apontamento funciona sem internet.
  var CAT = { itens: [], porCod: {}, em: 0, lido: false, erro: '' };

  function nomeGrupo(g) { return GRUPO_NOME[g] || (g ? g.charAt(0) + g.slice(1).toLowerCase() : 'Outros'); }
  function unidadeTx(u) {
    var x = String(u || '').trim(), m = { UN: 'un', UND: 'un', M: 'm', M2: 'm²', KG: 'kg', TKM: 't·km', KM: 'km', H: 'h', VB: 'vb' };
    return m[x.toUpperCase()] || x.toLowerCase() || 'un';
  }
  function palavras(t) { return norm(t).split(/[^A-Z0-9]+/).filter(function (w) { return w && !PALAVRAS_VAZIAS[w]; }); }
  function numCodigo(c) { var m = String(c || '').match(/(\d+)\s*$/); return m ? +m[1] : 1e9; }

  function prepararCatalogo(itens, em) {
    CAT.itens = itens.map(function (x) {
      return { c: String(x.c), d: String(x.d), u: x.u || '', k: +x.k || 0, g: x.g || '', ct: x.ct || '',
               _p: palavras(x.d).concat(palavras(x.c)), _num: numCodigo(x.c) };
    }).sort(function (a, b) { return a._num - b._num || a.c.localeCompare(b.c); });
    CAT.porCod = {};
    CAT.itens.forEach(function (x) { CAT.porCod[x.ct + '|' + x.c] = x; if (!CAT.porCod[x.c]) CAT.porCod[x.c] = x; });
    CAT.em = em || 0;
  }

  // Baixa de novo quando passou mais de uma hora (são ~40 KB) ou quando pedem.
  async function carregarCatalogo(forcar) {
    if (!CAT.lido) {
      CAT.lido = true;
      var g = await kvGet('servicos');
      if (g && Array.isArray(g.itens)) prepararCatalogo(g.itens, g.em);
    }
    var velho = !CAT.em || Date.now() - CAT.em > 60 * 60 * 1000;
    if (S.online && S.sb && S.conta && (velho || forcar)) {
      try {
        var r = await comPrazo(S.sb.rpc('rdo_campo_servicos'), 20000);
        if (r.error) throw r.error;
        var itens = (Array.isArray(r.data) ? r.data : []).filter(function (x) { return x && x.c && x.d; });
        prepararCatalogo(itens, itens.length ? Date.now() : 0);     // lista vazia: tenta de novo na próxima
        CAT.erro = '';
        await kvSet('servicos', { em: CAT.em, itens: itens });
      } catch (e) {
        CAT.erro = mensagemErro(e, 'Não deu para baixar a lista de serviços.');
        if (forcar) throw e;
      }
    }
    return CAT.itens;
  }

  function ufDaEquipe(eq) {
    var suf = (norm(eq && eq.codigo).match(/-([A-Z]+)$/) || [])[1] || '';
    var mapa = { IRC: 'BA', JAC: 'BA', FSA: 'BA', SRR: 'BA', PA: 'MG', ITA: 'MG', AJU: 'SE' };
    if (mapa[suf]) return mapa[suf];
    var c = norm(eq && eq.centro);
    if (/IRECE|JACOBINA|FEIRA|SERRINHA/.test(c)) return 'BA';
    if (/CONGONHAL|ITAJUBA/.test(c)) return 'MG';
    if (/ARACAJU/.test(c)) return 'SE';
    return '';
  }
  // Com um contrato só, usa ele. Com vários, o do estado da equipe (OBRAS - BA, …).
  function catalogoDaEquipe() {
    var cts = [];
    CAT.itens.forEach(function (x) { if (cts.indexOf(x.ct) < 0) cts.push(x.ct); });
    if (cts.length <= 1) return CAT.itens;
    var uf = ufDaEquipe(S.equipe);
    var doUf = uf ? cts.filter(function (ct) { return new RegExp('(^|[^A-Z])' + uf + '([^A-Z]|$)').test(norm(ct)); }) : [];
    return doUf.length === 1 ? CAT.itens.filter(function (x) { return x.ct === doUf[0]; }) : CAT.itens;
  }

  // 3 = palavra igual; 2 = começa com o que foi digitado; 1 = abreviação da lista
  // ("CRUZ" casa com "cruzeta", "INST" com "instalar", "ISOL" com "isolador").
  function casaPalavra(item, q) {
    var melhor = 0;
    for (var i = 0; i < item._p.length; i++) {
      var w = item._p[i];
      if (w === q) return 3;
      if (w.indexOf(q) === 0) melhor = Math.max(melhor, 2);
      else if (w.length >= 3 && q.indexOf(w) === 0) melhor = Math.max(melhor, 1);
    }
    return melhor;
  }
  function buscarServicos(lista, termo) {
    var bruto = String(termo || '').trim();
    var q = palavras(bruto); if (!q.length) return lista;
    var soNum = (bruto.replace(/^[a-z]{2}[_\s-]?/i, '').match(/^\d+$/) || [])[0];   // "131", "ba_131", "BA 131"
    var achados = [];
    lista.forEach(function (x) {
      var pts = 0;
      if (soNum && x._num === +soNum) pts = 100;
      else {
        for (var i = 0; i < q.length; i++) { var p = casaPalavra(x, q[i]); if (!p) { pts = 0; break; } pts += p; }
        if (pts && x._p[0] && x._p[0].indexOf(q[0]) === 0) pts += 1;    // começa pelo que foi digitado
      }
      if (pts) achados.push({ x: x, p: pts });
    });
    achados.sort(function (a, b) { return b.p - a.p || a.x._num - b.x._num; });
    return achados.map(function (a) { return a.x; });
  }
  function parecidosComAtividade(lista, atividade) {
    var q = palavras(atividade).filter(function (w) { return w.length >= 4; });
    if (!q.length) return [];
    var res = [];
    lista.forEach(function (x) {
      var pts = 0; q.forEach(function (w) { pts += casaPalavra(x, w); });
      if (pts >= 2) res.push({ x: x, p: pts });
    });
    res.sort(function (a, b) { return b.p - a.p || a.x._num - b.x._num; });
    return res.slice(0, 6).map(function (a) { return a.x; });
  }
  async function maisUsados(lista) {
    var uso = (await kvGet('servicos-uso')) || {};
    var mapa = {}; lista.forEach(function (x) { mapa[x.c] = x; });
    return Object.keys(uso).sort(function (a, b) { return uso[b].n - uso[a].n || (uso[b].em || 0) - (uso[a].em || 0); })
      .map(function (c) { return mapa[c]; }).filter(Boolean).slice(0, 8);
  }
  async function registrarUso(r) {
    var uso = (await kvGet('servicos-uso')) || {};
    r.servicos.forEach(function (s) {
      if (!s.codigo) return;
      var u = uso[s.codigo] || { n: 0 }; u.n++; u.em = Date.now(); uso[s.codigo] = u;
    });
    await kvSet('servicos-uso', uso);
  }

  // ─── seletor de serviço ──────────────────────────────────────────────────
  var PICK = { grupo: '', usados: [], parecidos: [] };

  async function abrirSeletorServico() {
    var r = S.rdo; if (!r) return;
    await carregarCatalogo();
    var lista = catalogoDaEquipe();
    PICK.grupo = '';
    $('dlg-serv-busca').value = '';
    $('dlg-serv-livre').open = false;
    PICK.usados = await maisUsados(lista);
    PICK.parecidos = parecidosComAtividade(lista, r.obra.atividade);
    renderGruposServico(lista);
    renderListaServico();
    $('dlg-serv').showModal();
    $('dlg-serv-lista').scrollTop = 0;
  }

  function renderGruposServico(lista) {
    var cont = {}; lista.forEach(function (x) { cont[x.g] = (cont[x.g] || 0) + 1; });
    var gs = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; });
    var box = $('dlg-serv-grupos');
    box.hidden = gs.length < 2;
    box.innerHTML = '<button type="button" role="radio" aria-checked="' + (!PICK.grupo) + '" data-g="">Todos</button>' +
      gs.map(function (g) {
        return '<button type="button" role="radio" aria-checked="' + (PICK.grupo === g) + '" data-g="' + esc(g) + '">' +
          esc(nomeGrupo(g)) + ' <small>' + cont[g] + '</small></button>';
      }).join('');
  }

  function linhaServico(x, ja) {
    return '<button type="button" class="sp-item' + (ja ? ' ja' : '') + '" data-cod="' + esc(x.c) + '" data-ct="' + esc(x.ct) + '">' +
      '<span class="sp-cod">' + esc(x.c) + '</span>' +
      '<span class="sp-desc">' + esc(x.d) + (ja ? '<small>Já está no RDO</small>' : '') + '</span>' +
      '<span class="sp-un">' + esc(unidadeTx(x.u)) + '</span></button>';
  }

  function renderListaServico() {
    var r = S.rdo; if (!r) return;
    var lista = catalogoDaEquipe(), box = $('dlg-serv-lista');
    if (!lista.length) {
      box.innerHTML = '<p class="sp-vazio">' + esc(CAT.erro || (S.online
        ? 'O escritório ainda não carregou a lista de serviços no sistema.'
        : 'A lista de serviços ainda não foi baixada neste celular. Abra o app uma vez com internet.')) +
        ' Por enquanto, aponte o serviço escrevendo abaixo.</p>';
      $('dlg-serv-livre').open = true;
      return;
    }
    var ja = {}; r.servicos.forEach(function (s) { if (s.codigo) ja[s.codigo] = 1; });
    var termo = $('dlg-serv-busca').value.trim();
    var base = PICK.grupo ? lista.filter(function (x) { return x.g === PICK.grupo; }) : lista;
    var secao = function (tit, itens, limite) {
      if (!itens.length) return '';
      var mostra = itens.slice(0, limite || 250);
      return '<h3 class="sp-tit">' + esc(tit) + '</h3>' + mostra.map(function (x) { return linhaServico(x, ja[x.c]); }).join('') +
        (itens.length > mostra.length ? '<p class="sp-mais">Mostrando ' + mostra.length + ' de ' + itens.length + '. Escreva parte do nome para achar mais rápido.</p>' : '');
    };
    var html = '';
    if (termo) {
      var achados = buscarServicos(base, termo);
      html = achados.length
        ? secao(achados.length === 1 ? '1 serviço encontrado' : achados.length + ' serviços encontrados', achados, 120)
        : '<p class="sp-vazio">Nenhum serviço com “' + esc(termo) + '”' + (PICK.grupo ? ' em ' + esc(nomeGrupo(PICK.grupo)) : '') +
          '. Tente outra palavra, o número do código (ex.: 131) ou aponte escrevendo abaixo.</p>';
    } else {
      if (!PICK.grupo) {
        html += secao('Parecidos com a atividade programada', PICK.parecidos);
        html += secao('Mais usados neste celular', PICK.usados.filter(function (x) { return PICK.parecidos.indexOf(x) < 0; }));
      }
      html += secao((PICK.grupo ? nomeGrupo(PICK.grupo) : 'Todos os serviços') + ' (' + base.length + ')', base);
    }
    box.innerHTML = html;
  }

  function focarQtd(i, abrirTeclado) {
    setTimeout(function () {
      var q = $('sv-q-' + i); if (!q) return;
      var li = q.closest('.sv');
      li.scrollIntoView({ block: 'center' });
      li.classList.remove('realce'); void li.offsetWidth; li.classList.add('realce');
      if (abrirTeclado) try { q.focus({ preventScroll: true }); } catch (e) {}
    }, 80);
  }

  function adicionarServicoDoCatalogo(cod, ct) {
    var r = S.rdo; if (!r) return;
    var x = CAT.porCod[ct + '|' + cod] || CAT.porCod[cod]; if (!x) return;
    var i = -1;
    r.servicos.forEach(function (s, k) { if (s.codigo === x.c) i = k; });
    if (i < 0) {
      r.servicos.push({ codigo: x.c, descricao: x.d, unidade: x.u, casas: x.k, grupo: x.g, contrato: x.ct, qtd: '' });
      i = r.servicos.length - 1;
      mudou();
    } else aviso(x.c + ' já está no RDO.');
    $('dlg-serv').close();
    renderServicos();
    focarQtd(i, x.k > 0);
  }

  function adicionarServicoLivre() {
    var r = S.rdo; if (!r) return;
    var campo = $('dlg-serv-livre-d'), desc = campo.value.trim(), un = $('dlg-serv-livre-u').value;
    if (!desc) { campo.focus(); return; }
    r.servicos.push({ codigo: '', descricao: desc, unidade: un, casas: un === 'UN' ? 0 : 2, grupo: '', contrato: '', qtd: '', livre: true });
    campo.value = '';
    $('dlg-serv').close();
    renderServicos(); mudou();
    focarQtd(r.servicos.length - 1, un !== 'UN');
  }

  // Só números, com as casas decimais que a lista manda (poste é inteiro, cabo em metro aceita 2).
  function limparQtd(v, casas) {
    var t = String(v || '').replace(/[^\d.,]/g, '').replace(/\./g, ',');
    if (!(casas > 0)) return t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    var partes = t.split(','), inteiro = partes[0].replace(/^0+(?=\d)/, '');
    return partes.length > 1 ? (inteiro || '0') + ',' + partes.slice(1).join('').slice(0, casas) : inteiro;
  }

  // ─── CONFIGURAÇÕES DO ESCRITÓRIO ─────────────────────────────────────────
  // Definidas na página "App de campo" do site; ficam guardadas no celular.
  var CONF = { dados: {}, lido: false };
  function fotosMinimas() { var n = parseInt(CONF.dados.fotos_minimas, 10); return isNaN(n) ? 1 : Math.max(0, Math.min(10, n)); }
  function cmpVersao(a, b) {
    var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  function aplicarConfig() {
    var m = Array.isArray(CONF.dados.motivos) && CONF.dados.motivos.length ? CONF.dados.motivos : MOTIVOS_PADRAO;
    MOTIVOS = m.map(String);
    if (S.tela === 'inicio') renderRecado();
    if (ATU.nova && atualizacaoObrigatoria()) { ATU.adiada = false; mostrarAtualizacao(); }
    if (S.rdo) atualizarTrilho();
  }
  async function carregarConfig() {
    if (!CONF.lido) {
      CONF.lido = true;
      var g = await kvGet('config');
      if (g && g.dados) { CONF.dados = g.dados; aplicarConfig(); }
    }
    if (!(S.online && S.sb && S.conta)) return;
    try {
      var r = await comPrazo(S.sb.from('rdo_campo_config').select('dados').eq('id', 1).maybeSingle(), 15000);
      if (r.error) throw r.error;
      CONF.dados = (r.data && r.data.dados) || {};
      await kvSet('config', { dados: CONF.dados, em: Date.now() });
      aplicarConfig();
    } catch (e) { /* sem a tabela ou sem internet: segue com o que está guardado */ }
  }
  function renderRecado() {
    var box = $('ini-recado'); if (!box) return;
    var c = CONF.dados, h = '';
    if (c.versao_minima && cmpVersao(versaoAtual(), c.versao_minima) < 0) {
      h += '<div class="recado recado-alerta"><b>Atualize o app.</b><p>O escritório pediu a versão ' + esc(c.versao_minima) + ' ou mais nova, e esta é a ' + esc(versaoAtual()) + '.</p>' +
        '<button type="button" class="bt bt-sinal bt-p" data-acao="atualizar">' + (ATU.nova ? 'Atualizar agora' : 'Procurar atualização') + '</button></div>';
      if (!ATU.nova) buscarAtualizacao(false);
    } else if (ATU.nova && ATU.adiada) {
      h += '<div class="recado"><b>Atualização pronta' + (ATU.info && ATU.info.versao ? ' (versão ' + esc(ATU.info.versao) + ')' : '') + '</b>' +
        '<p>Leva poucos segundos, e o que você preencheu fica salvo.</p>' +
        '<button type="button" class="bt bt-linha bt-p" data-acao="atualizar">Atualizar agora</button></div>';
    }
    if (c.aviso_ativo && String(c.aviso || '').trim()) h += '<div class="recado"><b>Recado do escritório</b><p>' + esc(c.aviso) + '</p></div>';
    box.innerHTML = h; box.hidden = !h;
  }

  // Informe do celular para a página de gestão: versão, fila e último contato.
  var INFORME = { ultimo: 0 };
  function plataforma() {
    var ua = navigator.userAgent, m;
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPhone';
    if ((m = ua.match(/Android\s([\d.]+)/))) return 'Android ' + m[1].split('.')[0];
    return /Windows/.test(ua) ? 'Computador (Windows)' : /Mac/.test(ua) ? 'Computador (Mac)' : 'Outro';
  }
  async function informarAparelho(forcar) {
    if (!(S.online && S.sb && S.conta && S.conta.id)) return;
    if (!forcar && Date.now() - INFORME.ultimo < 10 * 60 * 1000) return;
    INFORME.ultimo = Date.now();
    try {
      var dev = await kvGet('aparelho-id');
      if (!dev) { dev = uuid(); await kvSet('aparelho-id', dev); }
      var todos = await DB.todos('rdos');
      var fila = todos.filter(function (r) { return r.status === 'pendente' || r.status === 'enviando' || r.status === 'erro'; });
      var desde = fila.map(function (r) { return r.finalizadoEm || r.atualizadoEm; }).filter(Boolean).sort()[0] || null;
      await comPrazo(S.sb.from('rdo_campo_aparelhos').upsert({
        id: dev + ':' + S.conta.id, autor_id: S.conta.id, usuario: S.conta.email,
        equipe_codigo: S.equipe ? S.equipe.codigo : null, encarregado: S.equipe ? S.equipe.encarregado : null,
        versao_app: versaoAtual(), plataforma: plataforma(), instalado: instalado(),
        fila: fila.length, com_erro: fila.filter(function (r) { return r.status === 'erro'; }).length, fila_desde: desde,
        catalogo_em: CAT.em ? new Date(CAT.em).toISOString() : null, ultimo_contato: new Date().toISOString()
      }, { onConflict: 'id' }), 15000);
    } catch (e) { INFORME.ultimo = 0; }
  }

  // Tudo o que o app busca do escritório, quando tem internet.
  function atualizarDoEscritorio(forcarInforme) {
    carregarCatalogo().catch(function () {});
    carregarConfig().catch(function () {});
    informarAparelho(forcarInforme);
  }

  // ─── INÍCIO ──────────────────────────────────────────────────────────────
  function obraTitulo(r) {
    var o = r.obra || {};
    var partes = [o.pep, o.nome_obra].filter(function (x) { return x && String(x).trim(); });
    return partes.length ? partes.join(', ') : 'Obra não informada';
  }
  function resumoRdo(r) {
    var h = r.hora_inicio ? r.hora_inicio + (r.hora_fim ? ' às ' + r.hora_fim : '') : 'sem horário';
    var n = (r.fotos || []).length;
    return h + ', ' + n + (n === 1 ? ' foto' : ' fotos');
  }
  function linhaRdo(r, comData) {
    var destino = r.status === 'rascunho' ? '#rdo/' + r.id : '#ver/' + r.id;
    return '<li><button type="button" class="linha" data-ir="' + destino + '">' +
      '<span class="linha-tx"><b>' + esc(obraTitulo(r)) + '</b><span>' +
      (comData ? esc(brCurto(r.data)) + ', ' : '') + esc(resumoRdo(r)) + '</span></span>' +
      '<span class="etq ' + r.status + '">' + esc(ROTULO_STATUS[r.status] || r.status) + '</span>' +
      SVG_SETA + '</button></li>';
  }

  async function abrirInicio() {
    var eq = S.equipe;
    mostrar('inicio', { titulo: eq.codigo, sub: primeiroNome(S.conta && S.conta.nome) ? 'Olá, ' + primeiroNome(S.conta.nome) : '', selo: true });
    var hoje = hojeISO();
    $('ini-dia').textContent = dataLonga(hoje);
    $('ini-eq').textContent = eq.codigo;
    $('ini-enc').textContent = eq.encarregado && norm(eq.encarregado) !== norm(eq.codigo) ? eq.encarregado : '';

    var rdos = (await DB.todos('rdos')).filter(function (r) { return r.equipe && norm(r.equipe.codigo) === norm(eq.codigo); });
    rdos.sort(function (a, b) { return (b.criadoEm || '').localeCompare(a.criadoEm || ''); });
    var deHoje = rdos.filter(function (r) { return r.data === hoje; });
    var antes = rdos.filter(function (r) { return r.data !== hoje; }).slice(0, 20);

    $('ini-hoje').innerHTML = deHoje.length ? deHoje.map(function (r) { return linhaRdo(r, false); }).join('')
      : '<li class="linha-vazia">Nenhum RDO hoje ainda. Toque em Novo RDO para começar.</li>';
    $('ini-ant-bloco').hidden = !antes.length;
    $('ini-ant').innerHTML = antes.map(function (r) { return linhaRdo(r, true); }).join('');

    renderAvisoInicio(rdos);
    renderRecado();
    renderInstalar();

    var desenharProg = function (ctx) {
      if (S.tela !== 'inicio') return;
      var usados = deHoje.map(function (r) { return r.obra && r.obra.prog_id; }).filter(Boolean);
      var livres = (ctx.programacao || []).filter(function (p) { return usados.indexOf(p.id) < 0; });
      $('ini-prog-bloco').hidden = !livres.length;
      $('ini-prog').innerHTML = livres.map(function (p) {
        var tit = [p.pep, p.nome_obra].filter(Boolean).join(', ') || 'Obra programada';
        var det = [p.atividade, p.municipio].filter(Boolean).join(', ');
        return '<li><button type="button" class="linha" data-prog="' + esc(p.id) + '">' +
          '<span class="linha-tx"><b>' + esc(tit) + '</b><span>' + esc(det) + '</span></span>' +
          '<span class="linha-acao">Começar RDO</span></button></li>';
      }).join('');
      S.ctxHoje = ctx;
    };
    desenharProg(await contexto(hoje, desenharProg));
  }

  function renderAvisoInicio(rdos) {
    var box = $('ini-aviso');
    var comErro = rdos.filter(function (r) { return r.status === 'erro'; });
    if (S.precisaLogin) {
      box.className = 'aviso';
      box.innerHTML = 'Seu acesso venceu. Entre de novo para enviar os RDOs da fila. ' +
        '<button type="button" class="bt-link" id="ini-reentrar">Entrar de novo</button>';
      box.hidden = false;
    } else if (comErro.length) {
      box.className = 'aviso erro';
      box.innerHTML = esc(comErro.length === 1 ? 'Um RDO não foi aceito pelo banco.' : comErro.length + ' RDOs não foram aceitos pelo banco.') +
        ' ' + esc(comErro[0].erro || '') + ' <button type="button" class="bt-link" id="ini-tentar">Tentar de novo</button>';
      box.hidden = false;
    } else {
      box.hidden = true; box.innerHTML = '';
    }
  }

  function ehIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function instalado() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  async function renderInstalar() {
    var box = $('ini-instalar');
    var recusou = await kvGet('instalar-nao');
    if (instalado() || (recusou && Date.now() - recusou < 7 * 864e5)) { box.hidden = true; return; }
    if (S.instalarEvt) {
      $('ini-instalar-tx').textContent = 'Instale o app para abrir direto da tela inicial, mesmo sem internet.';
      $('ini-instalar-bt').hidden = false; box.hidden = false;
    } else if (ehIOS()) {
      $('ini-instalar-tx').textContent = 'Para instalar no iPhone: toque em Compartilhar e depois em Adicionar à Tela de Início.';
      $('ini-instalar-bt').hidden = true; box.hidden = false;
    } else box.hidden = true;
  }

  // ─── NOVO RDO ────────────────────────────────────────────────────────────
  // A atividade da Programação usa outra lista (Fator K). Ela aparece como dica
  // nos serviços, e o encarregado aponta pela lista de serviços da precificação.
  function aplicarProg(rdo, p) {
    rdo.obra = { prog_id: p.id || '', pep: p.pep || '', nome_obra: p.nome_obra || '', municipio: p.municipio || '',
                 atividade: p.atividade || '', previsto: p.qtd_previsto != null ? p.qtd_previsto : null };
  }

  async function novoRdo(prog) {
    var agora = new Date().toISOString();
    var qtd = parseInt(S.equipe.qtd_colab, 10);
    var rdo = {
      id: uuid(), status: 'rascunho', criadoEm: agora, atualizadoEm: agora,
      data: hojeISO(),
      equipe: { codigo: S.equipe.codigo, encarregado: S.equipe.encarregado },
      autor: S.conta ? S.conta.email : '',
      obra: { prog_id: '', pep: '', nome_obra: '', municipio: '', atividade: '', previsto: null },
      hora_inicio: '', hora_fim: '',
      clima: { manha: '', tarde: '' },
      efetivo: isFinite(qtd) && qtd > 0 ? qtd : 0,
      nomes: null,
      servicos: [],
      parada: { houve: false, motivo: '', horas: 0, descricao: '' },
      observacoes: '',
      gps: null, fotos: [], etapa: 'antes', erro: ''
    };
    if (prog) aplicarProg(rdo, prog);
    await DB.put('rdos', rdo);
    ir('#rdo/' + rdo.id);
  }

  // ─── EDITOR ──────────────────────────────────────────────────────────────
  var salvar = debounce(async function () {
    var r = S.rdo; if (!r) return;
    r.atualizadoEm = new Date().toISOString();
    try {
      await DB.put('rdos', r);
      $('r-salvo').textContent = 'Salvo no celular às ' + horaAgora();
    } catch (e) {
      $('r-salvo').textContent = 'Não deu para salvar no celular. Libere espaço e tente de novo.';
    }
    atualizarTrilho();
  }, 350);
  function mudou() { $('r-salvo').textContent = 'Salvando…'; salvar(); atualizarTrilho(); }

  async function abrirEditor(id) {
    var r = await DB.get('rdos', id);
    if (!r) { aviso('Este RDO não está mais no celular.', 'erro'); trocar('#'); return; }
    if (r.status !== 'rascunho') { trocar('#ver/' + id); return; }
    S.rdo = r; S.tentouEnviar = false;
    S.fotos = ordenarFotos(await DB.porRdo(id), r.fotos);
    mostrar('rdo', { titulo: 'RDO de ' + brCurto(r.data), sub: r.equipe.codigo, voltar: true, selo: true });
    preencherEditor();
    $('r-salvo').textContent = 'Tudo fica salvo no celular enquanto você preenche.';
    gpsLigar();
    carregarCtxEditor();
  }

  function ordenarFotos(lista, ordem) {
    var mapa = {}; lista.forEach(function (f) { mapa[f.id] = f; });
    return (ordem || []).map(function (id) { return mapa[id]; }).filter(Boolean);
  }

  function sairDoEditor() {
    if (S.rdo) salvar.agora();
    gpsDesligar();
    S.rdo = null; S.fotos.forEach(function (f) { if (f._url) URL.revokeObjectURL(f._url); }); S.fotos = []; S.ctx = null;
  }

  function preencherEditor() {
    var r = S.rdo;
    $('r-data').value = r.data; $('r-data').max = hojeISO();
    $('r-pep').value = r.obra.pep || ''; $('r-mun').value = r.obra.municipio || '';
    $('r-nome').value = r.obra.nome_obra || ''; $('r-ativ').value = r.obra.atividade || '';
    $('r-ini').value = r.hora_inicio || ''; $('r-fim').value = r.hora_fim || '';
    document.querySelectorAll('#p-clima .seg').forEach(function (g) {
      var campo = g.dataset.campo; var atual = campo === 'clima_manha' ? r.clima.manha : r.clima.tarde;
      g.innerHTML = CLIMAS.map(function (c) {
        return '<button type="button" role="radio" aria-checked="' + (atual === c.v) + '" data-v="' + c.v + '">' + c.i + '<span>' + c.t + '</span></button>';
      }).join('');
    });
    $('r-parou').checked = !!r.parada.houve;
    $('r-parada-bloco').hidden = !r.parada.houve;
    var motivos = MOTIVOS.slice();
    if (r.parada.motivo && motivos.indexOf(r.parada.motivo) < 0) motivos.push(r.parada.motivo);
    $('r-motivos').innerHTML = motivos.map(function (m) {
      return '<button type="button" role="radio" aria-checked="' + (r.parada.motivo === m) + '" data-v="' + esc(m) + '">' + esc(m) + '</button>';
    }).join('');
    $('r-horas').textContent = fmtNum(r.parada.horas || 0) + ' h';
    $('r-parada-desc').value = r.parada.descricao || '';
    $('r-etapa').innerHTML = ETAPAS.map(function (e) {
      return '<button type="button" role="radio" aria-checked="' + (r.etapa === e.v) + '" data-v="' + e.v + '">' + e.t + '</button>';
    }).join('');
    $('r-obs').value = r.observacoes || '';
    $('r-foto-msg').textContent = '';
    renderProgEditor(); renderNomes(); renderServicos(); renderFotos(); gpsRender(); atualizarTrilho();
  }

  async function carregarCtxEditor() {
    var r = S.rdo; if (!r) return;
    var data = r.data;
    var aplicar = function (ctx) {
      if (!S.rdo || S.rdo.id !== r.id || S.rdo.data !== data) return;
      S.ctx = ctx;
      // efetivo: a lista de nomes entra uma vez; depois é o encarregado quem marca
      if (!r.nomes && ctx.efetivo && ctx.efetivo.length) {
        r.nomes = ctx.efetivo.map(function (p) { return { matricula: p.matricula, nome: p.nome, funcao: p.funcao, presente: true }; });
        r.efetivo = r.nomes.length;
        salvar();
      }
      renderProgEditor(); renderNomes(); renderServicos();
    };
    aplicar(await contexto(data, aplicar));
  }

  function renderProgEditor() {
    var r = S.rdo; var lista = (S.ctx && S.ctx.programacao) || [];
    $('r-prog-bloco').hidden = !lista.length;
    if (!lista.length) { $('r-prog').innerHTML = ''; return; }
    var algum = lista.some(function (p) { return p.id === r.obra.prog_id; });
    $('r-prog').innerHTML = lista.map(function (p) {
      var tit = [p.pep, p.nome_obra].filter(Boolean).join(', ') || 'Obra programada';
      var det = [p.atividade, p.municipio].filter(Boolean).join(', ');
      return '<button type="button" class="obra-op" role="radio" aria-checked="' + (p.id === r.obra.prog_id) + '" data-prog="' + esc(p.id) + '">' +
        '<span class="bola"></span><span><b>' + esc(tit) + '</b><span>' + esc(det) + '</span></span></button>';
    }).join('') +
      '<button type="button" class="obra-op" role="radio" aria-checked="' + (!algum && !!(r.obra.pep || r.obra.nome_obra)) + '" data-prog="">' +
      '<span class="bola"></span><span><b>Outra obra</b><span>Preencha os campos abaixo</span></span></button>';
  }

  function renderNomes() {
    var r = S.rdo; var tem = Array.isArray(r.nomes) && r.nomes.length;
    $('r-nomes-bloco').hidden = !tem;
    $('r-efetivo-bloco').hidden = !!tem;
    if (tem) {
      $('r-nomes').innerHTML = r.nomes.map(function (p, i) {
        return '<li><label><input type="checkbox" data-nome="' + i + '"' + (p.presente ? ' checked' : '') + '>' +
          '<span>' + esc(p.nome || 'Matrícula ' + p.matricula) + '<small>' + esc([p.funcao, p.matricula].filter(Boolean).join(', ')) + '</small></span></label></li>';
      }).join('');
    }
    $('r-efetivo').textContent = r.efetivo || 0;
  }

  function renderServicos() {
    var r = S.rdo;
    var dica = r.obra.atividade ? '<li class="serv-dica">Programado: ' + esc(r.obra.atividade) +
      (r.obra.previsto != null && r.obra.previsto !== '' ? ', previsto ' + esc(fmtNum(r.obra.previsto)) : '') +
      '. Aponte abaixo o que a equipe fez, pela lista de serviços.</li>' : '';
    if (!r.servicos.length) { $('r-servicos').innerHTML = dica + '<li class="serv-vazio">Nenhum serviço apontado ainda.</li>'; return; }
    $('r-servicos').innerHTML = dica + r.servicos.map(function (s, i) {
      var inteiro = !(+s.casas > 0), un = unidadeTx(s.unidade);
      var nome = (s.codigo ? s.codigo + ' ' : '') + s.descricao;
      var rotulo = 'Quantidade de ' + nome + ', em ' + un;
      var qtd = inteiro
        ? '<div class="passo passo-p">' +
            '<button type="button" class="passo-bt" data-sv-passo="' + i + '" data-d="-1" aria-label="Menos um">−</button>' +
            '<input id="sv-q-' + i + '" class="sv-qtd" type="text" inputmode="numeric" data-sv-qtd="' + i + '" value="' + esc(s.qtd) + '" placeholder="0" aria-label="' + esc(rotulo) + '">' +
            '<button type="button" class="passo-bt" data-sv-passo="' + i + '" data-d="1" aria-label="Mais um">+</button></div>'
        : '<input id="sv-q-' + i + '" class="sv-qtd sv-qtd-dec" type="text" inputmode="decimal" data-sv-qtd="' + i + '" value="' + esc(s.qtd) + '" placeholder="0,00" aria-label="' + esc(rotulo) + '">';
      return '<li class="sv">' +
        '<div class="sv-cab">' + (s.codigo ? '<span class="sv-cod">' + esc(s.codigo) + '</span>' : '<span class="sv-cod livre">Fora da lista</span>') +
          (s.grupo ? '<span class="sv-grupo">' + esc(nomeGrupo(s.grupo)) + '</span>' : '') +
          '<button type="button" class="serv-x" data-sv-x="' + i + '" aria-label="Tirar ' + esc(nome) + '">' + SVG_X + '</button></div>' +
        '<p class="sv-desc">' + esc(s.descricao) + '</p>' +
        '<div class="sv-linha"><span class="sv-rot">Quantidade feita</span>' + qtd + '<span class="sv-un">' + esc(un) + '</span></div>' +
        '</li>';
    }).join('');
  }

  function renderFotos() {
    var html = S.fotos.map(function (f, i) {
      var et = (ETAPAS.filter(function (e) { return e.v === f.etapa; })[0] || {}).t || '';
      return '<li><button type="button" data-foto="' + i + '" aria-label="Foto ' + (i + 1) + ', ' + esc(et) + (f.legenda ? ', ' + esc(f.legenda) : '') + '">' +
        '<img src="' + f.thumb + '" alt=""></button><span class="etq">' + esc(et) + '</span></li>';
    }).join('');
    for (var k = 0; k < S.processando; k++) html += '<li><div class="proc">Preparando…</div></li>';
    $('r-fotos').innerHTML = html;
  }

  function parteFeita(id, r) {
    switch (id) {
      case 'obra': return !!(String(r.obra.pep || '').trim() || String(r.obra.nome_obra || '').trim());
      case 'horario': return !!r.hora_inicio;
      case 'clima': return !!(r.clima.manha || r.clima.tarde);
      case 'equipe': return (r.efetivo || 0) > 0;
      case 'servicos': return r.servicos.length ? r.servicos.every(function (s) { return numero(s.qtd) > 0; }) : r.parada.houve;
      case 'fotos': return r.fotos.length > 0 && r.fotos.length >= fotosMinimas();
      case 'obs': return !!String(r.observacoes || '').trim();
    }
    return false;
  }

  function faltando(r) {
    var f = [];
    if (!parteFeita('obra', r)) f.push({ parte: 'obra', tx: 'Obra (PEP ou nome)' });
    if (!r.hora_inicio) f.push({ parte: 'horario', tx: 'Hora de início' });
    else if (r.hora_fim && r.hora_fim < r.hora_inicio) f.push({ parte: 'horario', tx: 'Término está antes do início' });
    if (!r.servicos.length && !r.parada.houve) f.push({ parte: 'servicos', tx: 'Um serviço feito, ou marque a paralisação' });
    var semQtd = r.servicos.filter(function (s) { return !(numero(s.qtd) > 0); });
    semQtd.slice(0, 3).forEach(function (s) { f.push({ parte: 'servicos', tx: 'Quantidade de ' + (s.codigo || s.descricao) }); });
    if (semQtd.length > 3) f.push({ parte: 'servicos', tx: 'Quantidade de mais ' + (semQtd.length - 3) + ' serviços' });
    if (r.parada.houve && !r.parada.motivo) f.push({ parte: 'parada', tx: 'Motivo da paralisação' });
    var minFotos = fotosMinimas();
    if (r.fotos.length < minFotos) f.push({ parte: 'fotos', tx: minFotos === 1 ? 'Pelo menos uma foto' : 'Pelo menos ' + minFotos + ' fotos (faltam ' + (minFotos - r.fotos.length) + ')' });
    if (CONF.dados.exigir_termino && !r.hora_fim) f.push({ parte: 'horario', tx: 'Hora de término' });
    return f;
  }

  function atualizarTrilho() {
    var r = S.rdo; if (!r) return;
    var obrig = S.tentouEnviar ? faltando(r).map(function (x) { return x.parte; }) : [];
    $('trilho').innerHTML = PARTES.map(function (p) {
      var feito = parteFeita(p.id, r);
      var rot = p.id === 'fotos' && r.fotos.length ? 'Fotos ' + r.fotos.length : p.t;
      var cls = feito && obrig.indexOf(p.id) < 0 ? 'feito' : (obrig.indexOf(p.id) >= 0 ? 'falta' : '');
      return '<button type="button" class="' + cls + '" data-parte="' + p.id + '">' + (cls === 'feito' ? SVG_CHECK : '') + esc(rot) + '</button>';
    }).join('');
    // .trilho usa botões: um link #p-obra mudaria o endereço da tela
  }

  function irParaParte(id) {
    var el = $('p-' + id); if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('realce'); void el.offsetWidth; el.classList.add('realce');
    var campo = el.querySelector('input:not([type=checkbox]):not([type=file]),textarea,button');
    if (campo && id !== 'fotos') setTimeout(function () { try { campo.focus({ preventScroll: true }); } catch (e) {} }, 400);
  }

  // ─── FOTOS ───────────────────────────────────────────────────────────────
  function abrirImagem(file) {
    var viaImg = function () {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file); var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); res(img); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('o celular não conseguiu abrir este arquivo')); };
        img.src = url;
      });
    };
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(viaImg);
    }
    return viaImg();
  }

  function paraBlob(cv, tipo, q) {
    return new Promise(function (res) {
      if (cv.toBlob) cv.toBlob(function (b) { res(b); }, tipo, q);
      else {
        var bin = atob(cv.toDataURL(tipo, q).split(',')[1]); var a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        res(new Blob([a], { type: tipo }));
      }
    });
  }

  function gpsFresco() { return S.gps && Date.now() - S.gps.em < 2 * 60 * 1000 ? S.gps : null; }

  // Carimbo na própria foto: data, hora, equipe, coordenadas e obra.
  function carimbar(cx, w, h, info) {
    var fs = Math.max(16, Math.round(Math.min(w, h) * 0.034));
    var d = info.quando;
    var linhas = [
      p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + '  ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '   ' + info.equipe,
      info.gps ? info.gps.lat.toFixed(6) + ', ' + info.gps.lng.toFixed(6) + '   ±' + Math.round(info.gps.precisao) + ' m'
               : (info.origem === 'galeria' ? 'Foto da galeria, sem localização' : 'Sem localização')
    ];
    if (info.obra) linhas.push('Obra ' + info.obra);
    var pad = Math.round(fs * 0.6), lh = Math.round(fs * 1.3);
    var alt = pad * 2 + lh * linhas.length;
    cx.fillStyle = 'rgba(0,0,0,0.58)'; cx.fillRect(0, h - alt, w, alt);
    cx.fillStyle = '#ff6b35'; cx.fillRect(0, h - alt, w, Math.max(3, Math.round(fs * 0.18)));
    cx.fillStyle = '#ffffff'; cx.textBaseline = 'top';
    cx.font = '600 ' + fs + 'px Barlow, "Segoe UI", Roboto, sans-serif';
    linhas.forEach(function (l, i) { cx.fillText(l, pad, h - alt + pad + i * lh + Math.round(fs * 0.12), w - pad * 2); });
  }

  async function processarFoto(file, origem, rdo) {
    var img = await abrirImagem(file);
    var w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    if (!w0 || !h0) throw new Error('imagem vazia');
    var k = Math.min(1, CFG.FOTO_LADO / Math.max(w0, h0));
    var w = Math.round(w0 * k), h = Math.round(h0 * k);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    var quando = origem === 'camera' ? new Date() : new Date(file.lastModified || Date.now());
    var gps = origem === 'camera' ? gpsFresco() : null;
    carimbar(cx, w, h, { quando: quando, gps: gps, origem: origem, equipe: rdo.equipe.codigo, obra: rdo.obra.pep || rdo.obra.nome_obra });
    var blob = await paraBlob(cv, 'image/jpeg', CFG.FOTO_QUALIDADE);
    if (!blob) throw new Error('falta memória para preparar a foto');
    var km = Math.min(1, CFG.MINI_LADO / Math.max(w, h));
    var mv = document.createElement('canvas'); mv.width = Math.round(w * km); mv.height = Math.round(h * km);
    mv.getContext('2d').drawImage(cv, 0, 0, mv.width, mv.height);
    var thumb = mv.toDataURL('image/jpeg', 0.7);
    cv.width = cv.height = 0; mv.width = mv.height = 0;   // devolve a memória no iPhone
    return {
      id: uuid(), rdoId: rdo.id, blob: blob, thumb: thumb,
      etapa: rdo.etapa || 'antes', legenda: '',
      lat: gps ? gps.lat : null, lng: gps ? gps.lng : null, precisao: gps ? Math.round(gps.precisao) : null,
      tiradaEm: quando.toISOString(), origem: origem, path: '', enviada: false, bytes: blob.size
    };
  }

  async function adicionarFotos(files, origem) {
    var rdo = S.rdo; if (!rdo) return;
    var lista = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type) || !f.type; });
    if (!lista.length) return;
    var vagas = CFG.MAX_FOTOS - rdo.fotos.length;
    if (vagas <= 0) { aviso('Este RDO já tem ' + CFG.MAX_FOTOS + ' fotos, o máximo.', 'erro'); return; }
    if (lista.length > vagas) aviso('Só cabem mais ' + vagas + ' fotos neste RDO.');
    lista = lista.slice(0, vagas);
    S.processando += lista.length; renderFotos();
    for (var i = 0; i < lista.length; i++) {
      try {
        var f = await processarFoto(lista[i], origem, rdo);
        await DB.put('fotos', f);
        rdo.fotos.push(f.id);
        await DB.put('rdos', rdo);
        if (S.rdo === rdo) S.fotos.push(f);
        $('r-foto-msg').textContent = '';
      } catch (e) {
        $('r-foto-msg').textContent = 'Não deu para usar uma foto: ' + (e.message || e) + '.';
      }
      S.processando--;
      if (S.rdo === rdo) { renderFotos(); atualizarTrilho(); }
    }
    if (S.rdo === rdo) $('r-salvo').textContent = 'Salvo no celular às ' + horaAgora();
    seguirAtualizacaoPedida();
  }

  var fotoAberta = null;
  async function abrirFoto(i) {
    var f = S.fotos[i]; if (!f) return;
    fotoAberta = f;
    if (f.blob && !f._url) f._url = URL.createObjectURL(f.blob);
    $('dlg-foto-img').src = f._url || f.thumb;
    $('dlg-foto-tit').textContent = 'Foto ' + (i + 1) + ' de ' + S.fotos.length;
    $('dlg-foto-etapa').innerHTML = ETAPAS.map(function (e) {
      return '<button type="button" role="radio" aria-checked="' + (f.etapa === e.v) + '" data-v="' + e.v + '">' + e.t + '</button>';
    }).join('');
    $('dlg-foto-leg').value = f.legenda || '';
    $('dlg-foto-apagar').hidden = false;
    var d = $('dlg-foto'); d.returnValue = '';
    d.onclose = async function () {
      var r = S.rdo; if (!r || !fotoAberta) return;
      var foto = fotoAberta; fotoAberta = null;
      if (d.returnValue === 'apagar') {
        var ok = await confirmar('Apagar esta foto?', 'Ela sai do RDO e do celular.', 'Apagar foto', true);
        if (!ok) return;
        r.fotos = r.fotos.filter(function (id) { return id !== foto.id; });
        S.fotos = S.fotos.filter(function (x) { return x.id !== foto.id; });
        if (foto._url) URL.revokeObjectURL(foto._url);
        await DB.del('fotos', foto.id); await DB.put('rdos', r);
        renderFotos(); atualizarTrilho();
        return;
      }
      foto.legenda = $('dlg-foto-leg').value.trim();
      var copia = Object.assign({}, foto); delete copia._url;
      await DB.put('fotos', copia);
      renderFotos();
    };
    d.showModal();
  }

  // ─── LOCALIZAÇÃO ─────────────────────────────────────────────────────────
  function gpsLigar() {
    if (!('geolocation' in navigator) || S.gpsWatch != null) { gpsRender(); return; }
    S.gpsErro = null;
    S.gpsWatch = navigator.geolocation.watchPosition(function (p) {
      S.gps = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy, em: Date.now() };
      S.gpsErro = null;
      var r = S.rdo;
      if (r && (!r.gps || S.gps.precisao < r.gps.precisao)) {
        r.gps = { lat: S.gps.lat, lng: S.gps.lng, precisao: Math.round(S.gps.precisao) };
        salvar();
      }
      gpsRender();
    }, function (err) { S.gpsErro = err.code; gpsRender(); },
    { enableHighAccuracy: true, maximumAge: 20000, timeout: 30000 });
  }
  function gpsDesligar() {
    if (S.gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.gpsWatch);
    S.gpsWatch = null;
  }
  function gpsRender() {
    var el = $('r-gps'), tx = $('r-gps-tx'); var g = gpsFresco();
    if (!('geolocation' in navigator)) { el.className = 'gps sem'; tx.textContent = 'Este celular não informa a localização.'; return; }
    if (S.gpsErro === 1) { el.className = 'gps sem'; tx.textContent = 'Localização bloqueada. Libere nos ajustes do celular para carimbar as fotos.'; return; }
    if (!g) { el.className = 'gps'; tx.textContent = S.gpsErro ? 'Sem sinal de GPS agora. As fotos saem sem coordenadas.' : 'Procurando localização…'; return; }
    var m = Math.round(g.precisao);
    if (m <= 30) { el.className = 'gps bom'; tx.textContent = 'Localização certa (±' + m + ' m)'; }
    else { el.className = 'gps fraco'; tx.textContent = 'Localização aproximada (±' + m + ' m). Fique em céu aberto.'; }
  }

  // ─── ENVIAR (entra na fila) ──────────────────────────────────────────────
  async function enviarRdo() {
    var r = S.rdo; if (!r) return;
    if (S.processando) { aviso('Espere as fotos terminarem de preparar.'); return; }
    await salvar.agora();
    var f = faltando(r);
    if (f.length) {
      S.tentouEnviar = true; atualizarTrilho();
      $('dlg-falta-lista').innerHTML = f.map(function (x) { return '<li><button type="submit" value="' + x.parte + '">' + esc(x.tx) + '</button></li>'; }).join('');
      var d = $('dlg-falta'); d.returnValue = '';
      d.onclose = function () { irParaParte(d.returnValue && d.returnValue !== 'ok' ? d.returnValue : f[0].parte); };
      d.showModal();
      return;
    }
    var nServ = r.servicos.filter(function (s) { return String(s.descricao || '').trim(); }).length;
    var resumo = r.fotos.length + (r.fotos.length === 1 ? ' foto' : ' fotos') + ', ' + nServ + (nServ === 1 ? ' serviço' : ' serviços') +
      (r.parada.houve ? ', com paralisação' : '') + '. Depois de enviado, o RDO não pode ser alterado.';
    var ok = await confirmar('Enviar o RDO de ' + br(r.data) + '?', resumo, 'Enviar RDO');
    if (!ok) return;
    r.status = 'pendente'; r.finalizadoEm = new Date().toISOString(); r.erro = '';
    registrarUso(r).catch(function () {});
    if (!r.gps && gpsFresco()) r.gps = { lat: S.gps.lat, lng: S.gps.lng, precisao: Math.round(S.gps.precisao) };
    await DB.put('rdos', r);
    S.rdo = null;          // não salvar de novo por cima como rascunho
    voltar();
    aviso(S.online ? 'RDO na fila. Enviando agora…' : 'Sem sinal agora. O RDO vai sozinho quando o celular pegar internet.', '', 5000);
    S.atrasoSync = 15000;
    sincronizar();
  }

  // ─── FILA DE ENVIO ───────────────────────────────────────────────────────
  function tipoErro(e) {
    var m = String((e && (e.message || e.error_description || e.error)) || e || '');
    var st = Number(e && (e.status || e.statusCode)) || 0;
    if (!navigator.onLine || (e && e.name === 'AuthRetryableFetchError') ||
        /failed to fetch|networkerror|network request failed|load failed|tempo esgotado|the internet connection/i.test(m)) return 'rede';
    if (st === 401 || /jwt|refresh token|not authenticated|invalid claim|session/i.test(m)) return 'login';
    return 'outro';
  }
  function mensagemErro(e, padrao) {
    var m = String((e && (e.message || e.error_description || e.error)) || e || '');
    if (/rdo_campo_(equipes|contexto)|could not find the function/i.test(m)) return 'O banco ainda não tem as funções do app (rode o rdo_campo.sql no Supabase).';
    if (/relation .*rdo_campo|could not find the table|schema cache/i.test(m)) return 'O banco ainda não tem a tabela do app (rode o rdo_campo.sql no Supabase).';
    if (/bucket not found/i.test(m)) return 'O banco ainda não tem o local das fotos (rode o rdo_campo.sql no Supabase).';
    if (/row-level security|permission denied/i.test(m)) return 'O banco recusou o envio por permissão. Avise o escritório.';
    if (/payload too large|exceeded the maximum/i.test(m)) return 'Uma foto ficou grande demais para o banco.';
    return (padrao ? padrao + ' ' : '') + (m ? '(' + m + ')' : '');
  }
  function jaExiste(e) {
    var m = String((e && (e.message || e.error)) || '');
    return String(e && (e.statusCode || e.status)) === '409' || /already exists|duplicate/i.test(m);
  }

  function linhaBanco(r, fotos, user) {
    var nomes = Array.isArray(r.nomes) ? r.nomes.filter(function (p) { return p.presente; })
      .map(function (p) { return { matricula: p.matricula || '', nome: p.nome || '', funcao: p.funcao || '' }; }) : [];
    return {
      id: r.id,
      data: r.data,
      equipe_codigo: r.equipe.codigo || r.equipe.encarregado || 'SEM EQUIPE',
      encarregado: r.equipe.encarregado || null,
      autor_id: user.id,
      autor_email: user.email || null,
      pep: r.obra.pep || null, nome_obra: r.obra.nome_obra || null,
      municipio: r.obra.municipio || null, atividade: r.obra.atividade || null,
      prog_id: r.obra.prog_id || null,
      hora_inicio: r.hora_inicio || null, hora_fim: r.hora_fim || null,
      clima_manha: r.clima.manha || null, clima_tarde: r.clima.tarde || null,
      efetivo: nomes.length || r.efetivo || 0,
      efetivo_nomes: nomes,
      servicos: r.servicos.filter(function (s) { return s.codigo || String(s.descricao || '').trim(); }).map(function (s) {
        return { codigo: s.codigo || null, descricao: String(s.descricao || '').trim(), qtd: numero(s.qtd), unidade: s.unidade || 'UN',
                 grupo: s.grupo || null, contrato: s.contrato || null, fora_da_lista: !s.codigo };
      }),
      paralisacao: r.parada.houve ? { motivo: r.parada.motivo, horas: r.parada.horas || 0, descricao: r.parada.descricao || '' } : null,
      observacoes: r.observacoes || null,
      fotos: fotos.map(function (f) {
        return { path: f.path, etapa: f.etapa, legenda: f.legenda || '', lat: f.lat, lng: f.lng, precisao: f.precisao, tirada_em: f.tiradaEm, origem: f.origem };
      }),
      lat: r.gps ? r.gps.lat : null, lng: r.gps ? r.gps.lng : null, precisao_m: r.gps ? r.gps.precisao : null,
      finalizado_em: r.finalizadoEm || null,
      versao_app: versaoAtual()
    };
  }

  async function enviarUm(r, user) {
    r.status = 'enviando'; await DB.put('rdos', r); atualizarSelo();
    var fotos = ordenarFotos(await DB.porRdo(r.id), r.fotos);
    for (var i = 0; i < fotos.length; i++) {
      var f = fotos[i];
      if (f.enviada && f.path) continue;
      if (!f.blob) throw new Error('A foto ' + (i + 1) + ' sumiu do celular.');
      var path = r.data + '/' + slug(r.equipe.codigo) + '/' + r.id + '/' + f.id + '.jpg';
      var up = await comPrazo(S.sb.storage.from(CFG.BUCKET).upload(path, f.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }), 120000);
      if (up.error && !jaExiste(up.error)) throw up.error;
      f.path = path; f.enviada = true;
      await DB.put('fotos', f);
    }
    var res = await comPrazo(S.sb.from(CFG.TABELA).upsert(linhaBanco(r, fotos, user), { onConflict: 'id' }), 30000);
    if (res.error) throw res.error;
    r.status = 'enviado'; r.enviadoEm = new Date().toISOString(); r.erro = '';
    await DB.put('rdos', r);
    // a foto já está no banco: no celular fica só a miniatura
    for (var j = 0; j < fotos.length; j++) { fotos[j].blob = null; await DB.put('fotos', fotos[j]); }
  }

  async function sincronizar() {
    clearTimeout(S.esperaSync);
    if (S.sincronizando || !S.sb) return;
    var fila = (await DB.todos('rdos')).filter(function (r) { return r.status === 'pendente' || r.status === 'erro' || r.status === 'enviando'; });
    fila.sort(function (a, b) { return (a.finalizadoEm || '').localeCompare(b.finalizadoEm || ''); });
    if (!fila.length) { atualizarSelo(); return; }
    if (!navigator.onLine) { atualizarSelo(); return; }
    S.sincronizando = true; atualizarSelo();
    var enviados = 0, parar = false;
    try {
      var sess = await comPrazo(S.sb.auth.getSession(), 15000);
      if (sess.error) throw sess.error;
      var user = sess.data && sess.data.session && sess.data.session.user;
      if (!user) { S.precisaLogin = true; parar = true; }
      for (var i = 0; !parar && i < fila.length; i++) {
        var r = fila[i];
        try {
          await enviarUm(r, user);
          enviados++;
        } catch (e) {
          var t = tipoErro(e);
          if (t === 'rede') { r.status = 'pendente'; await DB.put('rdos', r); parar = true; break; }
          if (t === 'login') { r.status = 'pendente'; await DB.put('rdos', r); S.precisaLogin = true; parar = true; break; }
          r.status = 'erro'; r.erro = mensagemErro(e, 'Erro do banco.'); await DB.put('rdos', r);
          S.ultimoErro = r.erro;
        }
      }
      if (enviados) {
        S.atrasoSync = 15000;
        aviso(enviados === 1 ? 'RDO enviado ao escritório.' : enviados + ' RDOs enviados ao escritório.', 'ok');
      }
    } catch (e) {
      if (tipoErro(e) === 'login') S.precisaLogin = true;
      fila.forEach(function (r) { if (r.status === 'enviando') { r.status = 'pendente'; DB.put('rdos', r); } });
    } finally {
      S.sincronizando = false;
    }
    var resta = (await DB.todos('rdos')).filter(function (r) { return r.status === 'pendente'; }).length;
    if (resta && !S.precisaLogin) {
      S.esperaSync = setTimeout(sincronizar, S.atrasoSync);
      S.atrasoSync = Math.min(S.atrasoSync * 2, 5 * 60 * 1000);
    }
    atualizarSelo();
    informarAparelho(true);
    seguirAtualizacaoPedida();
    if (S.tela === 'inicio') abrirInicioSuave();
    if (S.tela === 'ver' && S.verId) abrirVer(S.verId, true);
  }

  var abrirInicioSuave = debounce(function () { if (S.tela === 'inicio') { var y = window.scrollY; abrirInicio().then(function () { window.scrollTo(0, y); }); } }, 200);

  async function atualizarSelo() {
    var el = $('selo'); if (!el) return;
    var todos = await DB.todos('rdos').catch(function () { return []; });
    var fila = todos.filter(function (r) { return r.status === 'pendente' || r.status === 'enviando'; }).length;
    var erros = todos.filter(function (r) { return r.status === 'erro'; }).length;
    var cls = '', tx = 'Tudo enviado';
    if (S.sincronizando) { cls = 'fila enviando'; tx = 'Enviando…'; }
    else if (erros) { cls = 'erro'; tx = erros === 1 ? '1 com erro' : erros + ' com erro'; }
    else if (fila) { cls = 'fila'; tx = fila + ' na fila'; }
    else if (!S.online) { cls = 'semsinal'; tx = 'Sem sinal'; }
    el.className = 'selo ' + cls; $('selo-tx').textContent = tx;
  }

  async function toqueSelo() {
    var todos = await DB.todos('rdos');
    var fila = todos.filter(function (r) { return r.status === 'pendente' || r.status === 'erro'; }).length;
    if (S.precisaLogin) { abrirLogin('Entre de novo para enviar os RDOs da fila.'); return; }
    if (!fila) { aviso(S.online ? 'Nada esperando envio.' : 'Sem sinal, mas não há nada esperando envio.'); return; }
    if (!navigator.onLine) { aviso('Sem sinal. Os RDOs vão sozinhos quando o celular pegar internet.'); return; }
    S.atrasoSync = 15000;
    todos.forEach(function (r) { if (r.status === 'erro') { r.status = 'pendente'; DB.put('rdos', r); } });
    aviso('Tentando enviar agora…');
    setTimeout(sincronizar, 50);
  }

  // ─── VER RDO (na fila ou enviado) ────────────────────────────────────────
  async function abrirVer(id, suave) {
    var r = await DB.get('rdos', id);
    if (!r) { aviso('Este RDO não está mais no celular.', 'erro'); trocar('#'); return; }
    if (r.status === 'rascunho') { trocar('#rdo/' + id); return; }
    S.verId = id;
    var y = window.scrollY;
    if (!suave || S.tela !== 'ver') mostrar('ver', { titulo: 'RDO de ' + brCurto(r.data), sub: r.equipe.codigo, voltar: true, selo: true });
    var fotos = ordenarFotos(await DB.porRdo(id), r.fotos);
    var climaTx = function (v) { var c = CLIMAS.filter(function (x) { return x.v === v; })[0]; return c ? c.t : 'não informado'; };
    var estado = {
      enviado: 'Enviado ao escritório em ' + quandoBR(r.enviadoEm) + '.',
      pendente: 'Na fila. Vai sozinho quando o celular tiver internet.',
      enviando: 'Enviando agora…',
      erro: 'Não foi aceito: ' + (r.erro || 'erro desconhecido')
    }[r.status] || '';
    var nomes = Array.isArray(r.nomes) ? r.nomes.filter(function (p) { return p.presente; }) : [];
    var serv = r.servicos.filter(function (s) { return s.codigo || String(s.descricao || '').trim(); });
    var h = '<div class="ver-cab"><span class="etq ' + r.status + '">' + esc(ROTULO_STATUS[r.status]) + '</span>' +
      '<h1>' + esc(obraTitulo(r)) + '</h1><p>' + esc(dataLonga(r.data)) + '</p><p>' + esc(estado) + '</p></div>' +
      '<dl class="ficha">' +
      '<dt>Equipe</dt><dd>' + esc(r.equipe.codigo) + '</dd>' +
      (r.obra.municipio ? '<dt>Município</dt><dd>' + esc(r.obra.municipio) + '</dd>' : '') +
      (r.obra.atividade ? '<dt>Atividade</dt><dd>' + esc(r.obra.atividade) + '</dd>' : '') +
      '<dt>Horário</dt><dd>' + esc(r.hora_inicio || '') + (r.hora_fim ? ' às ' + esc(r.hora_fim) : '') + '</dd>' +
      '<dt>Clima</dt><dd>Manhã ' + esc(climaTx(r.clima.manha).toLowerCase()) + ', tarde ' + esc(climaTx(r.clima.tarde).toLowerCase()) + '</dd>' +
      '<dt>Pessoas</dt><dd>' + esc(nomes.length || r.efetivo || 0) + '</dd>' +
      '</dl>';
    if (serv.length) h += '<h2 class="ver-sec">Serviços executados</h2><ul class="ver-lista">' + serv.map(function (s) {
      return '<li>' + (s.codigo ? '<span class="sv-cod">' + esc(s.codigo) + '</span> ' : '') + esc(s.descricao) +
        '<small>' + (numero(s.qtd) != null ? esc(fmtNum(s.qtd)) + ' ' + esc(unidadeTx(s.unidade)) : 'sem quantidade') +
        (s.codigo ? '' : ', fora da lista') + '</small></li>';
    }).join('') + '</ul>';
    if (r.parada.houve) h += '<h2 class="ver-sec">Paralisação</h2><ul class="ver-lista"><li>' + esc(r.parada.motivo) +
      '<small>' + esc(fmtNum(r.parada.horas || 0)) + ' h parado' + (r.parada.descricao ? '. ' + esc(r.parada.descricao) : '') + '</small></li></ul>';
    if (nomes.length) h += '<h2 class="ver-sec">Quem trabalhou</h2><ul class="ver-lista">' + nomes.map(function (p) {
      return '<li>' + esc(p.nome || p.matricula) + '<small>' + esc([p.funcao, p.matricula].filter(Boolean).join(', ')) + '</small></li>';
    }).join('') + '</ul>';
    h += '<h2 class="ver-sec">Fotos</h2><ul class="fotos">' + fotos.map(function (f) {
      var et = (ETAPAS.filter(function (e) { return e.v === f.etapa; })[0] || {}).t || '';
      return '<li><img src="' + f.thumb + '" alt="Foto ' + esc(et) + (f.legenda ? ', ' + esc(f.legenda) : '') + '" style="aspect-ratio:1;object-fit:cover;width:100%;border-radius:8px"><span class="etq">' + esc(et) + '</span></li>';
    }).join('') + '</ul>';
    if (r.observacoes) h += '<h2 class="ver-sec">Observações</h2><p class="ver-tx">' + esc(r.observacoes) + '</p>';
    $('ver-corpo').innerHTML = h;

    var rod = $('ver-rodape');
    if (r.status === 'pendente' || r.status === 'erro') {
      rod.innerHTML = '<button class="bt bt-sinal" type="button" id="ver-tentar">Tentar enviar agora</button>' +
        '<button class="bt bt-linha" type="button" id="ver-editar">Corrigir antes de enviar</button>';
      rod.hidden = false;
    } else { rod.innerHTML = ''; rod.hidden = true; }
    if (suave) window.scrollTo(0, y);
  }

  async function editarDaFila(id) {
    var r = await DB.get('rdos', id);
    if (!r || r.status === 'enviando' || r.status === 'enviado') { aviso('Este RDO já está sendo enviado.'); return; }
    r.status = 'rascunho'; r.erro = ''; await DB.put('rdos', r);
    trocar('#rdo/' + id);
  }

  // ─── AJUSTES ─────────────────────────────────────────────────────────────
  async function abrirAjustes() {
    var todos = await DB.todos('rdos');
    var fila = todos.filter(function (r) { return r.status !== 'rascunho' && r.status !== 'enviado'; }).length;
    $('dlg-aj-ficha').innerHTML =
      '<dt>Usuário</dt><dd>' + esc(usuarioDaConta(S.conta)) + '</dd>' +
      '<dt>Equipe</dt><dd>' + esc(S.equipe ? S.equipe.codigo : '') + '</dd>' +
      '<dt>Na fila</dt><dd>' + fila + '</dd>' +
      '<dt>Serviços</dt><dd>' + (CAT.itens.length ? CAT.itens.length + (CAT.em ? ' (lista de ' + quandoBR(CAT.em) + ')' : '') : 'lista não baixada') + '</dd>' +
      '<dt>Versão</dt><dd>' + esc(versaoAtual()) + (ATU.nova ? ' <span class="etq pendente">nova ' + esc((ATU.info && ATU.info.versao) || '') + ' pronta</span>' : '') + '</dd>';
    var d = $('dlg-ajustes'); d.returnValue = '';
    d.onclose = async function () {
      var v = d.returnValue;
      if (v === 'equipe') ir('#equipe');
      else if (v === 'atualizar') {
        if (!S.online) { aviso('Sem internet agora.'); return; }
        try {
          await baixarEquipes();
          await contexto(hojeISO(), null, true);
          await carregarCatalogo(true);
          aviso('Equipes, programação e lista de serviços atualizadas.', 'ok');
          if (S.tela === 'inicio') abrirInicio();
        } catch (e) { aviso(mensagemErro(e, 'Não deu para atualizar.'), 'erro', 6000); }
      } else if (v === 'versao') procurarAtualizacaoManual();
      else if (v === 'sair') sair(fila);
    };
    d.showModal();
  }

  async function sair(fila) {
    var tx = fila ? 'Há ' + fila + (fila === 1 ? ' RDO que ainda não foi enviado. Ele' : ' RDOs que ainda não foram enviados. Eles') +
      ' continua' + (fila === 1 ? '' : 'm') + ' guardado' + (fila === 1 ? '' : 's') + ' neste celular e sobe' + (fila === 1 ? '' : 'm') + ' quando alguém entrar de novo.'
      : 'Os rascunhos continuam neste celular.';
    if (!(await confirmar('Sair da conta?', tx, 'Sair', true))) return;
    try { await S.sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    await kvDel('conta');
    S.conta = null; S.precisaLogin = false;
    trocar('#');
  }

  // ─── LIMPEZA ─────────────────────────────────────────────────────────────
  async function limparAntigos() {
    var limite = Date.now() - CFG.DIAS_GUARDAR * 864e5;
    var rdos = await DB.todos('rdos');
    for (var i = 0; i < rdos.length; i++) {
      var r = rdos[i];
      if (r.status === 'enviado' && new Date(r.enviadoEm || r.criadoEm).getTime() < limite) {
        var fotos = await DB.porRdo(r.id);
        for (var j = 0; j < fotos.length; j++) await DB.del('fotos', fotos[j].id);
        await DB.del('rdos', r.id);
      }
    }
  }

  // ─── EVENTOS ─────────────────────────────────────────────────────────────
  function ligarEventos() {
    $('form-login').addEventListener('submit', entrar);
    $('lg-esqueci').addEventListener('click', esqueciSenha);
    $('lg-ver').addEventListener('click', function () {
      var i = $('lg-senha'); var ver = i.type === 'password';
      i.type = ver ? 'text' : 'password'; this.setAttribute('aria-pressed', String(ver));
      this.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
    });
    $('topo-voltar').addEventListener('click', voltar);
    $('selo').addEventListener('click', toqueSelo);

    // equipe
    $('eq-busca').addEventListener('input', renderEquipes);
    $('eq-lista').addEventListener('click', function (e) {
      var b = e.target.closest('[data-eq]'); if (b) escolherEquipe(S.equipes[+b.dataset.eq]);
    });
    $('eq-m-ok').addEventListener('click', function () {
      var cod = $('eq-m-cod').value.trim().toUpperCase(), enc = $('eq-m-enc').value.trim();
      if (!cod && !enc) { $('eq-msg').textContent = 'Escreva pelo menos o código ou o nome do encarregado.'; return; }
      escolherEquipe({ codigo: cod, encarregado: enc });
    });

    // início
    $('ini-novo').addEventListener('click', function () { novoRdo(null); });
    $('ini-ajustes').addEventListener('click', abrirAjustes);
    $('tela-inicio').addEventListener('click', function (e) {
      var a = e.target.closest('[data-ir]'); if (a) { ir(a.dataset.ir); return; }
      var p = e.target.closest('[data-prog]');
      if (p) {
        var prog = ((S.ctxHoje && S.ctxHoje.programacao) || []).filter(function (x) { return x.id === p.dataset.prog; })[0];
        if (prog) novoRdo(prog);
        return;
      }
      if (e.target.closest('[data-acao="atualizar"]')) { aplicarAtualizacao(); return; }
      if (e.target.id === 'ini-reentrar') abrirLogin('Entre de novo para enviar os RDOs da fila.');
      if (e.target.id === 'ini-tentar') toqueSelo();
    });
    $('ini-instalar-bt').addEventListener('click', async function () {
      if (!S.instalarEvt) return;
      S.instalarEvt.prompt();
      try { await S.instalarEvt.userChoice; } catch (e) {}
      S.instalarEvt = null; renderInstalar();
    });
    $('ini-instalar-nao').addEventListener('click', function () { kvSet('instalar-nao', Date.now()); $('ini-instalar').hidden = true; });

    // editor: campos de texto simples
    var form = $('form-rdo');
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', function (e) {
      var r = S.rdo; if (!r) return; var t = e.target;
      switch (t.id) {
        case 'r-pep': r.obra.pep = t.value; break;
        case 'r-nome': r.obra.nome_obra = t.value; break;
        case 'r-mun': r.obra.municipio = t.value; break;
        case 'r-ativ': r.obra.atividade = t.value; break;
        case 'r-ini': r.hora_inicio = t.value; break;
        case 'r-fim': r.hora_fim = t.value; break;
        case 'r-parada-desc': r.parada.descricao = t.value; break;
        case 'r-obs': r.observacoes = t.value; break;
        default:
          if (t.dataset.svQtd != null) {
            var sv = r.servicos[+t.dataset.svQtd]; if (!sv) return;
            var limpo = limparQtd(t.value, +sv.casas);
            if (!(+sv.casas > 0) && /[.,]/.test(t.value)) aviso('Este serviço é contado em número inteiro.');
            if (limpo !== t.value) t.value = limpo;
            sv.qtd = limpo;
          } else return;
      }
      if (t.id === 'r-pep' || t.id === 'r-nome') {
        var pr = ((S.ctx && S.ctx.programacao) || []).filter(function (p) { return p.id === r.obra.prog_id; })[0];
        if (pr && (norm(pr.pep) !== norm(r.obra.pep) || norm(pr.nome_obra) !== norm(r.obra.nome_obra))) { r.obra.prog_id = ''; renderProgEditor(); }
      }
      mudou();
    });
    form.addEventListener('change', function (e) {
      var r = S.rdo; if (!r) return; var t = e.target;
      if (t.id === 'r-data') {
        if (!t.value) { t.value = r.data; return; }
        r.data = t.value; $('topo-titulo').textContent = 'RDO de ' + brCurto(r.data);
        if (r.obra.prog_id) r.obra.prog_id = '';
        S.ctx = null; renderProgEditor(); mudou(); carregarCtxEditor();
      } else if (t.dataset.nome != null) {
        var p = r.nomes[+t.dataset.nome]; if (p) p.presente = t.checked;
        r.efetivo = r.nomes.filter(function (x) { return x.presente; }).length; mudou();
      } else if (t.id === 'r-parou') {
        r.parada.houve = t.checked; $('r-parada-bloco').hidden = !t.checked; mudou();
      } else if (t.id === 'r-cam' || t.id === 'r-gal') {
        var arquivos = Array.prototype.slice.call(t.files || []); t.value = '';
        adicionarFotos(arquivos, t.id === 'r-cam' ? 'camera' : 'galeria');
      }
    });
    form.addEventListener('click', function (e) {
      var r = S.rdo; if (!r) return; var t = e.target;
      var agora = t.closest('[data-agora]');
      if (agora) { var alvo = $(agora.dataset.agora); alvo.value = horaAgora(); alvo.dispatchEvent(new Event('input', { bubbles: true })); return; }
      var radio = t.closest('[role=radio]');
      if (radio) {
        var grupo = radio.parentElement;
        if (grupo.id === 'r-prog') {
          var id = radio.dataset.prog;
          if (id) { var p = ((S.ctx && S.ctx.programacao) || []).filter(function (x) { return x.id === id; })[0]; if (p) aplicarProg(r, p); }
          else { r.obra = { prog_id: '', pep: '', nome_obra: '', municipio: '', atividade: '', previsto: null }; }
          $('r-pep').value = r.obra.pep; $('r-nome').value = r.obra.nome_obra; $('r-mun').value = r.obra.municipio; $('r-ativ').value = r.obra.atividade;
          renderProgEditor(); renderServicos(); mudou();
          if (!id) $('r-pep').focus();
          return;
        }
        var v = radio.dataset.v;
        if (grupo.dataset.campo === 'clima_manha') r.clima.manha = r.clima.manha === v ? '' : v;
        else if (grupo.dataset.campo === 'clima_tarde') r.clima.tarde = r.clima.tarde === v ? '' : v;
        else if (grupo.id === 'r-motivos') r.parada.motivo = v;
        else if (grupo.id === 'r-etapa') r.etapa = v;
        else return;
        var atual = grupo.dataset.campo === 'clima_manha' ? r.clima.manha : grupo.dataset.campo === 'clima_tarde' ? r.clima.tarde
          : grupo.id === 'r-motivos' ? r.parada.motivo : r.etapa;
        grupo.querySelectorAll('[role=radio]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === atual)); });
        mudou(); return;
      }
      var passo = t.closest('[data-passo]');
      if (passo) { r.efetivo = Math.max(0, Math.min(99, (r.efetivo || 0) + (+passo.dataset.passo))); $('r-efetivo').textContent = r.efetivo; mudou(); return; }
      var horas = t.closest('[data-horas]');
      if (horas) { r.parada.horas = Math.max(0, Math.min(24, (r.parada.horas || 0) + (+horas.dataset.horas))); $('r-horas').textContent = fmtNum(r.parada.horas) + ' h'; mudou(); return; }
      var x = t.closest('[data-sv-x]');
      if (x) { r.servicos.splice(+x.dataset.svX, 1); renderServicos(); mudou(); return; }
      var sp = t.closest('[data-sv-passo]');
      if (sp) {
        var item = r.servicos[+sp.dataset.svPasso]; if (!item) return;
        item.qtd = String(Math.max(0, Math.min(9999, (parseInt(item.qtd, 10) || 0) + (+sp.dataset.d))));
        var campoQ = $('sv-q-' + sp.dataset.svPasso); if (campoQ) campoQ.value = item.qtd;
        mudou(); return;
      }
      var foto = t.closest('[data-foto]');
      if (foto) { abrirFoto(+foto.dataset.foto); return; }
      if (t.closest('#r-add-serv')) { abrirSeletorServico(); return; }
      if (t.closest('#r-descartar')) descartar();
    });
    $('atu-agora').addEventListener('click', aplicarAtualizacao);
    $('atu-depois').addEventListener('click', function () {
      ATU.adiada = true; esconderAtualizacao();
      aviso('Tudo bem. A atualização fica na tela inicial e volta quando abrir o app de novo.');
      if (S.tela === 'inicio') renderRecado();
    });
    $('trilho').addEventListener('click', function (e) { var b = e.target.closest('[data-parte]'); if (b) irParaParte(b.dataset.parte); });
    var buscaServ = debounce(function () { renderListaServico(); $('dlg-serv-lista').scrollTop = 0; }, 120);
    $('dlg-serv-busca').addEventListener('input', buscaServ);
    $('dlg-serv-busca').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } });
    $('dlg-serv-grupos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return;
      PICK.grupo = b.dataset.g;
      this.querySelectorAll('[data-g]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      renderListaServico(); $('dlg-serv-lista').scrollTop = 0;
    });
    $('dlg-serv-lista').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cod]'); if (b) adicionarServicoDoCatalogo(b.dataset.cod, b.dataset.ct);
    });
    $('dlg-serv-fechar').addEventListener('click', function () { $('dlg-serv').close(); });
    $('dlg-serv-livre-ok').addEventListener('click', adicionarServicoLivre);
    $('r-enviar').addEventListener('click', enviarRdo);
    $('dlg-foto-etapa').addEventListener('click', function (e) {
      var b = e.target.closest('[role=radio]'); if (!b || !fotoAberta) return;
      fotoAberta.etapa = b.dataset.v;
      this.querySelectorAll('[role=radio]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
    });

    // ver
    $('ver-rodape').addEventListener('click', function (e) {
      if (e.target.id === 'ver-tentar') toqueSelo();
      if (e.target.id === 'ver-editar') editarDaFila(S.verId);
    });

    // rede, foco e navegação
    window.addEventListener('popstate', rota);
    window.addEventListener('online', function () { S.online = true; S.atrasoSync = 15000; atualizarSelo(); sincronizar(); atualizarDoEscritorio(true); buscarAtualizacao(false); });
    window.addEventListener('offline', function () { S.online = false; atualizarSelo(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        sincronizar();
        atualizarDoEscritorio(false);
        buscarAtualizacao(false);
        if (S.tela === 'inicio') abrirInicioSuave();
      } else if (S.rdo) salvar.agora();
    });
    window.addEventListener('pagehide', function () { if (S.rdo) salvar.agora(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalarEvt = e; if (S.tela === 'inicio') renderInstalar(); });
  }

  async function descartar() {
    var r = S.rdo; if (!r) return;
    if (!(await confirmar('Descartar este rascunho?', 'O RDO e as fotos dele saem do celular. Não dá para desfazer.', 'Descartar', true))) return;
    var fotos = await DB.porRdo(r.id);
    for (var i = 0; i < fotos.length; i++) await DB.del('fotos', fotos[i].id);
    await DB.del('rdos', r.id);
    S.rdo = null;
    aviso('Rascunho descartado.');
    voltar();
  }

  // ─── ATUALIZAÇÃO DO APP (service worker) ─────────────────────────────────
  // A versão nova baixa sozinha em segundo plano. Quando fica pronta, o app
  // mostra "Nova versão do app" com Atualizar agora e Depois. Atualizar guarda
  // o rascunho, espera um envio em andamento terminar e recarrega na mesma tela.
  var ATU = { reg: null, nova: null, info: null, adiada: false, pedida: false, aplicando: false, ultimaBusca: 0 };

  function versaoAtual() { return S.versao || CFG.VERSAO; }

  function perguntarAoSW(sw, msg) {
    return new Promise(function (res) {
      try {
        var canal = new MessageChannel();
        var t = setTimeout(function () { res(null); }, 3000);
        canal.port1.onmessage = function (e) { clearTimeout(t); res(e.data || null); };
        sw.postMessage(msg, [canal.port2]);
      } catch (e) { res(null); }
    });
  }

  async function novaVersaoPronta(sw) {
    if (ATU.nova === sw) return;
    ATU.nova = sw;
    ATU.info = (await perguntarAoSW(sw, { tipo: 'info' })) || {};
    if (ATU.info.versao && ATU.info.versao === versaoAtual()) { ATU.nova = null; return; }
    mostrarAtualizacao();
  }

  function atualizacaoObrigatoria() {
    return !!(CONF.dados.versao_minima && cmpVersao(versaoAtual(), CONF.dados.versao_minima) < 0);
  }

  function mostrarAtualizacao() {
    if (!ATU.nova) return;
    var obrigatoria = atualizacaoObrigatoria();
    if (S.tela === 'inicio') renderRecado();
    if (ATU.adiada && !obrigatoria) return;
    $('atu-tit').textContent = 'Nova versão do app' + (ATU.info && ATU.info.versao ? ' (' + ATU.info.versao + ')' : '');
    $('atu-tx').textContent = (obrigatoria ? 'O escritório pediu para atualizar. ' : '') + 'Leva poucos segundos, e o que você preencheu fica salvo.';
    var notas = (ATU.info && Array.isArray(ATU.info.novidades) ? ATU.info.novidades : []).slice(0, 3);
    $('atu-notas').innerHTML = notas.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    $('atu-notas').hidden = !notas.length;
    $('atu-depois').hidden = obrigatoria;
    $('atu-agora').disabled = false;
    $('atu-agora').textContent = 'Atualizar agora';
    $('atualizacao').hidden = false;
    document.body.classList.add('com-atualizacao');
  }

  function esconderAtualizacao() {
    $('atualizacao').hidden = true;
    document.body.classList.remove('com-atualizacao');
  }

  async function aplicarAtualizacao() {
    if (!ATU.nova) { procurarAtualizacaoManual(); return; }
    if (S.sincronizando || S.processando) {
      ATU.pedida = true;
      $('atu-agora').disabled = true;
      $('atu-agora').textContent = S.processando ? 'Atualiza depois de preparar as fotos…' : 'Atualiza assim que terminar o envio…';
      $('atualizacao').hidden = false;
      return;
    }
    ATU.pedida = false;
    if (S.rdo) await salvar.agora();
    ATU.aplicando = true;
    $('atu-agora').disabled = true; $('atu-agora').textContent = 'Atualizando…';
    await kvSet('atualizou-de', versaoAtual());
    ATU.nova.postMessage({ tipo: 'ativar' });
    setTimeout(function () { location.reload(); }, 5000);      // se o celular não trocar sozinho
  }
  function seguirAtualizacaoPedida() { if (ATU.pedida && !S.sincronizando && !S.processando) aplicarAtualizacao(); }

  function buscarAtualizacao(manual) {
    if (!ATU.reg || !navigator.onLine) return Promise.resolve(false);
    if (!manual && Date.now() - ATU.ultimaBusca < 2 * 60 * 1000) return Promise.resolve(false);
    ATU.ultimaBusca = Date.now();
    return ATU.reg.update().then(function () { return !!(ATU.reg.installing || ATU.reg.waiting); }, function () { return false; });
  }

  async function procurarAtualizacaoManual() {
    if (ATU.nova) { ATU.adiada = false; mostrarAtualizacao(); return; }
    if (!('serviceWorker' in navigator) || !ATU.reg) { aviso('Este celular não atualiza o app sozinho. Feche e abra o app com internet.'); return; }
    if (!navigator.onLine) { aviso('Sem internet agora. Tente de novo quando tiver sinal.'); return; }
    aviso('Procurando atualização…');
    var achou = await buscarAtualizacao(true);
    if (!achou) aviso('Você já está na versão mais nova (' + versaoAtual() + ').', 'ok');
    else if (ATU.reg.installing) aviso('Baixando a versão nova. O aviso aparece quando terminar.');
  }

  async function avisarSeAtualizou() {
    var de = await kvGet('atualizou-de');
    if (de && de !== versaoAtual()) aviso('App atualizado para a versão ' + versaoAtual() + '.', 'ok', 5000);
    if (de) kvDel('atualizou-de');
  }

  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    var perguntarVersao = function () {
      var c = navigator.serviceWorker.controller;
      if (c) perguntarAoSW(c, { tipo: 'info' }).then(function (i) {
        if (i && i.versao) { S.versao = i.versao; avisarSeAtualizou(); if (S.tela === 'inicio') renderRecado(); }
      });
    };
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      ATU.reg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) novaVersaoPronta(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) novaVersaoPronta(nw);
        });
      });
      perguntarVersao();
      buscarAtualizacao(false);
      setInterval(function () { if (document.visibilityState === 'visible') buscarAtualizacao(false); }, 15 * 60 * 1000);
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (ATU.aplicando) { ATU.aplicando = false; location.reload(); return; }
      perguntarVersao();                                        // primeira instalação
    });
  }

  // ─── INÍCIO DO APP ───────────────────────────────────────────────────────
  async function iniciar() {
    registrarSW();
    ligarEventos();
    try { if (document.fonts) document.fonts.load('600 20px Barlow'); } catch (e) {}
    if (!window.supabase || !window.supabase.createClient) {
      $('tela-abrindo').innerHTML = '<div class="abrindo"><p>Faltou um arquivo do app. Abra de novo com internet.</p></div>';
      return;
    }
    S.sb = window.supabase.createClient(CFG.SUPA_URL, CFG.SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    S.sb.auth.onAuthStateChange(function (ev, sess) {
      if ((ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') && sess && S.precisaLogin) { S.precisaLogin = false; sincronizar(); }
    });

    S.equipe = (await kvGet('equipe')) || null;
    var salva = await kvGet('conta');
    try {
      var r = await comPrazo(S.sb.auth.getSession(), 6000);
      if (r.data && r.data.session) { S.conta = montarConta(r.data.session.user); kvSet('conta', S.conta); }
      else if (r.error && salva) { S.conta = salva; }               // sem internet: segue com a conta guardada
      else if (salva) { S.conta = salva; S.precisaLogin = true; }   // acesso venceu: preenche, mas pede login para enviar
    } catch (e) {
      if (salva) S.conta = salva;
    }
    if (!history.state) history.replaceState({ raiz: 1 }, '', location.hash || '#');
    rota();
    limparAntigos().catch(function () {});
    sincronizar();
    if (S.conta) atualizarDoEscritorio(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
