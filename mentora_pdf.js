/* =====================================================================
   Mentóra — PDF DAS TELEMETRIAS E FERRAMENTAS (03/10/2026)
   1) Botão "Incluir no PDF" no campo de perguntas/ações para a próxima sessão.
      Desligado por padrão: se o mentor não clicar, esse campo NÃO vai para o PDF.
   2) Lembrete ao gerar o PDF quando o campo existe e não foi incluído.
   3) PDF compacto da página de resultado das telemetrias (documento próprio,
      em uma coluna, sem a lista completa de respostas).
   ===================================================================== */
(function () {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Botão "Incluir no PDF" ──
  function botao() {
    return '<button type="button" class="mpdf-toggle" aria-pressed="false" onclick="MentoraPDF.alternar(this)" title="Se não clicar, este campo não vai para o PDF">Incluir no PDF</button>';
  }
  function alternar(btn) {
    const bloco = btn && btn.closest('.mpdf-proxima'); if (!bloco) return;
    const on = bloco.getAttribute('data-incluir') !== '1';
    marcar(bloco, on);
  }
  function marcar(bloco, on) {
    bloco.setAttribute('data-incluir', on ? '1' : '0');
    bloco.querySelectorAll('.mpdf-toggle').forEach(b => { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? 'Incluído no PDF' : 'Incluir no PDF'; b.classList.toggle('on', on); });
  }
  function temConteudo(bloco) {
    const c = bloco.cloneNode(true);
    c.querySelectorAll('.mpdf-toggle, .mpdf-rot, .cp-panel-title, .mcb-rot, .cpv-vazio').forEach(x => x.remove());
    return c.textContent.trim().length > 3;
  }

  // ── Lembrete ao gerar o PDF ──
  // Devolve 'incluir', 'sem' (gerar sem o campo) ou null (cancelou)
  function confirmar(raiz) {
    const el = typeof raiz === 'string' ? document.getElementById(raiz) : (raiz || document);
    const blocos = el ? [...el.querySelectorAll('.mpdf-proxima')].filter(temConteudo) : [];
    if (!blocos.length) return Promise.resolve('sem');
    if (blocos.some(b => b.getAttribute('data-incluir') === '1')) return Promise.resolve('incluir');
    return new Promise(resolve => {
      const fundo = document.createElement('div');
      fundo.className = 'mpdf-modal';
      fundo.innerHTML = `<div class="mpdf-caixa" role="dialog" aria-modal="true" aria-labelledby="mpdf-tit">
        <div class="mpdf-tit" id="mpdf-tit">Lembrete antes de gerar o PDF</div>
        <p>As <b>perguntas e ações para a próxima sessão</b> não estão marcadas para ir no PDF. Elas costumam ser só para você, mentor.</p>
        <p>Quer incluir esse campo neste PDF?</p>
        <div class="mpdf-botoes">
          <button type="button" class="mpdf-b2" data-r="sem">Gerar sem esse campo</button>
          <button type="button" class="mpdf-b1" data-r="incluir">Incluir e gerar</button>
        </div>
        <button type="button" class="mpdf-cancel" data-r="">Cancelar</button>
      </div>`;
      const fim = r => { fundo.remove(); if (r === 'incluir') blocos.forEach(b => marcar(b, true)); resolve(r || null); };
      fundo.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) fim(b.getAttribute('data-r')); else if (e.target === fundo) fim(null); });
      document.body.appendChild(fundo);
      const b1 = fundo.querySelector('.mpdf-b1'); if (b1) b1.focus();
    });
  }

  // Remove do clone o que não vai para o PDF
  function limparClone(clone, incluir) {
    clone.querySelectorAll('.mpdf-toggle, button, .mcb-pdi-botoes, .ctr-acoes, .ctr-rodape, details > summary').forEach(x => x.remove());
    if (!incluir) clone.querySelectorAll('.mpdf-proxima').forEach(x => x.remove());
    clone.querySelectorAll('details').forEach(d => d.remove()); // "Ver todas as respostas" nunca vai (deixava o PDF longo)
    return clone;
  }
  // HTML de um elemento pronto para o PDF (respeita a escolha atual)
  function htmlParaPDF(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id; if (!el) return '';
    return limparClone(el.cloneNode(true), api.incluirAtual).innerHTML;
  }
  // Texto bruto do Agente: tira a parte "Para a próxima sessão" quando não foi incluída
  function textoAgente(texto) {
    if (!texto) return texto;
    if (api.incluirAtual) return texto;
    const linhas = String(texto).split('\n'); const out = []; let pulando = false;
    const titulo = /^\s*(\*\*)?\s*(LEITURA|AN[AÁ]LISE|PONDERA|EVOLU|DIRECIONA|PDI\b|PLANO DE|PONTOS DE|META REESCRITA|AVALIA|ESTRAT|PRIORIDADE|INCONSIST)/i;
    linhas.forEach(l => {
      const u = l.replace(/\*\*/g, '').trim().toUpperCase();
      if (/^PARA A PR[OÓ]XIMA/.test(u) && u.length < 60) { pulando = true; return; }
      if (pulando && u.length < 60 && titulo.test(u)) pulando = false;
      if (!pulando) out.push(l);
    });
    return out.join('\n');
  }

  // ── Documento de impressão compacto ──
  const CSS_PDF = `
    @page { size:A4; margin:12mm 12mm 14mm; }
    *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body{ font-family:Inter, Arial, sans-serif; color:#1E293B; font-size:10.5px; line-height:1.45; margin:0; background:#fff; }
    .pdf-cab{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #5B2DA3; padding-bottom:6px; margin-bottom:10px; }
    .pdf-cab b{ font-size:15px; color:#1B2559; } .pdf-cab span{ color:#64748B; font-size:10px; text-align:right; }
    .pdf-sub{ color:#475569; font-size:10.5px; margin:-4px 0 10px; }
    .pdf-sec{ border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; margin-bottom:8px; page-break-inside:avoid; break-inside:avoid; }
    .pdf-sec.longa{ page-break-inside:auto; break-inside:auto; }
    .pdf-rot{ font-size:9.5px; font-weight:800; color:#5B2DA3; text-transform:uppercase; letter-spacing:.6px; margin-bottom:5px; }
    .pdf-2col{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .pdf-2col > .pdf-sec{ margin-bottom:0; }
    /* conteúdo vindo da tela, em versão enxuta */
    .cp-panel, .cpv-painel, .ctr-card, .mcb-caixa, .mcb-pdi { border:none !important; box-shadow:none !important; padding:0 !important; margin:0 !important; background:transparent !important; }
    .cp-panel-title, .ctr-rot, .ctr-sub-rot, .cpv-sec-tit { font-size:9.5px !important; font-weight:800; color:#5B2DA3; text-transform:uppercase; letter-spacing:.5px; margin:6px 0 4px !important; }
    p, li, div { font-size:10.5px; }
    p { margin:0 0 5px; } ul, ol { margin:0 0 5px; padding-left:16px; }
    h1,h2,h3,h4{ font-size:12px; margin:4px 0; }
    .cpa-barras{ display:grid; grid-template-columns:1fr 1fr; gap:4px 14px; }
    .cpa-bar-top{ display:flex; justify-content:space-between; font-size:10px; }
    .cpa-trilho{ height:5px; background:#EEF2F7; border-radius:4px; overflow:hidden; margin-top:2px; } .cpa-trilho > div{ height:100%; }
    .ctr-alerta{ display:flex; gap:6px; border:1px solid #FDE68A; background:#FFFBEB; border-radius:6px; padding:3px 6px; margin:3px 0; font-size:10px; }
    .ctr-alerta.crit{ border-color:#FCA5A5; background:#FEF2F2; } .ctr-alerta b{ white-space:nowrap; font-size:9px; text-transform:uppercase; }
    .mcb-acao{ display:flex; gap:6px; padding:4px 0; border-top:1px solid #F1F5F9; page-break-inside:avoid; break-inside:avoid; }
    .mcb-num{ flex-shrink:0; width:15px; height:15px; border-radius:50%; background:#EDE9FE; color:#5B2DA3; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; }
    .mcb-t{ font-size:10.5px; font-weight:700; } .mcb-d{ display:inline; font-size:9.8px; color:#475569; margin-right:6px; } .mcb-d b{ color:#334155; }
    .mcb-pdi-cab b, .mcb-rot{ font-size:9.5px !important; color:#5B2DA3; text-transform:uppercase; letter-spacing:.5px; }
    .mcb-bloco{ margin-top:5px; } .mcb-txt{ font-size:10.5px; line-height:1.5; }
    textarea, input, select, svg.cpv-icone, .mpdf-toggle, button { display:none !important; }
    img, svg, canvas{ max-width:100%; height:auto; }
    .cpv-bloco{ margin:0 0 6px; } .cpv-bloco-rot{ font-size:9.5px; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:.4px; margin:6px 0 2px; }
    .cpv-txt{ margin:0 0 4px; } .cpv-lista{ margin:0 0 4px; padding-left:16px; } .cpv-sub{ color:#64748B; font-size:9.5px; margin:0 0 4px !important; }
    .cpv-vazio{ color:#94A3B8; font-style:italic; font-size:10px; }
    .cpv-pergunta{ display:flex; gap:6px; padding:3px 0; border-top:1px solid #F1F5F9; page-break-inside:avoid; break-inside:avoid; }
    .cpv-pergunta .n{ flex-shrink:0; width:15px; height:15px; border-radius:50%; background:#EDE9FE; color:#5B2DA3; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; }
    .ctr-sub-rot{ font-size:9px; font-weight:700; color:#64748B; text-transform:uppercase; margin:4px 0 2px; }
    .mpdf-rot-linha span{ display:inline; }
    .pdf-rodape{ margin-top:8px; padding-top:5px; border-top:1px solid #E2E8F0; font-size:9px; color:#94A3B8; text-align:center; }
  `;
  function imprimirDocumento(titulo, subtitulo, corpo, nomeArquivo) {
    document.querySelectorAll('iframe.mpdf-frame').forEach(f => f.remove());
    const fr = document.createElement('iframe');
    fr.className = 'mpdf-frame'; fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed; left:-12000px; top:0; width:800px; height:1200px; border:0; opacity:0; pointer-events:none;';
    document.body.appendChild(fr);
    const quando = new Date().toLocaleDateString('pt-BR');
    const doc = fr.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(nomeArquivo || ('Mentora - ' + titulo))}</title><style>${CSS_PDF}</style></head><body>
      <div class="pdf-cab"><b>Mentóra · ${esc(titulo)}</b><span>${esc(quando)}</span></div>
      ${subtitulo ? `<div class="pdf-sub">${subtitulo}</div>` : ''}
      ${corpo}
      <div class="pdf-rodape">Documento gerado pela plataforma Mentóra. Uso restrito ao mentor e ao mentorado.</div>
    </body></html>`);
    doc.close();
    const w = fr.contentWindow;
    const remover = () => setTimeout(() => { try { fr.remove(); } catch (e) {} }, 800);
    setTimeout(() => { try { w.addEventListener('afterprint', remover, { once: true }); w.focus(); w.print(); } catch (e) { console.error(e); } setTimeout(remover, 120000); }, 350);
  }

  const api = window.MentoraPDF = { botao, alternar, marcar, confirmar, limparClone, htmlParaPDF, textoAgente, imprimirDocumento, incluirAtual: false, esc };

  // ── Liga o lembrete aos PDFs das ferramentas (sem mudar o que cada uma imprime) ──
  function embrulhar(nome, raiz) {
    const orig = window[nome];
    if (typeof orig !== 'function' || orig.__mpdf) return;
    const novo = async function () {
      const r = await confirmar(raiz);
      if (!r) return;
      api.incluirAtual = r === 'incluir';
      try { return orig.apply(this, arguments); } finally { setTimeout(() => { api.incluirAtual = false; }, 3000); }
    };
    novo.__mpdf = true;
    window[nome] = novo;
  }
  function ligar() {
    embrulhar('rv_imprimirRelatorio', 'rv-ai-resultado');
    embrulhar('smart_imprimir', 'smart-ai-resultado');
    embrulhar('swot_imprimir', 'swot-ai-resultado');
    embrulhar('perfilcompat_imprimir', 'pc-res-pdi');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
  window.addEventListener('load', ligar);
})();
