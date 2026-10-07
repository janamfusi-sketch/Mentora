/* =====================================================================
   Mentóra — Habilitação profissional do mentor (opcional)
   • Psicólogo(a) com CRP ativo  → nível "clínica"
   • Formação em psicanálise     → nível "psicanalítica"
   O mentor só PEDE. Quem aprova é a administração (painel admin → Habilitações).
   O comprovante vai para um bucket PRIVADO (habilitacoes), só visível ao próprio mentor e à administração,
   e é apagado se o mentor excluir a conta.
   ===================================================================== */
(function () {
  'use strict';
  var MAX_BYTES = 5 * 1024 * 1024;
  var TIPOS_ARQUIVO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  var estado = { lista: [], enviando: false };

  function sb() { return window.supabaseClient; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function data(d) { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return ''; } }
  function rotuloTipo(t) { return t === 'psicologo' ? 'Psicólogo(a) com CRP' : 'Formação em psicanálise'; }

  function ativo(tipo) {
    return estado.lista.some(function (h) { return h.tipo === tipo && (h.status === 'pendente' || h.status === 'aprovada'); });
  }

  function cartaoStatus(h) {
    var cores = { pendente: ['#FEF3C7', '#92400E', 'Em análise'], aprovada: ['#DCFCE7', '#166534', 'Aprovada'], recusada: ['#FEE2E2', '#991B1B', 'Recusada'], revogada: ['#FEE2E2', '#991B1B', 'Revogada'] };
    var c = cores[h.status] || ['#F1F5F9', '#475569', h.status];
    var detalhe = '';
    if (h.status === 'pendente') detalhe = 'Enviado em ' + data(h.criado_em) + '. A administração vai conferir o documento.';
    if (h.status === 'aprovada') detalhe = 'Válida até ' + data(h.valida_ate) + '. O selo aparece no seu perfil e a Telemetria de Traumas passa a usar a linguagem do seu nível. Renove o pedido antes do vencimento.';
    if ((h.status === 'recusada' || h.status === 'revogada') && h.motivo_recusa) detalhe = 'Motivo: ' + h.motivo_recusa;
    var ident = h.tipo === 'psicologo' ? ('CRP ' + esc(h.crp_regiao) + '/' + esc(h.crp_numero)) : esc(h.curso || '');
    return '<div style="display:flex; gap:12px; align-items:flex-start; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#fff;">' +
      '<span style="background:' + c[0] + '; color:' + c[1] + '; font-size:12px; font-weight:700; padding:3px 10px; border-radius:100px; white-space:nowrap;">' + c[2] + '</span>' +
      '<div style="flex:1; min-width:0;"><div style="font-size:14px; font-weight:600; color:#1e293b;">' + rotuloTipo(h.tipo) + ' · ' + ident + '</div>' +
      (detalhe ? '<div style="font-size:12.5px; color:#64748b; margin-top:3px; line-height:1.5;">' + esc(detalhe) + '</div>' : '') + '</div></div>';
  }

  function campo(rotulo, html, dica) {
    return '<div><label style="display:block; font-size:13px; font-weight:600; color:#1e293b; margin-bottom:.35rem;">' + rotulo + '</label>' + html +
      (dica ? '<div style="font-size:12px; color:#64748b; margin-top:.3rem;">' + dica + '</div>' : '') + '</div>';
  }
  var ESTILO_IN = 'width:100%; padding:.65rem; border:1px solid #e2e8f0; border-radius:8px; font-family:inherit; font-size:14px; box-sizing:border-box;';

  function formulario() {
    var podePsico = !ativo('psicologo'), podePsican = !ativo('psicanalista');
    if (!podePsico && !podePsican) return '';
    var opcoes = '';
    if (podePsico) opcoes += '<option value="psicologo">Sou psicólogo(a) com inscrição ativa no CRP</option>';
    if (podePsican) opcoes += '<option value="psicanalista">Tenho formação em psicanálise (curso/certificado)</option>';
    return '<div id="hab-form" style="border:1px dashed #cbd5e1; border-radius:12px; padding:1rem 1.1rem; background:#f8fafc; display:flex; flex-direction:column; gap:.9rem;">' +
      campo('O que você quer comprovar', '<select id="hab-tipo" style="' + ESTILO_IN + ' background:#fff;" onchange="habTrocarTipo()">' + opcoes + '</select>') +
      campo('Nome completo (igual ao documento)', '<input type="text" id="hab-nome" maxlength="200" style="' + ESTILO_IN + '">') +
      '<div id="hab-campos-psicologo" style="display:grid; grid-template-columns:2fr 1fr; gap:.75rem;">' +
        campo('Número do CRP', '<input type="text" id="hab-crp-num" maxlength="12" inputmode="numeric" placeholder="Ex.: 12345" style="' + ESTILO_IN + '">') +
        campo('Região do CRP', '<input type="text" id="hab-crp-reg" maxlength="2" inputmode="numeric" placeholder="Ex.: 06" style="' + ESTILO_IN + '">') +
      '</div>' +
      '<div id="hab-campos-psicanalista" style="display:none; flex-direction:column; gap:.75rem;">' +
        campo('Instituição que emitiu o certificado', '<input type="text" id="hab-inst" maxlength="200" style="' + ESTILO_IN + '">') +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:.75rem;">' +
          campo('CNPJ da instituição', '<input type="text" id="hab-cnpj" maxlength="20" placeholder="00.000.000/0000-00" style="' + ESTILO_IN + '">', 'Ajuda a conferir que a instituição existe.') +
          campo('Carga horária', '<input type="text" id="hab-carga" maxlength="40" placeholder="Ex.: 360 horas" style="' + ESTILO_IN + '">') +
        '</div>' +
        campo('Nome do curso/formação', '<input type="text" id="hab-curso" maxlength="200" style="' + ESTILO_IN + '">') +
      '</div>' +
      campo('Comprovante', '<input type="file" id="hab-arquivo" accept="application/pdf,image/jpeg,image/png,image/webp" style="font-size:13px;">',
        '<span id="hab-dica-arq">Envie a carteira profissional do CRP (frente e verso) ou o certificado completo, em PDF ou imagem de até 5 MB.</span>') +
      '<label style="display:flex; gap:.6rem; align-items:flex-start; font-size:13px; color:#334155; line-height:1.55; cursor:pointer;">' +
        '<input type="checkbox" id="hab-aceite" style="margin-top:3px; accent-color:var(--purple);"> ' +
        '<span>Declaro que as informações são verdadeiras e autorizo a Mentóra a conferir o documento junto ao conselho ou à instituição. Sei que o comprovante é guardado de forma privada (só a administração vê), é apagado se eu excluir a conta, e que, se aprovado, o selo aparece no meu perfil. Entendo que a habilitação vale por 1 ano e pode ser revogada.</span></label>' +
      '<div id="hab-msg" style="display:none; font-size:13px; border-radius:8px; padding:.6rem .8rem;"></div>' +
      '<div style="display:flex; justify-content:flex-end;"><button type="button" class="btn btn-primary" id="hab-enviar" style="padding:.65rem 1.4rem; font-size:14px; border-radius:8px;" onclick="habEnviar()">Enviar para análise</button></div>' +
    '</div>';
  }

  function render() {
    var box = $('hab-conteudo'); if (!box) return;
    var historico = estado.lista.map(cartaoStatus).join('');
    box.innerHTML = historico + formulario();
    habTrocarTipo();
  }

  window.habTrocarTipo = function () {
    var t = $('hab-tipo'); if (!t) return;
    var psico = t.value === 'psicologo';
    var a = $('hab-campos-psicologo'), b = $('hab-campos-psicanalista'), d = $('hab-dica-arq');
    if (a) a.style.display = psico ? 'grid' : 'none';
    if (b) b.style.display = psico ? 'none' : 'flex';
    if (d) d.textContent = psico
      ? 'Envie a carteira profissional do CRP (frente e verso), em PDF ou imagem de até 5 MB.'
      : 'Envie o certificado completo (com instituição, carga horária e datas), em PDF ou imagem de até 5 MB.';
  };

  function mensagem(texto, ok) {
    var m = $('hab-msg'); if (!m) return;
    m.style.display = texto ? 'block' : 'none';
    m.style.background = ok ? '#DCFCE7' : '#FEE2E2';
    m.style.color = ok ? '#166534' : '#991B1B';
    m.textContent = texto || '';
  }

  window.habCarregar = async function () {
    var box = $('hab-conteudo'); if (!box || !sb()) return;
    try {
      var r = await sb().auth.getUser();
      var uid = r && r.data && r.data.user && r.data.user.id;
      if (!uid) { box.textContent = 'Faça login para solicitar a habilitação.'; return; }
      var q = await sb().from('Habilitacoes_Profissionais')
        .select('id,tipo,status,crp_numero,crp_regiao,curso,motivo_recusa,valida_ate,criado_em')
        .eq('mentor_id', uid).order('criado_em', { ascending: false });
      if (q.error) throw q.error;
      estado.lista = q.data || [];
      window.__habUid = uid;
      render();
    } catch (e) {
      console.warn('Habilitação:', e && e.message);
      box.textContent = 'Não foi possível carregar agora. Tente de novo em instantes.';
    }
  };

  window.habEnviar = async function () {
    if (estado.enviando) return;
    var uid = window.__habUid; if (!uid || !sb()) return;
    var tipo = $('hab-tipo').value, nome = $('hab-nome').value.trim();
    var arq = $('hab-arquivo').files && $('hab-arquivo').files[0];
    var reg = {};
    if (nome.length < 5) return mensagem('Escreva o nome completo, igual ao documento.', false);
    if (tipo === 'psicologo') {
      var num = $('hab-crp-num').value.replace(/\D/g, ''), rg = $('hab-crp-reg').value.replace(/\D/g, '');
      if (num.length < 3) return mensagem('Informe o número do CRP.', false);
      var rgn = parseInt(rg, 10);
      if (!(rgn >= 1 && rgn <= 24)) return mensagem('Informe a região do CRP (de 01 a 24).', false);
      reg.crp_numero = num; reg.crp_regiao = ('0' + rgn).slice(-2);
    } else {
      var inst = $('hab-inst').value.trim(), curso = $('hab-curso').value.trim();
      if (inst.length < 3 || curso.length < 3) return mensagem('Informe a instituição e o nome do curso.', false);
      reg.instituicao = inst; reg.curso = curso;
      reg.instituicao_cnpj = $('hab-cnpj').value.trim() || null;
      reg.carga_horaria = $('hab-carga').value.trim() || null;
    }
    if (!arq) return mensagem('Anexe o comprovante.', false);
    if (!TIPOS_ARQUIVO[arq.type]) return mensagem('O comprovante precisa ser PDF, JPG, PNG ou WebP.', false);
    if (arq.size > MAX_BYTES) return mensagem('O arquivo passa de 5 MB. Envie uma versão menor.', false);
    if (!$('hab-aceite').checked) return mensagem('Marque a declaração para enviar.', false);
    if (ativo(tipo)) return mensagem('Você já tem um pedido ativo para este tipo.', false);

    estado.enviando = true;
    var btn = $('hab-enviar'); btn.disabled = true; btn.textContent = 'Enviando...'; mensagem('', true);
    try {
      var caminho = uid + '/' + Date.now() + '_' + tipo + '.' + TIPOS_ARQUIVO[arq.type];
      var up = await sb().storage.from('habilitacoes').upload(caminho, arq, { contentType: arq.type, upsert: false });
      if (up.error) throw up.error;
      var linha = Object.assign({ mentor_id: uid, tipo: tipo, nome_completo: nome, arquivo_path: caminho }, reg);
      var ins = await sb().from('Habilitacoes_Profissionais').insert([linha]);
      if (ins.error) throw ins.error;
      await window.habCarregar();
      mensagem('Pedido enviado. A administração vai conferir o documento e o resultado aparece aqui.', true);
    } catch (e) {
      console.warn('Habilitação:', e && e.message);
      var m = String((e && e.message) || '');
      mensagem(/duplicate|unique/i.test(m) ? 'Você já tem um pedido ativo para este tipo.' : 'Não foi possível enviar agora. Confira os dados e tente novamente.', false);
      btn.disabled = false; btn.textContent = 'Enviar para análise';
    } finally { estado.enviando = false; }
  };
})();
