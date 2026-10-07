/* =====================================================================
   Mentóra — Painel admin: Habilitações profissionais
   O admin vê o pedido, abre o comprovante (bucket privado, link temporário),
   confere no cadastro oficial e aprova, recusa ou revoga.
   A decisão é gravada pela função do banco mentora_analisar_habilitacao (só admin consegue).
   Aprovada = vale 1 ano; depois disso o nível volta sozinho para o padrão.
   ===================================================================== */
(function () {
  'use strict';
  var dados = [], filtro = 'pendente', nomes = {};

  function sb() { return window.supabaseClient; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dt(d) { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return ''; } }

  async function buscar() {
    var q = await sb().from('Habilitacoes_Profissionais').select('*').order('criado_em', { ascending: false });
    if (q.error) throw q.error;
    dados = q.data || [];
    var ids = Array.from(new Set(dados.map(function (h) { return h.mentor_id; })));
    nomes = {};
    if (ids.length) {
      var u = await sb().from('Usuarios').select('id,nome,email').in('id', ids);
      (u.data || []).forEach(function (x) { nomes[x.id] = x; });
    }
    atualizarBadge();
  }

  function atualizarBadge() {
    var b = document.getElementById('badge-habilitacoes'); if (!b) return;
    var n = dados.filter(function (h) { return h.status === 'pendente'; }).length;
    b.style.display = n ? 'flex' : 'none'; b.textContent = n;
  }

  window.carregarBadgeHabilitacoes = async function () {
    try { if (!sb()) return; var q = await sb().from('Habilitacoes_Profissionais').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
      var b = document.getElementById('badge-habilitacoes'); if (b && !q.error) { var n = q.count || 0; b.style.display = n ? 'flex' : 'none'; b.textContent = n; } } catch (e) {}
  };

  window.carregarHabilitacoesAdmin = async function () {
    var box = document.getElementById('hab-adm-lista'); if (!box) return;
    box.textContent = 'Carregando...';
    try { await buscar(); desenhar(); } catch (e) { console.warn(e); box.textContent = 'Não foi possível carregar os pedidos.'; }
  };

  window.filtrarHabilitacoesAdmin = function (f) {
    filtro = f;
    document.querySelectorAll('#hab-adm-filtros button').forEach(function (b) { b.classList.toggle('ativo', b.getAttribute('data-f') === f); });
    desenhar();
  };

  function selecionados() {
    if (filtro === 'todas') return dados;
    if (filtro === 'encerradas') return dados.filter(function (h) { return h.status === 'recusada' || h.status === 'revogada'; });
    return dados.filter(function (h) { return h.status === filtro; });
  }

  function linha(r, v) { return v ? '<div style="font-size:13px; color:#334155; margin-top:2px;"><span style="color:#64748b;">' + r + ':</span> ' + esc(v) + '</div>' : ''; }

  function desenhar() {
    var box = document.getElementById('hab-adm-lista'); if (!box) return;
    var lista = selecionados();
    if (!lista.length) { box.innerHTML = '<div style="padding:14px; color:#94a3b8; font-size:14px;">Nenhum pedido nesta lista.</div>'; return; }
    var cores = { pendente: ['#FEF3C7', '#92400E', 'Pendente'], aprovada: ['#DCFCE7', '#166534', 'Aprovada'], recusada: ['#FEE2E2', '#991B1B', 'Recusada'], revogada: ['#FEE2E2', '#991B1B', 'Revogada'] };
    box.innerHTML = lista.map(function (h) {
      var c = cores[h.status] || ['#F1F5F9', '#475569', h.status];
      var m = nomes[h.mentor_id] || {};
      var psico = h.tipo === 'psicologo';
      var venc = '';
      if (h.status === 'aprovada' && h.valida_ate) {
        var dias = Math.round((new Date(h.valida_ate) - Date.now()) / 86400000);
        venc = '<div style="font-size:12.5px; margin-top:6px; color:' + (dias < 30 ? '#B45309' : '#64748b') + ';">Válida até ' + dt(h.valida_ate) + (dias < 0 ? ' (vencida)' : ' (' + dias + ' dias)') + '</div>';
      }
      var conferir = psico
        ? '<a href="https://cadastro.cfp.org.br" target="_blank" rel="noopener" style="color:#5B2DA3; font-weight:600; font-size:13px;">Abrir o Cadastro Nacional do CFP para conferir</a>'
        : '<span style="font-size:12.5px; color:#64748b;">Confira se a instituição existe (CNPJ ativo) e, na dúvida, confirme com ela que o certificado foi emitido.</span>';
      var acoes = '';
      if (h.status === 'pendente') acoes = '<button class="btn-ok" onclick="decidirHabilitacao(\'' + h.id + '\',\'aprovar\')">Aprovar</button><button class="btn-no" onclick="decidirHabilitacao(\'' + h.id + '\',\'recusar\')">Recusar</button>';
      if (h.status === 'aprovada') acoes = '<button class="btn-no" onclick="decidirHabilitacao(\'' + h.id + '\',\'revogar\')">Revogar</button>';
      return '<div style="border:1px solid #E2E8F0; border-radius:12px; padding:14px 16px; margin-bottom:12px; background:#fff;">' +
        '<div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">' +
          '<div><div style="font-weight:700; color:#1B2559; font-size:15px;">' + esc(m.nome || 'Mentor') + '</div><div style="font-size:12.5px; color:#64748b;">' + esc(m.email || '') + ' · pedido de ' + dt(h.criado_em) + '</div></div>' +
          '<span style="background:' + c[0] + '; color:' + c[1] + '; font-size:12px; font-weight:700; padding:3px 10px; border-radius:100px; height:fit-content;">' + c[2] + '</span></div>' +
        '<div style="margin-top:10px; padding:10px 12px; background:#F8FAFC; border-radius:8px;">' +
          '<div style="font-size:13px; font-weight:700; color:#5B2DA3; margin-bottom:4px;">' + (psico ? 'Psicólogo(a) com CRP' : 'Formação em psicanálise') + '</div>' +
          linha('Nome no documento', h.nome_completo) + linha('Nome no cadastro da Mentóra', m.nome) +
          (psico ? linha('CRP', h.crp_regiao + '/' + h.crp_numero) : linha('Instituição', h.instituicao) + linha('CNPJ', h.instituicao_cnpj) + linha('Curso', h.curso) + linha('Carga horária', h.carga_horaria)) +
        '</div>' +
        '<div style="margin-top:10px; display:flex; gap:14px; align-items:center; flex-wrap:wrap;">' +
          '<button class="btn-ver" onclick="verComprovanteHabilitacao(\'' + h.id + '\')">Ver comprovante</button>' + conferir + '</div>' +
        (h.motivo_recusa ? '<div style="margin-top:8px; font-size:13px; color:#991B1B;">Motivo: ' + esc(h.motivo_recusa) + '</div>' : '') +
        venc +
        (acoes ? '<div class="hab-acoes" style="margin-top:12px; display:flex; gap:10px;">' + acoes + '</div>' : '') +
      '</div>';
    }).join('');
  }

  window.verComprovanteHabilitacao = async function (id) {
    var h = dados.find(function (x) { return x.id === id; }); if (!h) return;
    var r = await sb().storage.from('habilitacoes').createSignedUrl(h.arquivo_path, 120);
    if (r.error || !r.data) { alert('Não foi possível abrir o comprovante agora.'); return; }
    window.open(r.data.signedUrl, '_blank', 'noopener');
  };

  window.decidirHabilitacao = async function (id, decisao) {
    var h = dados.find(function (x) { return x.id === id; }); if (!h) return;
    var motivo = null;
    if (decisao === 'recusar' || decisao === 'revogar') {
      motivo = prompt(decisao === 'recusar' ? 'Motivo da recusa (o mentor vai ler):' : 'Motivo da revogação (o mentor vai ler):');
      if (motivo === null) return;
      if (!motivo.trim()) { alert('Informe o motivo.'); return; }
    } else if (!confirm('Confirme que você conferiu o documento e os dados. A habilitação vale por 1 ano.')) return;
    var r = await sb().rpc('mentora_analisar_habilitacao', { p_id: id, p_decisao: decisao, p_motivo: motivo });
    if (r.error) { alert('Não foi possível registrar a decisão: ' + r.error.message); return; }
    await window.carregarHabilitacoesAdmin();
  };

  // selo de pendências ao abrir o painel
  setTimeout(function () { window.carregarBadgeHabilitacoes(); }, 2500);
  setInterval(function () { window.carregarBadgeHabilitacoes(); }, 120000);
})();
