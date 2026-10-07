// =====================================================================
// Mentóra — PESQUISA INTERNA DE SATISFAÇÃO DOS MENTORES (05/10/2026)
// • Cada mentor responde UMA vez por rodada, a partir de 15 dias depois do cadastro.
//   A rodada (perguntas, duração de 6 meses ou 1 ano) é criada no painel administrativo.
// • Quem decide se o mentor pode responder é o banco (mentora_pesquisa_status, que já devolve as
//   perguntas da rodada); o envio é conferido no servidor (mentora_pesquisa_enviar).
//   As respostas vão só para o painel administrativo: não aparecem na Comunidade nem nas avaliações.
// • "Responder depois" adia o convite por 3 dias neste aparelho; o item "Pesquisa Mentóra"
//   no menu lateral fica disponível enquanto a pesquisa estiver pendente.
// =====================================================================
(function () {
  'use strict';
  const ADIA_DIAS = 3;
  const CHAVE_ADIA = 'mentora_pesquisa_adiada_ate';
  let statusAtual = null, conferindo = false, mostrouNestaVisita = false;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  function adiadoAte() { try { return Number(localStorage.getItem(CHAVE_ADIA)) || 0; } catch (e) { return 0; } }
  function adiar() { try { localStorage.setItem(CHAVE_ADIA, String(Date.now() + ADIA_DIAS * 86400000)); } catch (e) {} }

  async function consultarStatus() {
    const c = window.supabaseClient; if (!c || conferindo) return statusAtual;
    conferindo = true;
    try {
      const { data: s } = await c.auth.getSession();
      if (!s || !s.session) { statusAtual = null; return null; }
      const { data, error } = await c.rpc('mentora_pesquisa_status');
      statusAtual = error ? null : data;
      return statusAtual;
    } catch (e) { return null; } finally { conferindo = false; atualizarMenu(); }
  }

  function atualizarMenu() {
    const ancora = Array.from(document.querySelectorAll('#pf-sidebar a.nav-item-side')).find(a => /abrirConfiguracoes/.test(a.getAttribute('onclick') || ''));
    let item = $('nav-pesquisa-mentora');
    if (!item && ancora) {
      item = document.createElement('a');
      item.href = 'javascript:void(0)'; item.id = 'nav-pesquisa-mentora'; item.className = 'nav-item-side';
      item.style.cssText = 'display:none; padding:10px 16px; font-size:13px; border-radius:8px; color:var(--purple, #5B2DA3); font-weight:600; text-decoration:none; transition:0.2s;';
      item.textContent = 'Pesquisa Mentóra';
      item.onmouseover = function () { this.style.background = 'rgba(0,0,0,0.05)'; };
      item.onmouseout = function () { this.style.background = 'transparent'; };
      item.onclick = function () { abrir(); };
      ancora.insertAdjacentElement('afterend', item);
    }
    if (item) item.style.display = statusAtual && statusAtual.pode_responder ? 'block' : 'none';
  }

  // ── Formulário ──
  function escala(nome, de, ate, rotDe, rotAte) {
    let b = '';
    for (let i = de; i <= ate; i++) b += `<button type="button" class="psm-n" data-campo="${nome}" data-v="${i}" aria-pressed="false">${i}</button>`;
    return `<div class="psm-escala psm-esc-${ate - de + 1}" role="group">${b}</div><div class="psm-esc-rot"><span>${rotDe}</span><span>${rotAte}</span></div>`;
  }
  function opcoes(nome, lista, multiplo, max) {
    return `<div class="psm-ops">${lista.map(([v, t]) => `<button type="button" class="psm-op" data-campo="${nome}" data-v="${esc(v)}" data-multi="${multiplo ? 1 : 0}" data-max="${max || ''}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>`;
  }
  function pergunta(n, titulo, corpo, obrig, ajuda) {
    return `<div class="psm-q" id="psm-q-${n}"><div class="psm-q-t"><span class="psm-q-n">${n}</span><div>${titulo}${obrig ? '' : ' <em>(opcional)</em>'}${ajuda ? `<div class="psm-q-a">${ajuda}</div>` : ''}</div></div>${corpo}</div>`;
  }
  function area(nome, ph) { return `<textarea class="psm-txt" data-campo="${nome}" maxlength="2000" placeholder="${esc(ph)}"></textarea>`; }

  function htmlPergunta(q, i) {
    const n = i + 1, id = esc(q.id);
    let corpo = '', ajuda = '';
    if (q.tipo === 'escala') corpo = escala(id, 1, 10, '1 · muito insatisfeito', '10 · muito satisfeito');
    else if (q.tipo === 'nps') corpo = escala(id, 0, 10, '0 · nada provável', '10 · extremamente provável');
    else if (q.tipo === 'unica') corpo = opcoes(id, (q.opcoes || []).map(o => [o, o]));
    else if (q.tipo === 'multipla') { corpo = opcoes(id, (q.opcoes || []).map(o => [o, o]), true, q.max); if (q.max) ajuda = `Escolha até ${q.max}.`; }
    else corpo = area(id, 'Escreva aqui...');
    return pergunta(n, esc(q.texto), corpo, !!q.obrigatoria, ajuda);
  }

  function montar(campanha) {
    let m = $('psm-modal'); if (m) m.remove();
    estilos();
    const perguntas = (campanha && campanha.perguntas) || [];
    m = document.createElement('div'); m.id = 'psm-modal'; m.className = 'psm-fundo';
    m.innerHTML = `<div class="psm-caixa" role="dialog" aria-modal="true" aria-labelledby="psm-tit">
      <div class="psm-cab"><div><div class="psm-sup">Pesquisa interna · ${perguntas.length} perguntas</div><h2 id="psm-tit">${esc(campanha.titulo || 'Pesquisa Mentóra')}</h2>
        <p>Suas respostas vão apenas para a equipe da Mentóra e nos ajudam a entender o impacto da plataforma no seu trabalho. Elas não aparecem na Comunidade nem nas avaliações públicas.</p></div>
        <button type="button" class="psm-x" aria-label="Responder depois" onclick="MentoraPesquisa.depois()">&times;</button></div>
      <div class="psm-corpo" id="psm-corpo">${perguntas.map(htmlPergunta).join('')}</div>
      <div class="psm-rod"><button type="button" class="psm-sec" onclick="MentoraPesquisa.depois()">Responder depois</button>
        <button type="button" class="psm-pri" id="psm-enviar" onclick="MentoraPesquisa.enviar()">Enviar respostas</button></div>
    </div>`;
    m._campanha = campanha;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const b = e.target.closest('.psm-n, .psm-op'); if (!b) return;
      const campo = b.dataset.campo;
      if (b.dataset.multi === '1') {
        const max = Number(b.dataset.max) || 99;
        const marcados = m.querySelectorAll(`.psm-op[data-campo="${campo}"][aria-pressed="true"]`).length;
        if (b.getAttribute('aria-pressed') !== 'true' && marcados >= max) { b.classList.add('psm-treme'); setTimeout(() => b.classList.remove('psm-treme'), 400); return; }
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      } else {
        m.querySelectorAll(`[data-campo="${campo}"]`).forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
      }
      const q = b.closest('.psm-q'); if (q) q.classList.remove('psm-falta');
    });
    return m;
  }

  async function abrir() {
    if (!statusAtual || !statusAtual.campanha) await consultarStatus();
    if (!statusAtual || !statusAtual.pode_responder || !statusAtual.campanha) { alert('Não há pesquisa pendente para você no momento. Obrigado!'); return; }
    const m = montar(statusAtual.campanha);
    m.classList.add('on'); document.body.style.overflow = 'hidden';
    const c = $('psm-corpo'); if (c) c.scrollTop = 0;
  }
  function fechar() { const m = $('psm-modal'); if (m) m.classList.remove('on'); document.body.style.overflow = ''; }
  function depois() { adiar(); fechar(); }

  function coletar(m) {
    const out = {}, faltas = [];
    (m._campanha.perguntas || []).forEach((q, i) => {
      const id = q.id; let v = null;
      if (q.tipo === 'escala' || q.tipo === 'nps') { const b = m.querySelector(`.psm-n[data-campo="${CSS.escape(id)}"][aria-pressed="true"]`); v = b ? Number(b.dataset.v) : null; }
      else if (q.tipo === 'unica') { const b = m.querySelector(`.psm-op[data-campo="${CSS.escape(id)}"][aria-pressed="true"]`); v = b ? b.dataset.v : null; }
      else if (q.tipo === 'multipla') { v = Array.from(m.querySelectorAll(`.psm-op[data-campo="${CSS.escape(id)}"][aria-pressed="true"]`)).map(b => b.dataset.v); if (!v.length) v = null; }
      else { const t = m.querySelector(`textarea[data-campo="${CSS.escape(id)}"]`); v = t && t.value.trim() ? t.value.trim() : null; }
      if (v == null && q.obrigatoria) faltas.push(i + 1);
      if (v != null) out[id] = v;
    });
    return { out, faltas };
  }

  async function enviar() {
    const m = $('psm-modal'); const { out, faltas } = coletar(m);
    m.querySelectorAll('.psm-q').forEach(q => q.classList.remove('psm-falta'));
    if (faltas.length) {
      faltas.forEach(n => { const q = $('psm-q-' + n); if (q) q.classList.add('psm-falta'); });
      const q = $('psm-q-' + faltas[0]); if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const btn = $('psm-enviar'); btn.disabled = true; btn.textContent = 'Enviando...';
    const { error } = await window.supabaseClient.rpc('mentora_pesquisa_enviar', { p_campanha: m._campanha.id, p_respostas: out });
    btn.disabled = false; btn.textContent = 'Enviar respostas';
    if (error) { alert('Suas respostas NÃO foram enviadas: ' + (error.message || error) + '\n\nO que você marcou continua na tela; tente de novo.'); return; }
    try { localStorage.removeItem(CHAVE_ADIA); } catch (e) {}
    statusAtual = { pode_responder: false }; atualizarMenu();
    m.querySelector('.psm-caixa').innerHTML = `<div class="psm-ok"><div class="psm-ok-i">✓</div><h2>Obrigado pela sua resposta!</h2>
      <p>Ela já está com a equipe da Mentóra e vai orientar as próximas melhorias da plataforma.</p>
      <button type="button" class="psm-pri" onclick="MentoraPesquisa.fecharTudo()">Fechar</button></div>`;
  }
  function fecharTudo() { fechar(); const m = $('psm-modal'); if (m) m.remove(); }

  // Convite automático: quando a Área do Mentor abre, uma vez por visita
  async function talvezConvidar() {
    if (mostrouNestaVisita) return;
    const st = await consultarStatus();
    if (!st || !st.pode_responder || !st.campanha || adiadoAte() > Date.now()) return;
    const pf = $('painel-ferramentas');
    if (!pf || pf.style.display === 'none' || !pf.style.display) return;
    mostrouNestaVisita = true;
    setTimeout(() => { if (pf.style.display !== 'none') abrir(); }, 2500);
  }
  function iniciar() {
    document.addEventListener('keydown', e => { const m = $('psm-modal'); if (e.key === 'Escape' && m && m.classList.contains('on')) depois(); });
    const pf = $('painel-ferramentas'); if (!pf) return;
    if (window.MutationObserver) new MutationObserver(() => { if (pf.style.display && pf.style.display !== 'none') talvezConvidar(); }).observe(pf, { attributes: true, attributeFilter: ['style'] });
    setTimeout(consultarStatus, 3000);
  }

  function estilos() {
    if ($('psm-estilos')) return;
    const st = document.createElement('style'); st.id = 'psm-estilos';
    st.textContent = `
    .psm-fundo{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;z-index:100000;padding:16px}
    .psm-fundo.on{display:flex}
    .psm-caixa{background:#fff;border-radius:20px;width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 60px rgba(15,23,42,.25);overflow:hidden;font-family:'Inter',system-ui,sans-serif}
    .psm-cab{display:flex;gap:16px;justify-content:space-between;padding:26px 28px 18px;border-bottom:1px solid #EEF0F5}
    .psm-sup{font-size:12.5px;font-weight:600;color:#5B2DA3;margin-bottom:6px}
    .psm-cab h2{font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.25;color:#1B2559;margin:0 0 8px}
    .psm-cab p{margin:0;font-size:14px;line-height:1.55;color:#64748B;max-width:60ch}
    .psm-x{background:none;border:none;font-size:28px;line-height:1;color:#94A3B8;cursor:pointer;padding:0 4px;align-self:flex-start}
    .psm-corpo{overflow-y:auto;padding:8px 28px 8px}
    .psm-q{padding:18px 0;border-bottom:1px solid #F1F3F8}
    .psm-q:last-child{border-bottom:none}
    .psm-q-t{display:flex;gap:12px;font-size:15px;font-weight:600;color:#1E293B;line-height:1.45;margin-bottom:12px}
    .psm-q-t em{font-style:normal;font-weight:400;color:#94A3B8;font-size:13px}
    .psm-q-n{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#F1ECFB;color:#5B2DA3;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
    .psm-q-a{font-size:12.5px;font-weight:400;color:#64748B;margin-top:2px}
    .psm-q.psm-falta .psm-q-n{background:#DC2626;color:#fff}
    .psm-q.psm-falta .psm-q-t::after{content:'Responda esta pergunta';font-size:12px;font-weight:600;color:#DC2626;margin-left:auto;white-space:nowrap}
    .psm-escala{display:grid;gap:6px;margin-left:38px}
    .psm-esc-10{grid-template-columns:repeat(10,1fr)} .psm-esc-11{grid-template-columns:repeat(11,1fr)}
    .psm-n{height:40px;border:1px solid #D9DEE8;background:#fff;border-radius:10px;font-size:14px;font-weight:600;color:#334155;cursor:pointer;font-family:inherit}
    .psm-n:hover{border-color:#5B2DA3}
    .psm-n[aria-pressed="true"]{background:#5B2DA3;border-color:#5B2DA3;color:#fff}
    .psm-esc-rot{display:flex;justify-content:space-between;font-size:12px;color:#94A3B8;margin:6px 0 0 38px}
    .psm-ops{display:flex;flex-wrap:wrap;gap:8px;margin-left:38px}
    .psm-op{border:1px solid #D9DEE8;background:#fff;border-radius:999px;padding:8px 14px;font-size:13.5px;color:#334155;cursor:pointer;font-family:inherit;text-align:left}
    .psm-op:hover{border-color:#5B2DA3}
    .psm-op[aria-pressed="true"]{background:#F1ECFB;border-color:#5B2DA3;color:#3B1A73;font-weight:600}
    .psm-treme{animation:psmTreme .35s}
    @keyframes psmTreme{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
    .psm-txt{display:block;width:calc(100% - 38px);margin-left:38px;min-height:84px;border:1px solid #D9DEE8;border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;color:#1E293B;resize:vertical;box-sizing:border-box;outline:none}
    .psm-txt:focus,.psm-n:focus-visible,.psm-op:focus-visible{border-color:#5B2DA3;box-shadow:0 0 0 3px rgba(91,45,163,.15);outline:none}
    .psm-rod{display:flex;justify-content:flex-end;gap:10px;padding:16px 28px;border-top:1px solid #EEF0F5;background:#FBFBFE}
    .psm-pri{background:#5B2DA3;color:#fff;border:none;border-radius:999px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
    .psm-pri:disabled{opacity:.6;cursor:wait}
    .psm-sec{background:#fff;color:#475569;border:1px solid #D9DEE8;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
    .psm-ok{padding:44px 32px;text-align:center}
    .psm-ok-i{width:56px;height:56px;border-radius:50%;background:#DCFCE7;color:#166534;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
    .psm-ok h2{font-family:'Playfair Display',Georgia,serif;color:#1B2559;margin:0 0 10px}
    .psm-ok p{color:#64748B;font-size:14.5px;line-height:1.6;max-width:52ch;margin:0 auto 22px}
    @media (max-width:600px){
      .psm-fundo{padding:0;align-items:stretch}.psm-caixa{max-height:none;height:100%;border-radius:0}
      .psm-cab{padding:20px 18px 14px}.psm-cab h2{font-size:20px}.psm-corpo{padding:4px 18px}
      .psm-escala,.psm-ops,.psm-esc-rot{margin-left:0}.psm-txt{margin-left:0;width:100%}
      .psm-esc-10,.psm-esc-11{grid-template-columns:repeat(6,1fr)}
      .psm-rod{padding:12px 18px}.psm-rod button{flex:1}
      .psm-q.psm-falta .psm-q-t::after{display:none}
    }`;
    document.head.appendChild(st);
  }

  window.MentoraPesquisa = { abrir, depois, enviar, fecharTudo, status: consultarStatus };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
