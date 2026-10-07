// =====================================================================
// Mentóra — PLANO EM ATRASO NA ÁREA DO MENTOR (v1 · 05/10/2026)
// Regras (calculadas no banco por mentora_cobranca_situacao, em dias úteis, sem fins de semana e feriados nacionais):
//  • venceu e não pagou: o acesso continua normal;
//  • 2 dias úteis depois: aviso de pagamento em aberto no topo da Área do Mentor (+ e-mail do robô);
//  • mais 3 dias úteis sem pagamento: a Área do Mentor fica bloqueada até o pagamento ser confirmado.
//    Na tela de bloqueio o mentor pode pagar ou escolher voltar ao plano Free (sem cobrança).
// Planos cancelados não entram em atraso: ao fim do período pago, a conta só volta ao Free.
// =====================================================================
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
  let situacao = null, conferindo = false;

  async function consultar() {
    const c = window.supabaseClient; if (!c || conferindo) return situacao;
    conferindo = true;
    try {
      const { data: s } = await c.auth.getSession();
      if (!s || !s.session) { situacao = null; return null; }
      const { data, error } = await c.rpc('mentora_cobranca_situacao');
      situacao = error ? null : data;
    } catch (e) { situacao = null; } finally { conferindo = false; }
    return situacao;
  }

  function nomePlano(s) { return s && s.plano === 'VIP' ? 'VIP' : 'Premium'; }
  function pagar() { if (typeof abrirModalPagamentoVIP === 'function') abrirModalPagamentoVIP(situacao && situacao.plano === 'VIP' ? 'VIP' : 'PREMIUM'); }

  function aviso(s) {
    const pf = $('painel-ferramentas'); if (!pf) return;
    let b = $('cob-aviso');
    if (!s || s.situacao !== 'atrasado' || !s.mostrar_aviso) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'cob-aviso';
      const alvo = pf.querySelector('main') || pf;
      alvo.insertBefore(b, alvo.firstChild);
    }
    b.innerHTML = `<div class="cob-aviso-txt"><b>Pagamento em aberto.</b> O seu plano ${nomePlano(s)} venceu em ${dataBR(s.vencimento)}. Se o pagamento não for identificado, o acesso à Área do Mentor será suspenso em <b>${dataBR(s.bloqueio_em)}</b>.</div>
      <button type="button" onclick="MentoraCobranca.pagar()">Pagar agora</button>`;
  }

  function bloqueio(s) {
    let o = $('cob-bloqueio');
    const pf = $('painel-ferramentas');
    const ativo = s && s.situacao === 'bloqueado' && pf && pf.style.display && pf.style.display !== 'none';
    if (!ativo) { if (o) o.remove(); return; }
    if (o) return;
    o = document.createElement('div'); o.id = 'cob-bloqueio';
    o.innerHTML = `<div class="cob-caixa" role="alertdialog" aria-modal="true" aria-labelledby="cob-tit">
      <div class="cob-icone">!</div>
      <h2 id="cob-tit">Acesso à Área do Mentor suspenso</h2>
      <p>O pagamento do seu plano <b>${nomePlano(s)}</b>, com vencimento em <b>${dataBR(s.vencimento)}</b>, não foi identificado. Seus dados e os dos seus mentorados continuam guardados: assim que o pagamento for confirmado, o acesso volta automaticamente.</p>
      <div class="cob-botoes"><button type="button" class="cob-pri" onclick="MentoraCobranca.pagar()">Pagar agora</button>
        <button type="button" class="cob-sec" onclick="MentoraCobranca.voltarFree()">Prefiro voltar para o plano Free</button></div>
      <div class="cob-rod"><a href="javascript:void(0)" onclick="MentoraCobranca.sairDaArea()">Voltar ao site</a> · Já pagou? A confirmação pode levar alguns minutos. <a href="javascript:void(0)" onclick="MentoraCobranca.conferir()">Conferir de novo</a></div>
    </div>`;
    document.body.appendChild(o);
  }

  async function aplicar() { const s = await consultar(); aviso(s); bloqueio(s); }

  async function voltarFree() {
    if (!confirm('Voltar para o plano Free?\n\nNenhuma cobrança será feita. Você continua com acesso à Área do Mentor com os recursos do plano Free, e seus dados continuam guardados. Se quiser, pode assinar de novo quando desejar.')) return;
    const { error } = await window.supabaseClient.rpc('mentora_cobranca_voltar_free');
    if (error) { alert('Não foi possível concluir agora: ' + error.message); return; }
    alert('Pronto: sua conta está no plano Free.');
    location.reload();
  }
  async function conferir() {
    const s = await consultar();
    if (!s || s.situacao !== 'bloqueado') { location.reload(); return; }
    alert('O pagamento ainda não foi confirmado. Se você acabou de pagar, aguarde alguns minutos e confira de novo.');
  }
  function sairDaArea() { const o = $('cob-bloqueio'); if (o) o.remove(); if (typeof fecharFerramentasMentor === 'function') fecharFerramentasMentor(); }

  function estilos() {
    if ($('cob-estilos')) return;
    const st = document.createElement('style'); st.id = 'cob-estilos';
    st.textContent = `
    #cob-aviso{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:#FFF7ED;border:1px solid #FED7AA;border-left:5px solid #EA580C;border-radius:12px;padding:12px 16px;margin:16px 20px 0;font-size:14px;color:#9A3412;line-height:1.5}
    #cob-aviso button{background:#EA580C;color:#fff;border:none;border-radius:999px;padding:8px 18px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
    #cob-bloqueio{position:fixed;inset:0;z-index:9990;background:rgba(15,23,42,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px}
    #cob-bloqueio .cob-caixa{background:#fff;border-radius:20px;max-width:540px;width:100%;padding:32px 30px;text-align:center;box-shadow:0 30px 60px rgba(0,0,0,.3);font-family:'Inter',system-ui,sans-serif}
    #cob-bloqueio .cob-icone{width:56px;height:56px;border-radius:50%;background:#FEF2F2;color:#DC2626;font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
    #cob-bloqueio h2{font-family:'Playfair Display',Georgia,serif;color:#1B2559;font-size:24px;margin:0 0 10px}
    #cob-bloqueio p{color:#475569;font-size:14.5px;line-height:1.6;margin:0 0 20px}
    #cob-bloqueio .cob-botoes{display:flex;flex-direction:column;gap:10px}
    #cob-bloqueio .cob-pri{background:#5B2DA3;color:#fff;border:none;border-radius:999px;padding:13px 22px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
    #cob-bloqueio .cob-sec{background:#fff;color:#475569;border:1px solid #D9DEE8;border-radius:999px;padding:11px 22px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
    #cob-bloqueio .cob-rod{margin-top:16px;font-size:12.5px;color:#94A3B8;line-height:1.6}
    #cob-bloqueio .cob-rod a{color:#5B2DA3;font-weight:600}
    @media (max-width:600px){#cob-aviso{margin:12px 12px 0}#cob-bloqueio .cob-caixa{padding:26px 20px}}`;
    document.head.appendChild(st);
  }

  function iniciar() {
    estilos();
    const pf = $('painel-ferramentas'); if (!pf) return;
    if (window.MutationObserver) new MutationObserver(() => { if (pf.style.display && pf.style.display !== 'none') aplicar(); else bloqueio(null); })
      .observe(pf, { attributes: true, attributeFilter: ['style'] });
    setTimeout(aplicar, 2500);
    setInterval(() => { if (pf.style.display && pf.style.display !== 'none') aplicar(); }, 10 * 60 * 1000);
  }

  window.MentoraCobranca = { pagar, voltarFree, conferir, sairDaArea, atualizar: aplicar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
