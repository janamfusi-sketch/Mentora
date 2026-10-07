// =====================================================================
// Mentóra — AGENTE MENTÓRA NAS FERRAMENTAS
// Liga os botões "Agente Mentóra" das ferramentas à IA de verdade (função proxy-ia do
// Supabase). Antes, Roda da Vida, SMART e SWOT tinham o botão sem função, e DISC e
// Talentos montavam um texto pronto a partir de palavras-chave (sem ler o contexto).
// Cada análise leva em conta TUDO o que o mentor preencheu na ferramenta, inclusive
// o texto escrito por ele.
// =====================================================================
(function () {
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
  const nomeSel = (id) => { const s = document.getElementById(id); return s && s.value && s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; };
  const limpar = (t) => String(t || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();

  // Chamada única ao Agente Mentóra (usa o login do mentor; conta no limite diário).
  // "ferramenta" diz qual ferramenta pediu: no plano Free vale 1 análise de cada (conferido no servidor).
  async function pedirAgente(pedido, ferramenta) {
    if (!window.supabaseClient) throw new Error('Conexão com o banco não iniciada. Recarregue a página.');
    const { data: s } = await window.supabaseClient.auth.getSession();
    if (!s || !s.session) throw new Error('Faça login para usar o Agente Mentóra.');
    const { data, error } = await window.supabaseClient.functions.invoke('proxy-ia', { body: { finalidade: 'ferramenta', ferramenta: ferramenta || '', cerebro: pedido.cerebro, dados: pedido.dados, historico: pedido.historico } });
    if (error) {
      let msg = error.message || 'erro';
      try {
        const ctx = error.context && await error.context.json();
        if (ctx && ctx.error) msg = ctx.error;
        if (ctx && ctx.limite === 'diario' && typeof window.mentoraOfertaPacote === 'function') setTimeout(() => window.mentoraOfertaPacote(ctx.pacote), 300);
      } catch (e) {}
      throw new Error(msg.replace(/usos da IA/gi, 'usos do Agente Mentóra'));
    }
    const t = String((data && data.resposta) || '').trim();
    if (!t) throw new Error('O Agente Mentóra não retornou texto.');
    return t;
  }
  function lerJSON(t) {
    const m = String(t).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch (e) { return null; }
  }
  function carregando(box, texto) {
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `<div style="text-align:center; padding:18px; color:#4F46E5; font-weight:700;">✨ ${esc(texto)}</div>`;
  }
  function erroBox(box, e) {
    if (!box) { alert('O Agente Mentóra não conseguiu gerar a análise: ' + (e.message || e)); return; }
    box.style.display = 'block';
    box.innerHTML = `<div style="padding:14px; background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; color:#991B1B; font-size:13px;">O Agente Mentóra não conseguiu gerar a análise agora: ${esc(e.message || e)}</div>`;
  }
  // Monta o pedido: o navegador envia só os DADOS do mentorado e o histórico. As instruções do Agente Mentóra
  // (o "cérebro" de cada ferramenta) ficam no servidor (função proxy-ia) e não chegam ao navegador.
  function metodoDe(menteeId) { return (window.cp_currentMentee && String(cp_currentMentee.id) === String(menteeId)) ? (cp_currentMentee.metodo || '') : ''; }
  function historicoBruto(menteeId) {
    let h = '';
    try { if (typeof cp_montarContextoCentral === 'function' && menteeId) h = cp_montarContextoCentral(menteeId) || ''; } catch (e) {}
    return String(h).slice(-14000);
  }
  function pedidoCerebro(chave, nome, menteeId, dados, extras) {
    return { cerebro: { chave, nome: String(nome || ''), metodo: String(metodoDe(menteeId) || ''), extras: extras || {} }, dados: String(dados || ''), historico: historicoBruto(menteeId) };
  }
  // Blocos do ciclo (ponderação, evolução, direcionamento, PDI e próxima sessão) em HTML
  // "Para a próxima sessão" com o botão "Incluir no PDF" (desligado por padrão)
  function blocoProxima(html) {
    if (!html) return '';
    const bt = window.MentoraPDF ? MentoraPDF.botao() : '';
    return `<div class="mcb-bloco mpdf-proxima" data-incluir="0"><div class="mcb-rot mpdf-rot-linha"><span>Para a próxima sessão</span>${bt}</div>${html}</div>`;
  }
  function htmlCiclo(j, menteeId) {
    const C = window.MentoraCerebros;
    const lista = arr => (arr && arr.length) ? `<ul class="mcb-lista">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const bloco = (rot, html) => html ? `<div class="mcb-bloco"><div class="mcb-rot">${rot}</div>${html}</div>` : '';
    const par = t => t ? `<p class="mcb-txt">${esc(t)}</p>` : '';
    const acoes = (j.pdi || []).map(a => ({ acao: a.acao || a.titulo || '', porque: a.porque || '', como: a.como || (a.titulo ? a.acao : '') || '', evidencia: a.evidencia || '', indicador: a.indicador || '', prazo: a.prazo || '' }));
    return bloco('Ponderação', lista(j.ponderacao)) + bloco('Evolução e execução', par(j.evolucao)) + bloco('Direcionamento', par(j.direcionamento))
      + (C ? C.htmlPDI(acoes, menteeId) : '') + blocoProxima(lista(j.proxima_sessao));
  }
  function mostrarResposta(box, texto, menteeId) {
    box.style.whiteSpace = 'normal';
    box.style.display = 'block';
    box.innerHTML = window.MentoraCerebros ? MentoraCerebros.htmlResposta(texto, menteeId, 'Análise do Agente Mentóra') : esc(texto);
  }

  // ── RODA DA VIDA ──────────────────────────────────────────────────
  window.analisarRodaVidaIA = async function () {
    const box = document.getElementById('rv-ai-resultado');
    const cont = document.getElementById('rv-quadrants-container');
    const nome = nomeSel('rv-mentorado-select') || 'a mentorada';
    // lê direto os dados da Roda (rodavida.js); se não estiverem disponíveis, lê da tela
    const dominios = [];
    let planos = [];
    if (typeof RV_DOMINIOS !== 'undefined' && typeof rv_scores !== 'undefined') {
      RV_DOMINIOS.forEach((d, i) => dominios.push({ nome: d.name, quadrante: d.quad, nota: Number(rv_scores[i]), obs: (typeof rv_observations !== 'undefined' ? rv_observations[i] : '') || '' }));
      if (typeof rv_planos_acao !== 'undefined') planos = RV_DOMINIOS.map((d, i) => rv_planos_acao[i] ? `${d.name}: ${rv_planos_acao[i]}` : '').filter(Boolean);
    } else if (cont) {
      cont.querySelectorAll('input[type="range"]').forEach(r => {
        let bloco = r.parentElement;
        while (bloco && bloco !== cont && !bloco.querySelector('textarea')) bloco = bloco.parentElement;
        const ta = bloco ? bloco.querySelector('textarea') : null;
        const nomeDom = ta && ta.placeholder ? ta.placeholder.replace(/^Observações do mentor para\s*/i, '').replace(/\.\.\.$/, '').trim() : '';
        dominios.push({ nome: nomeDom || 'Domínio', nota: Number(r.value), obs: ta ? ta.value.trim() : '' });
      });
    }
    if (!dominios.length) { alert('Não encontrei as notas da Roda da Vida. Preencha os domínios e tente de novo.'); return; }
    const diag = val('rv-diagnostico-geral');
    const menteeRv = val('rv-mentorado-select');
    const pedido = pedidoCerebro('rodavida', nome, menteeRv,
`DADOS DA RODA DA VIDA — notas de 0 a 10 e observações do mentor:
${dominios.map(d => `- ${d.nome}${d.quadrante ? ' (' + d.quadrante + ')' : ''}: ${d.nota}${d.obs ? ' | obs: ' + d.obs : ''}`).join('\n')}
${planos.length ? '\nPlanos já escritos pelo mentor:\n' + planos.map(p => '- ' + p).join('\n') : ''}
${diag ? '\nDiagnóstico estratégico escrito pelo mentor:\n' + diag : ''}`);
    carregando(box, 'O Agente Mentóra está analisando a Roda da Vida...');
    try {
      const t = limpar(await pedirAgente(pedido, 'rodavida'));
      mostrarResposta(box, t, menteeRv);
      window.rv_ultimaAnaliseAgente = t;
    } catch (e) { erroBox(box, e); }
  };

  // ── SMART ─────────────────────────────────────────────────────────
  window.analisarSmartIA = async function () {
    const box = document.getElementById('smart-ai-resultado');
    const nome = nomeSel('smart-mentorado-select') || 'a mentorada';
    const listas = typeof smart_coletarListas === 'function' ? smart_coletarListas() : {};
    const txt = (k) => [(listas[k] || []).join('; '), val('smart-plan-' + k)].filter(Boolean).join(' | ');
    const partes = { Específica: txt('s'), Mensurável: txt('m'), Atingível: txt('a'), Relevante: txt('r'), Temporal: txt('t') };
    const resumo = (document.getElementById('smart-resumo') || {}).innerText || '';
    if (!Object.values(partes).some(Boolean) && !val('smart-metaNome')) { alert('Preencha a meta e os campos SMART antes de auditar.'); return; }
    const menteeSm = val('smart-mentorado-select');
    const pedido = pedidoCerebro('smart', nome, menteeSm,
`DADOS DA META SMART:
Meta em construção: ${val('smart-metaNome') || '(não informada)'}
${Object.keys(partes).map(k => `${k}: ${partes[k] || '(vazio)'}`).join('\n')}
Meta consolidada na tela: ${resumo || '(vazia)'}`);
    carregando(box, 'O Agente Mentóra está auditando a meta...');
    try {
      const t = limpar(await pedirAgente(pedido, 'smart'));
      mostrarResposta(box, t, menteeSm);
      window.smart_ultimaAnaliseAgente = t;
    } catch (e) { erroBox(box, e); }
  };

  // ── SWOT ──────────────────────────────────────────────────────────
  window.analisarSwotIA = async function () {
    const box = document.getElementById('swot-ai-resultado');
    const nome = nomeSel('swot-mentorado-select') || 'a mentorada';
    const L = typeof swot_coletarListas === 'function' ? swot_coletarListas() : {};
    const lst = (k) => (L[k] || []).join('; ') || '(vazio)';
    const menteeSw = val('swot-mentorado-select');
    const pedido = pedidoCerebro('swot', nome, menteeSw,
`DADOS DA MATRIZ SWOT:
Título: ${val('swot-titulo') || '-'} | Nicho: ${nomeSel('swot-pilar-select') || '-'}
Forças: ${lst('s')}
Fraquezas: ${lst('w')}
Oportunidades: ${lst('o')}
Ameaças: ${lst('t')}
Estratégia FO escrita pelo mentor: ${val('swot-plan-fo') || '(vazio)'}
Estratégia FA: ${val('swot-plan-fa') || '(vazio)'}
Estratégia DO: ${val('swot-plan-do') || '(vazio)'}
Estratégia DA: ${val('swot-plan-da') || '(vazio)'}
Diagnóstico e parecer da mentora: ${val('swot-diagnostico') || '(vazio)'}`);
    carregando(box, 'O Agente Mentóra está cruzando a matriz SWOT...');
    try {
      const t = limpar(await pedirAgente(pedido, 'swot'));
      mostrarResposta(box, t, menteeSw);
      window.swot_ultimaAnaliseAgente = t;
    } catch (e) { erroBox(box, e); }
  };

  // ── DISC ──────────────────────────────────────────────────────────
  window.disc_gerarAnaliseIA = async function () {
    const sel = document.getElementById('disc-mentorado-select');
    if (!sel || !sel.value) { alert('Selecione um mentorado antes de gerar a análise.'); return; }
    const sc = window.discScores || (typeof discScores !== 'undefined' ? discScores : null);
    if (!sc || (sc.d + sc.i + sc.s + sc.c) === 0) { alert('Responda algumas perguntas na escala antes de gerar a análise.'); return; }
    const box = document.getElementById('disc-ai-result');
    const nome = nomeSel('disc-mentorado-select') || 'o mentorado';
    const analiseMentor = val('disc-analise-mentor');
    const perguntas = (typeof DISC_QUESTIONS !== 'undefined' ? DISC_QUESTIONS : (window.DISC_QUESTIONS || []));
    const raw = window.discRawValues || (typeof discRawValues !== 'undefined' ? discRawValues : {});
    const respostas = perguntas.filter(q => raw[q.id] > 0).map(q => `- (${q.type.toUpperCase()}) ${q.text}: ${raw[q.id]}/10`).join('\n');
    const pedido = pedidoCerebro('disc', nome, sel.value,
`DADOS DO DISC:
Percentuais: Dominância ${Math.round(sc.d)}%, Influência ${Math.round(sc.i)}%, Estabilidade ${Math.round(sc.s)}%, Conformidade ${Math.round(sc.c)}%
Respostas marcadas (0 = nada a ver, 10 = descreve perfeitamente):
${respostas || '(nenhuma)'}
Análise escrita pelo mentor: ${analiseMentor || '(não escreveu)'}`);
    carregando(box, 'O Agente Mentóra está elaborando o relatório DISC...');
    try {
      const t = await pedirAgente(pedido, 'disc');
      const j = lerJSON(t);
      if (!j) { box.innerHTML = `<div style="white-space:pre-wrap; font-size:13.5px; line-height:1.6; color:#1E293B; padding:16px; background:#fff; border:1px solid #E0E7FF; border-radius:12px;">${esc(limpar(t))}</div>`; }
      else {
        const lista = (arr, cor) => `<ul style="margin:0; padding-left:18px; color:${cor}; font-size:13px; line-height:1.6;">${(arr || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
        box.innerHTML = `
          <div style="background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:18px;">
            <div style="font-size:13px; font-weight:800; color:#4F46E5; text-transform:uppercase; letter-spacing:.5px; text-align:center; margin-bottom:12px;">Análise comportamental — Agente Mentóra</div>
            <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:14px; margin-bottom:12px;"><div style="font-weight:700; color:#4F46E5; margin-bottom:6px;">Perfil predominante: ${esc(j.perfil)}</div><div style="font-size:13.5px; color:#334155; line-height:1.6;">${esc(j.sintese)}</div></div>
            ${j.leitura_mentor ? `<div style="background:#F5F3FF; border:1px solid #DDD6FE; border-radius:10px; padding:12px 14px; margin-bottom:12px; font-size:13px; color:#4C1D95; line-height:1.55;"><b>Leitura da análise do mentor:</b> ${esc(j.leitura_mentor)}</div>` : ''}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
              <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:10px; padding:12px;"><div style="font-weight:800; color:#065F46; font-size:12px; margin-bottom:6px;">▲ PONTOS FORTES</div>${lista(j.positivos, '#065F46')}</div>
              <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:12px;"><div style="font-weight:800; color:#991B1B; font-size:12px; margin-bottom:6px;">▼ RISCOS</div>${lista(j.riscos, '#991B1B')}</div>
            </div>
            ${j.sob_pressao ? `<p style="font-size:13px; color:#334155; line-height:1.6; margin:0 0 8px;"><b>Sob pressão:</b> ${esc(j.sob_pressao)}</p>` : ''}
            ${j.comunicacao ? `<p style="font-size:13px; color:#334155; line-height:1.6; margin:0 0 10px;"><b>Como se comunicar:</b> ${esc(j.comunicacao)}</p>` : ''}
            ${htmlCiclo(j, sel.value)}
          </div>`;
        // recomendacoes = PDI no formato antigo (o que o salvamento da ferramenta já conhece)
        const recomendacoes = (j.pdi || []).map(a => ({ titulo: a.acao || '', acao: [a.como, a.evidencia ? 'Evidência: ' + a.evidencia : '', a.prazo ? 'Prazo: ' + a.prazo : ''].filter(Boolean).join(' | ') }));
        window.disc_ultimaAnalise = { perfil: j.perfil, sintese: j.sintese, positivos: j.positivos, riscos: j.riscos, recomendacoes, pdi: j.pdi || [], ponderacao: j.ponderacao || [], evolucao: j.evolucao || '', direcionamento: j.direcionamento || '', analiseMentor: analiseMentor };
      }
      box.style.display = 'block';
      if (typeof disc_salvar === 'function') await disc_salvar({ automatico: true });
    } catch (e) { erroBox(box, e); }
  };

  // ── TALENTOS (Eneagrama & Compatibilidade) ────────────────────────
  window.perfilcompat_gerarIA = async function () {
    const fortes = val('pc-pontos-fortes'), fracos = val('pc-pontos-fracos'), contexto = val('pc-contexto');
    const alvo = val('pc-alvo') || 'Cargo / Função Alvo';
    if (!fortes || !fracos) { alert('Preencha os Pontos Fortes e os Pontos de Melhorias antes de gerar a análise com Agente Mentóra.'); return; }
    const nome = nomeSel('pc-mentorado-select') || 'a mentorada';
    const nicho = nomeSel('pc-nicho-select') || '-';
    if (typeof perfilcompat_mostrarStatus === 'function') perfilcompat_mostrarStatus(' O Agente Mentóra está analisando o perfil e o contexto...');
    const pedido = pedidoCerebro('perfil_compat', nome, val('pc-mentorado-select'),
`DADOS DO PERFIL:
Pontos fortes: ${fortes}
Pontos de melhoria: ${fracos}
Contexto atual: ${contexto || '(não informado)'}`, { alvo, nicho });
    try {
      const j = lerJSON(await pedirAgente(pedido, 'perfil_compat'));
      if (!j || !j.eneagrama) throw new Error('resposta em formato inesperado');
      const pct = Math.max(0, Math.min(100, Math.round(Number(j.compatibilidade && j.compatibilidade.pct) || 0)));
      const faixa = pct <= 50 ? ['pc-badge-red', 'Abaixo de 50%: Baixa compatibilidade (Riscos altos)', 'Baixa compatibilidade']
        : pct <= 70 ? ['pc-badge-yellow', 'Entre 51% a 70%: Média compatibilidade (Requer ajustes e acompanhamento)', 'Média compatibilidade']
        : ['pc-badge-green', 'Entre 71% a 100%: Alta compatibilidade (Alinhamento natural)', 'Alta compatibilidade'];
      const itens = (arr) => `<ul style="padding-left:16px; margin:0; font-size:13px; line-height:1.5;">${(arr || []).map(x => `<li><strong>${esc(x.titulo)}:</strong> ${esc(x.texto)}</li>`).join('')}</ul>`;
      const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
      set('pc-res-eneagrama', `
        ${j.leitura_contexto ? `<div style="background:#F5F3FF; border:1px solid #DDD6FE; border-radius:12px; padding:14px 16px; margin-bottom:12px;"><div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#6D28D9; letter-spacing:.5px; margin-bottom:6px;">Leitura do contexto atual</div><div style="font-size:13.5px; color:#3B0764; line-height:1.6;">${esc(j.leitura_contexto)}</div></div>` : ''}
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:16px; margin-bottom:12px;"><div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#4F46E5; letter-spacing:0.5px;">Tipo predominante do Eneagrama</div>
        <div style="font-size:18px; font-weight:800; color:#1E293B; margin:4px 0 6px 0;">${esc(j.eneagrama.tipo)}</div><div style="font-size:13px; color:#475569; font-weight:500;">${esc(j.eneagrama.descricao)}</div></div>
        <p><strong>Justificativa:</strong> ${esc(j.eneagrama.justificativa)}</p>`);
      set('pc-res-impacto', `<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div style="background:#ECFDF5; border:1px solid #A7F3D0; border-radius:12px; padding:16px; color:#166534;"><div style="font-size:12px; font-weight:800; color:#065F46; text-transform:uppercase; margin-bottom:8px;">Impacto positivo (valor tangível)</div>${itens(j.impacto_positivo)}</div>
        <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-radius:12px; padding:16px; color:#991B1B;"><div style="font-size:12px; font-weight:800; color:#991B1B; text-transform:uppercase; margin-bottom:8px;">Impacto negativo (riscos & gargalos reais)</div>${itens(j.impacto_negativo)}</div></div>`);
      set('pc-res-compatibilidade', `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:14px; background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px;">
        <div><div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Função / cargo alvo analisado</div><div style="font-size:16px; font-weight:800; color:#1E293B;">${esc(alvo)}</div></div>
        <div><div style="font-size:28px; font-weight:800; color:#1E293B; text-align:right;">${pct}%</div><span class="${faixa[0]}">${faixa[1]}</span></div></div>
        <p><strong>Justificativa da nota (${pct}%):</strong> ${esc(j.compatibilidade && j.compatibilidade.justificativa)}</p>`);
      const d = j.dinamica || {};
      set('pc-res-dinamica', `<div style="display:flex; flex-direction:column; gap:12px;">
        <div style="background:#F8FAFC; border-left:4px solid #4F46E5; padding:12px 16px; border-radius:0 8px 8px 0;"><strong style="color:#1E293B; font-size:13px; display:block; margin-bottom:4px;">Reação em situações de crise e estresse:</strong><span style="color:#475569;">${esc(d.pressao)}</span></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:12px 14px;"><strong style="color:#1E40AF; font-size:12.5px; display:block; margin-bottom:4px;">Perfil de colega que mitiga os gaps:</strong><span style="color:#1E3A8A; font-size:12.5px;">${esc(d.colega_que_ajuda)}</span></div>
        <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:10px; padding:12px 14px;"><strong style="color:#92400E; font-size:12.5px; display:block; margin-bottom:4px;">Perfil de atrito:</strong><span style="color:#78350F; font-size:12.5px;">${esc(d.atrito)}</span></div></div></div>`);
      set('pc-res-pdi', htmlCiclo(j, val('pc-mentorado-select')));
      // pdi no formato antigo (titulo/acao) para o salvamento da ferramenta
      const pdiCompat = (j.pdi || []).map(a => ({ titulo: a.acao || a.titulo || '', acao: [a.como, a.evidencia ? 'Evidência: ' + a.evidencia : '', a.prazo ? 'Prazo: ' + a.prazo : ''].filter(Boolean).join(' | ') }));
      window.pc_ultimaAnalise = { tipoEneagrama: j.eneagrama.tipo, descEneagrama: j.eneagrama.descricao, compatPct: pct, badgeLabel: faixa[2], alvo, leituraContexto: j.leitura_contexto || '', pdi: pdiCompat, pdiCompleto: j.pdi || [], ponderacao: j.ponderacao || [], evolucao: j.evolucao || '', direcionamento: j.direcionamento || '' };
      const cont = document.getElementById('pc-resultados-container') || document.getElementById('pc-res-eneagrama');
      if (cont && cont.scrollIntoView) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof perfilcompat_mostrarStatus === 'function') perfilcompat_mostrarStatus(' Análise gerada pelo Agente Mentóra, considerando o contexto!');
      if (typeof perfilcompat_salvar === 'function') await perfilcompat_salvar({ automatico: true });
    } catch (e) {
      if (typeof perfilcompat_mostrarStatus === 'function') perfilcompat_mostrarStatus(' O Agente Mentóra não conseguiu gerar a análise: ' + (e.message || e));
      else alert('O Agente Mentóra não conseguiu gerar a análise: ' + (e.message || e));
    }
  };
})();
