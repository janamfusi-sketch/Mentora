// ── Proteção: textos digitados (nomes, compromissos, post-its) entram na página como TEXTO, nunca como código ──
function vlEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function vlEscJs(v) { return vlEsc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function vlCor(v) { return /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d\s.,%]+\)$|^[a-zA-Z]{3,20}$/.test(String(v || '').trim()) ? String(v).trim() : '#4F46E5'; }
// ════ LÓGICA DA ÁREA VIP (MENTORES) ════
// Fase 7.3: o prontuário antigo deste arquivo (notas VIP, histórico e testes guardados no navegador)
// foi removido. O prontuário em uso é o do clean_prontuario.js, que salva tudo no banco.

// ── HELPERS DE PERSISTÊNCIA NA NUVEM (dados no nível da mentora, não por mentorado) ──
async function mentoraSalvarCampo(campo, valor) {
 if (!window.supabaseClient || !window.mentorId) return false;
 try {
 const payload = {};
 payload[campo] = valor;
 const { data, error } = await window.supabaseClient.from('Usuarios').update(payload).eq('id', window.mentorId).select('id');
 if (error) throw error;
 if (!data || !data.length) throw new Error('o banco não confirmou a gravação no seu cadastro');
 return true;
 } catch (e) {
 console.error('Erro ao salvar ' + campo + ' no Supabase:', e);
 alert('Não foi possível salvar agora. Verifique a internet e tente de novo.\n\nDetalhe: ' + (e.message || e));
 return false;
 }
}

// Agenda e post-its ficam só na memória desta página, carregados do banco (nada é gravado no navegador)
window.vlAgenda = window.vlAgenda || [];
window.vlPostits = window.vlPostits || [];
let vlNotificados = [];
// limpa sobras de versões antigas que guardavam cópias no navegador
['mentora_agenda_eventos', 'mentora_postits', 'notificados_agenda', 'mentora_test_clinico', 'mentora_test_lideranca', 'mentora_testes', 'mentora_frameworks'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
try { Object.keys(localStorage).forEach(k => { if (/^(vip_notes_|mentora_history_)/.test(k)) localStorage.removeItem(k); }); } catch (e) {}

// Alteração segura: busca a versão mais nova no banco, aplica a mudança e grava.
// Assim uma mudança feita em outro aparelho não é apagada por uma cópia antiga desta página.
async function vlAlterarLista(campo, mudar) {
 const atual = await mentoraCarregarCampo(campo);
 if (atual === null) { alert('Não foi possível carregar seus dados agora. Verifique a internet e tente de novo.'); return null; }
 const lista = mudar(Array.isArray(atual) ? atual.slice() : []);
 const ok = await mentoraSalvarCampo(campo, lista);
 return ok ? lista : null;
}

async function mentoraCarregarCampo(campo) {
 if (!window.supabaseClient || !window.mentorId) return null;
 try {
 const { data, error } = await window.supabaseClient.from('Usuarios').select(campo).eq('id', window.mentorId).single();
 if (error) throw error;
 if (!data) return null;
 // campo ainda vazio no banco (conta nova, nunca salvou) = lista vazia, não é erro
 return data[campo] == null ? [] : data[campo];
 } catch (e) {
 console.error('Erro ao carregar ' + campo + ' do Supabase:', e);
 return null;
 }
}

// ── EU MENTOR: AGENDA E POST-ITS ──

function abrirEuMentor() {
  ['subtab-content-ferramentas-rodavida', 'subtab-content-ferramentas-smart', 'subtab-content-ferramentas-swot', 'subtab-content-ferramentas-disc'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });


  const teleIframe = document.getElementById('area-telemetria-iframe'); if(teleIframe) teleIframe.style.display = 'none';

 document.getElementById('area-vip').style.display = 'none';
 const fwDash = document.getElementById('frameworks-dashboard');
 if(fwDash) fwDash.style.display = 'none';
 const metoMentora = document.getElementById('area-metodologia-mentora');
 if(metoMentora) metoMentora.style.display = 'none';
 const minhaMeto = document.getElementById('area-minha-metodologia');
 if(minhaMeto) minhaMeto.style.display = 'none';
 const configArea = document.getElementById('area-configuracoes');
 if(configArea) configArea.style.display = 'none';
 const ferArea = document.getElementById('area-ferramentas');
 if(ferArea) ferArea.style.display = 'none';
 document.getElementById('eu-mentor-dashboard').style.display = 'block';
 
 renderizarAgenda();
 carregarPostIts();
}

// irParaGestaoMentorados(): a versão única fica no HTML da página (esta cópia duplicada foi removida)

function abrirFrameworks() { if(typeof verificarPermissaoFrameworks === "function" && !verificarPermissaoFrameworks()) return;
  ['subtab-content-ferramentas-rodavida', 'subtab-content-ferramentas-smart', 'subtab-content-ferramentas-swot', 'subtab-content-ferramentas-disc'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
  const teleIframe = document.getElementById('area-telemetria-iframe'); if(teleIframe) teleIframe.style.display = 'none';
 document.getElementById('area-vip').style.display = 'none';
 document.getElementById('eu-mentor-dashboard').style.display = 'none';
 const metoMentora = document.getElementById('area-metodologia-mentora');
 if(metoMentora) metoMentora.style.display = 'none';
 const minhaMeto = document.getElementById('area-minha-metodologia');
 if(minhaMeto) minhaMeto.style.display = 'none';
 const configArea = document.getElementById('area-configuracoes');
 if(configArea) configArea.style.display = 'none';
 const ferArea = document.getElementById('area-ferramentas');
 if(ferArea) ferArea.style.display = 'none';
 const fwDash = document.getElementById('frameworks-dashboard');
 if(fwDash) fwDash.style.display = 'block';

 carregarFrameworksDaMemoria();
}

async function carregarFrameworksDaMemoria() {
 const listaLideranca = document.getElementById('lista-lideranca');
 const listaVendas = document.getElementById('lista-vendas');
 const listaVida = document.getElementById('lista-vida');
 
 if(listaLideranca) listaLideranca.innerHTML = '<div style="color:#64748b; font-size:13px; margin-top:10px;">Carregando do Supabase...</div>';
 if(listaVendas) listaVendas.innerHTML = '<div style="color:#64748b; font-size:13px; margin-top:10px;">Carregando do Supabase...</div>';
 if(listaVida) listaVida.innerHTML = '<div style="color:#64748b; font-size:13px; margin-top:10px;">Carregando do Supabase...</div>';
 
 try {
 const { data: rawData, error } = await window.supabaseClient
 .from('Metodologias_Admin')
 .select('*')
 .order('created_at', { ascending: false });
 
 if (error) throw error;
 
 let frameworks = (rawData || []).filter(c => 
 c.categoria && c.categoria.toLowerCase().includes('framework')
 );

 // ordem definida pela administração (coluna "ordem"); sem ordem, os mais novos primeiro
 frameworks.sort((a, b) => (typeof a.ordem === 'number' ? a.ordem : 1e9) - (typeof b.ordem === 'number' ? b.ordem : 1e9));

 if(listaLideranca) listaLideranca.innerHTML = '';
 if(listaVendas) listaVendas.innerHTML = '';
 if(listaVida) listaVida.innerHTML = '';
 
 frameworks.forEach(fw => {
 // Usa a função existente visualizarMetodologiaAdmin para abrir no modal
 const itemHtml = `
 <div onclick="visualizarMetodologiaAdmin('${vlEscJs(fw.titulo)}', '${vlEscJs(fw.file_url)}')" style="background:#F8FAFC; border:1px solid rgba(0,0,0,0.05); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:0.2s; margin-bottom:8px; width:100%; box-sizing:border-box; overflow:hidden;" onmouseover="this.style.borderColor='var(--purple)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='rgba(0,0,0,0.05)'; this.style.transform='translateY(0)';"><div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1; margin-right:8px;"><div style="min-width:0; flex:1;"><div style="font-weight:600; font-size:14px; color:var(--text); word-break:break-word; line-height:1.3;">${fw.titulo}</div>
 <div style="font-size:12px; color:var(--text-muted); word-break:break-all; margin-top:2px;">${fw.nomeArquivo || fw.categoria}</div>
 </div>
 </div>
 <div style="color:var(--purple); font-size:12px; font-weight:600; background:#f3e8ff; padding:6px 12px; border-radius:20px; flex-shrink:0; white-space:nowrap;">Visualizar &rarr;</div>
 </div>
 `;
 
 const catLow = (fw.categoria || '').toLowerCase();
 if ((catLow.includes('liderança') || catLow.includes('executiv') || catLow === 'framework liderança') && listaLideranca) {
 listaLideranca.innerHTML += itemHtml;
 } else if ((catLow.includes('venda') || catLow.includes('performance') || catLow === 'framework vendas') && listaVendas) {
 listaVendas.innerHTML += itemHtml;
 } else if ((catLow.includes('vida') || catLow.includes('carreira') || catLow === 'framework vida') && listaVida) {
 listaVida.innerHTML += itemHtml;
 } else if (listaLideranca) {
 listaLideranca.innerHTML += itemHtml;
 }
 });
 
 if(listaLideranca && listaLideranca.innerHTML === '') listaLideranca.innerHTML = '<i style="color:#94a3b8; font-size:13px;">Nenhum framework disponível.</i>';
 if(listaVendas && listaVendas.innerHTML === '') listaVendas.innerHTML = '<i style="color:#94a3b8; font-size:13px;">Nenhum framework disponível.</i>';
 if(listaVida && listaVida.innerHTML === '') listaVida.innerHTML = '<i style="color:#94a3b8; font-size:13px;">Nenhum framework disponível.</i>';
 
 } catch (err) {
 console.error("Erro ao carregar frameworks do Supabase:", err);
 if(listaLideranca) listaLideranca.innerHTML = '<div style="color:#ef4444; font-size:13px;">Erro de conexão com o banco de dados.</div>';
 }
}

function abrirModalMentee(id) {
 // Não implementado no mockup principal ainda
}

function mostrarAlertaVIP(mensagem) {
 const toast = document.createElement('div');
 toast.style.position = 'fixed';
 toast.style.top = '20px';
 toast.style.right = '20px';
 toast.style.background = '#ef4444';
 toast.style.color = '#fff';
 toast.style.padding = '16px 24px';
 toast.style.borderRadius = '8px';
 toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
 toast.style.zIndex = '10000';
 toast.style.fontWeight = '600';
 toast.style.fontFamily = "'Inter', sans-serif";
 toast.style.transition = '0.3s';
 toast.style.animation = 'slideInToast 0.3s ease forwards';
 toast.textContent = mensagem;

 // Add keyframes if not exists
 if (!document.getElementById('toast-styles')) {
 const style = document.createElement('style');
 style.id = 'toast-styles';
 style.innerHTML = `
 @keyframes slideInToast {
 from { transform: translateX(100%); opacity: 0; }
 to { transform: translateX(0); opacity: 1; }
 }
 `;
 document.head.appendChild(style);
 }

 document.body.appendChild(toast);

 setTimeout(() => {
 toast.style.opacity = '0';
 toast.style.transform = 'translateY(-20px)';
 setTimeout(() => toast.remove(), 300);
 }, 4000);
}

// A Agenda do Mentor (calendário com datas) fica no fim deste arquivo.

// ── LÓGICA DOS POST-ITS ──
const postItColors = ['#FDFBAA', '#BAE6FD', '#FBCFE8', '#A7F3D0'];

async function carregarPostIts() {
 const container = document.getElementById('postits-container');
 if(!container) return;
 
 const doBanco = await mentoraCarregarCampo('postits');
 if (Array.isArray(doBanco)) window.vlPostits = doBanco;
 const postits = window.vlPostits;
 let html = '';
 
 postits.forEach(p => {
 html += gerarHTMLPostIt(p.id, p.texto, p.cor);
 });
 
 if(postits.length === 0) {
 html = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding: 2rem;">Nenhuma anotação. Clique em + Novo Post-it.</div>`;
 }
 
 container.innerHTML = html;
}

function gerarHTMLPostIt(id, texto, cor) {
 return `
 <div id="postit-${id}" style="background: ${cor}; padding: 1rem; border-radius: 4px; box-shadow: 2px 4px 10px rgba(0,0,0,0.1); position: relative; transition: transform 0.2s;"><textarea id="texto-${id}" style="width: 100%; background: transparent; border: none; resize: none; min-height: 120px; font-family: 'Inter', sans-serif; font-size: 14px; color: #333;" placeholder="Escreva algo...">${vlEsc(texto)}</textarea>
 <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;"><button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; color: #166534; border-color: #166534;" onclick="salvarPostIt('${id}')">Salvar</button>
 <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; color: #ef4444; border-color: #ef4444;" onclick="removerPostIt('${id}')">Remover</button>
 </div>
 </div>
 `;
}

async function adicionarPostIt() {
 const novoId = Date.now().toString();
 const corAleatoria = postItColors[Math.floor(Math.random() * postItColors.length)];
 const salva = await vlAlterarLista('postits', l => { l.unshift({ id: novoId, texto: '', cor: corAleatoria }); return l; });
 if (!salva) return;
 window.vlPostits = salva;
 
 carregarPostIts();
}

async function salvarPostIt(id) {
 const textarea = document.getElementById('texto-'+id);
 if(!textarea) return;
 
 const texto = textarea.value;
 let achou = false;
 const salva = await vlAlterarLista('postits', l => l.map(p => { if (p.id === id) { achou = true; return Object.assign({}, p, { texto: texto }); } return p; }));
 if (salva) {
 window.vlPostits = salva;
 alert(achou ? 'Post-it salvo!' : 'Este post-it foi apagado em outro aparelho.');
 if (!achou) carregarPostIts();
 }
}

async function removerPostIt(id) {
 if(!confirm('Deseja excluir este post-it?')) return;
 
 const salva = await vlAlterarLista('postits', l => l.filter(p => p.id !== id));
 if (!salva) return;
 window.vlPostits = salva;
 
 carregarPostIts();
}

// ── SISTEMA DE NOTIFICAÇÕES (AGENDA) ──

// O aviso aparece no canto da tela e fica até o mentor fechar. Se a aba do site estiver
// em segundo plano e o navegador tiver permissão, também sai uma notificação do sistema.
function mostrarNotificacaoAgenda(texto) {
 let popup = document.getElementById('agx-alerta');
 if (!popup) {
  popup = document.createElement('div'); popup.id = 'agx-alerta'; popup.className = 'agx-alerta';
  popup.setAttribute('role', 'alert');
  document.body.appendChild(popup);
 }
 popup.innerHTML = `<div class="agx-alerta-cab"><span class="agx-alerta-ico">${typeof AG_SINO !== 'undefined' ? AG_SINO : ''}</span><b>Lembrete da agenda</b><button type="button" class="agx-x" onclick="fecharNotificacaoAgenda()" aria-label="Fechar">&times;</button></div>
  <div class="agx-alerta-txt">${String(texto).replace(/\n/g, '<br>')}</div>
  <button type="button" class="agx-alerta-ver" onclick="fecharNotificacaoAgenda(); if (typeof abrirEuMentor === 'function') abrirEuMentor();">Ver na agenda</button>`;
 popup.classList.add('on');
 const audio = document.getElementById('som-notificacao');
 if (audio) audio.play().catch(() => {});
 try {
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
   const tmp = document.createElement('div'); tmp.innerHTML = String(texto).replace(/\n/g, ' ');
   new Notification('Mentóra · Lembrete da agenda', { body: tmp.textContent.trim().slice(0, 180) });
  }
 } catch (e) {}
}

function fecharNotificacaoAgenda() {
 const popup = document.getElementById('agx-alerta');
 if (popup) popup.classList.remove('on');
}
// Pede permissão de notificação do navegador uma vez (ao salvar o primeiro compromisso)
function agPedirPermissaoAviso() {
 try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}


// ════════════════════════════════════════════════════════════════════
// AGENDA DO MENTOR — calendário com datas (03/10/2026)
// O mentor escolhe o dia no calendário e define o horário de início e de término.
// Formato de cada compromisso (coluna Usuarios.agenda_eventos):
//   { id, data:'AAAA-MM-DD', inicio:'HH:MM', fim:'HH:MM', titulo, mentorado_id, mentorado_nome, obs, cor }
// Compromissos antigos (da agenda semanal, sem data: { dia:'seg', hora, minuto }) continuam
// aparecendo, como compromisso que se repete toda semana naquele dia.
// ════════════════════════════════════════════════════════════════════
const AG_CORES = ['#5B2DA3', '#4F46E5', '#0E7490', '#047857', '#B45309', '#BE185D'];
const AG_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const AG_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const AG_DIA_LEGADO = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const agEstado = { ano: null, mes: null, dia: null, editando: null };

function agPad(n) { return String(n).padStart(2, '0'); }
function agIso(d) { return d.getFullYear() + '-' + agPad(d.getMonth() + 1) + '-' + agPad(d.getDate()); }
function agDeIso(iso) { const [a, m, d] = String(iso).split('-').map(Number); return new Date(a, (m || 1) - 1, d || 1); }
function agHoraDe(ev) { return ev.inicio || ((ev.hora != null ? agPad(parseInt(ev.hora, 10) || 0) : '00') + ':' + agPad(parseInt(ev.minuto, 10) || 0)); }
function agEhLegado(ev) { return !ev.data && ev.dia && AG_DIA_LEGADO[ev.dia] != null; }
// Compromissos de um dia (inclui os semanais antigos), em ordem de horário
function agEventosDoDia(iso) {
 const d = agDeIso(iso);
 return (window.vlAgenda || []).filter(ev => ev && (ev.data === iso || (agEhLegado(ev) && AG_DIA_LEGADO[ev.dia] === d.getDay())))
  .sort((a, b) => agHoraDe(a).localeCompare(agHoraDe(b)));
}
function agDataLonga(iso) {
 const d = agDeIso(iso);
 const sem = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][d.getDay()];
 return `${sem}, ${d.getDate()} de ${AG_MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
window.mentoraAgendaEventosDoDia = agEventosDoDia;
window.mentoraAgendaHoraDe = agHoraDe;

async function renderizarAgenda() {
 const raiz = document.getElementById('agenda-grid');
 if (!raiz) return;
 const hoje = new Date();
 if (agEstado.ano == null) { agEstado.ano = hoje.getFullYear(); agEstado.mes = hoje.getMonth(); agEstado.dia = agIso(hoje); }
 const doBanco = await mentoraCarregarCampo('agenda_eventos');
 if (Array.isArray(doBanco)) window.vlAgenda = doBanco;
 agDesenhar();
}

// Ícone de lembrete (sino)
const AG_SINO = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

// Calendário do mês. Clicar no dia abre o formulário de novo compromisso para aquela data.
// Dia com compromisso mostra o sino com a quantidade; clicar no sino abre a lista do dia.
function agDesenhar() {
 const raiz = document.getElementById('agenda-grid'); if (!raiz) return;
 const hojeIso = agIso(new Date());
 const primeiro = new Date(agEstado.ano, agEstado.mes, 1);
 const inicio = new Date(primeiro); inicio.setDate(1 - primeiro.getDay());
 let celulas = '';
 for (let i = 0; i < 42; i++) {
  const d = new Date(inicio); d.setDate(inicio.getDate() + i);
  const iso = agIso(d);
  const evs = agEventosDoDia(iso);
  const fora = d.getMonth() !== agEstado.mes;
  const rotulo = agDataLonga(iso) + (evs.length ? ', ' + evs.length + (evs.length === 1 ? ' compromisso' : ' compromissos') : ', sem compromissos');
  const prev = evs.slice(0, 2).map(ev => `<span class="agx-prev"><b>${vlEsc(agHoraDe(ev))}</b> ${vlEsc(ev.titulo)}</span>`).join('') + (evs.length > 2 ? `<span class="agx-prev mais">+${evs.length - 2} mais</span>` : '');
  const sino = evs.length ? `<button type="button" class="agx-sino${iso === hojeIso ? ' hoje' : ''}" onclick="event.stopPropagation(); agAbrirLista('${iso}')" title="Ver compromissos deste dia" aria-label="Ver ${evs.length} compromisso(s) de ${vlEsc(agDataLonga(iso))}">${AG_SINO}<span class="agx-qtd">${evs.length}</span></button>` : '';
  celulas += `<div class="agx-cel${fora ? ' fora' : ''}${iso === hojeIso ? ' hoje' : ''}${evs.length ? ' tem' : ''}" role="button" tabindex="0" onclick="agClicarDia('${iso}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();agClicarDia('${iso}')}" aria-label="${vlEsc(rotulo)}. Clique para agendar.">
   <div class="agx-topo"><span class="agx-num">${d.getDate()}</span>${sino}</div>
   ${evs.length ? `<div class="agx-prevs" onclick="event.stopPropagation(); agAbrirLista('${iso}')">${prev}</div>` : ''}
  </div>`;
 }
 raiz.innerHTML = `
  <div class="agx">
   <div class="agx-cab">
    <button type="button" class="agx-nav" onclick="agMudarMes(-1)" aria-label="Mês anterior">‹</button>
    <div class="agx-mes">${AG_MESES[agEstado.mes].charAt(0).toUpperCase() + AG_MESES[agEstado.mes].slice(1)} de ${agEstado.ano}</div>
    <button type="button" class="agx-nav" onclick="agMudarMes(1)" aria-label="Próximo mês">›</button>
    <button type="button" class="agx-hoje" onclick="agIrHoje()">Hoje</button>
   </div>
   <div class="agx-semana">${AG_SEMANA.map(x => `<span>${x}</span>`).join('')}</div>
   <div class="agx-grade">${celulas}</div>
   <div class="agx-legenda"><span class="agx-sino demo">${AG_SINO}<span class="agx-qtd">2</span></span> dia com compromisso: clique no sino para ver, editar ou apagar. Clique em qualquer dia para agendar.</div>
  </div>`;
}

window.agClicarDia = function (iso) { agEstado.dia = iso; agAbrirModal(null); };
window.agMudarMes = function (delta) {
 const d = new Date(agEstado.ano, agEstado.mes + delta, 1);
 agEstado.ano = d.getFullYear(); agEstado.mes = d.getMonth();
 agDesenhar();
};
window.agIrHoje = function () { const h = new Date(); agEstado.ano = h.getFullYear(); agEstado.mes = h.getMonth(); agEstado.dia = agIso(h); agDesenhar(); };
window.agNovoHoje = function () { agEstado.dia = agIso(new Date()); agAbrirModal(null); };
// Usado por outras telas (ex.: Engajamento → "Agendar na Agenda do Mentor")
window.mentoraAgendarPara = function (menteeId, menteeNome) {
 if (typeof abrirEuMentor === 'function') abrirEuMentor();
 setTimeout(() => agAbrirModal(null, { mentorado_id: menteeId, mentorado_nome: menteeNome }), 700);
};

// ── Lista de compromissos do dia (aberta pelo sino) ──
window.agAbrirLista = function (iso) {
 agEstado.dia = iso; agEstado.listaAberta = iso;
 let m = document.getElementById('agx-lista-modal');
 if (!m) {
  m = document.createElement('div'); m.id = 'agx-lista-modal'; m.className = 'agx-modal';
  m.addEventListener('click', e => { if (e.target === m) agFecharLista(); });
  document.body.appendChild(m);
 }
 const evs = agEventosDoDia(iso);
 const itens = evs.length ? evs.map(ev => `
   <div class="agx-ev" style="border-left-color:${vlCor(ev.cor)}">
    <div class="agx-ev-hora">${vlEsc(agHoraDe(ev))}${ev.fim ? ' – ' + vlEsc(ev.fim) : ''}${agEhLegado(ev) ? ' <span class="agx-tag">toda semana</span>' : ''}</div>
    <div class="agx-ev-tit">${vlEsc(ev.titulo)}</div>
    ${ev.mentorado_nome ? `<div class="agx-ev-sub">Mentorado: ${vlEsc(ev.mentorado_nome)}</div>` : ''}
    ${ev.obs ? `<div class="agx-ev-sub">${vlEsc(ev.obs)}</div>` : ''}
    ${ev.mentorado_id && ev.data && ev.data <= agIso(new Date()) ? `<div class="agx-ev-sub">Como foi esta sessão? <select onchange="agMarcarStatus('${vlEscJs(ev.id)}', this.value)" style="margin-left:4px; border:1px solid #CBD5E1; border-radius:6px; padding:3px 6px; font-size:12.5px;">
      ${[['', 'A marcar'], ['realizada', 'Realizada'], ['cancelada_mentorado', 'Mentorado cancelou'], ['remarcada_mentorado', 'Mentorado remarcou'], ['faltou', 'Não compareceu'], ['cancelada_mentor', 'Cancelada por mim']].map(o => `<option value="${o[0]}" ${String(ev.status || '') === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>` : ''}
    <div class="agx-ev-acoes"><button type="button" onclick="agAbrirModal('${vlEscJs(ev.id)}')">Alterar</button><button type="button" class="perigo" onclick="excluirEventoAgenda('${vlEscJs(ev.id)}')">Apagar</button></div>
   </div>`).join('') : `<div class="agx-vazio">Nenhum compromisso neste dia.</div>`;
 m.innerHTML = `<div class="agx-caixa" role="dialog" aria-modal="true" aria-labelledby="agx-lista-tit">
   <div class="agx-caixa-cab"><div><div class="agx-caixa-sup">${evs.length} ${evs.length === 1 ? 'compromisso' : 'compromissos'}</div><h3 id="agx-lista-tit">${vlEsc(agDataLonga(iso))}</h3></div><button type="button" class="agx-x" onclick="agFecharLista()" aria-label="Fechar">&times;</button></div>
   <div class="agx-lista">${itens}</div>
   <button type="button" class="btn btn-primary agx-add" onclick="agAbrirModal(null)">+ Adicionar compromisso neste dia</button>
  </div>`;
 m.style.display = 'flex';
};
// Situação da sessão (usada no Engajamento: cancelamentos, remarcações e faltas do mentorado)
window.agMarcarStatus = async function (id, status) {
 const salva = await vlAlterarLista('agenda_eventos', l => l.map(e => String(e.id) === String(id) ? Object.assign({}, e, { status: status || '', statusEm: new Date().toISOString() }) : e));
 if (!salva) return;
 window.vlAgenda = salva;
 agDepoisDeMudar();
};
window.agFecharLista = function () { const m = document.getElementById('agx-lista-modal'); if (m) m.style.display = 'none'; agEstado.listaAberta = null; };

async function agListaMentorados() {
 let lista = Array.isArray(window.cp_mentees) ? window.cp_mentees : null;
 if ((!lista || !lista.length) && window.supabaseClient && window.mentorId) {
  try {
   const { data } = await window.supabaseClient.from('Usuarios').select('id, nome, arquivado').eq('mentor_id', window.mentorId).eq('perfil', 'MENTORADO');
   lista = data || [];
  } catch (e) { lista = []; }
 }
 return (lista || []).filter(m => m && !m.arquivado).map(m => ({ id: m.id, nome: m.nome || 'Mentorado' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Formulário do compromisso (novo ou alterar). A lista do dia fica por trás e é atualizada ao salvar.
window.agAbrirModal = async function (id, pre) {
 const ev = id ? (window.vlAgenda || []).find(e => String(e.id) === String(id)) : null;
 agEstado.editando = ev ? ev.id : null;
 const m = document.getElementById('modal-novo-compromisso'); if (!m) return;
 const dataIni = ev ? (ev.data || agEstado.dia) : (agEstado.dia || agIso(new Date()));
 document.getElementById('agenda-modal-titulo').textContent = ev ? 'Alterar compromisso' : 'Novo compromisso';
 document.getElementById('agenda-data').value = dataIni || agIso(new Date());
 document.getElementById('agenda-hora').value = ev ? agHoraDe(ev) : '';
 document.getElementById('agenda-fim').value = ev && ev.fim ? ev.fim : '';
 document.getElementById('agenda-titulo').value = ev ? (ev.titulo || '') : '';
 document.getElementById('agenda-obs').value = ev ? (ev.obs || '') : '';
 document.getElementById('agenda-dia-label').textContent = ev && agEhLegado(ev) ? 'Compromisso da agenda antiga (toda semana). Ao salvar, ele passa a valer só para a data escolhida.' : (dataIni ? agDataLonga(dataIni) : '');
 const sel = document.getElementById('agenda-mentorado');
 sel.innerHTML = '<option value="">Sem mentorado (compromisso pessoal)</option>';
 document.getElementById('agenda-btn-excluir').style.display = ev ? '' : 'none';
 m.style.display = 'flex';
 setTimeout(() => { const h = document.getElementById('agenda-hora'); if (h && !ev) h.focus(); }, 50);
 const lista = await agListaMentorados();
 lista.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.nome; sel.appendChild(o); });
 const alvo = ev ? ev.mentorado_id : (pre && pre.mentorado_id);
 if (alvo) sel.value = String(alvo);
 if (!ev && pre && pre.mentorado_nome && !document.getElementById('agenda-titulo').value) document.getElementById('agenda-titulo').value = 'Sessão com ' + pre.mentorado_nome;
};
window.agTrocouMentorado = function () {
 const sel = document.getElementById('agenda-mentorado'), t = document.getElementById('agenda-titulo');
 if (!sel || !t) return;
 const nome = sel.value && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
 if (nome && (!t.value.trim() || /^Sessão com /.test(t.value))) t.value = 'Sessão com ' + nome;
};

function fecharModalAgenda() {
 const m = document.getElementById('modal-novo-compromisso'); if (m) m.style.display = 'none';
 agEstado.editando = null;
}
function agDepoisDeMudar(dataFoco) {
 agDesenhar();
 if (agEstado.listaAberta) agAbrirLista(dataFoco || agEstado.listaAberta);
}

async function salvarCompromissoDinamico() {
 const data = document.getElementById('agenda-data').value;
 const inicio = document.getElementById('agenda-hora').value;
 const fim = document.getElementById('agenda-fim').value;
 const titulo = document.getElementById('agenda-titulo').value.trim();
 const obs = document.getElementById('agenda-obs').value.trim().slice(0, 500);
 const sel = document.getElementById('agenda-mentorado');
 const menteeId = sel.value || '';
 const menteeNome = menteeId && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
 if (!data) { alert('Escolha a data do compromisso.'); return; }
 if (!inicio) { alert('Escolha o horário de início.'); return; }
 if (fim && fim <= inicio) { alert('O horário de término precisa ser depois do início.'); return; }
 if (!titulo) { alert('Escreva o nome do compromisso.'); return; }
 const editando = agEstado.editando;
 // aviso de horário ocupado (o mentor decide se mantém)
 const fimCmp = fim || inicio;
 const choque = agEventosDoDia(data).find(e => String(e.id) !== String(editando) && (() => { const a = agHoraDe(e), b = e.fim || a; return inicio <= b && fimCmp >= a; })());
 if (choque && !confirm(`Já existe um compromisso nesse horário: ${agHoraDe(choque)} ${choque.titulo}.\n\nSalvar mesmo assim?`)) return;
 const btn = document.getElementById('agenda-btn-salvar'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
 const novo = { data, inicio, fim: fim || '', titulo: titulo.slice(0, 160), mentorado_id: menteeId, mentorado_nome: menteeNome, obs };
 const salva = await vlAlterarLista('agenda_eventos', l => {
  if (editando) {
   let achou = false;
   l = l.map(e => { if (String(e.id) === String(editando)) { achou = true; const c = Object.assign({}, e, novo); delete c.dia; delete c.hora; delete c.minuto; return c; } return e; });
   if (achou) return l;
  }
  l.push(Object.assign({ id: Date.now().toString(), cor: AG_CORES[l.length % AG_CORES.length] }, novo));
  return l;
 });
 if (btn) { btn.disabled = false; btn.textContent = 'Salvar compromisso'; }
 if (!salva) return; // o aviso de erro já apareceu; o formulário continua aberto
 window.vlAgenda = salva;
 const d = agDeIso(data); agEstado.dia = data; agEstado.ano = d.getFullYear(); agEstado.mes = d.getMonth();
 fecharModalAgenda();
 agDepoisDeMudar(data);
 agPedirPermissaoAviso();
 if (data === agIso(new Date())) verificarLembretesAgenda();
}

async function excluirEventoAgenda(id) {
 id = id || agEstado.editando;
 if (!id || !confirm('Apagar este compromisso da agenda?')) return;
 const salva = await vlAlterarLista('agenda_eventos', l => l.filter(e => String(e.id) !== String(id)));
 if (!salva) return;
 window.vlAgenda = salva;
 fecharModalAgenda();
 agDepoisDeMudar();
}

// ── Lembretes: no horário do compromisso e um resumo do dia ao abrir a plataforma ──
function verificarLembretesAgenda() {
 const agora = new Date();
 const minAgora = agora.getHours() * 60 + agora.getMinutes();
 agEventosDoDia(agIso(agora)).forEach(ev => {
  const [h, mi] = agHoraDe(ev).split(':').map(Number);
  const falta = (h * 60 + mi) - minAgora;
  let tipo = null;
  if (falta === 0) tipo = 'agora'; else if (falta > 0 && falta <= 15) tipo = 'breve';
  if (!tipo) return;
  const chave = ev.id + '_' + agIso(agora) + '_' + tipo;
  if (vlNotificados.includes(chave)) return;
  vlNotificados.push(chave);
  const quem = ev.mentorado_nome ? `\nMentorado: ${vlEsc(ev.mentorado_nome)}` : '';
  mostrarNotificacaoAgenda(tipo === 'agora'
   ? `<strong>Começa agora (${vlEsc(agHoraDe(ev))}):</strong>\n\n${vlEsc(ev.titulo)}${quem}`
   : `<strong>Daqui a ${falta} min (${vlEsc(agHoraDe(ev))}):</strong>\n\n${vlEsc(ev.titulo)}${quem}`);
 });
}

async function resumoDoDia() {
 for (let i = 0; i < 12 && !window.mentorId; i++) await new Promise(r => setTimeout(r, 500));
 if (!window.mentorId) return;
 const doBanco = await mentoraCarregarCampo('agenda_eventos');
 if (Array.isArray(doBanco)) window.vlAgenda = doBanco;
 const eventosHoje = agEventosDoDia(agIso(new Date()));
 if (eventosHoje.length > 0) {
  const listaHtml = eventosHoje.map(e => `<strong>${vlEsc(agHoraDe(e))}</strong> - ${vlEsc(e.titulo)}`).join('\n');
  setTimeout(() => mostrarNotificacaoAgenda(`<strong>Você tem ${eventosHoje.length} compromisso(s) hoje!</strong>\n\n${listaHtml}`), 2000);
 }
}

setInterval(verificarLembretesAgenda, 60000); // confere a cada minuto
setTimeout(resumoDoDia, 1000);
