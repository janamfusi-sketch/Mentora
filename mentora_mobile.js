/* =====================================================================
   Mentóra — CELULAR (03/10/2026)
   • Menu do topo recolhido num botão "Menu" (antes quebrava em 3 linhas e cobria as telas).
   • Menus laterais da Comunidade (#pc-sidebar) e do Mentor (#pf-sidebar) viram gaveta,
     aberta por um botão "Menu" fixo no canto da tela.
   Os estilos ficam em mentora_ajustes.css (seção CELULAR).
   ===================================================================== */
(function () {
  'use strict';
  var LIMITE = 900;
  function celular() { return window.innerWidth <= LIMITE; }
  function $(id) { return document.getElementById(id); }

  // ── Menu do topo ──
  function montarMenuTopo() {
    var nav = document.querySelector('.nav'); if (!nav || $('mnav-btn')) return;
    var links = nav.querySelector('.nav-links'); if (!links) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'mnav-btn'; btn.className = 'mnav-btn';
    btn.setAttribute('aria-label', 'Abrir menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'mnav-links');
    btn.innerHTML = '<span></span><span></span><span></span>';
    if (!links.id) links.id = 'mnav-links';
    nav.appendChild(btn);
    btn.addEventListener('click', function (e) { e.stopPropagation(); alternarTopo(); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) fecharTopo(); });
    document.addEventListener('click', function (e) { if (document.body.classList.contains('mnav-aberto') && !e.target.closest('.nav')) fecharTopo(); });
  }
  function alternarTopo() { document.body.classList.contains('mnav-aberto') ? fecharTopo() : abrirTopo(); }
  function abrirTopo() { fecharGaveta(); document.body.classList.add('mnav-aberto'); var b = $('mnav-btn'); if (b) { b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', 'Fechar menu'); } }
  function fecharTopo() { document.body.classList.remove('mnav-aberto'); var b = $('mnav-btn'); if (b) { b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Abrir menu'); } }

  // ── Gavetas laterais ──
  function painelAtivo() {
    var pc = $('painel-comunidade'), pf = $('painel-ferramentas');
    if (pc && pc.style.display !== 'none' && pc.offsetParent !== null) return 'pc';
    if (pf && pf.style.display !== 'none' && pf.offsetParent !== null) return 'pf';
    return null;
  }
  function montarGaveta() {
    if ($('mob-side-btn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'mob-side-btn'; b.className = 'mob-side-btn'; b.textContent = 'Menu';
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function () { alternarGaveta(); });
    document.body.appendChild(b);
    var o = document.createElement('div'); o.id = 'mob-overlay'; o.className = 'mob-overlay';
    o.addEventListener('click', fecharGaveta);
    document.body.appendChild(o);
    // fecha a gaveta quando o mentor escolhe um item do menu lateral
    ['pc-sidebar', 'pf-sidebar'].forEach(function (id) {
      var s = $(id); if (!s) return;
      s.addEventListener('click', function (e) { if (celular() && e.target.closest('a, button') && !e.target.closest('.pf-submenu-toggle, [data-submenu]')) setTimeout(fecharGaveta, 60); });
    });
  }
  function alternarGaveta() { document.body.classList.contains('mob-gaveta') ? fecharGaveta() : abrirGaveta(); }
  function abrirGaveta() {
    var p = painelAtivo(); if (!p) return;
    fecharTopo();
    document.body.classList.add('mob-gaveta'); document.body.setAttribute('data-gaveta', p);
    var b = $('mob-side-btn'); if (b) { b.textContent = 'Fechar'; b.setAttribute('aria-expanded', 'true'); }
  }
  function fecharGaveta() {
    document.body.classList.remove('mob-gaveta'); document.body.removeAttribute('data-gaveta');
    var b = $('mob-side-btn'); if (b) { b.textContent = 'Menu'; b.setAttribute('aria-expanded', 'false'); }
  }
  // Mostra o botão "Menu" só quando a Comunidade ou a área do Mentor estão abertas
  function atualizar() {
    var p = painelAtivo();
    document.body.classList.toggle('mob-tem-gaveta', !!p);
    if (!p) fecharGaveta();
    if (!celular()) { fecharGaveta(); fecharTopo(); }
  }

  // Os botões antigos (onclick="togglePcSidebar()" / "togglePfSidebar()") passam a usar a gaveta
  window.togglePcSidebar = function () { alternarGaveta(); };
  window.togglePfSidebar = function () { alternarGaveta(); };
  window.MentoraMobile = { abrirGaveta: abrirGaveta, fecharGaveta: fecharGaveta, fecharTopo: fecharTopo, atualizar: atualizar };

  function iniciar() {
    montarMenuTopo(); montarGaveta(); atualizar();
    // observa a troca de telas (os painéis abrem e fecham mudando o display)
    var alvo = [$('painel-comunidade'), $('painel-ferramentas')].filter(Boolean);
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { atualizar(); });
      alvo.forEach(function (el) { mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }); });
    }
    // Comunidade e Área do Mentor nunca aparecem juntas (celular e computador):
    // ao abrir um painel, o outro some e a tela volta para o topo.
    if (window.MutationObserver) {
      var pc = $('painel-comunidade'), pf = $('painel-ferramentas');
      var vis = function (e) { return !!e && e.style.display !== 'none' && e.style.display !== ''; };
      var antes = { pc: vis(pc), pf: vis(pf) };
      var exclusivo = new MutationObserver(function () {
        var agora = { pc: vis(pc), pf: vis(pf) };
        if (agora.pf && !antes.pf && agora.pc) { pc.style.display = 'none'; agora.pc = false; window.scrollTo(0, 0); }
        else if (agora.pc && !antes.pc && agora.pf) { pf.style.display = 'none'; agora.pf = false; window.scrollTo(0, 0); }
        antes = agora;
      });
      [pc, pf].forEach(function (el) { if (el) exclusivo.observe(el, { attributes: true, attributeFilter: ['style'] }); });
    }
    window.addEventListener('resize', atualizar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { fecharGaveta(); fecharTopo(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
