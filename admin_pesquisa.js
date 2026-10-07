// =====================================================================
// Mentóra — PAINEL ADM: PESQUISA INTERNA DOS MENTORES (v2 · 05/10/2026)
// • Rodadas: cada rodada tem as suas perguntas e dura 6 meses ou 1 ano. Só uma fica ativa.
//   Cada mentor responde 1 vez por rodada, a partir de 15 dias depois do cadastro.
// • Nova rodada: reformular perguntas, escolher a duração e se quem já respondeu antes recebe de novo.
// • Respostas: excluir (apaga) ou reenviar (guarda no histórico e libera nova resposta), uma a uma ou todas.
// Tudo passa pelas funções mentora_pesquisa_admin* (só a administração tem acesso).
// =====================================================================
(function () {
  'use strict';
  const TIPOS = { escala: 'Nota de 1 a 10', nps: 'Recomendação de 0 a 10 (NPS)', unica: 'Escolha uma opção', multipla: 'Escolha várias opções', aberta: 'Resposta aberta' };
  let dados = null, campSel = null, busca = '', editor = null;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const fmtData = d => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const rpc = async (nome, args) => { const { data, error } = await window.supabaseClient.rpc(nome, args || {}); if (error) throw error; return data; };

  function montarAba() {
    if ($('pesquisa')) return;
    const nav = document.querySelector('.nav-menu');
    const cfg = Array.from(document.querySelectorAll('.nav-menu .nav-item')).find(n => /switchTab\('settings'/.test(n.getAttribute('onclick') || ''));
    const item = document.createElement('div');
    item.className = 'nav-item'; item.style.position = 'relative'; item.textContent = 'Pesquisa Interna';
    item.onclick = function () { switchTab('pesquisa', this); const t = $('page-title'); if (t) t.textContent = 'Pesquisa Interna'; carregar(); };
    if (cfg) nav.insertBefore(item, cfg); else if (nav) nav.appendChild(item);
    const area = document.querySelector('.content-area'); if (!area) return;
    const sec = document.createElement('section'); sec.id = 'pesquisa'; sec.className = 'section-view';
    sec.innerHTML = `<div class="psa"><div class="psa-head"><div><h2>Pesquisa interna dos mentores</h2>
      <p>Cada mentor responde uma vez por rodada, a partir de 15 dias depois do cadastro. A rodada fica ativa por 6 meses ou 1 ano; depois disso a pesquisa para de aparecer. As respostas ficam só aqui.</p></div>
      <div class="psa-acoes"><button type="button" class="psa-btn" onclick="AdmPesquisa.csv()">Exportar CSV</button><button type="button" class="psa-btn" onclick="AdmPesquisa.carregar()">Atualizar</button></div></div>
      <div id="psa-conteudo"><div class="psa-vazio">Carregando...</div></div></div>`;
    area.appendChild(sec);
    estilos();
  }

  async function carregar() {
    const alvo = $('psa-conteudo'); if (!alvo) return;
    alvo.innerHTML = '<div class="psa-vazio">Carregando...</div>';
    try { dados = await rpc('mentora_pesquisa_admin'); } catch (e) { alvo.innerHTML = `<div class="psa-vazio">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
    if (!campSel || !(dados.campanhas || []).some(c => c.id === campSel)) campSel = dados.ativa || ((dados.campanhas || [])[0] || {}).id || null;
    desenhar();
  }

  const campanha = () => (dados.campanhas || []).find(c => c.id === campSel) || null;
  const respostasDa = (c, todas) => (dados.respostas || []).filter(r => r.campanha_id === (c && c.id) && (todas || r.conta));

  function situacao(c) {
    if (!c) return '';
    if (c.id === dados.ativa) return `<span class="psa-st on">Ativa até ${fmtData(c.fim)}</span>`;
    if (c.encerrada_em) return `<span class="psa-st">Encerrada em ${fmtData(c.encerrada_em)}</span>`;
    return `<span class="psa-st">Terminou em ${fmtData(c.fim)}</span>`;
  }

  function barras(lista, q) {
    const cont = {}; let total = 0;
    lista.forEach(r => { const v = r.respostas[q.id]; if (v == null) return; total++; (Array.isArray(v) ? v : [v]).forEach(x => { cont[x] = (cont[x] || 0) + 1; }); });
    if (!total) return '<div class="psa-vazio-p">Sem respostas.</div>';
    const chaves = q.tipo === 'multipla' ? Object.keys(cont).sort((a, b) => cont[b] - cont[a]) : (q.opcoes || []);
    return chaves.map(k => { const n = cont[k] || 0, p = Math.round(n / total * 100);
      return `<div class="psa-bar"><span class="psa-bar-n">${esc(k)}</span><div class="psa-trilho"><div style="width:${p}%"></div></div><span class="psa-bar-v">${p}% <em>(${n})</em></span></div>`; }).join('');
  }
  function resumoEscala(lista, q) {
    const vs = lista.map(r => r.respostas[q.id]).filter(v => typeof v === 'number');
    if (!vs.length) return '<div class="psa-vazio-p">Sem respostas.</div>';
    const media = vs.reduce((a, b) => a + b, 0) / vs.length;
    const de = q.tipo === 'nps' ? 0 : 1;
    let extra = '';
    if (q.tipo === 'nps') { const p = vs.filter(v => v >= 9).length, d = vs.filter(v => v <= 6).length; extra = `<div class="psa-nps">NPS <b>${Math.round((p - d) / vs.length * 100)}</b> <span>${p} promotores · ${vs.length - p - d} neutros · ${d} detratores</span></div>`; }
    const dist = []; for (let i = de; i <= 10; i++) dist.push(vs.filter(v => v === i).length);
    const mx = Math.max(...dist, 1);
    return `<div class="psa-media">Média <b>${media.toFixed(1).replace('.', ',')}</b> <span>(${vs.length} respostas)</span></div>${extra}
      <div class="psa-dist">${dist.map((n, i) => `<div><div class="psa-dist-c"><div style="height:${Math.round(n / mx * 100)}%"></div></div><span>${i + de}</span></div>`).join('')}</div>`;
  }

  function desenhar() {
    const alvo = $('psa-conteudo'); if (!alvo || !dados) return;
    const c = campanha();
    const seletor = (dados.campanhas || []).length ? `<select onchange="AdmPesquisa.trocar(this.value)">${dados.campanhas.map(x => `<option value="${x.id}" ${x.id === campSel ? 'selected' : ''}>${esc(x.titulo)} · ${fmtData(x.inicio)}${x.id === dados.ativa ? ' (ativa)' : ''}</option>`).join('')}</select>` : '';
    const rodada = `<div class="psa-card psa-rodada"><div class="psa-card-cab"><div><h3>Rodada</h3>${seletor}</div><div class="psa-botoes">
        <button type="button" class="psa-btn pri" onclick="AdmPesquisa.novaRodada()">Nova rodada / reformular perguntas</button>
        ${dados.ativa ? '<button type="button" class="psa-btn" onclick="AdmPesquisa.encerrar()">Encerrar rodada ativa</button>' : ''}</div></div>
      ${c ? `<div class="psa-info">${situacao(c)} <span>Início ${fmtData(c.inicio)} · duração de ${c.duracao_meses === 6 ? '6 meses' : '1 ano'} · ${c.perguntas.length} perguntas · ${c.incluir_quem_ja_respondeu ? 'inclui quem respondeu rodadas anteriores' : 'só para quem ainda não respondeu nenhuma rodada'}</span></div>` : '<div class="psa-vazio-p">Nenhuma rodada criada. Clique em "Nova rodada" para começar.</div>'}
      ${c && c.id === dados.ativa ? `<div class="psa-info"><span><b>${dados.pendentes}</b> mentores com a pesquisa pendente · <b>${dados.aguardando_15_dias}</b> cadastrados há menos de 15 dias (recebem depois) · ${dados.mentores} mentores no total</span></div>` : ''}
    </div>`;
    if (!c) { alvo.innerHTML = rodada; return; }
    const lista = respostasDa(c), todas = respostasDa(c, true);
    const b = busca.trim().toLowerCase();
    const visiveis = todas.filter(r => !b || [r.nome, r.email, JSON.stringify(r.respostas)].join(' ').toLowerCase().includes(b));
    const graficos = c.perguntas.filter(q => q.tipo !== 'aberta').map(q => `<div class="psa-card"><h3>${esc(q.texto)}</h3>${q.tipo === 'escala' || q.tipo === 'nps' ? resumoEscala(lista, q) : barras(lista, q)}</div>`).join('');
    const valor = (q, v) => v == null ? '' : Array.isArray(v) ? v.map(x => `<span class="psa-tag">${esc(x)}</span>`).join(' ') : (q.tipo === 'aberta' ? `<p>${esc(v)}</p>` : `<span><b>${esc(v)}</b>${q.tipo === 'escala' || q.tipo === 'nps' ? '/10' : ''}</span>`);
    const cards = visiveis.map(r => `<div class="psa-resp${r.conta ? '' : ' reenviada'}">
      <div class="psa-resp-cab"><label><input type="checkbox" class="psa-sel" value="${r.id}"> <b>${esc(r.nome || 'Mentor')}</b> <span>${esc(r.email || '')}</span>${r.plano ? ` <span class="psa-tag">${esc(r.plano)}</span>` : ''}</label>
        <span>${fmtData(r.criado_em)}${r.conta ? '' : ` · reenviada em ${fmtData(r.reenviada_em)} (fora das contas)`}</span></div>
      ${c.perguntas.filter(q => r.respostas[q.id] != null).map(q => `<div class="psa-resp-l ${q.tipo === 'aberta' ? 'ab' : ''}"><div>${esc(q.texto)}</div>${valor(q, r.respostas[q.id])}</div>`).join('')}
      <div class="psa-resp-ac">${r.conta && c.id === dados.ativa ? `<button type="button" onclick="AdmPesquisa.reenviar(['${r.id}'])">Reenviar para este mentor</button>` : ''}<button type="button" class="perigo" onclick="AdmPesquisa.excluir(['${r.id}'])">Excluir resposta</button></div>
    </div>`).join('');
    alvo.innerHTML = rodada + `
      <div class="psa-stats"><div class="psa-stat" style="--c:#5B2DA3"><div class="n">${lista.length}</div><div class="l">Respostas válidas nesta rodada</div></div>
        <div class="psa-stat" style="--c:#94A3B8"><div class="n">${todas.length - lista.length}</div><div class="l">Reenviadas (histórico)</div></div></div>
      <div class="psa-grid">${graficos}</div>
      <div class="psa-card"><div class="psa-card-cab"><h3>Respostas (${visiveis.length})</h3><input id="psa-busca" type="search" placeholder="Buscar por mentor, e-mail ou texto" value="${esc(busca)}"></div>
        ${todas.length ? `<div class="psa-massa"><label><input type="checkbox" onchange="document.querySelectorAll('.psa-sel').forEach(x => x.checked = this.checked)"> Selecionar todas</label>
          ${c.id === dados.ativa ? '<button type="button" onclick="AdmPesquisa.reenviarSelecionadas()">Reenviar para os selecionados</button>' : ''}
          <button type="button" class="perigo" onclick="AdmPesquisa.excluirSelecionadas()">Excluir selecionadas</button></div>` : ''}
        ${cards || '<div class="psa-vazio-p">Nenhuma resposta nesta rodada ainda.</div>'}</div>`;
    const bx = $('psa-busca');
    if (bx) bx.oninput = e => { busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const nb = $('psa-busca'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); } };
  }

  const selecionadas = () => Array.from(document.querySelectorAll('.psa-sel:checked')).map(x => x.value);
  async function excluir(ids) {
    if (!ids.length) { alert('Selecione ao menos uma resposta.'); return; }
    if (!confirm(`Excluir ${ids.length === 1 ? 'esta resposta' : ids.length + ' respostas'} de vez?\n\nSe a rodada estiver ativa, ${ids.length === 1 ? 'o mentor volta' : 'os mentores voltam'} a receber a pesquisa.`)) return;
    try { await rpc('mentora_pesquisa_admin_excluir', { p_ids: ids }); await carregar(); } catch (e) { alert('Não foi possível excluir: ' + e.message); }
  }
  async function reenviar(ids) {
    if (!ids.length) { alert('Selecione ao menos uma resposta.'); return; }
    if (!confirm(`Reenviar a pesquisa para ${ids.length === 1 ? 'este mentor' : ids.length + ' mentores'}?\n\nA resposta atual fica guardada no histórico (fora das contas) e a pesquisa volta a aparecer na próxima vez que ${ids.length === 1 ? 'ele abrir' : 'eles abrirem'} a Área do Mentor.`)) return;
    try { const n = await rpc('mentora_pesquisa_admin_reenviar', { p_ids: ids }); await carregar(); alert(`Pesquisa reenviada para ${n} ${n === 1 ? 'mentor' : 'mentores'}.`); } catch (e) { alert('Não foi possível reenviar: ' + e.message); }
  }
  async function encerrar() {
    if (!confirm('Encerrar a rodada ativa agora? A pesquisa para de aparecer para os mentores. As respostas continuam guardadas.')) return;
    try { await rpc('mentora_pesquisa_admin_encerrar'); await carregar(); } catch (e) { alert('Não foi possível encerrar: ' + e.message); }
  }

  // ── Editor de nova rodada ──
  const novoId = () => 'p' + Math.random().toString(36).slice(2, 9);
  function novaRodada() {
    const base = campanha() || (dados.campanhas || [])[0];
    editor = { titulo: base ? base.titulo : 'Pesquisa Mentóra', duracao_meses: 12, incluir_quem_ja_respondeu: false,
      perguntas: base ? JSON.parse(JSON.stringify(base.perguntas)) : [{ id: novoId(), tipo: 'escala', obrigatoria: true, texto: '' }] };
    desenharEditor();
  }
  function desenharEditor() {
    let m = $('psa-editor');
    if (!m) { m = document.createElement('div'); m.id = 'psa-editor'; m.className = 'psa-modal'; document.body.appendChild(m); }
    const e = editor;
    m.innerHTML = `<div class="psa-modal-caixa"><div class="psa-modal-cab"><h3>Nova rodada da pesquisa</h3><button type="button" onclick="AdmPesquisa.fecharEditor()">&times;</button></div>
      <div class="psa-modal-corpo">
        <label class="psa-l">Título que o mentor vê<input id="psa-e-tit" value="${esc(e.titulo)}" maxlength="120"></label>
        <div class="psa-linha">
          <label class="psa-l">A pesquisa fica ativa por<select id="psa-e-dur"><option value="6" ${e.duracao_meses === 6 ? 'selected' : ''}>6 meses</option><option value="12" ${e.duracao_meses === 12 ? 'selected' : ''}>1 ano</option></select></label>
          <label class="psa-chk"><input type="checkbox" id="psa-e-inc" ${e.incluir_quem_ja_respondeu ? 'checked' : ''}> Enviar também para quem já respondeu rodadas anteriores</label>
        </div>
        <div class="psa-nota">Ao salvar, a rodada atual é encerrada (as respostas continuam guardadas) e esta passa a valer. Mentores cadastrados há menos de 15 dias recebem quando completarem 15 dias.</div>
        <div id="psa-e-lista">${e.perguntas.map((q, i) => `<div class="psa-e-q">
          <div class="psa-e-q-cab"><b>${i + 1}</b><select onchange="AdmPesquisa.ed(${i}, 'tipo', this.value)">${Object.keys(TIPOS).map(t => `<option value="${t}" ${q.tipo === t ? 'selected' : ''}>${TIPOS[t]}</option>`).join('')}</select>
            <label class="psa-chk"><input type="checkbox" ${q.obrigatoria ? 'checked' : ''} onchange="AdmPesquisa.ed(${i}, 'obrigatoria', this.checked)"> Obrigatória</label>
            <span class="psa-e-mv"><button type="button" title="Subir" onclick="AdmPesquisa.mover(${i}, -1)">↑</button><button type="button" title="Descer" onclick="AdmPesquisa.mover(${i}, 1)">↓</button><button type="button" class="perigo" title="Remover" onclick="AdmPesquisa.remover(${i})">Remover</button></span></div>
          <textarea placeholder="Texto da pergunta" oninput="AdmPesquisa.ed(${i}, 'texto', this.value)">${esc(q.texto)}</textarea>
          ${q.tipo === 'unica' || q.tipo === 'multipla' ? `<label class="psa-l">Opções (uma por linha)<textarea class="psa-e-ops" oninput="AdmPesquisa.ed(${i}, 'opcoes', this.value)">${esc((q.opcoes || []).join('\n'))}</textarea></label>` : ''}
          ${q.tipo === 'multipla' ? `<label class="psa-l psa-l-curto">Máximo de opções que o mentor pode marcar<input type="number" min="1" max="20" value="${q.max || 3}" oninput="AdmPesquisa.ed(${i}, 'max', this.value)"></label>` : ''}
        </div>`).join('')}</div>
        <button type="button" class="psa-btn" onclick="AdmPesquisa.adicionar()">+ Adicionar pergunta</button>
      </div>
      <div class="psa-modal-rod"><button type="button" class="psa-btn" onclick="AdmPesquisa.fecharEditor()">Cancelar</button><button type="button" class="psa-btn pri" id="psa-e-salvar" onclick="AdmPesquisa.salvarRodada()">Salvar e iniciar rodada</button></div></div>`;
    m.style.display = 'flex';
  }
  function lerTopo() { if (!editor) return; const t = $('psa-e-tit'), d = $('psa-e-dur'), inc = $('psa-e-inc'); if (t) editor.titulo = t.value; if (d) editor.duracao_meses = Number(d.value); if (inc) editor.incluir_quem_ja_respondeu = inc.checked; }
  function ed(i, campo, v) {
    const q = editor.perguntas[i]; if (!q) return;
    if (campo === 'opcoes') q.opcoes = String(v).split('\n').map(x => x.trim()).filter(Boolean);
    else if (campo === 'max') q.max = Math.max(1, parseInt(v, 10) || 1);
    else q[campo] = v;
    if (campo === 'tipo') { lerTopo(); if ((v === 'unica' || v === 'multipla') && !q.opcoes) q.opcoes = []; if (v === 'multipla' && !q.max) q.max = 3; desenharEditor(); }
  }
  function mover(i, d) { lerTopo(); const p = editor.perguntas, j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; desenharEditor(); }
  function remover(i) { lerTopo(); if (editor.perguntas.length <= 1) { alert('A pesquisa precisa de pelo menos 1 pergunta.'); return; } editor.perguntas.splice(i, 1); desenharEditor(); }
  function adicionar() { lerTopo(); editor.perguntas.push({ id: novoId(), tipo: 'aberta', obrigatoria: false, texto: '' }); desenharEditor(); setTimeout(() => { const l = $('psa-e-lista'); if (l && l.lastElementChild) l.lastElementChild.scrollIntoView({ behavior: 'smooth' }); }, 50); }
  function fecharEditor() { const m = $('psa-editor'); if (m) m.style.display = 'none'; editor = null; }
  async function salvarRodada() {
    lerTopo();
    const p = editor.perguntas.map(q => Object.assign({ id: q.id || novoId(), tipo: q.tipo, obrigatoria: !!q.obrigatoria, texto: String(q.texto || '').trim() },
      q.tipo === 'unica' || q.tipo === 'multipla' ? { opcoes: q.opcoes || [] } : {}, q.tipo === 'multipla' ? { max: q.max || 3 } : {}));
    const vazia = p.findIndex(q => !q.texto); if (vazia >= 0) { alert(`Escreva o texto da pergunta ${vazia + 1}.`); return; }
    const semOp = p.findIndex(q => (q.tipo === 'unica' || q.tipo === 'multipla') && q.opcoes.length < 2); if (semOp >= 0) { alert(`A pergunta ${semOp + 1} precisa de pelo menos 2 opções.`); return; }
    if (!confirm(`Iniciar a nova rodada por ${editor.duracao_meses === 6 ? '6 meses' : '1 ano'}?\n\nA rodada atual será encerrada${editor.incluir_quem_ja_respondeu ? ' e todos os mentores (inclusive quem já respondeu) vão receber a nova pesquisa' : '; quem já respondeu uma rodada anterior não recebe esta'}.`)) return;
    const btn = $('psa-e-salvar'); btn.disabled = true; btn.textContent = 'Salvando...';
    try { campSel = await rpc('mentora_pesquisa_admin_nova_rodada', { p: { titulo: editor.titulo, duracao_meses: editor.duracao_meses, incluir_quem_ja_respondeu: editor.incluir_quem_ja_respondeu, perguntas: p } }); fecharEditor(); await carregar(); }
    catch (e) { btn.disabled = false; btn.textContent = 'Salvar e iniciar rodada'; alert('Não foi possível salvar: ' + e.message); }
  }

  function csv() {
    const c = dados && campanha(); if (!c) { alert('Nenhuma rodada para exportar.'); return; }
    const lista = respostasDa(c, true); if (!lista.length) { alert('Nenhuma resposta nesta rodada.'); return; }
    const cel = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cab = ['Data', 'Mentor', 'E-mail', 'Plano', 'Situação'].concat(c.perguntas.map(q => q.texto));
    const linhas = [cab.map(cel).join(';')].concat(lista.map(r => [fmtData(r.criado_em), r.nome, r.email, r.plano, r.conta ? 'válida' : 'reenviada']
      .concat(c.perguntas.map(q => { const v = r.respostas[q.id]; return Array.isArray(v) ? v.join(', ') : v; })).map(cel).join(';')));
    const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pesquisa-mentores-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function estilos() {
    if ($('psa-estilos')) return;
    const st = document.createElement('style'); st.id = 'psa-estilos';
    st.textContent = `
    .psa{display:flex;flex-direction:column;gap:1.25rem}
    #psa-conteudo{display:flex;flex-direction:column;gap:1rem}
    .psa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}
    .psa-head h2{margin:0 0 6px;font-family:'Playfair Display',serif;font-size:24px;color:#1B2559}
    .psa-head p{margin:0;color:#64748B;font-size:14px;line-height:1.5;max-width:760px}
    .psa-acoes,.psa-botoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .psa select,#psa-busca,.psa-modal select,.psa-modal input:not([type=checkbox]),.psa-modal textarea{border:1px solid #E2E8F0;border-radius:10px;padding:8px 12px;font-size:14px;font-family:inherit;background:#fff;color:#1E293B;box-sizing:border-box}
    .psa-rodada select{margin-top:6px;max-width:100%}
    .psa-btn{background:#fff;border:1px solid #D6CCF0;color:#5B2DA3;border-radius:10px;padding:8px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
    .psa-btn.pri{background:#5B2DA3;border-color:#5B2DA3;color:#fff}.psa-btn:disabled{opacity:.6;cursor:wait}
    .psa-info{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;font-size:13.5px;color:#475569;margin-top:10px}
    .psa-st{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:#F1F5F9;color:#475569}.psa-st.on{background:#DCFCE7;color:#166534}
    .psa-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
    .psa-stat{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:1.1rem 1.25rem;border-top:4px solid var(--c)}
    .psa-stat .n{font-size:30px;font-weight:800;color:#1E293B;line-height:1.1}.psa-stat .l{font-size:12.5px;font-weight:600;color:#64748B;margin-top:4px}
    .psa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
    .psa-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:1.4rem}
    .psa-card h3{margin:0 0 12px;font-size:15.5px;color:#1B2559;line-height:1.4}
    .psa-card-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;margin-bottom:6px}.psa-card-cab h3{margin:0}
    .psa-bar{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13.5px;color:#334155}
    .psa-bar-n{width:200px;flex-shrink:0}
    .psa-trilho{flex:1;height:8px;background:#EEF0F4;border-radius:6px;overflow:hidden}.psa-trilho div{height:100%;background:#5B2DA3;border-radius:6px}
    .psa-bar-v{width:78px;text-align:right;font-weight:600}.psa-bar-v em{font-style:normal;font-weight:400;color:#94A3B8}
    .psa-media,.psa-nps{font-size:14px;color:#475569;margin-bottom:6px}.psa-media b,.psa-nps b{font-size:22px;color:#1E293B}.psa-media span,.psa-nps span{color:#94A3B8;font-size:12.5px}
    .psa-dist{display:flex;gap:6px;align-items:flex-end;margin-top:8px}
    .psa-dist>div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11.5px;color:#64748B}
    .psa-dist-c{height:70px;width:100%;background:#F4F1FB;border-radius:4px;display:flex;align-items:flex-end;overflow:hidden}.psa-dist-c div{width:100%;background:#5B2DA3}
    .psa-massa{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13.5px;color:#475569;margin:8px 0}
    .psa-massa button,.psa-resp-ac button{background:#fff;border:1px solid #D6CCF0;color:#5B2DA3;border-radius:8px;padding:5px 10px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
    .psa .perigo,.psa-modal .perigo{border-color:#FECACA !important;color:#B91C1C !important}
    .psa-resp{border:1px solid #EEF0F5;border-radius:12px;padding:14px 16px;margin-top:10px}
    .psa-resp.reenviada{background:#F8FAFC;opacity:.8}
    .psa-resp-cab{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px;color:#1E293B}.psa-resp-cab span{color:#64748B;font-size:13px}
    .psa-resp-l{display:flex;gap:10px;align-items:baseline;font-size:13.5px;color:#334155;margin-top:8px;flex-wrap:wrap}
    .psa-resp-l>div{color:#64748B;flex:0 1 420px}
    .psa-resp-l.ab{display:block;border-left:3px solid #D6CCF0;padding-left:10px}.psa-resp-l.ab>div{font-size:12.5px;font-weight:600;color:#5B2DA3}
    .psa-resp-l p{margin:3px 0 0;white-space:pre-wrap;line-height:1.5}
    .psa-resp-ac{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
    .psa-tag{display:inline-block;background:#F1ECFB;color:#4C1D95;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
    .psa-vazio,.psa-vazio-p{color:#64748B;font-size:14px;padding:8px 0}
    .psa-modal{position:fixed;inset:0;background:rgba(15,23,42,.5);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .psa-modal-caixa{background:#fff;border-radius:18px;width:100%;max-width:820px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
    .psa-modal-cab,.psa-modal-rod{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid #EEF0F5}
    .psa-modal-rod{border-bottom:none;border-top:1px solid #EEF0F5;justify-content:flex-end}
    .psa-modal-cab h3{margin:0;font-family:'Playfair Display',serif;color:#1B2559;font-size:20px}
    .psa-modal-cab button{background:none;border:none;font-size:26px;color:#94A3B8;cursor:pointer}
    .psa-modal-corpo{overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:12px}
    .psa-l{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#475569}.psa-l-curto input{max-width:120px}
    .psa-linha{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
    .psa-chk{display:flex;gap:7px;align-items:center;font-size:13.5px;color:#334155;cursor:pointer}
    .psa-nota{font-size:12.5px;color:#64748B;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:10px;padding:8px 12px;line-height:1.5}
    .psa-e-q{border:1px solid #E2E8F0;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;background:#FBFBFE;margin-bottom:10px}
    .psa-e-q-cab{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.psa-e-q-cab>b{width:24px;height:24px;border-radius:50%;background:#F1ECFB;color:#5B2DA3;display:flex;align-items:center;justify-content:center;font-size:12.5px}
    .psa-e-q textarea{min-height:52px;resize:vertical;width:100%}.psa-e-ops{min-height:90px !important}
    .psa-e-mv{margin-left:auto;display:flex;gap:6px}.psa-e-mv button{background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:4px 9px;cursor:pointer;font-family:inherit;font-size:12.5px}
    @media (max-width:900px){.psa-grid,.psa-stats{grid-template-columns:1fr}.psa-bar-n{width:130px}}`;
    document.head.appendChild(st);
  }

  window.AdmPesquisa = { carregar, csv, novaRodada, encerrar, excluir, reenviar, ed, mover, remover, adicionar, fecharEditor, salvarRodada,
    trocar: id => { campSel = id; desenhar(); },
    excluirSelecionadas: () => excluir(selecionadas()), reenviarSelecionadas: () => reenviar(selecionadas()) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarAba); else montarAba();
})();
