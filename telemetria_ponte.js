/* =====================================================================
   Mentóra — PONTE DAS TELEMETRIAS
   Incluída no fim de cada página de telemetria (que abre dentro da
   plataforma, num iframe). Faz 3 coisas:
   1) Pede à plataforma a lista REAL de mentoradas da mentora logada e
      preenche o seletor "#sel-mentorado".
   2) Chama a IA com as credenciais corretas.
   3) Envia o resultado estruturado para a plataforma gravar no
      prontuário (Sessoes_Mentoria) — é a plataforma que grava, com o
      login da mentora. Funciona no site publicado e aberto do computador.
   ===================================================================== */
(function () {
  // ── Padrão visual único das 8 telemetrias (03/10/2026): mesma cor roxa Mentóra em todas ──
  (function padraoVisual() {
    if (!document.getElementById('mt-padrao-css')) {
      const l = document.createElement('link');
      l.id = 'mt-padrao-css'; l.rel = 'stylesheet'; l.href = 'telemetria_padrao.css?v=20261003a';
      document.head.appendChild(l);
    }
    const COR = '#5B2DA3';
    const orig = window.updateSlider;
    if (typeof orig === 'function' && !orig.__mtPadrao) {
      const novo = function (id, value) { return orig(id, value, COR); };
      novo.__mtPadrao = true;
      window.updateSlider = novo;
      // repinta as escalas que já estavam na tela
      document.querySelectorAll('input[type=range]').forEach(r => { if (r.id) { try { novo(r.id, r.value); } catch (e) {} } });
    }
  })();
  const ANON_KEY = 'sb_publishable_n2qLPXvOmwCZRHCcCziVlg_rWRiiDcB';
  const noIframe = window.parent && window.parent !== window;
  const pendentes = {};
  let seq = 0;
  let ultimoSalvo = '';
  let ultimoId = null;

  function enviar(msg) {
    if (!noIframe) return Promise.reject(new Error('Abra esta telemetria pela plataforma (menu do mentor) para salvar no prontuário.'));
    const id = 'r' + (++seq) + '_' + Date.now();
    msg.requestId = id;
    return new Promise((resolve, reject) => {
      pendentes[id] = { resolve, reject };
      window.parent.postMessage(msg, '*');
      setTimeout(() => {
        if (pendentes[id]) { delete pendentes[id]; reject(new Error('A plataforma não respondeu. Recarregue a página.')); }
      }, 20000);
    });
  }

  window.addEventListener('message', (ev) => {
    if (!noIframe || ev.source !== window.parent) return;
    const msg = ev.data || {};
    if (msg.requestId && pendentes[msg.requestId]) {
      const p = pendentes[msg.requestId];
      delete pendentes[msg.requestId];
      if (msg.ok === false) p.reject(new Error(msg.erro || 'Erro ao salvar.'));
      else p.resolve(msg);
    }
  });

  // ── Lista de mentoradas ──
  function preencherMentoradas(lista, atualId) {
    const sel = document.getElementById('sel-mentorado');
    if (!sel) return;
    const urlId = new URLSearchParams(window.location.search).get('id') || '';
    const escolhido = sel.value || urlId || atualId || '';
    sel.innerHTML = '';
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Selecione o mentorado...';
    sel.appendChild(vazio);
    (lista || []).forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.nome || 'Mentorado';
      sel.appendChild(o);
    });
    if (escolhido) sel.value = escolhido;
  }

  function carregarMentoradas() {
    if (!noIframe) return;
    enviar({ tipo: 'mentora:pedir-mentorados' })
      .then(r => preencherMentoradas(r.lista, r.atual))
      .catch(e => console.warn('Lista de mentoradas indisponível:', e.message));
  }

  function nomeMentorada() {
    const sel = document.getElementById('sel-mentorado');
    if (!sel || !sel.value) return '';
    return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
  }

  // ── Transforma o texto de indicadores da página em dados estruturados ──
  function estruturar(indStr) {
    const dominios = [];
    const extras = {};
    const contexto = {};
    let atual = null;
    String(indStr || '').split('\n').forEach(linha => {
      const l = linha.trim();
      if (!l) return;
      const h = l.match(/^##\s*(.+)$/);
      if (h) {
        const t = h[1].trim();
        const kv = t.match(/^([^:]+):\s*(.+)$/);
        if (kv) { extras[kv[1].trim()] = kv[2].trim(); atual = null; }
        else { atual = { titulo: t, indicadores: [], obs: '' }; dominios.push(atual); }
        return;
      }
      const ind = l.match(/^-\s*(.+):\s*(\d+)\s*\/\s*100$/);
      if (ind && atual) { atual.indicadores.push({ nome: ind[1].trim(), valor: Number(ind[2]) }); return; }
      const obs = l.match(/^-\s*Observação:\s*(.*)$/);
      if (obs && atual) { atual.obs = obs[1].trim(); return; }
      const ctx = l.match(/^-\s*([^:]+):\s*(.*)$/);
      if (ctx && !atual) contexto[ctx[1].trim()] = ctx[2].trim();
    });
    dominios.forEach(d => {
      const v = d.indicadores.map(i => i.valor);
      d.media = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    });
    return { dominios: dominios.filter(d => d.indicadores.length), extras, contexto };
  }

  // ── Salvar ──
  async function salvar({ tipo, titulo, indStr, analise, dadosExtra }) {
    const sel = document.getElementById('sel-mentorado');
    const menteeId = sel ? sel.value : '';
    if (!menteeId) throw new Error('Selecione o mentorado antes de salvar.');
    const est = estruturar(indStr);
    const chave = tipo + '|' + menteeId + '|' + indStr + '|' + (analise || '');
    if (chave === ultimoSalvo) return { jaSalvo: true };
    const r = await enviar({
      tipo: 'mentora:salvar-telemetria',
      registro: {
        mentorado_id: menteeId,
        tipo: tipo,
        dados: {
          sessType: tipo,
          date: new Date().toISOString().split('T')[0],
          createdAt: Date.now(),
          telemetria: { titulo: titulo, dominios: est.dominios, extras: est.extras, contexto: est.contexto },
          aiAnalysis: analise || '',
          raw: indStr,
          ...(dadosExtra || {})
        }
      }
    });
    ultimoSalvo = chave;
    if (r && r.id) ultimoId = r.id;
    return r;
  }

  // Leva o mentor para a Visão Geral do mentorado escolhido (a análise e o PDI são gerados lá)
  function irVisaoGeral() {
    const sel = document.getElementById('sel-mentorado');
    if (!noIframe || !sel || !sel.value) return;
    window.parent.postMessage({ tipo: 'mentora:ir-visao-geral', mentorado_id: sel.value }, '*');
  }

  // Botão "Voltar para Visão Geral": com mentorado escolhido abre a Visão Geral dele; sem, volta à Gestão de Mentorados
  function voltar() {
    const sel = document.getElementById('sel-mentorado');
    if (!noIframe) { history.back(); return; }
    if (sel && sel.value) irVisaoGeral();
    else window.parent.postMessage({ tipo: 'mentora:voltar-gestao' }, '*');
  }

  // Depois de salvar, a plataforma abre a aba "Resultado e análise" desta telemetria
  // (gerar = true: a análise do Agente Mentóra começa sozinha)
  function abrirResultado(gerar) {
    const sel = document.getElementById('sel-mentorado');
    if (!noIframe || !ultimoId) return;
    window.parent.postMessage({ tipo: 'mentora:abrir-resultado', rowId: ultimoId, mentorado_id: sel ? sel.value : '', gerar: !!gerar }, '*');
  }

  // Botão principal da telemetria: salva no prontuário e abre o resultado com a análise do Agente Mentóra
  async function analisarESalvar(o) {
    const { tipo, titulo, indStr, btn, resultBox, dadosExtra } = o;
    const sel = document.getElementById('sel-mentorado');
    if (!sel || !sel.value) { alert('Selecione o mentorado antes de salvar.'); if (btn) { btn.disabled = false; btn.textContent = ROTULO_SALVAR; } return; }
    if (resultBox) resultBox.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const r = await salvar({ tipo, titulo, indStr, analise: '', dadosExtra });
      if (btn) btn.textContent = 'Salvo no prontuário';
      abrirResultado(!(r && r.jaSalvo));
    } catch (e) {
      alert('NÃO foi possível salvar no prontuário: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; setTimeout(() => { btn.textContent = ROTULO_SALVAR; }, 2500); }
    }
  }

  async function salvarManual(o) {
    try {
      await salvar(o);
      abrirResultado(false);
    } catch (e) {
      alert('NÃO foi possível salvar no prontuário: ' + e.message);
    }
  }

  // Ajusta os botões da página: o botão principal vira "Salvar e gerar análise"
  const ROTULO_SALVAR = 'Salvar e gerar análise';
  function ajustarBotoes() {
    document.querySelectorAll('button, a[role="button"], input[type="button"]').forEach(b => {
      const txt = (b.textContent || b.value || '').trim();
      const oc = b.getAttribute('onclick') || '';
      if (/analisarESalvar|salvarEAnalisar/.test(oc) || /(gerar|salvar).{0,20}an[aá]lise|an[aá]lise.{0,20}(ia|agente|mentóra)|salvar e ir para vis[aã]o geral/i.test(txt)) {
        if (b.tagName === 'INPUT') b.value = ROTULO_SALVAR; else b.textContent = ROTULO_SALVAR;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ajustarBotoes); else ajustarBotoes();

  window.MentoraPonte = { salvar, analisarESalvar, salvarManual, carregarMentoradas, irVisaoGeral, voltar, abrirResultado };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carregarMentoradas);
  else carregarMentoradas();

  if (!noIframe) {
    document.addEventListener('DOMContentLoaded', () => {
      const aviso = document.createElement('div');
      aviso.textContent = 'Abra esta telemetria pelo menu da plataforma para escolher o mentorado e salvar no prontuário.';
      aviso.style.cssText = 'background:#FEF3C7;color:#92400E;padding:10px 14px;font:600 13px sans-serif;text-align:center;';
      document.body.prepend(aviso);
    });
  }
})();
