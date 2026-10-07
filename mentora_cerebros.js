// =====================================================================
// Mentóra — CÉREBROS DO AGENTE MENTÓRA
// Cada telemetria e cada ferramenta tem uma "mentora especialista" própria,
// com referenciais, lentes de leitura, sinais de alerta e limites éticos.
// Todas seguem o mesmo ciclo: ANALISA → PONDERA → DIRECIONA → EXECUTA → EVOLUI.
// O PDI sai pronto para virar dever de casa e medir a evolução na próxima aplicação.
// =====================================================================
(function () {

  // ── MÉTODO COMUM A TODOS OS CÉREBROS ───────────────────────────────
  // ── LEITURA DAS RESPOSTAS ──────────────────────────────────────────
  function secoes(texto) {
    const out = { leitura: '', ponderacao: [], evolucao: '', direcionamento: '', pdi: [], proxima: [], avancos: [], atencao: [], especificas: [] };
    let atual = 'leitura';
    const alvos = [
      [/^LEITURA/, 'leitura'], [/^AN[AÁ]LISE/, 'leitura'], [/^PONDERA/, 'ponderacao'],
      [/^EVOLU[CÇ][AÃ]O/, 'evolucao'], [/^DIRECIONA/, 'direcionamento'], [/^PDI\b|^PLANO DE A[CÇ][AÃ]O|^PLANO DE 90/, 'pdi'],
      [/^PARA A PR[OÓ]XIMA/, 'proxima'], [/^PONTOS DE AVAN[CÇ]O/, 'avancos'], [/^PONTOS DE ATEN[CÇ][AÃ]O/, 'atencao'],
      [/^(META REESCRITA|AVALIA[CÇ][AÃ]O POR CRIT|ESTRAT[EÉ]GIAS CRUZADAS|PRIORIDADE DE EFEITO|INCONSIST)/, 'especifica']
    ];
    String(texto || '').replace(/\*\*/g, '').split('\n').forEach(l => {
      const t = l.trim(); if (!t) return;
      const u = t.toUpperCase().replace(/[:\-–—]+$/, '').trim();
      const achou = u.length < 60 && alvos.find(([re]) => re.test(u));
      if (achou) { atual = achou[1]; if (atual === 'especifica') out.especificas.push({ titulo: t.replace(/[:\-–—]+$/, '').trim(), linhas: [] }); return; }
      const item = t.replace(/^(\d+[\.\)]|[-•*])\s*/, '').trim();
      if (atual === 'especifica') { out.especificas[out.especificas.length - 1].linhas.push(t); return; }
      if (['leitura', 'evolucao', 'direcionamento'].includes(atual)) out[atual] += (out[atual] ? ' ' : '') + t;
      else if (item) out[atual].push(item);
    });
    return out;
  }
  function partesAcao(a) {
    const p = {};
    String(a).split('|').forEach(x => { const m = x.match(/^\s*([^:]+):\s*(.+)$/); if (m) p[m[1].trim().toLowerCase()] = m[2].trim(); });
    return {
      acao: p['ação'] || p['acao'] || String(a).split('|')[0].trim(),
      porque: p['por quê'] || p['por que'] || p['porque'] || '',
      como: p['como'] || '',
      evidencia: p['evidência'] || p['evidencia'] || '',
      indicador: p['indicador'] || p['indicador de progresso'] || p['indicador de evolução'] || '',
      prazo: p['prazo'] || ''
    };
  }
  // Texto da tarefa do dever de casa (o mentorado entende sozinho o que fazer e como provar)
  function tarefaDeverDeCasa(a) {
    return a.acao + (a.como ? ` — ${a.como}` : '') + (a.evidencia ? ` Evidência: ${a.evidencia}.` : '') + (a.prazo ? ` (prazo: ${a.prazo})` : '');
  }

  // ── PDI na tela (usado nas ferramentas e na Visão Geral) ────────────
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let pdiSeq = 0;
  const pdiGuardados = {};
  // op (opcional): { titulo, solto (sem moldura), extra (HTML de botões ao lado do Dever de casa) }
  function htmlPDI(acoes, menteeId, op) {
    if (!acoes || !acoes.length) return '';
    op = op || {};
    const id = 'pdi' + (++pdiSeq);
    pdiGuardados[id] = { acoes, menteeId };
    const linha = (rot, v) => v ? `<div class="mcb-d"><b>${rot}:</b> ${esc(v)}</div>` : '';
    return `<div class="mcb-pdi${op.solto ? ' mcb-pdi-solto' : ''}">
      <div class="mcb-pdi-cab"><b>${esc(op.titulo || 'PDI')}</b><span class="mcb-pdi-botoes">${op.extra || ''}${menteeId ? `<button type="button" class="mcb-btn-dever" onclick="MentoraCerebros.enviarDeverDeCasa('${id}')">Dever de casa</button>` : ''}</span></div>
      ${acoes.map((a, i) => `<div class="mcb-acao"><div class="mcb-num">${i + 1}</div><div><div class="mcb-t">${esc(a.acao)}</div>
        ${linha('Por quê', a.porque)}${linha('Como', a.como)}${linha('Evidência', a.evidencia)}${linha('Indicador', a.indicador)}${linha('Prazo', a.prazo)}</div></div>`).join('')}
    </div>`;
  }
  async function enviarDeverDeCasa(id) {
    const g = pdiGuardados[id]; if (!g || !g.menteeId) return;
    if (typeof cp_dcGetTarefas !== 'function' || typeof cp_salvarTarefasDeverDeCasa !== 'function') { alert('O dever de casa não está disponível nesta página.'); return; }
    const tarefas = g.acoes.map(tarefaDeverDeCasa);
    const atuais = cp_dcGetTarefas(g.menteeId);
    const novas = tarefas.filter(t => !atuais.includes(t));
    if (!novas.length) {
      alert('As ações deste PDI já estão no dever de casa. O link será copiado para você enviar.');
      if (typeof cp_copiarLinkDeverDeCasa === 'function') cp_copiarLinkDeverDeCasa(g.menteeId);
      return;
    }
    if (!confirm(`Adicionar ${novas.length} ação(ões) deste PDI ao dever de casa do mentorado?\n\nAs tarefas que ele já tem continuam na lista. Em seguida, o link do dever de casa é copiado para você enviar.`)) return;
    const ok = await cp_salvarTarefasDeverDeCasa(g.menteeId, atuais.concat(novas));
    if (ok && typeof cp_copiarLinkDeverDeCasa === 'function') cp_copiarLinkDeverDeCasa(g.menteeId);
  }

  // ── Histórico do mentorado para as ferramentas (evolução e execução) ─
  function historicoMentorado(menteeId, limite) {
    let h = '';
    try { if (typeof cp_montarContextoCentral === 'function' && menteeId) h = cp_montarContextoCentral(menteeId); } catch (e) {}
    limite = limite || 3500;
    return h.length > limite ? '(histórico resumido pelos mais recentes)\n' + h.slice(-limite) : h;
  }

  (function estilos() {
    if (document.getElementById('mcb-estilos')) return;
    const st = document.createElement('style'); st.id = 'mcb-estilos';
    st.textContent = `
    .mcb-pdi { background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:12px 16px; margin-top:12px; }
    .mcb-pdi-cab { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .mcb-pdi-cab b { color:#1B2559; font-size:14px; letter-spacing:.5px; }
    .mcb-pdi.mcb-pdi-solto { border:none; padding:0; margin:0; background:transparent; }
    .mcb-pdi-solto .mcb-pdi-cab b { font-size:12px; color:#5B2DA3; text-transform:uppercase; letter-spacing:.6px; }
    .mcb-pdi-botoes { display:flex; gap:8px; align-items:center; }
    .mcb-btn-dever { background:#4F46E5; color:#fff; border:none; border-radius:100px; padding:6px 14px; font-size:12px; font-weight:700; cursor:pointer; }
    .mcb-acao { display:flex; gap:10px; padding:9px 0; border-top:1px solid #F1F5F9; }
    .mcb-acao:first-of-type { border-top:none; }
    .mcb-num { flex-shrink:0; width:22px; height:22px; border-radius:50%; background:#EDE9FE; color:#5B2DA3; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
    .mcb-t { font-size:13.5px; font-weight:600; color:#1E293B; }
    .mcb-d { font-size:12.5px; color:#475569; margin-top:2px; line-height:1.45; }
    .mcb-bloco { margin-top:10px; }
    .mcb-rot { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#5B2DA3; margin-bottom:4px; }
    .mcb-txt { font-size:13.5px; line-height:1.6; color:#1E293B; margin:0; }
    .mcb-lista { margin:0; padding-left:18px; font-size:13px; line-height:1.55; color:#334155; }
    .mcb-caixa { background:#F8F6FE; border:1px solid #E9E3FF; border-radius:12px; padding:14px 16px; }
    `;
    document.head.appendChild(st);
  })();

  // Resposta completa (estrutura comum) em HTML
  function htmlResposta(texto, menteeId, titulo) {
    const s = secoes(texto);
    const bloco = (rot, conteudo) => conteudo ? `<div class="mcb-bloco"><div class="mcb-rot">${rot}</div>${conteudo}</div>` : '';
    const lista = itens => itens.length ? `<ul class="mcb-lista">${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    const par = t => t ? `<p class="mcb-txt">${esc(t)}</p>` : '';
    return `<div class="mcb-caixa">
      ${titulo ? `<div class="mcb-rot" style="font-size:12px;">${esc(titulo)}</div>` : ''}
      ${bloco('Leitura da especialista', par(s.leitura))}
      ${bloco('Pontos de avanço', lista(s.avancos))}
      ${bloco('Pontos de atenção', lista(s.atencao))}
      ${s.especificas.map(e => bloco(e.titulo.charAt(0) + e.titulo.slice(1).toLowerCase(), `<div class="mcb-txt" style="white-space:pre-line;">${esc(e.linhas.join('\n'))}</div>`)).join('')}
      ${bloco('Ponderação', lista(s.ponderacao))}
      ${bloco('Evolução e execução', par(s.evolucao))}
      ${bloco('Direcionamento', par(s.direcionamento))}
      ${htmlPDI(s.pdi.map(partesAcao), menteeId)}
      ${s.proxima.length ? `<div class="mcb-bloco mpdf-proxima" data-incluir="0"><div class="mcb-rot mpdf-rot-linha"><span>Para a próxima sessão</span>${window.MentoraPDF ? MentoraPDF.botao() : ''}</div>${lista(s.proxima)}</div>` : ''}
    </div>`;
  }

  window.MentoraCerebros = {
    // Os "cérebros" do Agente Mentóra (instruções de cada telemetria e ferramenta) ficam SÓ no servidor (proxy-ia).
    // Aqui ficam apenas o leitor e o desenhista das respostas.
    setNivelHabilitacao: function () {}, nivelHabilitacao: function () { return 'padrao'; },
    secoes, partesAcao, tarefaDeverDeCasa, htmlPDI, htmlResposta, enviarDeverDeCasa, historicoMentorado
  };
})();
