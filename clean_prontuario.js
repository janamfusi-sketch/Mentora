// ════════════════════════════════════════════════════════════
// CLEAN PRONTUÁRIO JS — LAYOUT REDESENHADO v3
// ════════════════════════════════════════════════════════════

// Fase 6: colunas de Usuarios sem o CPF (o CPF não precisa vir para o navegador)
const USUARIOS_COLUNAS_SEM_CPF = 'id, created_at, nome, telefone, email, especialidade, plano, "Data nascimento", Idade, Telefone, Perfil, data_nascimento, idade, perfil, metodo, mentor_id, mentor_email, role, arquivado, arquivado_em, arquivado_motivo, agenda_eventos, postits, perfil_publico, foto_perfil_base64, conteudos_order, nichos_metodologia, comunidade_banido, foto_url, vip_ate, pro_business, desconto_pro, plano_proximo, plano_proximo_ate, plano_cancelado_em, pro_convite, pro_preco_mensal, pro_preco_anual';

// Fase 7.3: análise, plano de ação e nicho dos mentorados ficam só no banco.
// Limpa cópias antigas que versões anteriores deixavam no navegador.
try { Object.keys(localStorage).forEach(k => { if (/^(mentor_onboarding_notes_|mentor_onboarding_nicho_|cp_caderno_rascunho_)/.test(k)) localStorage.removeItem(k); }); } catch (e) {}

let cp_mentees = [];
let cp_arquivados = [];      // mentorados arquivados (só aparecem em "Ver arquivados")
let cp_verArquivados = false;
let cp_logadoNaBusca = true;       // a busca foi feita com uma conta logada?
let cp_carregandoMentorados = true; // enquanto a busca não termina, a lista mostra "Carregando"
let cp_all_sessions = [];
let cp_currentMentee = null;
let cp_radarChart = null;
let cp_trustChart = null;
let cp_regChart = null;

// ── INDICADORES DE TRAUMA (mesmos do mentor_telemetria) ──
const CP_TRAUMA_INDICATORS = [
 { k: 'intrusao', name: 'Pensamentos intrusivos', color: '#c45a6a' },
 { k: 'abandono', name: 'Abandono / Rejeição', color: '#d48a3a' },
 { k: 'dissociacao', name: 'Dissociação observada', color: '#8a6ad4' },
 { k: 'vergonha', name: 'Vergonha / Humilhação', color: '#4a7dd4' },
 { k: 'abuso', name: 'Marcas de abuso', color: '#c45a6a' },
 { k: 'evitacao', name: 'Evitação de memórias', color: '#10b981' }
];

// ── INIT ──
// Sessões dos mentorados em blocos (evita o limite de tamanho da busca) e em páginas de 1.000
// (o banco entrega no máximo 1.000 linhas por vez: sem as páginas, o histórico longo vinha cortado)
async function cp_buscarSessoes(ids) {
 const todas = [];
 const BLOCO = 80, PAGINA = 1000;
 for (let i = 0; i < ids.length; i += BLOCO) {
  const parte = ids.slice(i, i + BLOCO);
  for (let de = 0; ; de += PAGINA) {
   const { data, error } = await window.supabaseClient
    .from('Sessoes_Mentoria').select('*')
    .in('mentorado_id', parte)
    .order('created_at', { ascending: false })
    .range(de, de + PAGINA - 1);
   if (error) { console.error('Erro ao buscar sessões:', error); break; }
   todas.push(...(data || []));
   if (!data || data.length < PAGINA) break;
  }
 }
 return todas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Nível de habilitação do mentor (lido do banco): 'padrao' | 'psicanalitica' | 'clinica'
var cp_nivelHab = 'padrao';
async function cp_carregarHabilitacao() {
 try {
  const { data, error } = await window.supabaseClient.rpc('mentora_nivel_habilitacao');
  cp_nivelHab = (!error && (data === 'clinica' || data === 'psicanalitica')) ? data : 'padrao';
 } catch (e) { cp_nivelHab = 'padrao'; }
 if (window.MentoraCerebros && MentoraCerebros.setNivelHabilitacao) MentoraCerebros.setNivelHabilitacao(cp_nivelHab);
}
window.cp_recarregarHabilitacao = cp_carregarHabilitacao;

async function cp_init() {
 await cp_carregarHabilitacao();
 if (!window.supabaseClient) {
 console.error("Supabase client não encontrado. Verifique a inicialização no HTML.");
 return;
 }
 cp_carregandoMentorados = true;
 cp_renderMenteesList();
 
 const getCookie = (name) => {
 const value = `; ${document.cookie}`;
 const parts = value.split(`; ${name}=`);
 if (parts.length === 2) return parts.pop().split(';').shift();
 return null;
 };
 
 try {
 const { data: sessionData } = await window.supabaseClient.auth.getSession();
 const authUser = sessionData?.session?.user;
 const authEmail = authUser?.email;
 const authId = authUser?.id;
 cp_logadoNaBusca = !!authId;
 if (authId && window.mentoraCarregarChart) window.mentoraCarregarChart().catch(function () {});

 const mentorEmail = authEmail || window.mentorEmail || getCookie('mentor_email_logado') || localStorage.getItem('mentor_email') || localStorage.getItem('mentor_email_logado');
 const mentorId = authId || window.mentorId || localStorage.getItem('mentor_id');
 if (mentorId) window.mentorId = mentorId;
 if (mentorEmail) window.mentorEmail = mentorEmail;
 
 // busca SÓ os mentorados deste mentor, direto no banco (antes baixava todos que a conta podia ver)
 let data = [], error = null;
 if (mentorId) {
  const r = await window.supabaseClient
  .from('Usuarios')
  .select(USUARIOS_COLUNAS_SEM_CPF)
  .eq('mentor_id', mentorId)
  .ilike('perfil', 'mentorado')
  .order('created_at', { ascending: false });
  data = r.data || []; error = r.error;
 }
 if (error) console.error('Erro ao buscar mentorados:', error);

 // Gestão de Mentorados mostra SEMPRE só os mentorados de quem está logado —
 // inclusive para a administração, que pode ler todos os cadastros no banco,
 // mas vê os de todos os mentores apenas no painel administrativo.
 const emailMin = String(mentorEmail || '').toLowerCase();
 data = (data || []).filter(m =>
 (mentorId && m.mentor_id && m.mentor_id === mentorId) ||
 (emailMin && m.mentor_email && String(m.mentor_email).toLowerCase() === emailMin)
 );
 
 cp_mentees = (data || []).filter(m => !m.arquivado);
 cp_arquivados = (data || []).filter(m => m.arquivado);
 
 // Buscar telemetrias do Supabase — SOMENTE dos mentorados deste mentor.
 // Antes buscava a tabela inteira (todo mentor via qualquer mentee de qualquer
 // outro mentor) e só filtrava na tela depois — os dados de todo mundo já
 // tinham baixado pro navegador nesse meio tempo.
 const menteeIds = cp_mentees.map(m => m.id).filter(Boolean);
 const sessData = await cp_buscarSessoes(menteeIds);
 cp_all_sessions = sessData;
 
 cp_carregandoMentorados = false;
 cp_renderMenteesList();
 } catch(err) {
 console.error("Erro ao puxar mentorados do Supabase:", err);
 cp_carregandoMentorados = false;
 cp_renderMenteesList();
 }
}

window.cp_renderMenteeProntuario = function() {
 if (typeof cp_currentMentee !== 'undefined' && cp_currentMentee && cp_currentMentee.id) {
 cp_openProfile(cp_currentMentee.id);
 }
};

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', cp_init);
} else {
 cp_init();
}
setTimeout(() => {
 if (document.getElementById('cp-mentees-list') && document.getElementById('cp-mentees-list').innerHTML.trim() === '') {
 cp_init();
 }
}, 1000);

window.cp_filterTimelineSessions = function(rawSessions, menteeId) {
 if (!Array.isArray(rawSessions)) return [];
 return rawSessions.filter(s => {
 if (!s) return false;
 if (menteeId && String(s.mentorado_id) !== String(menteeId)) return false;
 const tipo = (s.tipo || '').toLowerCase().trim();
 if (tipo === 'analise_telemetria' || tipo === 'pdi_mentor' || tipo === 'dever_de_casa_config' || tipo === 'onboarding_config' || tipo === 'anotacao' || tipo === 'onboarding_arquivo' || tipo === 'caderno' || tipo === 'analise_central' || tipo === 'engajamento_pref' || tipo === 'engajamento_alerta' || tipo === 'visao_geral_nota' || tipo === 'visao_geral_nota_mentor') {
 return false;
 }
 // Marcador de "formulário limpo" (SMART, SWOT, Perfil & Compatibilidade): não é um registro de sessão
 const dd = cp_parseDados(s.dados);
 if (dd && dd.limpo === true) return false;
 return true;
 });
};

// ── DEVER DE CASA / ONBOARDING: FONTE ÚNICA = SUPABASE (cp_all_sessions) ──
// Antes a lista de tarefas e as respostas da mentorada eram lidas do
// localStorage — só apareciam no navegador onde tinham sido criadas.
// Agora tudo vem das linhas de Sessoes_Mentoria já carregadas em cp_all_sessions.
function cp_esc(v) {
 return String(v == null ? '' : v)
 .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cp_parseDados(dados) {
 if (!dados) return null;
 if (typeof dados === 'string') { try { return JSON.parse(dados); } catch(e) { return null; } }
 return dados;
}

function cp_ultimaSessao(menteeId, tipo) {
 return cp_all_sessions
 .filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo === tipo)
 .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

window.cp_dcGetTarefas = function(menteeId) {
 const cfg = cp_ultimaSessao(menteeId, 'dever_de_casa_config');
 if (!cfg) return [];
 let d = cp_parseDados(cfg.dados);
 if (d && !Array.isArray(d) && Array.isArray(d.tasks)) d = d.tasks;
 if (!Array.isArray(d)) return [];
 return d.map(t => typeof t === 'string' ? t : (t && (t.text || t.taskText)) || '')
 .map(t => String(t).trim()).filter(Boolean);
};

// Ajustes do mentor na leitura automática de cada tarefa (semanal, comprovação, sensível)
window.cp_dcGetAjustes = function(menteeId) {
 const cfg = cp_ultimaSessao(menteeId, 'dever_de_casa_config');
 const d = cfg ? cp_parseDados(cfg.dados) : null;
 return (d && !Array.isArray(d) && d.ajustes && typeof d.ajustes === 'object') ? Object.assign({}, d.ajustes) : {};
};

// Última resposta da mentorada enviada DEPOIS da lista de tarefas atual
window.cp_dcGetResposta = function(menteeId) {
 const cfg = cp_ultimaSessao(menteeId, 'dever_de_casa_config');
 const resp = cp_ultimaSessao(menteeId, 'dever_de_casa_resp');
 if (!resp) return [];
 if (cfg && new Date(resp.created_at) < new Date(cfg.created_at)) return [];
 const d = cp_parseDados(resp.dados) || {};
 return Array.isArray(d.tasks) ? d.tasks : [];
};

window.cp_obGetPerguntas = function(menteeId) {
 const cfg = cp_ultimaSessao(menteeId, 'onboarding_config');
 if (!cfg) return [];
 let d = cp_parseDados(cfg.dados);
 if (d && !Array.isArray(d) && Array.isArray(d.questions)) d = d.questions;
 if (!Array.isArray(d)) return [];
 return d.map(q => typeof q === 'string' ? q : (q && (q.text || q.pergunta)) || '')
 .map(q => String(q).trim()).filter(Boolean);
};

// Migração única: perguntas antigas que só existiam no localStorage sobem para o banco
const cp_obMigrados = {};
function cp_obMigrarLegado(menteeId) {
 if (cp_obMigrados[menteeId]) return;
 cp_obMigrados[menteeId] = true;
 if (cp_ultimaSessao(menteeId, 'onboarding_config')) return;
 let legado = [];
 try { legado = JSON.parse(localStorage.getItem('onboarding_questions_' + menteeId)) || []; } catch(e) {}
 if (Array.isArray(legado) && legado.length > 0) {
 cp_salvarPerguntasOnboarding(menteeId, legado).then(ok => {
 if (ok) { localStorage.removeItem('onboarding_questions_' + menteeId); cp_renderOnboardingQuestionsList(menteeId); }
 });
 }
}

// Itens do onboarding que a mentora tirou do painel. O registro original
// NUNCA é alterado nem apagado: cada exclusão vira uma linha 'onboarding_arquivo'.
function cp_obIndicesArquivados(onboardingRowId) {
 const set = new Set();
 cp_all_sessions.forEach(s => {
 if (!s || s.tipo !== 'onboarding_arquivo') return;
 const d = cp_parseDados(s.dados) || {};
 if (String(d.onboarding_id) !== String(onboardingRowId)) return;
 if (d.todos === true) set.add('*');
 else if (d.indice != null) set.add(Number(d.indice));
 });
 return set;
}

window.cp_getOnboardingResp = function(menteeId) {
 const ob = cp_ultimaSessao(menteeId, 'onboarding');
 if (ob) {
 const dados = cp_parseDados(ob.dados) || {};
 if (!Array.isArray(dados.respostas)) return dados; // formato legado
 const arquivados = cp_obIndicesArquivados(ob.id);
 if (arquivados.has('*')) return null;
 const visiveis = dados.respostas
 .map((r, i) => Object.assign({}, r, { _idx: i }))
 .filter(r => !arquivados.has(r._idx));
 if (visiveis.length === 0) return null; // tudo arquivado → volta a "Pendente"
 return Object.assign({}, dados, { respostas: visiveis, _rowId: ob.id });
 }
 // Fallback legado: respostas antigas que só existem neste navegador
 try { return JSON.parse(localStorage.getItem('onboarding_resp_' + menteeId)); } catch(e) { return null; }
};

// Busca no banco as linhas mais recentes de dever de casa desta mentorada
// (para a mentora ver respostas novas sem recarregar a página toda)
const cp_dcSyncEmAndamento = {};
window.cp_dcSincronizar = async function(menteeId) {
 if (!window.supabaseClient || !menteeId || cp_dcSyncEmAndamento[menteeId]) return false;
 cp_dcSyncEmAndamento[menteeId] = true;
 try {
 const { data, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .select('*')
 .eq('mentorado_id', menteeId)
 .in('tipo', ['dever_de_casa_config', 'dever_de_casa_resp', 'onboarding_config', 'onboarding', 'onboarding_arquivo'])
 .order('created_at', { ascending: false })
 .limit(20);
 if (error) { console.error('Erro ao sincronizar dever de casa:', error); return false; }
 let mudou = false;
 (data || []).forEach(row => {
 const jaTem = cp_all_sessions.some(s => s && row.id != null && s.id === row.id);
 if (!jaTem) { cp_all_sessions.unshift(row); mudou = true; }
 });
 return mudou;
 } finally {
 cp_dcSyncEmAndamento[menteeId] = false;
 }
};

// Migração única: tarefas antigas que só existiam no localStorage sobem para o banco
const cp_dcMigrados = {};
function cp_dcMigrarLegado(menteeId) {
 if (cp_dcMigrados[menteeId]) return;
 cp_dcMigrados[menteeId] = true;
 if (cp_ultimaSessao(menteeId, 'dever_de_casa_config')) return;
 let legado = [];
 try { legado = JSON.parse(localStorage.getItem('dever_de_casa_tasks_' + menteeId)) || []; } catch(e) {}
 if (Array.isArray(legado) && legado.length > 0) {
 cp_salvarTarefasDeverDeCasa(menteeId, legado).then(ok => {
 if (ok) { localStorage.removeItem('dever_de_casa_tasks_' + menteeId); cp_renderDeverDeCasaList(menteeId, true); }
 });
 }
}

// Endereço completo de um arquivo na MESMA pasta desta página.
// Funciona tanto no site publicado (https://...) quanto aberto do computador (file:///C:/...).
function cp_urlDaPasta(arquivo) {
 const atual = window.location.href.split('#')[0].split('?')[0];
 return atual.substring(0, atual.lastIndexOf('/') + 1) + arquivo;
}

// ── LISTAGEM ──
function cp_renderMenteesList() {
 const listEl = document.getElementById('cp-mentees-list');
 if (!listEl) return;
 // os alertas usam os cancelamentos da Agenda: quando ela chega do banco, a lista é redesenhada uma vez
 if (typeof cp_engajGarantirAgenda === 'function' && !window.__cpeAgendaOk && !window.__cpeListaEsperando) {
 window.__cpeListaEsperando = true;
 cp_engajGarantirAgenda().then(ok => { window.__cpeListaEsperando = false; if (ok) cp_renderMenteesList(); });
 }
 if (!Array.isArray(cp_mentees)) cp_mentees = [];

 if (cp_carregandoMentorados) {
 if (!document.getElementById('cp-estilo-carregando')) {
 const st = document.createElement('style'); st.id = 'cp-estilo-carregando';
 st.textContent = '@keyframes cpGira{to{transform:rotate(360deg)}} .cp-carregando{grid-column:1/-1; display:flex; flex-direction:column; align-items:center; gap:14px; padding:48px 0; color:#64748b; font-size:15px;} .cp-carregando span{width:34px; height:34px; border:3px solid #E0E7FF; border-top-color:#5B2DA3; border-radius:50%; animation:cpGira .8s linear infinite;}';
 document.head.appendChild(st);
 }
 listEl.innerHTML = '<div class="cp-carregando"><span></span>Carregando seus mentorados...</div>';
 return;
 }

 if (!cp_logadoNaBusca) {
 listEl.innerHTML = '<div style="text-align:center; color:#64748b; grid-column:1/-1;">Entre na sua conta para ver e cadastrar seus mentorados. <a href="javascript:void(0)" onclick="abrirLogin()" style="color:#5B2DA3; font-weight:600;">Entrar</a></div>';
 return;
 }

 if (cp_mentees.length === 0 && cp_arquivados.length === 0) {
 listEl.innerHTML = '<div style="text-align:center; color:#64748b; grid-column:1/-1;">Você ainda não tem mentorados cadastrados. Clique em <b>+ Novo Mentorado</b> para começar.</div>';
 return;
 }

 try {
 let html = '';
 let emAlerta = 0;
 cp_mentees.forEach(m => {
 try {
 const nomeStr = m.nome || m.name || 'Mentorado';
 const pLetra = nomeStr.charAt(0).toUpperCase();

 const menteeSessionsRaw = cp_filterTimelineSessions(cp_all_sessions, m.id);
 const sessions = menteeSessionsRaw.map(s => cp_parseGenericSession(s)).filter(Boolean).sort((a,b) => b.createdAt - a.createdAt);
 let s1 = { lbl: 'Confiança', val: '—' };
 let s2 = { lbl: 'Trauma', val: '—' };
 let s3 = { lbl: 'Regulação', val: '—' };
 let sColor = 'rgba(255,255,255,0.9)';
 let sDate = 'Nenhuma avaliação';

 if (sessions.length> 0) {
 const last = sessions[0];
 sDate = last.date;
 const info = cp_getTelemetryInfo(last);
 s1 = info.cardSummary.s1;
 s2 = info.cardSummary.s2;
 s3 = info.cardSummary.s3;
 sColor = info.color;
 }

 // Controle de Missão: alerta amarelo / laranja / vermelho no cartão (engajamento.js)
 let alertaHorizonte = '';
 try {
 const rsc = cp_engajRisco(m.id);
 if (rsc.nivel && rsc.chave !== 'estavel') {
 emAlerta++;
 const c = rsc.cor;
 alertaHorizonte = `<div style="background:${c.fundo}; color:${c.texto}; border-left:4px solid ${c.cor}; border-radius:8px; padding:6px 10px; font-size:12px; font-weight:600;">${rsc.chave === 'amarelo' ? 'Alerta amarelo' : rsc.chave === 'laranja' ? 'Alerta laranja' : 'Alerta vermelho'} (risco ${rsc.pontos})${rsc.sinais[0] ? ': ' + cp_esc(rsc.sinais[0].texto) : (rsc.agravantes && rsc.agravantes[0] ? ': ' + cp_esc(rsc.agravantes[0]) : '')}</div>`;
 }
 } catch (e) { console.warn('Telemetria de engajamento indisponível para', m.id, e); }

 html += `
 <div class="cp-card" style="cursor:pointer; display:flex; flex-direction:column; gap:1rem;" onclick="cp_openProfile('${cp_esc(m.id)}')"><div style="display:flex; gap:1rem; align-items:center;"><div class="cp-avatar" style="border:2px solid rgba(255,255,255,0.4); background:transparent;">${cp_esc(pLetra)}</div>
 <div><div style="font-family:'Playfair Display',serif; font-weight:700; font-size:18px; color:#ffffff;">${cp_esc(nomeStr)}</div>
 <div style="font-size:12px; color:rgba(255,255,255,0.8);">${cp_esc(m.idade || '--')} anos &middot; ${cp_esc(m.metodo || 'Geral')}</div>
 </div>
 </div>
 ${alertaHorizonte}
 <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">${[s1, s2, s3].map(x => `<div class="cp-card-stat"><div class="v">${cp_esc(String(x.val == null ? '—' : x.val).replace(/<[^>]*>/g, ''))}</div><div class="l">${cp_esc(x.lbl)}</div></div>`).join('')}
 </div>
 <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.2); padding-top:1rem; align-items:center;"><span style="font-size:12px; color:rgba(255,255,255,0.7);">${cp_contarDiasSessao(m.id)} ${cp_contarDiasSessao(m.id) === 1 ? 'sessão' : 'sessões'} &middot; última ${sDate}</span>
 <span style="font-size:12px; color:#ffffff; font-weight:600;">Acessar Ficha &rarr;</span>
 </div>
 </div>`;
 } catch(err) {
 console.error('Erro ao renderizar mentorado', m, err);
 }
 });
 if (!cp_mentees.length) html = '<div style="text-align:center; color:#64748b; grid-column:1/-1;">Nenhum mentorado ativo. Clique em <b>+ Novo Mentorado</b> para começar.</div>';
 const resumoAlerta = emAlerta ? `<div style="grid-column:1/-1; background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:10px 14px; font-size:13.5px;"><b>Controle de Missão:</b> ${emAlerta} ${emAlerta === 1 ? 'mentorado precisa' : 'mentorados precisam'} de atenção (perto ou além do Horizonte de Eventos, ou com risco de abandono alto). Abra a ficha e veja a aba Engajamento.</div>` : '';
 listEl.innerHTML = resumoAlerta + html + cp_blocoArquivados();
 } catch(globalErr) {
 listEl.innerHTML = '<div style="color:red; padding:20px; font-weight:bold;">ERRO FATAL: ' + globalErr.message + '</div>';
 }
}

// Limite de mentorados por plano (conferido no banco): mostra o motivo e oferece ver os planos
window.cp_avisoLimitePlano = function(motivo) {
  const texto = String(motivo || '').replace(/^.*LIMITE_PLANO:\s*/, '');
  if (confirm(texto + '\n\nQuer conhecer os planos agora?')) {
    if (typeof scrollToSection === 'function') scrollToSection('planos');
  }
};

window.cp_abrirNovoModal = async function() {
  // Antes de abrir o formulário, confere no banco se o plano ainda permite cadastrar
  if (window.supabaseClient) {
    try {
      const { data: motivo, error } = await window.supabaseClient.rpc('mentora_motivo_limite_mentorados');
      if (!error && motivo) { cp_avisoLimitePlano(motivo); return; }
    } catch (e) { console.warn('Limite de mentorados:', e); }
  }
  document.getElementById('cp-nm-nome').value = '';
  document.getElementById('cp-nm-idade').value = '';
  document.getElementById('cp-nm-genero').value = '';
  document.getElementById('cp-nm-email').value = '';
  document.getElementById('cp-nm-queixa').value = '';
  const tel = document.getElementById('cp-nm-telefone'); if(tel) tel.value = '';
  document.getElementById('cp-nm-tipo-teste').value = 'geral';
  const inicio = document.getElementById('cp-nm-inicio'); if(inicio) inicio.value = '';
  
  const title = document.querySelector('#cp-modal-novo .cp-panel-title');
  if(title) title.textContent = 'Novo Mentorado';
  
  const btn = document.querySelector('#cp-modal-novo .cp-btn-primary');
  if(btn) btn.textContent = 'Salvar Mentorado';
  
  document.getElementById('cp-modal-novo').removeAttribute('data-edit-id');
  document.getElementById('cp-modal-novo').style.display = 'flex'; 
};
window.cp_fecharNovoModal = function() { document.getElementById('cp-modal-novo').style.display = 'none'; };

window.cp_abrirEditarMentorado = function() {
  if (!cp_currentMentee) return;
  const m = cp_currentMentee;
  
  document.getElementById('cp-nm-nome').value = m.nome || m.name || '';
  document.getElementById('cp-nm-idade').value = m.idade || '';
  document.getElementById('cp-nm-genero').value = m.genero || '';
  document.getElementById('cp-nm-email').value = m.email || '';
  document.getElementById('cp-nm-queixa').value = m.queixa || '';
  const tel = document.getElementById('cp-nm-telefone'); if(tel) tel.value = m.telefone || '';
  document.getElementById('cp-nm-tipo-teste').value = cp_metodoParaValor(m.metodo);
  const inicio = document.getElementById('cp-nm-inicio'); if(inicio) inicio.value = m.data_nascimento || m.inicio || '';
  
  const title = document.querySelector('#cp-modal-novo .cp-panel-title');
  if(title) title.textContent = 'Atualizar Ficha Mentorado';
  
  const btn = document.querySelector('#cp-modal-novo .cp-btn-primary');
  if(btn) btn.textContent = 'Salvar Alterações';
  
  document.getElementById('cp-modal-novo').setAttribute('data-edit-id', m.id);
  document.getElementById('cp-modal-novo').style.display = 'flex';
};

window.cp_cadastrarMentorado = async function() {
 const getCookie = (name) => {
 const value = `; ${document.cookie}`;
 const parts = value.split(`; ${name}=`);
 if (parts.length === 2) return parts.pop().split(';').shift();
 return null;
 };
 
 const planoLogado = window.mentorPlano || 'FREE';
 // Limite de mentorados: conferido no banco (ao abrir o formulário e ao salvar)

 const nome = document.getElementById('cp-nm-nome').value.trim();
 if (!nome) return alert('Nome é obrigatório');
 // Nome completo é exigido (não só o primeiro nome): evita engano na Agenda do
 // Mentor e na aba Engajamento quando dois mentorados têm o mesmo primeiro nome.
 if (nome.split(/\s+/).filter(Boolean).length < 2) {
 alert('Cadastre o nome completo do mentorado (nome e sobrenome).\nIsso evita engano quando dois mentorados têm o mesmo primeiro nome.');
 return;
 }
 
 const inicioEl = document.getElementById('cp-nm-inicio');
 const metodoVal = CP_METODOS[document.getElementById('cp-nm-tipo-teste').value] || 'Geral';
 const btn = document.querySelector('#cp-modal-novo .cp-btn-primary');
 if (btn) btn.textContent = 'Salvando no banco...';

 // O dono do mentorado é SEMPRE a conta logada de verdade (sessão do Supabase).
 // Antes usava primeiro um mentor_id guardado no navegador, que podia ser de
 // outra conta/login antigo — o mentorado ficava ligado ao id errado e sumia
 // em outros navegadores.
 let mentorEmail = null;
 let mentorId = null;
 try {
 const { data: sessionData } = await window.supabaseClient.auth.getSession();
 const user = sessionData?.session?.user;
 if (user) { mentorId = user.id; mentorEmail = user.email; }
 } catch(e) {}

 if (!mentorId) {
 alert('Sua sessão expirou. Faça login novamente antes de cadastrar um mentorado.');
 if (btn) btn.textContent = document.getElementById('cp-modal-novo').getAttribute('data-edit-id') ? 'Salvar Alterações' : 'Salvar Mentorado';
 return;
 }
 
 const editId = document.getElementById('cp-modal-novo').getAttribute('data-edit-id');

 const novoMentorado = {
 nome: nome,
 idade: document.getElementById('cp-nm-idade').value || null,
 email: document.getElementById('cp-nm-email').value || null,
 telefone: (document.getElementById('cp-nm-telefone') || {}).value || null,
 metodo: metodoVal,
 perfil: 'MENTORADO',
 data_nascimento: inicioEl ? inicioEl.value : null,
 mentor_id: mentorId || null,
 mentor_email: mentorEmail || null
 };

 if (!mentorId && !mentorEmail) {
     alert("Erro de Segurança: Credenciais do mentor não encontradas. Por favor, faça login no Painel (dashboard).");
     if (btn) btn.textContent = editId ? 'Salvar Alterações' : 'Salvar Mentorado';
     return;
 }

 if (!window.supabaseClient) {
 alert("Erro: Banco de dados não conectado!");
 if (btn) btn.textContent = editId ? 'Salvar Alterações' : 'Salvar Mentorado';
 return;
 }

 try {
 if (editId) {
     const { error } = await window.supabaseClient
     .from('Usuarios')
     .update(novoMentorado)
     .eq('id', editId);
     if (error) throw error;
 } else {
     const { error } = await window.supabaseClient
     .from('Usuarios')
     .insert([novoMentorado]);
     if (error) throw error;
 }

 cp_fecharNovoModal();
 alert(editId ? 'Ficha atualizada com sucesso!' : 'Mentorado cadastrado com sucesso!');
 
 await cp_init();
 if (editId && cp_currentMentee) {
     cp_openProfile(editId);
 }
 } catch(err) {
 console.error("Erro ao salvar mentorado:", err);
 if (/LIMITE_PLANO/.test(String(err && err.message))) { cp_fecharNovoModal(); cp_avisoLimitePlano(err.message); return; }
 alert('Não foi possível salvar o mentorado agora. Confira os dados e tente novamente.');
 } finally {
 if (btn) btn.textContent = 'Salvar Mentorado';
 }
};

// ── OPEN PROFILE ──
window.cp_openProfile = function(id) {
 cp_currentMentee = cp_mentees.find(x => x.id === id);
 if (!cp_currentMentee) return;

 document.getElementById('cp-view-lista').style.display = 'none';
 document.getElementById('cp-view-perfil').style.display = 'block';

 const m = cp_currentMentee;

 // Avatar
 const avatarEl = document.getElementById('cp-prof-avatar');
 if (avatarEl) avatarEl.textContent = m.nome.charAt(0).toUpperCase();

 // Name
 const nameEl = document.getElementById('cp-prof-name');
 if (nameEl) nameEl.textContent = m.nome;

 // Meta tags
 const menteeSessionsRaw = cp_filterTimelineSessions(cp_all_sessions, id);
 const sessions = menteeSessionsRaw.map(s => cp_parseGenericSession(s)).filter(Boolean).sort((a,b) => b.createdAt - a.createdAt);
 const sessCount = cp_contarDiasSessao(id);
 const inicio = m.inicio || (m.created_at ? m.created_at.split('T')[0] : '—');

 const metaEl = document.getElementById('cp-prof-meta');
 if (metaEl) {
 // só mostra o que está preenchido, em etiquetas (antes apareciam "--" e o método repetido duas vezes)
 const chip = (rot, val) => val ? `<span class="cp-chip">${rot ? `<b>${rot}</b>` : ''}${cp_esc(val)}</span>` : '';
 const dataBR = v => { const t = String(v || ''); const mm = t.match(/^(\d{4})-(\d{2})-(\d{2})/); return mm ? `${mm[3]}/${mm[2]}/${mm[1]}` : t; };
 const emailMask = m.email ? String(m.email).replace(/^(.{0,2})[^@]*(@.*)$/, '$1***$2') : '';
 const metodo = m.metodo || '', genero = m.genero && m.genero !== metodo ? m.genero : '';
 const queixa = m.queixa && m.queixa !== metodo ? m.queixa : '';
 metaEl.innerHTML = [
  chip('', m.idade ? m.idade + ' anos' : ''),
  chip('', m.telefone || ''),
  chip('', emailMask),
  chip('', genero),
  chip('Área:', metodo),
  chip('Foco:', queixa),
  chip('', sessCount + (sessCount === 1 ? ' sessão registrada' : ' sessões registradas')),
  chip('Desde', inicio && inicio !== '—' ? dataBR(inicio) : '')
 ].join('');
 }

 // Buttons
 const btnTraumas = document.getElementById('cp-btn-traumas');
 if (btnTraumas) btnTraumas.href = 'telemetria_traumas.html?id=' + id;

 const btnLideranca = document.getElementById('cp-btn-lideranca');
 if (btnLideranca) btnLideranca.href = 'telemetria_lideranca.html?id=' + id;

 // Notes
 const noteRows = cp_all_sessions.filter(s => String(s.mentorado_id) === String(id) && s.tipo === 'anotacao').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
 const savedNotes = noteRows.length> 0 ? noteRows[0].dados.texto : '';
 if (document.getElementById('cp-mentee-notes')) {
 document.getElementById('cp-mentee-notes').value = savedNotes || '';
 }

 // Switch to first tab (Análise do Mentor)
 cp_switchTab('telemetria');
 if (typeof window.cp_renderOnboardingSection === 'function') {
 window.cp_renderOnboardingSection(id);
 }
 cp_renderCaderno(id);

 // Render dashboard
 cp_renderDashboardUI(sessions.filter(s => !CP_TIPOS_FORA_VISAO.includes(s.sessType)));
 setTimeout(() => { if(window.cp_atualizarDominiosNichoInline) cp_atualizarDominiosNichoInline(); }, 50);
};

window.cp_closeProfile = function() {
 document.getElementById('cp-view-perfil').style.display = 'none';
 document.getElementById('cp-view-lista').style.display = 'block';
};

// ── Arquivados: ver, restaurar e excluir definitivamente (LGPD) ──
// Motivo do arquivamento: "Desistiu" e "Parou de aparecer" contam como ABANDONO e são a base
// para calibrar no futuro a porcentagem da previsão de abandono.
const CP_MOTIVOS_ARQUIVO = {
 concluiu: 'Concluiu a mentoria',
 desistiu: 'Desistiu',
 sumiu: 'Parou de aparecer',
 pausou: 'Pausou',
 outro: 'Outro'
};
function cp_escolherMotivoArquivo() {
 return new Promise(resolve => {
 const fundo = document.createElement('div');
 fundo.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px;';
 const opcoes = Object.keys(CP_MOTIVOS_ARQUIVO).map(k => `<label style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; font-size:14px; color:#1e293b;"><input type="radio" name="cp-motivo-arquivo" value="${k}"> ${CP_MOTIVOS_ARQUIVO[k]}</label>`).join('');
 fundo.innerHTML = `<div style="background:#fff; border-radius:16px; max-width:440px; width:100%; padding:22px; box-shadow:0 20px 50px rgba(0,0,0,.25);">
 <h3 style="margin:0 0 6px; font-size:18px; color:#1e293b;">Arquivar este mentorado</h3>
 <p style="margin:0 0 14px; font-size:13px; color:#64748b; line-height:1.5;">Ele sai da sua lista, mas a ficha e todo o histórico continuam salvos. Você pode restaurá-lo em "Ver arquivados". Se o mentorado pediu a exclusão dos dados dele, use "Excluir definitivamente (LGPD)".</p>
 <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;">Por que a mentoria está sendo encerrada?</div>
 <div style="display:flex; flex-direction:column; gap:8px;">${opcoes}</div>
 <div id="cp-motivo-aviso" style="display:none; color:#b91c1c; font-size:12.5px; margin-top:8px;">Escolha um motivo para continuar.</div>
 <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
 <button type="button" class="cp-btn-outline" data-acao="cancelar">Cancelar</button>
 <button type="button" class="cp-btn-primary" data-acao="ok">Arquivar</button>
 </div></div>`;
 const fechar = v => { fundo.remove(); resolve(v); };
 fundo.addEventListener('click', e => {
 const acao = e.target && e.target.dataset ? e.target.dataset.acao : null;
 if (e.target === fundo || acao === 'cancelar') return fechar(null);
 if (acao === 'ok') {
 const sel = fundo.querySelector('input[name="cp-motivo-arquivo"]:checked');
 if (!sel) { fundo.querySelector('#cp-motivo-aviso').style.display = 'block'; return; }
 fechar(sel.value);
 }
 });
 document.body.appendChild(fundo);
 });
}

function cp_blocoArquivados() {
 if (!cp_arquivados.length) return '';
 const botao = `<button type="button" class="cp-btn-outline" style="font-size:13px;" onclick="cp_alternarArquivados()">${cp_verArquivados ? 'Ocultar arquivados' : 'Ver arquivados (' + cp_arquivados.length + ')'}</button>`;
 if (!cp_verArquivados) return `<div style="grid-column:1/-1; text-align:center; margin-top:.5rem;">${botao}</div>`;
 const linhas = cp_arquivados.map(m => {
  const quando = m.arquivado_em ? new Date(m.arquivado_em).toLocaleDateString('pt-BR') : '';
  return `<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; padding:.8rem 1rem; border:1px solid #e2e8f0; border-radius:12px; background:#fff;">
   <div><div style="font-weight:700; color:#1e293b;">${cp_esc(m.nome || 'Sem nome')}</div><div style="font-size:12px; color:#64748b;">Arquivado${quando ? ' em ' + quando : ''}${CP_MOTIVOS_ARQUIVO[m.arquivado_motivo] ? ' · ' + CP_MOTIVOS_ARQUIVO[m.arquivado_motivo] : ''}</div></div>
   <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
    <button type="button" class="cp-btn-outline" style="font-size:13px;" onclick="cp_restaurarMentorado('${cp_esc(m.id)}')">Restaurar</button>
    <button type="button" class="cp-btn-outline" style="font-size:13px; color:#b91c1c; border-color:rgba(185,28,28,.35);" onclick="cp_excluirDefinitivo('${cp_esc(m.id)}')">Excluir definitivamente</button>
   </div></div>`;
 }).join('');
 return `<div style="grid-column:1/-1; margin-top:1rem; display:flex; flex-direction:column; gap:.6rem;">
  <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;"><h3 style="margin:0; font-size:16px; color:#334155;">Mentorados arquivados</h3>${botao}</div>
  <p style="margin:0; font-size:13px; color:#64748b;">Arquivados não aparecem na sua lista, mas a ficha e o histórico continuam guardados. Use "Excluir definitivamente" quando o mentorado pedir a exclusão dos dados dele (LGPD).</p>
  ${linhas}</div>`;
}
window.cp_alternarArquivados = function () { cp_verArquivados = !cp_verArquivados; cp_renderMenteesList(); };

window.cp_restaurarMentorado = async function (id) {
 if (!window.supabaseClient) return;
 const { data, error } = await window.supabaseClient.from('Usuarios').update({ arquivado: false, arquivado_em: null, arquivado_motivo: null }).eq('id', id).select('id');
 if (error || !data || !data.length) {
  alert('Não foi possível restaurar o mentorado.' + (error && error.message ? '\n\n' + error.message : ''));
  return;
 }
 alert('Mentorado restaurado. Ele voltou para a sua lista.');
 await cp_init();
};

// Exclusão definitiva a pedido do mentorado (LGPD). Apaga cadastro, prontuário, anotações,
// telemetrias e histórico do cadastro. Não tem volta. Feita no banco (mentora_excluir_mentorado),
// que confere se o mentorado é desta mentora (ou se quem pede é a administração).
window.cp_excluirDefinitivo = async function (id) {
 const m = cp_mentees.concat(cp_arquivados).find(x => String(x.id) === String(id));
 if (!m || !window.supabaseClient) return;
 const nome = String(m.nome || '').trim();
 const digitado = prompt('EXCLUIR DEFINITIVAMENTE (LGPD)\n\nIsto apaga para sempre o cadastro, o prontuário, as anotações, as telemetrias e todo o histórico deste mentorado. Não é possível desfazer.\n\nUse só quando o próprio mentorado pedir a exclusão dos dados dele.\n\nPara confirmar, digite o nome do mentorado: ' + nome);
 if (digitado === null) return;
 const norm = t => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
 if (!nome || norm(digitado) !== norm(nome)) { alert('O nome digitado não confere. Nada foi excluído.'); return; }
 const { data, error } = await window.supabaseClient.rpc('mentora_excluir_mentorado', { p_mentorado: m.id });
 if (error) { alert('Não foi possível excluir.\n\n' + (error.message || 'Tente novamente.')); return; }
 const d = data || {};
 if (cp_currentMentee && String(cp_currentMentee.id) === String(m.id)) cp_closeProfile();
 alert('Mentorado excluído definitivamente.\n\nForam apagados: cadastro, ' + (d.sessoes_e_registros || 0) + ' registro(s) do prontuário, ' + (d.anotacoes || 0) + ' anotação(ões) e ' + (d.telemetrias || 0) + ' telemetria(s).\n\nFica guardado apenas um registro, sem dados pessoais, de que a exclusão foi feita e quando.');
 await cp_init();
};

// Arquivar mentorado: sai da lista da mentora, mas a ficha e TODO o histórico
// continuam salvos na nuvem. Nada é apagado.
window.cp_excluirMentorado = async function() {
 if (!cp_currentMentee) return;
 const motivo = await cp_escolherMotivoArquivo();
 if (!motivo) return;
 if (!window.supabaseClient) {
 alert('Erro: Banco de dados não conectado!');
 return;
 }

 const { data, error } = await window.supabaseClient
 .from('Usuarios')
 .update({ arquivado: true, arquivado_em: new Date().toISOString(), arquivado_motivo: motivo })
 .eq('id', cp_currentMentee.id)
 .select('id');

 if (error || !data || data.length === 0) {
 console.error('Erro ao arquivar mentorado:', error);
 alert('Não foi possível arquivar o mentorado. Tente novamente.\n\nDetalhe: ' + ((error && error.message) || 'o banco não permitiu a alteração'));
 return;
 }

 cp_closeProfile();
 alert('Mentorado arquivado. Ele fica em "Ver arquivados", no fim da lista, e o histórico continua salvo.');
 await cp_init();
};

window.cp_salvarAnotacao = async function() {
 const text = document.getElementById('cp-mentee-notes').value;
 if (!window.supabaseClient) return;
 
 try {
   // Grava uma nova versão (as anteriores continuam salvas; a tela mostra a mais recente)
   const { error: insErr } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{
     mentorado_id: cp_currentMentee.id,
     tipo: 'anotacao',
     dados: { texto: text }
   }]);
   if (insErr) throw insErr;
   
   await cp_init();
   alert('Anotação salva com sucesso!');
 } catch(err) {
   console.error('Erro ao salvar anotação:', err);
   alert('Não foi possível salvar a anotação no banco de dados. Tente novamente.\n\nDetalhe: ' + (err.message || err));
 }
};

window.cp_apagarAnotacao = async function() {
 if (confirm('Limpar as anotações? A versão anterior continua guardada no histórico.')) {
 if (!window.supabaseClient) return;
 const { error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{
 mentorado_id: cp_currentMentee.id,
 tipo: 'anotacao',
 dados: { texto: '' }
 }]);
 if (error) {
 alert('Não foi possível limpar as anotações. Tente novamente.\n\nDetalhe: ' + (error.message || error));
 return;
 }
 document.getElementById('cp-mentee-notes').value = '';
 await cp_init();
 }
};

// ── CONFIGURAÇÃO DOS 9 NICHOS DE MENTORIA ──
const CP_NICHOS_CONFIG = {
 clinico: {
 nome: 'Emocional / Traumas',
 color: '#6366f1',
 dominios: [
 { key: 'confianca', name: 'Índice de Confiança', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 66 },
 { key: 'trauma', name: 'Carga Emocional', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 },
 { key: 'regulacao', name: 'Regulação Emocional', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'autoestima', name: 'Autoestima', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['conflito familiar', 'autoridade', 'rejeição', 'esquiva emocional', 'medo de ser deixado de lado', 'desligamento', 'vergonha']
 },
 disc: {
 nome: 'Perfil Comportamental DISC',
 color: '#db2777',
 dominios: [
 { key: 'dominancia', name: 'Dominância (D)', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'influencia', name: 'Influência (I)', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'estabilidade', name: 'Estabilidade (S)', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'conformidade', name: 'Conformidade (C)', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['ritmo acelerado', 'orientação a prazos', 'comunicação direta', 'respeito a regras', 'impulsividade']
 },
 lideranca: {
 nome: 'Liderança — LeaderMap',
 color: '#38b2d8',
 dominios: [
 { key: 'estrategia', name: 'Visão Estratégica', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'ie', name: 'Inteligência Emocional', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'equipe', name: 'Gestão de Equipe', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'execucao', name: 'Capacidade de Execução', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['delegação', 'gestão de conflitos', 'feedback estruturado', 'alinhamento de metas', 'postura executiva']
 },
 comunicacao: {
 nome: 'Comunicação Assertiva',
 color: '#8b5cf6',
 dominios: [
 { key: 'clareza', name: 'Clareza de Expressão', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'empatia', name: 'Empatia e Conexão', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'assertividade', name: 'Assertividade', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'escuta', name: 'Escuta Ativa', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['oratória', 'expressão de limites', 'dificuldade de dizer não', 'feedback difícil', 'persuasão']
 },
 transicao: {
 nome: 'Transição de Carreira',
 color: '#f59e0b',
 dominios: [
 { key: 'clareza', name: 'Clareza de Objetivo', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'prontidao', name: 'Prontidão de Ação', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'adaptabilidade', name: 'Adaptabilidade', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'networking', name: 'Rede de Contatos', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['mudança de área', 'perda de renda', 'atualização de currículo', 'perfil no linkedin', 'entrevistas']
 },
 ie: {
 nome: 'Inteligência Emocional',
 color: '#10b981',
 dominios: [
 { key: 'autoconsciencia', name: 'Autoconsciência', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'autoregulacao', name: 'Autorregulação', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'empatia', name: 'Empatia Relacional', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'habilidades', name: 'Habilidades Sociais', scale: ['Baixas', 'Médias', 'Altas'], defaultVal: 66 }
 ],
 sugestoesTags: ['explosões de raiva', 'ansiedade social', 'autocontrole', 'ruminacao', 'tolerância ao estresse']
 },
 produtividade: {
 nome: 'Produtividade & Foco',
 color: '#06b6d4',
 dominios: [
 { key: 'foco', name: 'Foco & Concentração', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 66 },
 { key: 'tempo', name: 'Gestão do Tempo', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'energia', name: 'Nível de Energia', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 66 },
 { key: 'organizacao', name: 'Organização Pessoal', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['procrastinação', 'interrupções frequentes', 'falta de rotina', 'priorização', 'multitarefas']
 },
 impostor: {
 nome: 'Síndrome do Impostor',
 color: '#ec4899',
 dominios: [
 { key: 'autoeficacia', name: 'Autoeficácia', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'merecimento', name: 'Senso de Merecimento', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 66 },
 { key: 'perfeccionismo', name: 'Perfeccionismo', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 66 },
 { key: 'autocompaixao', name: 'Autocompaixão', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 }
 ],
 sugestoesTags: ['dúvida sobre capacidade', 'medo de exposição', 'comparação com pares', 'autossabotagem']
 },
 burnout: {
 nome: 'Burnout & Vitalidade',
 color: '#ef4444',
 dominios: [
 { key: 'exaustao', name: 'Nível de Exaustão', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 50 },
 { key: 'vitalidade', name: 'Vitalidade & Vigor', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'realizacao', name: 'Realização Pessoal', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 66 },
 { key: 'cargamental', name: 'Carga Mental', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 }
 ],
 sugestoesTags: ['esgotamento físico', 'trabalho fora do horário', 'insônia', 'sobrecarga crônica', 'limite de esforço']
 },
 vendas: {
 nome: 'Vendas & Negociação',
 color: '#059669',
 dominios: [
 { key: 'prospeccao', name: 'Prospecção & Geração de Oportunidades', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 },
 { key: 'diagnostico', name: 'Diagnóstico & Rapport', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 50 },
 { key: 'objecoes', name: 'Contorno de Objeções', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 50 },
 { key: 'fechamento', name: 'Fechamento & Follow-up', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 50 }
 ],
 sugestoesTags: ['medo do não', 'desconto excessivo', 'falta de follow-up', 'baixa prospecção', 'pipeline vazio']
 },
 geral: {
 nome: 'Geral / Desenvolvimento',
 color: '#4F46E5',
 dominios: [
 { key: 'clareza', name: 'Clareza de Objetivos', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 },
 { key: 'autoconfianca', name: 'Autoconfiança', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 },
 { key: 'execucao', name: 'Execução & Disciplina', scale: ['Baixa', 'Média', 'Alta'], defaultVal: 50 },
 { key: 'bemestar', name: 'Bem-estar & Energia', scale: ['Baixo', 'Médio', 'Alto'], defaultVal: 50 }
 ],
 sugestoesTags: ['procrastinação', 'falta de foco', 'insegurança', 'sobrecarga', 'baixa autoestima']
 }
};

window.cp_openNovaObs = function() {
 cp_switchTab('telemetria');
 const el = document.getElementById('cp-tab-content-telemetria');
 if (el) el.scrollIntoView({ behavior: 'smooth' });
 cp_atualizarDominiosNichoInline();
};

window.cp_abrirModalObservacaoManual = function() {
 const modal = document.getElementById('cp-modal-obs-manual');
 if (!modal) {
 const id = cp_currentMentee ? cp_currentMentee.id : '';
 window.location.href = 'telemetria_traumas.html?id=' + id;
 return;
 }
 modal.style.display = 'flex';
 
 // Configura o nicho padrão de acordo com o mentorado atual
 const selectNicho = document.getElementById('cp-obs-nicho');
 if (selectNicho && cp_currentMentee && cp_currentMentee.metodo) {
 const m = cp_currentMentee.metodo.toLowerCase();
 if (m.includes('lider')) selectNicho.value = 'lideranca';
 else if (m.includes('disc')) selectNicho.value = 'disc';
 else if (m.includes('comunica')) selectNicho.value = 'comunicacao';
 else if (m.includes('transi')) selectNicho.value = 'transicao';
 else if (m.includes('emoc')) selectNicho.value = 'ie';
 else if (m.includes('venda')) selectNicho.value = 'vendas';
 else if (m.includes('ie') || m.includes('inteli')) selectNicho.value = 'ie';
 else if (m.includes('produ')) selectNicho.value = 'produtividade';
 else if (m.includes('impost')) selectNicho.value = 'impostor';
 else if (m.includes('burnout')) selectNicho.value = 'burnout';
 else selectNicho.value = 'geral';
 }
 cp_atualizarDominiosNicho();
};

window.cp_fecharModalObservacaoManual = function() {
 const modal = document.getElementById('cp-modal-obs-manual');
 if (modal) modal.style.display = 'none';
 const drop = document.getElementById('cp-obs-telemetry-dropdown');
 if (drop) drop.classList.remove('show');
};

window.cp_atualizarDominiosNicho = function() {
 const nichoKey = (document.getElementById('cp-obs-nicho') || {}).value || 'geral';
 const cfg = CP_NICHOS_CONFIG[nichoKey] || CP_NICHOS_CONFIG.geral;
 
 // 1. Renderiza os domínios específicos do nicho com Escala 0 a 100
 const container = document.getElementById('cp-obs-dominios-container');
 if (container) {
 let html = '';
 cfg.dominios.forEach(dom => {
 const defaultVal = dom.defaultVal || 66;
 html += `
 <div class="cp-obs-domain-row" style="margin-bottom:16px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span class="cp-obs-domain-name" style="font-weight:600; font-size:14px; color:#1e293b;">${dom.name}</span>
 <span style="font-weight:700; font-size:14px; color:#4f46e5; background:#eef2ff; padding:2px 10px; border-radius:12px;" id="cp-val-modal-${dom.key}">não avaliado</span>
 </div>
 <div class="cp-obs-pill-group" data-domain="${dom.key}" style="display:flex; flex-direction:column; gap:6px;"><input type="range" class="cp-obs-slider-range" min="0" max="100" value="${defaultVal}" style="width:100%; accent-color:#4f46e5; height:6px; cursor:pointer;" oninput="document.getElementById('cp-val-modal-${dom.key}').textContent = this.value + '/100'; this.setAttribute('data-val', this.value);" data-val="${defaultVal}"><div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; font-weight:500;"><span>0 (Baixo)</span>
 <span>25</span>
 <span>50 (Médio)</span>
 <span>75</span>
 <span>100 (Alto)</span>
 </div>
 </div>
 </div>`;
 });
 container.innerHTML = html;
 }
 
 // 2. Renderiza as sugestões de gatilhos/tags para o nicho
 const sugContainer = document.getElementById('cp-obs-sug-tags');
 if (sugContainer) {
 let sugHtml = '<span style="font-size:11px; color:#94a3b8; width:100%; display:block; margin-bottom:2px;">Sugestões de gatilhos para este nicho (clique para adicionar):</span>';
 cfg.sugestoesTags.forEach(tag => {
 sugHtml += `<span class="cp-obs-sug-chip" onclick="cp_adicionarTagManual('${tag}')">+ ${tag}</span>`;
 });
 sugContainer.innerHTML = sugHtml;
 }
};

window.cp_selectPill = function(pillEl) {
 const group = pillEl.closest('.cp-obs-pill-group');
 if (!group) return;
 group.querySelectorAll('.cp-obs-pill').forEach(p => p.classList.remove('selected'));
 pillEl.classList.add('selected');
};

window.cp_selectToggle = function(el) {
 const parent = el.closest('.cp-obs-link-toggle');
 if (!parent) return;
 parent.querySelectorAll('.cp-obs-toggle-card').forEach(c => c.classList.remove('selected'));
 el.classList.add('selected');
};

window.cp_handleTagKey = function(e) {
 if (e.key === 'Enter' && e.target.value.trim()) {
 e.preventDefault();
 cp_adicionarTagManual(e.target.value.trim());
 e.target.value = '';
 }
};

window.cp_adicionarTagManual = function(tagText) {
 const box = document.getElementById('cp-obs-tags-box');
 const input = document.getElementById('cp-obs-tag-input');
 if (!box || !input || !tagText) return;
 
 const existing = Array.from(box.querySelectorAll('.cp-obs-tag-chip')).map(c => c.textContent.replace('×', '').trim());
 if (existing.includes(tagText)) return;

 const chip = document.createElement('span');
 chip.className = 'cp-obs-tag-chip';
 chip.innerHTML = tagText + ' <button onclick="this.parentElement.remove()">×</button>';
 box.insertBefore(chip, input);
};

window.cp_toggleSubmenuTelemetria = function(e) {
 e.stopPropagation();
 const drop = document.getElementById('cp-obs-telemetry-dropdown');
 if (drop) drop.classList.toggle('show');
};

if (!window.cp_globalClickSetup) {
 window.cp_globalClickSetup = true;
 document.addEventListener('click', () => {
 const drop = document.getElementById('cp-obs-telemetry-dropdown');
 if (drop) drop.classList.remove('show');
 });
}

window.cp_redirecionarTelemetria = function(url) {
 const menteeId = cp_currentMentee ? cp_currentMentee.id : '';
 const finalUrl = url + (menteeId ? '?id=' + menteeId : '');
 if (typeof window.abrirTelemetriaIframe === 'function') {
     window.abrirTelemetriaIframe(finalUrl);
 } else {
     window.location.href = finalUrl;
 }
};

window.cp_salvarObservacaoManual = async function() {
 if (!cp_currentMentee) {
 alert("Nenhum mentorado selecionado!");
 return;
 }

 const texto = (document.getElementById('cp-obs-texto') || {}).value || '';
 const nicho = (document.getElementById('cp-obs-nicho') || {}).value || 'geral';
 const cfg = CP_NICHOS_CONFIG[nicho] || CP_NICHOS_CONFIG.geral;
 
 // Coleta as pontuações dos domínios mapeados
 const domainScores = {};
 document.querySelectorAll('#cp-obs-dominios-container .cp-obs-pill-group').forEach(group => {
 const domainKey = group.getAttribute('data-domain');
 const rangeInp = group.querySelector('input[type="range"]');
 if (!rangeInp || !rangeInp.hasAttribute('data-val')) return; // não avaliado: não entra (antes gravava 66 sem a mentora escolher)
 domainScores[domainKey] = parseInt(rangeInp.value, 10);
 });

 // Coleta as tags de gatilhos
 const tagsBox = document.getElementById('cp-obs-tags-box');
 const tags = tagsBox ? Array.from(tagsBox.querySelectorAll('.cp-obs-tag-chip')).map(c => c.textContent.replace('×', '').trim()) : [];

 // Link Type
 const toggleCard = document.querySelector('.cp-obs-toggle-card.selected');
 const linkType = toggleCard ? toggleCard.getAttribute('data-link') : 'independente';

 const mentorEmail = window.mentorEmail || getCookie('mentor_email_logado') || localStorage.getItem('mentor_email') || localStorage.getItem('mentor_email_logado');
 const mentorId = window.mentorId || localStorage.getItem('mentor_id');

 // Mapeia os scores para os cartões gerais do prontuário
 const trustIdx = domainScores.confianca !== undefined ? domainScores.confianca : (domainScores.estrategia || domainScores.clareza || domainScores.foco || domainScores.autoeficacia || undefined);
 const traumaAvg = domainScores.trauma !== undefined ? domainScores.trauma : (domainScores.exaustao || domainScores.perfeccionismo || undefined);
 const regScore = domainScores.regulacao !== undefined ? domainScores.regulacao : (domainScores.autoregulacao || domainScores.assertividade || domainScores.estabilidade || undefined);
 const selfScore = domainScores.autoestima !== undefined ? domainScores.autoestima : (domainScores.merecimento || domainScores.autocompaixao || domainScores.habilidades || undefined);

 const payload = {
 mentorado_id: cp_currentMentee.id,
 tipo: 'observacao_manual',
 dados: {
 nicho: nicho,
 nichoNome: cfg.nome,
 anotacoes: texto,
 domains: domainScores,
 tags: tags,
 linkType: linkType,
 date: cp_chaveDia(Date.now()),
 createdAt: Date.now(),
 scores: {
 trustIdx: trustIdx,
 traumaAvg: traumaAvg,
 regScore: regScore,
 selfScore: selfScore,
 domains: domainScores
 },
 mentorNotes: texto,
 aiAnalysis: ` Observação Manual (${cfg.nome}): ${texto || 'Sessão registrada pelo mentor.'}`
 }
 };

 if (!window.supabaseClient) {
 alert("Erro: Banco de dados não conectado!");
 return;
 }

 try {
 const { error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([payload]);

 if (error) throw error;

 cp_fecharModalObservacaoManual();
 alert('Observação registrada com sucesso no prontuário!');
 
 await cp_init();
 if (cp_currentMentee) cp_openProfile(cp_currentMentee.id);
 } catch(err) {
 console.error("Erro ao salvar observação manual:", err);
 alert("Erro ao salvar no banco de dados: " + (err.message || 'Desconhecido'));
 }
};

window.cp_atualizarDominiosNichoInline = function() {
 const menteeId = cp_currentMentee ? cp_currentMentee.id : null;
 const elObNicho = menteeId ? document.getElementById('cp-ob-nicho-select-' + menteeId) : null;
 const elInlineNicho = document.getElementById('cp-obs-nicho-inline');
 const nichoKey = (elObNicho ? elObNicho.value : '') || (elInlineNicho ? elInlineNicho.value : '') || 'geral';
 const cfg = CP_NICHOS_CONFIG[nichoKey] || CP_NICHOS_CONFIG.geral;
 
 // 1. Renderiza os domínios específicos do nicho com Escala 0 a 100
 const container = document.getElementById('cp-obs-dominios-container-inline');
 if (container) {
 let html = '';
 cfg.dominios.forEach(dom => {
 const defaultVal = dom.defaultVal || 66;
 html += `
 <div class="cp-obs-domain-row" style="margin-bottom:16px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span class="cp-obs-domain-name" style="font-weight:600; font-size:14px; color:#1e293b;">${dom.name}</span>
 <span style="font-weight:700; font-size:14px; color:#4f46e5; background:#eef2ff; padding:2px 10px; border-radius:12px;" id="cp-val-inline-${dom.key}">não avaliado</span>
 </div>
 <div class="cp-obs-pill-group" data-domain="${dom.key}" style="display:flex; flex-direction:column; gap:6px;"><input type="range" class="cp-obs-slider-range" min="0" max="100" value="${defaultVal}" style="width:100%; accent-color:#4f46e5; height:6px; cursor:pointer;" oninput="document.getElementById('cp-val-inline-${dom.key}').textContent = this.value + '/100'; this.setAttribute('data-val', this.value);" data-val="${defaultVal}"><div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; font-weight:500;"><span>0 (Baixo)</span>
 <span>25</span>
 <span>50 (Médio)</span>
 <span>75</span>
 <span>100 (Alto)</span>
 </div>
 </div>
 </div>`;
 });
 container.innerHTML = html;
 }
 
 // 2. Renderiza as sugestões de gatilhos/tags para o nicho
 const sugContainer = document.getElementById('cp-obs-sug-tags-inline');
 if (sugContainer) {
 let sugHtml = '<span style="font-size:11px; color:#94a3b8; width:100%; display:block; margin-bottom:2px;">Sugestões de gatilhos para este nicho (clique para adicionar):</span>';
 cfg.sugestoesTags.forEach(tag => {
 sugHtml += `<span class="cp-obs-sug-chip" onclick="cp_adicionarTagManualInline('${tag}')">+ ${tag}</span>`;
 });
 sugContainer.innerHTML = sugHtml;
 }
};

window.cp_handleTagKeyInline = function(e) {
 if (e.key === 'Enter' && e.target.value.trim()) {
 e.preventDefault();
 cp_adicionarTagManualInline(e.target.value.trim());
 e.target.value = '';
 }
};

window.cp_adicionarTagManualInline = function(tagText) {
 const box = document.getElementById('cp-obs-tags-box-inline');
 const input = document.getElementById('cp-obs-tag-input-inline');
 if (!box || !input || !tagText) return;
 
 const existing = Array.from(box.querySelectorAll('.cp-obs-tag-chip')).map(c => c.textContent.replace('×', '').trim());
 if (existing.includes(tagText)) return;

 const chip = document.createElement('span');
 chip.className = 'cp-obs-tag-chip';
 chip.innerHTML = tagText + ' <button onclick="this.parentElement.remove()">×</button>';
 box.insertBefore(chip, input);
};

window.cp_toggleSubmenuTelemetriaInline = function(e) {
 e.stopPropagation();
 const drop = document.getElementById('cp-obs-telemetry-dropdown-inline');
 if (drop) drop.classList.toggle('show');
};

window.cp_salvarObservacaoManualInline = async function() {
 if (!cp_currentMentee) {
 alert("Nenhum mentorado selecionado!");
 return;
 }

 const texto = (document.getElementById('cp-obs-texto-inline') || {}).value || '';
 const elObAnalise = document.getElementById('cp-ob-analise-mentor-' + cp_currentMentee.id);
 const elObPlano = document.getElementById('cp-ob-plano-acao-' + cp_currentMentee.id);
 const analiseDiag = (document.getElementById('cp-obs-analise-diag-inline') || elObAnalise || {}).value || '';
 const planoAcao = (document.getElementById('cp-obs-plano-acao-inline') || elObPlano || {}).value || '';
 const nicho = (document.getElementById('cp-obs-nicho-inline') || {}).value || 'geral';
 const cfg = CP_NICHOS_CONFIG[nicho] || CP_NICHOS_CONFIG.geral;

 
 // Coleta as pontuações dos domínios mapeados
 const domainScores = {};
 document.querySelectorAll('#cp-obs-dominios-container-inline .cp-obs-pill-group').forEach(group => {
 const domainKey = group.getAttribute('data-domain');
 const rangeInp = group.querySelector('input[type="range"]');
 if (!rangeInp || !rangeInp.hasAttribute('data-val')) return; // não avaliado: não entra (antes gravava 66 sem a mentora escolher)
 domainScores[domainKey] = parseInt(rangeInp.value, 10);
 });

 // Coleta as tags de gatilhos
 const tagsBox = document.getElementById('cp-obs-tags-box-inline');
 const tags = tagsBox ? Array.from(tagsBox.querySelectorAll('.cp-obs-tag-chip')).map(c => c.textContent.replace('×', '').trim()) : [];

 // Link Type
 const toggleCard = document.querySelector('#cp-tab-content-telemetria .cp-obs-toggle-card.selected');
 const linkType = toggleCard ? toggleCard.getAttribute('data-link') : 'independente';

 // Mapeia os scores para os cartões gerais do prontuário
 const trustIdx = domainScores.confianca !== undefined ? domainScores.confianca : (domainScores.estrategia || domainScores.clareza || domainScores.foco || domainScores.autoeficacia || undefined);
 const traumaAvg = domainScores.trauma !== undefined ? domainScores.trauma : (domainScores.exaustao || domainScores.perfeccionismo || undefined);
 const regScore = domainScores.regulacao !== undefined ? domainScores.regulacao : (domainScores.autoregulacao || domainScores.assertividade || domainScores.estabilidade || undefined);
 const selfScore = domainScores.autoestima !== undefined ? domainScores.autoestima : (domainScores.merecimento || domainScores.autocompaixao || domainScores.habilidades || undefined);

 const payload = {
 mentorado_id: cp_currentMentee.id,
 tipo: 'observacao_manual',
 dados: {
 nicho: nicho,
 nichoNome: cfg.nome,
 anotacoes: texto,
 analiseDiagnostico: analiseDiag,
 planoAcao: planoAcao,
 domains: domainScores,
 tags: tags,
 linkType: linkType,
 date: cp_chaveDia(Date.now()),
 createdAt: Date.now(),
 scores: {
 trustIdx: trustIdx,
 traumaAvg: traumaAvg,
 regScore: regScore,
 selfScore: selfScore,
 domains: domainScores
 },
 mentorNotes: texto,
 aiAnalysis: ` Observação Manual (${cfg.nome}): ${texto || 'Sessão registrada pelo mentor.'}`
 }
 };

 if (!window.supabaseClient) {
 alert("Erro: Banco de dados não conectado!");
 return;
 }

 try {
 const { error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([payload]);

 if (error) throw error;

 alert('Observação registrada com sucesso no prontuário!');
 
 await cp_init();
 if (cp_currentMentee) {
 cp_openProfile(cp_currentMentee.id);
 cp_switchTab('telemetria');
 }
 } catch(err) {
 console.error("Erro ao salvar observação manual:", err);
 alert("Erro ao salvar no banco de dados: " + (err.message || 'Desconhecido'));
 }
};

// ── TAB SWITCHING ──
window.cp_switchTab = function(tab) {
 const tabs = ['visao', 'telemetria', 'historico', 'engajamento'];
 tabs.forEach(t => {
 const btn = document.getElementById('cp-tab-' + t);
 const content = document.getElementById('cp-tab-content-' + t);
 if (btn) btn.classList.toggle('active', t === tab);
 if (content) content.style.display = t === tab ? 'block' : 'none';
 });

 // Show notes panel unless viewing history
 const notesPanel = document.getElementById('cp-notes-panel');
 if (notesPanel) notesPanel.style.display = tab === 'historico' ? 'none' : 'block';

 if (tab === 'telemetria') {
 if (typeof window.cp_renderOnboardingSection === 'function') {
 window.cp_renderOnboardingSection();
 }
 if (cp_currentMentee) cp_renderCaderno(cp_currentMentee.id);
 }
 // gráficos de evolução agora ficam na Visão Geral (desenhados quando a aba está visível)
 if (tab === 'visao') setTimeout(cp_renderTelemetriaCharts, 30);
 if (tab === 'historico') {
 if (typeof window.cp_abrirDia === 'function') window.cp_abrirDia(0);
 else if (typeof window.cp_showSessionDetail === 'function') window.cp_showSessionDetail(0);
 }
 if (tab === 'engajamento' && cp_currentMentee) cp_renderEngajamento(cp_currentMentee.id);
 if (tab === 'visao' && cp_currentMentee && typeof cp_vgDashboard === 'function') { try { cp_vgDashboard(); } catch (e) { console.warn('Visão Geral:', e); } }
};

// ── ABA ENGAJAMENTO ──
// v7 (05/10/2026): o cálculo foi refeito e mora em engajamento.js. Sessão = compromisso da Agenda
// (realizada / cancelada / remarcada / falta) ou Registro do Mentor; ferramentas e telemetrias não
// contam como sessão. Ver o cabeçalho de engajamento.js para os sinais, pesos e níveis.
const CP_ENGAJ_JANELA_DIAS = 21; // mesmo limite já usado na Visão Geral para sinalizar alerta de ritmo
const cp_engajCache = { agendaCarregada: false };

window.cp_ocultarLembreteSessao = async function(menteeId) {
 if (!window.supabaseClient) return;
 const dados = { lembreteProximaSessaoOculto: true };
 const { error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{
 mentorado_id: menteeId, tipo: 'engajamento_pref', dados
 }]);
 if (error) {
 console.error('Erro ao dispensar lembrete de sessão:', error);
 alert('Não foi possível salvar. Tente novamente.\n\nDetalhe: ' + (error.message || error));
 return;
 }
 // Registra também na memória da página, para o lembrete sumir na hora
 // (sem isto ele reaparecia até a página ser recarregada).
 cp_all_sessions.push({ mentorado_id: menteeId, tipo: 'engajamento_pref', dados, created_at: new Date().toISOString() });
 cp_renderEngajamento(menteeId);
};

// O cálculo do engajamento (risco, trajetória, órbita, alerta e PDCA) fica em engajamento.js (v7).

function cp_engajInjetarEstilo() {
 if (document.getElementById('cpe-estilo')) return;
 const st = document.createElement('style');
 st.id = 'cpe-estilo';
 st.textContent = `
#cp-engajamento-content .cpe-fundo{background:#eef1f5;border-radius:16px;padding:18px 18px 4px}
#cp-engajamento-content .cpe-topo{margin:0 0 18px}
#cp-engajamento-content .cpe-topo-r{font-size:14px;color:#6b7280;text-transform:uppercase}
#cp-engajamento-content .cpe-topo-n{font-size:20px;font-weight:700;color:#111827;margin-top:4px}
#cp-engajamento-content .cpe-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-bottom:20px}
#cp-engajamento-content .cpe-card{background:#fff;border:1px solid #e3e7ee;border-radius:16px;padding:22px 24px}
#cp-engajamento-content .cpe-bloco{margin-bottom:20px}
#cp-engajamento-content .cpe-rot{font-size:14px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:#374151;margin-bottom:14px}
#cp-engajamento-content .cpe-num{font-size:38px;font-weight:700;color:#111827;line-height:1.1}
#cp-engajamento-content .cpe-linha{display:flex;align-items:center;gap:12px}
#cp-engajamento-content .cpe-sub{font-size:13px;color:#64748b;margin-top:4px;line-height:1.5}
#cp-engajamento-content .cpe-vazio{font-size:13px;color:#64748b;line-height:1.5}
#cp-engajamento-content .cpe-selo{font-size:13px;font-weight:600;padding:4px 12px;border-radius:999px}
#cp-engajamento-content .cpe-ok{background:#dcfce7;color:#166534}
#cp-engajamento-content .cpe-est{background:#dbeafe;color:#1e40af}
#cp-engajamento-content .cpe-at{background:#fdebd3;color:#9a4a07}
#cp-engajamento-content .cpe-cr{background:#fee2e2;color:#991b1b}
#cp-engajamento-content .cpe-prox{display:flex;align-items:center;gap:16px}
#cp-engajamento-content .cpe-data{border:1px solid #e5e9f0;background:#f8fafc;border-radius:10px;width:70px;height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center}
#cp-engajamento-content .cpe-data b{font-size:22px;color:#0f172a;line-height:1}
#cp-engajamento-content .cpe-data span{font-size:12px;color:#64748b;margin-top:4px}
#cp-engajamento-content .cpe-prox-tit{font-size:16px;font-weight:600;color:#0f172a}
#cp-engajamento-content .cpe-previs{display:flex;align-items:center;gap:18px}
#cp-engajamento-content .cpe-previs svg{flex-shrink:0;width:96px;height:96px}
#cp-engajamento-content .cpe-previs-txt{font-size:14px;color:#64748b;line-height:1.6}
#cp-engajamento-content .cpe-lembrete{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#92400e;line-height:1.5}
#cp-engajamento-content .cpe-lembrete a{color:#92400e;font-weight:600;text-decoration:underline}
#cp-engajamento-content .cpe-lembrete button{border:none;background:none;color:#92400e;font-size:18px;cursor:pointer;line-height:1;padding:0}
#cp-engajamento-content .cpe-barra{display:flex;align-items:center;gap:12px;margin:10px 0;font-size:14px;color:#334155}
#cp-engajamento-content .cpe-pt{width:10px;height:10px;border-radius:50%;flex-shrink:0}
#cp-engajamento-content .cpe-bn{width:250px;flex-shrink:0;font-size:15px;color:#374151;line-height:1.35}
#cp-engajamento-content .cpe-trilho{flex:1;height:8px;background:#eef0f4;border-radius:6px;overflow:hidden}
#cp-engajamento-content .cpe-trilho div{height:100%;border-radius:6px}
#cp-engajamento-content .cpe-bp{width:52px;text-align:right;font-weight:500;font-size:15px;color:#374151}
#cp-engajamento-content .cpe-cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
#cp-engajamento-content .cpe-orb{width:100%;max-width:900px;height:auto;display:block;margin:0 auto}
#cp-engajamento-content .cpe-orb-t{font-size:15px;fill:#9aa3b2}
#cp-engajamento-content .cpe-orb-l{font-size:15px;fill:#5b6475}
#cp-engajamento-content .cpe-leg{display:flex;flex-wrap:wrap;gap:18px;font-size:13px;color:#475569;margin-top:6px}
#cp-engajamento-content .cpe-leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
#cp-engajamento-content .cpe-alerta{background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:20px 24px;margin-bottom:20px}
#cp-engajamento-content .cpe-alerta .cpe-rot{color:#9a4a07}
#cp-engajamento-content .cpe-alerta-txt{font-size:15px;color:#9a4a07;line-height:1.6}
#cp-engajamento-content .cpe-alerta-nota{font-size:12.5px;color:#64748b;font-style:italic;margin-top:8px}
#cp-engajamento-content .cpe-alerta-ok{background:#f0fdf4;border-color:#bbf7d0}
#cp-engajamento-content .cpe-btn-ia{margin-top:12px;background:#5B2DA3;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
#cp-engajamento-content .cpe-btn-ia:disabled{opacity:.7;cursor:wait}
#cp-engajamento-content .cpe-btn-ia-sec{background:#fff;color:#5B2DA3;border:1px solid #c9b8ea}
#cp-engajamento-content .cpe-rodape{font-size:12.5px;color:#64748b;line-height:1.6;text-align:center;padding:4px 24px 18px}
#cp-engajamento-content .cpe-como{font-size:13px;color:#475569;line-height:1.6;background:#f8fafc;border:1px solid #e5e9f0;border-radius:10px;padding:10px 14px;margin-top:12px}
#cp-engajamento-content .cpe-alerta-ok .cpe-rot,#cp-engajamento-content .cpe-alerta-ok .cpe-alerta-txt{color:#166534}
#cp-engajamento-content .cpe-plano{margin:0;padding-left:22px;font-size:15px;color:#374151;line-height:1.7}
#cp-engajamento-content .cpe-plano li{margin-bottom:6px}
#cp-engajamento-content .cpe-pdca{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
#cp-engajamento-content .cpe-q{border:1px solid #e5e9f0;border-top:4px solid;border-radius:0;padding:14px 16px;background:#fbfcfe}
#cp-engajamento-content .cpe-q-tit{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;margin-bottom:8px}
#cp-engajamento-content .cpe-q-l{width:26px;height:26px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px}
#cp-engajamento-content .cpe-q-corpo{font-size:14px;color:#334155;line-height:1.6}
#cp-engajamento-content .cpe-prazo{color:#64748b;font-size:12.5px}
#cp-engajamento-content .cpe-chk{display:flex;gap:10px;margin-bottom:8px}
#cp-engajamento-content .cpe-chk-ok{color:#16a34a;font-weight:700}
#cp-engajamento-content .cpe-chk-no{color:#b45309;font-weight:700}
@media (max-width:640px){#cp-engajamento-content .cpe-grid,#cp-engajamento-content .cpe-pdca{grid-template-columns:1fr}#cp-engajamento-content .cpe-bn{width:130px}#cp-engajamento-content .cpe-num{font-size:28px}}`;
 document.head.appendChild(st);
}

// ── ONBOARDING HÍBRIDO ──
window.cp_testarOnboarding = function(id) {
 const menteeId = id || (cp_currentMentee ? cp_currentMentee.id : '1');
 const fullUrl = window.location.href;
 const baseUrl = fullUrl.substring(0, fullUrl.lastIndexOf('/') + 1);
 const link = baseUrl + 'onboarding.html?id=' + encodeURIComponent(menteeId);
 window.open(link, '_blank');
};

window.cp_configurarDominioOnboarding = function() {
 const actualDomain = localStorage.getItem('onboarding_custom_domain') || '';
 const newDomain = prompt('Digite o endereço (URL) onde seu sistema está publicado na web (ex: https://meusite.com):\n\nIsso garantirá que os links copiados funcionem no WhatsApp dos seus mentorados.', actualDomain);
 
 if (newDomain !== null) {
 let formatted = newDomain.trim();
 if (formatted && !formatted.startsWith('http://') && !formatted.startsWith('https://')) {
 formatted = 'https://' + formatted;
 }
 if (formatted && !formatted.endsWith('/')) {
 formatted += '/';
 }
 localStorage.setItem('onboarding_custom_domain', formatted);
 alert(formatted ? ' Domínio web salvo com sucesso: ' + formatted : 'Domínio personalizado removido.');
 }
};

window.cp_copiarLinkOnboarding = function(id) {
 const menteeId = id || (cp_currentMentee ? cp_currentMentee.id : '1');
 
 const customDomain = localStorage.getItem('onboarding_custom_domain') || '';
 let link = '';
 if (customDomain) {
 link = customDomain.replace(/\/$/, '') + '/onboarding.html?id=' + menteeId;
 } else {
 link = cp_urlDaPasta('onboarding.html') + '?id=' + encodeURIComponent(menteeId);
 }

 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(link).then(() => {
 alert('Link do Onboarding copiado com sucesso!\n\nURL: ' + link);
 }).catch(() => {
 prompt('Copie o link do Onboarding abaixo:', link);
 });
 } else {
 prompt('Copie o link do Onboarding abaixo:', link);
 }
};

window.cp_renderOnboardingSection = function(id) {
 const container = document.getElementById('cp-onboarding-container');
 if (!container) return;

 const menteeId = id || (cp_currentMentee ? cp_currentMentee.id : null);
 if (!menteeId) {
 container.innerHTML = '';
 return;
 }

 // Busca dados no cp_all_sessions ou localStorage
 let data = cp_getOnboardingResp(menteeId);

 // Carrega Análise, Nicho e Plano de Ação salvos do mentor
 let savedNotesObj = {};
 const cpDados = x => { try { return typeof x.dados === 'string' ? JSON.parse(x.dados) : (x.dados || {}); } catch (e) { return {}; } };
 const notesSession = cp_all_sessions
 .filter(s => String(s.mentorado_id) === String(menteeId) && (
 s.tipo === 'onboarding_mentor_notes' ||
 (s.tipo === 'observacao_manual' && (cpDados(s).analiseMentor || cpDados(s).planoAcao))
 ))
 .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 if (notesSession) {
 const d = cpDados(notesSession);
 savedNotesObj = notesSession.tipo === 'onboarding_mentor_notes' ? d : { analise: d.analiseMentor || '', plano: d.planoAcao || '', nicho: d.nicho || '' };
 }
 const savedMentorAnalise = savedNotesObj.analise || '';
 const savedMentorPlano = savedNotesObj.plano || '';
 let savedMentorNicho = savedNotesObj.nicho || '';

 if (!savedMentorNicho && cp_currentMentee && cp_currentMentee.metodo) {
 const m = cp_currentMentee.metodo.toLowerCase();
 if (m.includes('lider')) savedMentorNicho = 'lideranca';
 else if (m.includes('disc')) savedMentorNicho = 'disc';
 else if (m.includes('comunica')) savedMentorNicho = 'comunicacao';
else if (m.includes('transi')) savedMentorNicho = 'transicao';
 else if (m.includes('emoc')) savedMentorNicho = 'ie';
 else if (m.includes('venda')) savedMentorNicho = 'vendas';
 else if (m.includes('ie') || m.includes('inteli')) savedMentorNicho = 'ie';
 else if (m.includes('produ')) savedMentorNicho = 'produtividade';
 else if (m.includes('impost')) savedMentorNicho = 'impostor';
 else if (m.includes('burnout')) savedMentorNicho = 'burnout';
 else savedMentorNicho = 'geral';
 }
 if (!savedMentorNicho) savedMentorNicho = 'geral';

 // Sincroniza campos se existirem
 const elInlineAnalise = document.getElementById('cp-obs-analise-diag-inline');
 const elInlinePlano = document.getElementById('cp-obs-plano-acao-inline');
 const elInlineNicho = document.getElementById('cp-obs-nicho-inline');
 if (elInlineAnalise) elInlineAnalise.value = savedMentorAnalise;
 if (elInlinePlano) elInlinePlano.value = savedMentorPlano;
 if (elInlineNicho) elInlineNicho.value = savedMentorNicho;

 let onboardingContentHtml = '';
 
 if (data) {
 const dataFmt = data.submittedAt ? new Date(data.submittedAt).toLocaleDateString('pt-BR') : 'Recentemente';
 
 if (data.respostas && Array.isArray(data.respostas)) {
 // LAYOUT DINÂMICO NOVO
 let respostasHtml = '';
 data.respostas.forEach((r, idx) => {
 respostasHtml += `
 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;">
 <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 3px;">
 <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700;">PERGUNTA ${idx + 1}</div>
 <button onclick="cp_excluirRespostaOnboarding('${cp_esc(menteeId)}', ${r._idx != null ? r._idx : idx})" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Tirar este item do painel (continua salvo no histórico)">Excluir</button>
 </div>
 <div style="font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px; line-height: 1.3;">${cp_esc(r.pergunta)}</div>
 <div style="font-size: 13px; font-weight: 400; color: #475569; line-height: 1.4; white-space: pre-wrap;">${cp_esc(r.resposta || 'Não respondido')}</div>
 </div>
 `;
 });

 onboardingContentHtml = `
 <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid #F1F5F9; padding-bottom: 12px;">
 <div>
 <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700;">ONBOARDING HÍBRIDO: DIAGNÓSTICO E ALINHAMENTO</span>
 <h2 style="font-size: 0.925rem; margin-top: 2px; color: #334155; font-weight: 600;">Raio-X de Entrada do Mentorado</h2>
 <span style="font-size: 0.75rem; color: #64748B;">Preenchido pelo mentorado em ${dataFmt}</span>
 </div>
 <div style="display: flex; gap: 8px; flex-wrap: wrap;">
 <button onclick="cp_baixarPDFOnboarding('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 6px 14px; border-radius: 100px; font-size: 0.775rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">Baixar PDF Onboarding</button>
 <button onclick="cp_copiarLinkOnboarding('${menteeId}')" style="background: rgba(79, 70, 229, 0.08); color: #4F46E5; border: 1px solid rgba(79, 70, 229, 0.2); padding: 6px 12px; border-radius: 100px; font-size: 0.775rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">Reenviar / Copiar Link</button>
 </div>
 </div>
 <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
 ${respostasHtml}
 </div>
 `;
 } else {
 // LAYOUT LEGADO FIXO
 const desafiosHtml = Array.isArray(data.desafios) && data.desafios.length > 0
 ? data.desafios.map(d => `<li style="margin-bottom: 3px; color: #475569; font-size: 13px; line-height: 1.4;">• ${d}</li>`).join('')
 : '<li style="color: #94A3B8; font-size: 13px;">Nenhum desafio específico marcado</li>';

 onboardingContentHtml = `
 <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid #F1F5F9; padding-bottom: 12px;"><div><span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700;">ONBOARDING HÍBRIDO: DIAGNÓSTICO E ALINHAMENTO</span>
 <h2 style="font-size: 0.925rem; margin-top: 2px; color: #334155; font-weight: 600;">Raio-X de Entrada do Mentorado</h2>
 <span style="font-size: 0.75rem; color: #64748B;">Preenchido pelo mentorado em ${dataFmt}</span>
 </div>
 <div style="display: flex; gap: 8px; flex-wrap: wrap;"><button onclick="cp_baixarPDFOnboarding('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 6px 14px; border-radius: 100px; font-size: 0.775rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">Baixar PDF Onboarding
 </button>
 <button onclick="cp_copiarLinkOnboarding('${menteeId}')" style="background: rgba(79, 70, 229, 0.08); color: #4F46E5; border: 1px solid rgba(79, 70, 229, 0.2); padding: 6px 12px; border-radius: 100px; font-size: 0.775rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">Reenviar / Copiar Link do Onboarding
 </button>
 </div>
 </div>

 <div style="display: grid; grid-template-columns: 1fr; gap: 8px;"><div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 3px;">1. MOMENTO PROFISSIONAL EXATO</div>
 <div style="font-size: 13px; font-weight: 400; color: #475569; line-height: 1.4;">${data.momento || 'Não informado'}</div>
 </div>

 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 3px;">2. DIAGNÓSTICO DA DOR (TEMPO & ESTOPIM)</div>
 <div style="font-size: 13px; color: #475569; line-height: 1.4; white-space: pre-wrap;">${data.estopimTempo || 'Não informado'}</div>
 </div>

 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">3. MAIORES DESAFIOS E INSEGURANÇAS</div>
 <ul style="list-style: none; padding: 0; margin: 0; line-height: 1.4;">${desafiosHtml}
 </ul>
 </div>

 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 3px;">4. A ROTA DE ESCAPE (ANSIEDADE / PREOCUPAÇÕES)</div>
 <div style="font-size: 13px; color: #475569; line-height: 1.4; white-space: pre-wrap;">${data.rotaEscape || 'Nenhum detalhe adicional fornecido'}</div>
 </div>

 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 3px;">5. ALINHAMENTO DE EXPECTATIVAS (RESULTADO PRÁTICO ESPERADO)</div>
 <div style="font-size: 13px; color: #475569; line-height: 1.4; white-space: pre-wrap;">${data.expectativaFinal || 'Não informado'}</div>
 </div>

 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 3px;">6. PRIORIDADE PARA A 1ª SESSÃO</div>
 <div style="font-size: 13px; font-weight: 400; color: #475569; line-height: 1.4;">${data.prioridade || 'Não informada'}</div>
 </div>
 </div>
 `;
 }
 } else {
 onboardingContentHtml = `
 <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid #F1F5F9; padding-bottom: 12px;"><div><span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700;">ONBOARDING HÍBRIDO: DIAGNÓSTICO E ALINHAMENTO</span>
 <h2 style="font-size: 0.925rem; margin-top: 2px; color: #334155; font-weight: 600;">Diagnóstico Inicial Pendente</h2>
 <span style="font-size: 0.75rem; color: #64748B;">O mentorado ainda não respondeu ao formulário digital</span>
 </div>
 <div style="display: flex; gap: 8px; flex-wrap: wrap;">
 <button onclick="cp_copiarLinkOnboarding('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 6px 14px; border-radius: 100px; font-size: 0.775rem; font-weight: 600; cursor: pointer;">Copiar Link do Onboarding
 </button>
 </div>
 </div>

 <!-- CHECKLIST: PERGUNTAS DO ONBOARDING -->
 <div style="background: #F8FAFC; border-radius: 12px; padding: 16px 18px; border: 1px solid #E2E8F0; margin-top: 16px;"><div style="margin-bottom: 12px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">CRIAR PERGUNTAS DO ONBOARDING</div>
 <div style="font-size: 0.775rem; color: #64748B; line-height: 1.4;">Cadastre abaixo as perguntas que o mentorado deverá responder no diagnóstico.
 </div>
 </div>

 <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #E2E8F0;"><button onclick="cp_limparPerguntasOnboarding('${menteeId}')" style="background: rgba(239, 68, 68, 0.08); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 5px 12px; border-radius: 6px; font-size: 0.725rem; font-weight: 600; cursor: pointer; transition: 0.2s;">Limpar Perguntas
 </button>
 </div>

 <div style="display: flex; gap: 8px; margin-bottom: 12px;"><input id="cp-ob-input-${menteeId}" type="text" style="flex: 1; border: 1px solid #CBD5E1; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #334155; outline: none; background: #ffffff;" placeholder="Digite uma pergunta para o mentorado..." onkeydown="if(event.key==='Enter') cp_adicionarPerguntaOnboarding('${menteeId}')"><button onclick="cp_adicionarPerguntaOnboarding('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.775rem; font-weight: 600; cursor: pointer; white-space: nowrap;">Adicionar Pergunta
 </button>
 </div>

 <div id="cp-ob-questions-list-${menteeId}" style="display: flex; flex-direction: column; gap: 6px;"><!-- RENDERIZADO DINAMICAMENTE -->
 </div>
 </div>
 `;
 }

 container.innerHTML = `
 <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px 20px; color: #1E293B; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">${onboardingContentHtml}

 <div style="height: 1px; background: #F1F5F9; margin: 12px 0;"></div>

 <!-- ANÁLISE DO MENTOR SOBRE O DIAGNÓSTICO -->
 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0; margin-bottom: 8px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">ANÁLISE DO MENTOR SOBRE O DIAGNÓSTICO</div>
 <textarea id="cp-ob-analise-mentor-${menteeId}" class="cp-obs-textarea" style="width: 100%; min-height: 70px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px; color: #475569; font-size: 13px; resize: vertical;" placeholder="Escreva aqui a sua análise técnica sobre as respostas e momento do mentorado...">${savedMentorAnalise}</textarea>
 </div>

 <!-- NICHO / ÁREA DA MENTORIA -->
 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0; margin-bottom: 8px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">NICHO / ÁREA DA MENTORIA</div>
 <select id="cp-ob-nicho-select-${menteeId}" onchange="cp_atualizarDominiosNichoInline()" style="width: 100%; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px; color: #334155; font-size: 13px; font-weight: 500; outline: none;"><option value="clinico" ${savedMentorNicho === 'clinico' ? 'selected' : ''}>Emocional / Traumas (Confiança, Carga Emocional, Regulação, Autoestima)</option>
 <option value="lideranca" ${savedMentorNicho === 'lideranca' ? 'selected' : ''}>Liderança — LeaderMap (Estratégia, Inteligência Emocional, Equipe, Execução)</option>
 <option value="comunicacao" ${savedMentorNicho === 'comunicacao' ? 'selected' : ''}>Comunicação Assertiva (Clareza, Empatia, Assertividade, Escuta Ativa)</option>
 <option value="transicao" ${savedMentorNicho === 'transicao' ? 'selected' : ''}>Transição de Carreira (Clareza, Prontidão, Adaptabilidade, Networking)</option>
 <option value="ie" ${savedMentorNicho === 'ie' ? 'selected' : ''}>Inteligência Emocional (Autoconsciência, Autorregulação, Empatia, Hab. Sociais)</option>
 <option value="produtividade" ${savedMentorNicho === 'produtividade' ? 'selected' : ''}>Produtividade & Foco (Foco, Gestão de Tempo, Energia, Organização)</option>
 <option value="impostor" ${savedMentorNicho === 'impostor' ? 'selected' : ''}>Síndrome do Impostor (Autoeficácia, Merecimento, Perfeccionismo, Autocompaixão)</option>
 <option value="burnout" ${savedMentorNicho === 'burnout' ? 'selected' : ''}>Burnout & Vitalidade (Exaustão, Vitalidade, Realização, Carga Mental)</option>
 <option value="vendas" ${savedMentorNicho === 'vendas' ? 'selected' : ''}>Vendas & Negociação (Prospecção, Diagnóstico, Objeções, Fechamento)</option>
 <option value="geral" ${savedMentorNicho === 'geral' ? 'selected' : ''}>Geral / Desenvolvimento (Clareza, Autoconfiança, Execução, Bem-estar)</option>
 </select>
 </div>

 <!-- PLANO DE AÇÃO (FOCO NAS RESPOSTAS DO MENTORADO) -->
 <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 12px; border: 1px solid #E2E8F0; margin-bottom: 8px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">PLANO DE AÇÃO (FOCO NAS RESPOSTAS DO MENTORADO)</div>
 <textarea id="cp-ob-plano-acao-${menteeId}" class="cp-obs-textarea" style="width: 100%; min-height: 70px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 10px; color: #475569; font-size: 13px; resize: vertical;" placeholder="Descreva os passos estratégicos e tarefas prioritárias focadas neste diagnóstico...">${savedMentorPlano}</textarea>
 </div>

 <div style="height: 1px; background: #F1F5F9; margin: 12px 0;"></div>

 <!-- CHECKLIST: DEVER DE CASA -->
 <div style="background: #F8FAFC; border-radius: 12px; padding: 16px 18px; border: 1px solid #E2E8F0;"><div style="margin-bottom: 12px;"><div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; font-weight: 700; margin-bottom: 4px;">CHECKLIST: DEVER DE CASA</div>
 <div style="font-size: 0.775rem; color: #64748B; line-height: 1.4;">Cadastre abaixo as tarefas práticas da mentoria. O mentorado recebe a lista digital para marcar como concluída, enviar a comprovação e justificar o que não cumpriu.
 <div style="margin-top:6px;">Cada tarefa é lida automaticamente: <b>pede comprovação</b> (print, foto, planilha, PDF) → botão para enviar arquivo; <b>semanal</b> → lista 1ª semana, 2ª semana... com resposta, arquivo e concluída; <b>sensível</b> (dinheiro, percentual do salário, peso) → o valor não fica fixo, o mentorado informa o valor combinado com você e a tarefa ganha prazos de 30, 60 e 90 dias. Use <b>Ajustar</b> para corrigir a leitura de uma tarefa.</div>
 </div>
 </div>

 <!-- LINHA DE AÇÕES -->
 <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #E2E8F0;"><button onclick="cp_limparDeverDeCasa('${menteeId}')" style="background: rgba(239, 68, 68, 0.08); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 5px 12px; border-radius: 6px; font-size: 0.725rem; font-weight: 600; cursor: pointer; transition: 0.2s;">Limpar Lista
 </button>
 <button onclick="cp_baixarPDFDeverDeCasa('${menteeId}')" style="background: rgba(79, 70, 229, 0.08); color: #4F46E5; border: 1px solid rgba(79, 70, 229, 0.2); padding: 5px 12px; border-radius: 6px; font-size: 0.725rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: 0.2s;">Baixar PDF Checklist
 </button>
 <button onclick="cp_copiarLinkDeverDeCasa('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 5px 14px; border-radius: 6px; font-size: 0.725rem; font-weight: 600; cursor: pointer; transition: 0.2s;">Copiar Link do Dever de Casa
 </button>
 </div>

 <!-- LINHA DE ADIÇÃO DE TAREFA -->
 <div style="display: flex; gap: 8px; margin-bottom: 12px;"><input id="cp-dc-input-${menteeId}" type="text" style="flex: 1; border: 1px solid #CBD5E1; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #334155; outline: none; background: #ffffff;" placeholder="Digite uma nova tarefa para o mentorado..." onkeydown="if(event.key==='Enter') cp_adicionarTarefaDeverDeCasa('${menteeId}')"><button onclick="cp_adicionarTarefaDeverDeCasa('${menteeId}')" style="background: #4F46E5; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.775rem; font-weight: 600; cursor: pointer; white-space: nowrap;">Adicionar Tarefa
 </button>
 </div>

 <div id="cp-dc-list-${menteeId}" style="display: flex; flex-direction: column; gap: 6px;"><!-- RENDERIZADO DINAMICAMENTE -->
 </div>
 </div>

 </div>
 `;
 setTimeout(() => {
 cp_renderDeverDeCasaList(menteeId, true);
 if (typeof cp_renderOnboardingQuestionsList === 'function') cp_renderOnboardingQuestionsList(menteeId);
 // Busca no banco respostas novas da mentorada (onboarding e dever de casa)
 cp_dcSincronizar(menteeId).then(mudou => {
 if (mudou && cp_currentMentee && String(cp_currentMentee.id) === String(menteeId)) cp_renderOnboardingSection(menteeId);
 });
 }, 50);
};

window.cp_salvarAnalisePlanoOnboarding = async function(menteeId) {
 const elAnalise = document.getElementById('cp-ob-analise-mentor-' + menteeId);
 const elPlano = document.getElementById('cp-ob-plano-acao-' + menteeId);
 const elNicho = document.getElementById('cp-ob-nicho-select-' + menteeId);
 const analiseVal = elAnalise ? elAnalise.value.trim() : '';
 const planoVal = elPlano ? elPlano.value.trim() : '';
 const nichoVal = elNicho ? elNicho.value : 'geral';

 const payload = { analise: analiseVal, plano: planoVal, nicho: nichoVal, updatedAt: new Date().toISOString() };

 if (window.supabaseClient) {
 try {
 const { error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{
 mentorado_id: menteeId,
 tipo: 'onboarding_mentor_notes',
 dados: payload
 }]);
 if (error) throw error;
 } catch (e) {
 console.error('Erro ao salvar análise/plano do onboarding no Supabase:', e);
 alert('Não foi possível salvar no banco de dados — ficou salvo só neste navegador.\n\nDetalhe: ' + (e.message || e));
 return;
 }
 }
 
 // Atualiza também os campos no formulário de registro do mentor para manter sincronizado
 const inlineAnalise = document.getElementById('cp-obs-analise-diag-inline');
 const inlinePlano = document.getElementById('cp-obs-plano-acao-inline');
 const inlineNicho = document.getElementById('cp-obs-nicho-inline');
 if (inlineAnalise) inlineAnalise.value = analiseVal;
 if (inlinePlano) inlinePlano.value = planoVal;
 if (inlineNicho) {
 inlineNicho.value = nichoVal;
 if (typeof cp_atualizarDominiosNichoInline === 'function') cp_atualizarDominiosNichoInline();
 }

 alert('Análise do Mentor, Nicho e Plano de Ação salvos com sucesso!');
};

// ── FUNÇÃO DE SALVAMENTO ÚNICO E COMPLETO DO REGISTRO DO MENTOR ──
window.cp_salvarRegistroCompletoMentor = async function(id) {
 const menteeId = id || (cp_currentMentee ? cp_currentMentee.id : null);
 if (!menteeId) {
 alert("Nenhum mentorado selecionado!");
 return;
 }

 // 1. Coleta Análise do Mentor
 const elObAnalise = document.getElementById('cp-ob-analise-mentor-' + menteeId);
 const elInlineAnalise = document.getElementById('cp-obs-analise-diag-inline');
 const analiseText = (elObAnalise ? elObAnalise.value.trim() : '') || (elInlineAnalise ? elInlineAnalise.value.trim() : '');

 // 2. Coleta Nicho da Mentoria
 const elObNicho = document.getElementById('cp-ob-nicho-select-' + menteeId);
 const elInlineNicho = document.getElementById('cp-obs-nicho-inline');
 const nichoKey = (elObNicho ? elObNicho.value : '') || (elInlineNicho ? elInlineNicho.value : '') || 'geral';

 // 3. Coleta Plano de Ação
 const elObPlano = document.getElementById('cp-ob-plano-acao-' + menteeId);
 const elInlinePlano = document.getElementById('cp-obs-plano-acao-inline');
 const planoText = (elObPlano ? elObPlano.value.trim() : '') || (elInlinePlano ? elInlinePlano.value.trim() : '');

 // 4. Coleta Anotações Extras da Sessão
 const elObTexto = document.getElementById('cp-obs-texto-inline');
 const textoExtra = elObTexto ? elObTexto.value.trim() : '';

 // 5. Bloco de notas da sessão: vai para o histórico, junto com este registro
 const elCaderno = document.getElementById('cpc-texto');
 const textoCaderno = elCaderno ? elCaderno.value.trim() : '';
 // Percepção do mentor sobre a sessão (marcadores que entram no Engajamento)
 const percepcao = typeof cp_engajPercepcaoLer === 'function' ? cp_engajPercepcaoLer() : [];


 // Coleta Domínios Mapeados
 const domainScores = {};
 document.querySelectorAll('#cp-obs-dominios-container-inline .cp-obs-pill-group').forEach(group => {
 const domainKey = group.getAttribute('data-domain');
 const rangeInp = group.querySelector('input[type="range"]');
 if (!rangeInp || !rangeInp.hasAttribute('data-val')) return; // não avaliado: não entra (antes gravava 66 sem a mentora escolher)
 domainScores[domainKey] = parseInt(rangeInp.value, 10);
 });

 // Coleta Tags
 const tagsBox = document.getElementById('cp-obs-tags-box-inline');
 const tags = tagsBox ? Array.from(tagsBox.querySelectorAll('.cp-obs-tag-chip')).map(c => c.textContent.replace('×', '').trim()) : [];

 // Coleta Link Type
 const toggleCard = document.querySelector('#cp-tab-content-telemetria .cp-obs-toggle-card.selected');
 const linkType = toggleCard ? toggleCard.getAttribute('data-link') : 'independente';

 const cfg = CP_NICHOS_CONFIG[nichoKey] || CP_NICHOS_CONFIG.geral;

 // Constrói texto das anotações combinadas
 let combinedNotes = analiseText;
 if (planoText) combinedNotes += (combinedNotes ? '\n\n' : '') + ' PLANO DE AÇÃO: ' + planoText;
 if (textoExtra) combinedNotes += (combinedNotes ? '\n\n' : '') + ' ANOTAÇÕES EXTRAS: ' + textoExtra;

 const trustIdx = domainScores.confianca !== undefined ? domainScores.confianca : (domainScores.estrategia || domainScores.clareza || domainScores.foco || domainScores.autoeficacia || undefined);
 const traumaAvg = domainScores.trauma !== undefined ? domainScores.trauma : (domainScores.exaustao || domainScores.perfeccionismo || undefined);
 const regScore = domainScores.regulacao !== undefined ? domainScores.regulacao : (domainScores.autoregulacao || domainScores.assertividade || domainScores.estabilidade || undefined);
 const selfScore = domainScores.autoestima !== undefined ? domainScores.autoestima : (domainScores.merecimento || domainScores.autocompaixao || domainScores.habilidades || undefined);

 const payloadSupabase = {
 mentorado_id: menteeId,
 tipo: 'observacao_manual',
 dados: {
 nicho: nichoKey,
 nichoNome: cfg.nome,
 anotacoes: combinedNotes,
 analiseMentor: analiseText,
 planoAcao: planoText,
 caderno: textoCaderno,
 percepcao: percepcao,
 domains: domainScores,
 tags: tags,
 linkType: linkType,
 date: cp_chaveDia(Date.now()),
 createdAt: Date.now(),
 scores: {
 trustIdx: trustIdx,
 traumaAvg: traumaAvg,
 regScore: regScore,
 selfScore: selfScore,
 domains: domainScores
 },
 mentorNotes: combinedNotes,
 aiAnalysis: ` Registro do Mentor (${cfg.nome}): ${combinedNotes || (textoCaderno ? 'BLOCO DE NOTAS: ' + textoCaderno : 'Sessão registrada pelo mentor.')}`
 }
 };

 if (window.supabaseClient) {
 try {
 // Um Registro do Mentor por DIA: se já existe um hoje para esta mentorada, ele é ATUALIZADO
 // (anotações e bloco de notas são somados; domínios e tags ficam com a versão mais recente).
 const hojeChave = cp_chaveDia(Date.now());
 const existente = (cp_all_sessions || []).filter(r => r && String(r.mentorado_id) === String(menteeId) && r.tipo === 'observacao_manual' && r.id && cp_chaveDia(r.created_at) === hojeChave)
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 let atualizado = false;
 if (existente) {
  const antigo = cp_parseDados(existente.dados) || {};
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const juntar = (a, b) => a && b ? (a === b ? a : a + '\n\n— ' + hora + ' —\n' + b) : (a || b || '');
  const d = payloadSupabase.dados;
  d.caderno = juntar(antigo.caderno, d.caderno);
 d.percepcao = [...new Set([].concat(Array.isArray(antigo.percepcao) ? antigo.percepcao : [], d.percepcao || []))];
  d.anotacoes = juntar(antigo.anotacoes, d.anotacoes);
  d.mentorNotes = juntar(antigo.mentorNotes, d.mentorNotes);
  d.analiseMentor = d.analiseMentor || antigo.analiseMentor || '';
  d.planoAcao = d.planoAcao || antigo.planoAcao || '';
  d.tags = [...new Set([...(Array.isArray(antigo.tags) ? antigo.tags : []), ...(d.tags || [])])];
  // Mapeamento dos domínios: vale o ÚLTIMO salvamento do dia; os valores anteriores ficam guardados como índice
  const anteriores = Array.isArray(antigo.historicoDomains) ? antigo.historicoDomains.slice() : [];
  if (d.domains && Object.keys(d.domains).length) {
   if (antigo.domains && Object.keys(antigo.domains).length) anteriores.push({ em: antigo.atualizadoEm || existente.created_at, domains: antigo.domains });
  } else {
   d.domains = antigo.domains || {};
   if (antigo.scores) d.scores = antigo.scores;
  }
  d.historicoDomains = anteriores.slice(-6);
  d.aiAnalysis = ` Registro do Mentor (${cfg.nome}): ${d.mentorNotes || (d.caderno ? 'BLOCO DE NOTAS: ' + d.caderno : 'Sessão registrada pelo mentor.')}`;
  d.createdAt = antigo.createdAt || d.createdAt;
  d.atualizadoEm = new Date().toISOString();
  const { data: up, error: eu } = await window.supabaseClient.from('Sessoes_Mentoria').update({ dados: d }).eq('id', existente.id).select('id');
  if (eu) console.warn('Não foi possível atualizar o registro do dia; será criado um novo:', eu.message);
  atualizado = !eu && !!(up && up.length);
  if (!atualizado) payloadSupabase.dados = Object.assign({}, payloadSupabase.dados); // grava como registro novo, com tudo o que foi juntado
 }
 if (!atualizado) {
  const { error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([payloadSupabase]);
  if (error) throw error;
 }
 } catch(err) {
 console.error("Erro ao salvar no Supabase:", err);
 alert('Não foi possível salvar o registro no banco de dados. Tente novamente.\n\nDetalhe: ' + (err.message || err));
 return;
 }
 }

 // bloco de notas já foi para o histórico: limpa a folha e o rascunho
 if (elCaderno) { elCaderno.value = ''; if (typeof cp_cadernoAjustarAltura === 'function') cp_cadernoAjustarAltura(elCaderno); }
 try { sessionStorage.removeItem('cp_caderno_rascunho_' + menteeId); } catch (e) {}
 alert(' Registro do Mentor salvo com sucesso no prontuário!' + (textoCaderno ? '\nO bloco de notas foi guardado no histórico, junto com esta sessão.' : ''));
 await cp_init();
 if (cp_currentMentee) cp_openProfile(cp_currentMentee.id);
};

window.cp_salvarObservacaoManualInline = function() {
 cp_salvarRegistroCompletoMentor();
};

// ── FUNÇÕES DO CHECKLIST DE ONBOARDING ──
// Tira UM item do onboarding do painel da mentora.
// Nada é apagado: grava uma linha 'onboarding_arquivo' apontando para o item.
// O diagnóstico original continua inteiro na nuvem e na linha do tempo.
// Quando todos os itens saem do painel, o onboarding volta a "Pendente"
// e a mentora pode enviar um novo.
window.cp_excluirRespostaOnboarding = async function(menteeId, indiceOriginal) {
 const atual = cp_getOnboardingResp(menteeId);
 if (!atual || !Array.isArray(atual.respostas) || atual._rowId == null) return;
 const item = atual.respostas.find(r => r._idx === indiceOriginal);
 if (!item) return;

 const ultimo = atual.respostas.length === 1;
 const msg = ultimo
 ? 'Este é o último item. O diagnóstico sai do painel e o onboarding volta para "Pendente", para você enviar um novo.\n\nAs respostas continuam salvas no histórico (linha do tempo).\n\nDeseja continuar?'
 : 'Tirar este item do painel?\n\n"' + (item.pergunta || '') + '"\n\nEle continua salvo no histórico (linha do tempo).';
 if (!confirm(msg)) return;

 const { data, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([{
 mentorado_id: menteeId,
 tipo: 'onboarding_arquivo',
 dados: {
 onboarding_id: atual._rowId,
 indice: indiceOriginal,
 pergunta: item.pergunta || '',
 arquivadoEm: new Date().toISOString()
 }
 }])
 .select();

 if (error) {
 console.error('Erro ao arquivar item do onboarding:', error);
 alert('Não foi possível tirar o item do painel. Tente novamente.\n\nDetalhe: ' + (error.message || error));
 return;
 }

 if (Array.isArray(data)) data.forEach(row => cp_all_sessions.unshift(row));
 cp_renderOnboardingSection(menteeId);
};

window.cp_limparPerguntasOnboarding = async function(menteeId) {
 const id = menteeId || (cp_currentMentee ? cp_currentMentee.id : null);
 if (!id) return;
 if (confirm('Deseja realmente limpar todas as perguntas configuradas para o onboarding?')) {
 localStorage.removeItem('onboarding_questions_' + id);
 const ok = await cp_salvarPerguntasOnboarding(id, []);
 cp_renderOnboardingQuestionsList(id);
 if (ok) alert('Perguntas limpas! Agora você pode cadastrar novas.');
 }
};

window.cp_adicionarPerguntaOnboarding = async function(menteeId) {
 const input = document.getElementById('cp-ob-input-' + menteeId);
 if (!input || !input.value.trim()) return;
 const questions = cp_obGetPerguntas(menteeId).concat([input.value.trim()]);
 input.disabled = true;
 const ok = await cp_salvarPerguntasOnboarding(menteeId, questions);
 input.disabled = false;
 if (ok) input.value = '';
 cp_renderOnboardingQuestionsList(menteeId);
};

window.cp_removerPerguntaOnboarding = async function(menteeId, index) {
 const questions = cp_obGetPerguntas(menteeId);
 if (index >= 0 && index < questions.length) {
 questions.splice(index, 1);
 await cp_salvarPerguntasOnboarding(menteeId, questions);
 cp_renderOnboardingQuestionsList(menteeId);
 }
};

// Grava a nova lista de perguntas no banco. Retorna true/false.
window.cp_salvarPerguntasOnboarding = async function(menteeId, questionsArray) {
 const questions = Array.isArray(questionsArray) ? questionsArray : cp_obGetPerguntas(menteeId);

 if (!window.supabaseClient) {
 alert('Banco de dados não conectado. As perguntas NÃO foram salvas.');
 return false;
 }

 const { data, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([{
 mentorado_id: menteeId,
 tipo: 'onboarding_config',
 dados: { questions: questions, updatedAt: new Date().toISOString() }
 }])
 .select();

 if (error) {
 console.error('Erro Supabase ao salvar perguntas do onboarding:', error);
 alert('As perguntas NÃO foram salvas no banco de dados. Tente novamente.\n\nDetalhe: ' + (error.message || error));
 return false;
 }

 if (Array.isArray(data)) data.forEach(row => cp_all_sessions.unshift(row));
 return true;
};

window.cp_renderOnboardingQuestionsList = function(menteeId) {
 const listContainer = document.getElementById('cp-ob-questions-list-' + menteeId);
 if (!listContainer) return;

 cp_obMigrarLegado(menteeId);
 const questions = cp_obGetPerguntas(menteeId);

 if (questions.length === 0) {
 listContainer.innerHTML = `
 <div style="font-size: 0.8rem; color: #94A3B8; font-style: italic; padding: 4px 0;">Nenhuma pergunta cadastrada ainda. Digite a pergunta acima e clique em "Adicionar Pergunta".
 </div>
 `;
 return;
 }

 const idAttr = cp_esc(menteeId);
 let html = '';
 questions.forEach((qText, idx) => {
 html += `
 <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; margin-bottom: 4px;"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;"><div style="font-size: 0.825rem; font-weight: 500; color: #475569; line-height: 1.4; flex: 1;">${idx + 1}. ${cp_esc(qText)}
 </div>
 <div style="display: flex; align-items: center; gap: 8px;"><button onclick="cp_removerPerguntaOnboarding('${idAttr}', ${idx})" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Excluir pergunta">Excluir
 </button>
 </div>
 </div>
 </div>
 `;
 });

 listContainer.innerHTML = html;
};

// ── FUNÇÕES DE PDF E LIMPEZA DE CHECKLIST ──
window.cp_limparDeverDeCasa = async function(menteeId) {
 const id = menteeId || (cp_currentMentee ? cp_currentMentee.id : null);
 if (!id) return;
 if (confirm('Deseja realmente limpar todas as tarefas do checklist deste mentorado?')) {
 localStorage.removeItem('dever_de_casa_tasks_' + id);
 localStorage.removeItem('dever_de_casa_resp_' + id);
 const ok = await cp_salvarTarefasDeverDeCasa(id, []);
 cp_renderDeverDeCasaList(id, true);
 if (ok) alert('Checklist limpo! Agora você pode cadastrar novas tarefas.');
 }
};

window.cp_baixarPDFOnboarding = async function(menteeId) {
 const id = menteeId || (cp_currentMentee ? cp_currentMentee.id : 'mentorado');
 const mentee = cp_currentMentee || { nome: 'Mentorado' };
 const container = document.getElementById('cp-onboarding-container');
 if (!container) {
 alert('Conteúdo do Onboarding não encontrado.');
 return;
 }
 
 if (typeof html2pdf === 'undefined') {
 try { await window.mentoraCarregarHtml2pdf(); }
 catch (e) { alert('Não foi possível carregar o gerador de PDF. Verifique a internet e tente de novo.'); return; }
 }

 const opt = {
 margin: [10, 10, 10, 10],
 filename: `Onboarding_${mentee.nome ? mentee.nome.replace(/\s+/g, '_') : 'Mentorado'}.pdf`,
 image: { type: 'jpeg', quality: 0.98 },
 html2canvas: { scale: 2, useCORS: true },
 jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
 };
 
 html2pdf().set(opt).from(container).save();
};

window.cp_baixarPDFDeverDeCasa = async function(menteeId) {
 const id = menteeId || (cp_currentMentee ? cp_currentMentee.id : '1');
 const mentee = cp_currentMentee || { nome: 'Mentorado' };
 
 if (typeof html2pdf === 'undefined') {
 try { await window.mentoraCarregarHtml2pdf(); }
 catch (e) { alert('Não foi possível carregar o gerador de PDF. Verifique a internet e tente de novo.'); return; }
 }

 const tasks = cp_dcGetTarefas(id);
 const menteeResp = cp_dcGetResposta(id);

 const printDiv = document.createElement('div');
 printDiv.style.padding = '24px';
 printDiv.style.fontFamily = 'Arial, sans-serif';
 printDiv.style.color = '#334155';
 printDiv.style.background = '#ffffff';

 let listHtml = '';
 if (tasks.length === 0) {
 listHtml = '<p style="font-style:italic; color:#94a3b8; font-size:14px;">Nenhuma tarefa cadastrada no checklist.</p>';
 } else {
 tasks.forEach((t, idx) => {
 const resp = menteeResp.find(r => r.taskText === t) || menteeResp.find(r => r.taskIndex === idx) || {};
 const isCompleted = resp.completed === true;
 const justification = resp.justification || '';
 const statusLabel = isCompleted 
 ? '<span style="color:#059669; font-weight:700; background:#ECFDF5; padding:3px 8px; border-radius:12px; font-size:11px;">CONCLUÍDA</span>' 
 : (resp.completed !== undefined 
 ? '<span style="color:#DC2626; font-weight:700; background:#FEF2F2; padding:3px 8px; border-radius:12px; font-size:11px;">NÃO CONCLUÍDA</span>' 
 : '<span style="color:#64748B; background:#F1F5F9; padding:3px 8px; border-radius:12px; font-size:11px;">PENDENTE</span>');

 listHtml += `
 <div style="margin-bottom: 12px; padding: 12px 14px; border: 1px solid #CBD5E1; border-radius: 8px; background: #F8FAFC;"><div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;"><strong style="font-size:14px; color:#1E293B; flex:1;">${idx + 1}. ${cp_esc(t)}</strong>
 <div>${statusLabel}</div>
 </div>
 ${justification ? `
 <div style="margin-top:8px; font-size:12px; color:#92400E; background:#FFFBEB; border:1px solid #FDE68A; padding:8px 10px; border-radius:6px;"><strong>Justificativa do Mentorado:</strong> "${cp_esc(justification)}"
 </div>
 ` : ''}
 </div>
 `;
 });
 }

 printDiv.innerHTML = `
 <div style="border-bottom: 2px solid #4F46E5; padding-bottom: 12px; margin-bottom: 20px;"><h2 style="margin: 0; color: #4F46E5; font-size: 20px; font-weight:700;">CHECKLIST: DEVER DE CASA</h2>
 <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748B;">Mentorado: <strong>${cp_esc(mentee.nome)}</strong> | Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
 </div>
 <div>${listHtml}
 </div>
 `;

 document.body.appendChild(printDiv);
 const opt = {
 margin: [10, 10, 10, 10],
 filename: `Checklist_Dever_de_Casa_${mentee.nome ? mentee.nome.replace(/\s+/g, '_') : 'Mentorado'}.pdf`,
 image: { type: 'jpeg', quality: 0.98 },
 html2canvas: { scale: 2 },
 jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
 };
 html2pdf().set(opt).from(printDiv).save().then(() => {
 document.body.removeChild(printDiv);
 });
};

// ── FUNÇÕES DO CHECKLIST DEVER DE CASA ──
window.cp_testarDeverDeCasa = function(id) {
 const menteeId = id || (cp_currentMentee ? cp_currentMentee.id : '1');
 const fullUrl = window.location.href;
 const baseUrl = fullUrl.substring(0, fullUrl.lastIndexOf('/') + 1);
 const link = baseUrl + 'deverdecasa.html?id=' + encodeURIComponent(menteeId);
 window.open(link, '_blank');
};

window.cp_adicionarTarefaDeverDeCasa = async function(menteeId) {
 const input = document.getElementById('cp-dc-input-' + menteeId);
 if (!input || !input.value.trim()) return;
 const taskText = input.value.trim();

 const tasks = cp_dcGetTarefas(menteeId).concat([taskText]);
 input.disabled = true;
 const ok = await cp_salvarTarefasDeverDeCasa(menteeId, tasks);
 input.disabled = false;
 if (ok) input.value = '';
 cp_renderDeverDeCasaList(menteeId, true);
};

window.cp_removerTarefaDeverDeCasa = async function(menteeId, index) {
 const tasks = cp_dcGetTarefas(menteeId);
 if (index >= 0 && index < tasks.length) {
 tasks.splice(index, 1);
 await cp_salvarTarefasDeverDeCasa(menteeId, tasks);
 cp_renderDeverDeCasaList(menteeId, true);
 }
};

// Grava a nova lista no banco. Retorna true/false.
// Não usa mais localStorage: se o banco falhar, a mentora é avisada e nada muda na tela.
window.cp_salvarTarefasDeverDeCasa = async function(menteeId, tasksArray, ajustesNovos) {
 const tasks = Array.isArray(tasksArray) ? tasksArray : cp_dcGetTarefas(menteeId);
 // ajustes do mentor ficam ligados ao texto da tarefa; os de tarefas removidas saem
 const ajustesBase = ajustesNovos || cp_dcGetAjustes(menteeId);
 const ajustes = {};
 tasks.forEach(t => { if (ajustesBase[t]) ajustes[t] = ajustesBase[t]; });

 if (!window.supabaseClient) {
 alert('Banco de dados não conectado. A lista de tarefas NÃO foi salva.');
 return false;
 }

 const { data, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([{
 mentorado_id: menteeId,
 tipo: 'dever_de_casa_config',
 dados: { tasks: tasks, ajustes: ajustes, updatedAt: new Date().toISOString() }
 }])
 .select();

 if (error) {
 console.error('Erro Supabase ao salvar tarefas do dever de casa:', error);
 alert('A lista de tarefas NÃO foi salva no banco de dados. Tente novamente.\n\nDetalhe: ' + (error.message || error));
 return false;
 }

 // Atualiza a cópia em memória para a tela refletir na hora
 if (Array.isArray(data)) data.forEach(row => cp_all_sessions.unshift(row));
 return true;
};

window.cp_copiarLinkDeverDeCasa = function(menteeId) {
 const customDomain = localStorage.getItem('onboarding_custom_domain') || '';
 let link = '';
 if (customDomain) {
 link = customDomain.replace(/\/$/, '') + '/deverdecasa.html?id=' + menteeId;
 } else {
 link = cp_urlDaPasta('deverdecasa.html') + '?id=' + encodeURIComponent(menteeId);
 }

 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(link).then(() => {
 alert('Link do Dever de Casa copiado com sucesso!\n\nURL: ' + link);
 }).catch(() => {
 prompt('Copie o link do Dever de Casa abaixo:', link);
 });
 } else {
 prompt('Copie o link do Dever de Casa abaixo:', link);
 }
};

window.cp_renderDeverDeCasaList = function(menteeId, semSincronizar) {
 const listContainer = document.getElementById('cp-dc-list-' + menteeId);
 if (!listContainer) return;

 cp_dcMigrarLegado(menteeId);

 // Mostra já o que está em memória e, em paralelo, busca respostas novas no banco
 if (!semSincronizar) {
 cp_dcSincronizar(menteeId).then(mudou => { if (mudou) cp_renderDeverDeCasaList(menteeId, true); });
 }

 const tasks = cp_dcGetTarefas(menteeId);
 const menteeResp = cp_dcGetResposta(menteeId);

 if (tasks.length === 0) {
 listContainer.innerHTML = `
 <div style="font-size: 0.8rem; color: #94A3B8; font-style: italic; padding: 4px 0;">Nenhuma tarefa cadastrada ainda. Digite a tarefa acima e clique em "Adicionar Tarefa".
 </div>
 `;
 return;
 }

 const idAttr = cp_esc(menteeId);
 const ajustes = cp_dcGetAjustes(menteeId);
 const DE = window.DeverEstrutura;
 let html = '';
 tasks.forEach((taskText, idx) => {
 const resp = menteeResp.find(r => r.taskText === taskText) || menteeResp.find(r => r.taskIndex === idx) || {};
 const isCompleted = resp.completed === true;
 const justification = resp.justification || '';
 const hasSubmitted = resp.completed !== undefined || justification !== '';
 const info = DE ? DE.analisar(taskText, ajustes[taskText]) : null;
 const rs = DE ? DE.resumoResposta(resp) : null;
 const progresso = rs && rs.semanas ? ` (${rs.semanasFeitas}/${rs.semanas} semanas)` : '';
 const chips = info ? `<div class="dvm-chips">
 ${info.semanal ? `<span class="dvm-chip w">Semanal · ${info.semanas} semanas</span>` : ''}
 ${info.sensivel ? `<span class="dvm-chip s">Valor definido pelo mentorado · prazos 30/60/90 dias</span>` : ''}
 ${info.evidencia ? `<span class="dvm-chip e">Pede comprovação</span>` : ''}
 ${!info.semanal && !info.sensivel && !info.evidencia ? `<span class="dvm-chip">Entrega única · ${info.prazoDias} dias</span>` : ''}
 <button onclick="cp_dcAbrirAjuste('${idAttr}', ${idx})" style="background:none; border:none; color:#4F46E5; font-size:11px; font-weight:700; cursor:pointer; padding:2px 4px;">Ajustar</button>
 </div><div id="cp-dc-ajuste-${idAttr}-${idx}"></div>` : '';

 html += `
 <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; margin-bottom: 4px;"><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;"><div style="font-size: 0.825rem; font-weight: 500; color: #475569; line-height: 1.4; flex: 1;">${idx + 1}. ${cp_esc(taskText)}
 </div>
 <div style="display: flex; align-items: center; gap: 8px; flex-shrink:0;">${isCompleted ? `
 <span style="font-size: 0.725rem; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; padding: 2px 8px; border-radius: 100px; font-weight: 600;">Concluída${progresso}
 </span>
 ` : (hasSubmitted ? `
 <span style="font-size: 0.725rem; background: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; padding: 2px 8px; border-radius: 100px; font-weight: 600;">Não Concluída${progresso}
 </span>
 ` : `
 <span style="font-size: 0.725rem; background: #F1F5F9; color: #64748B; border: 1px solid #CBD5E1; padding: 2px 8px; border-radius: 100px; font-weight: 500;">Pendente
 </span>
 `)}
 <button onclick="cp_removerTarefaDeverDeCasa('${idAttr}', ${idx})" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Excluir tarefa">Excluir
 </button>
 </div>
 </div>
 ${chips}
 ${DE && hasSubmitted ? DE.htmlRespostaMentor(resp, info) : ''}
 ${justification && !(rs && (rs.semanas || (resp.prazos || []).length)) ? `
 <div style="margin-top: 6px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 6px 10px; font-size: 0.775rem; color: #92400E;"><span style="font-weight: 700; text-transform: uppercase; font-size: 0.7rem; display: block; margin-bottom: 2px; color: #B45309;">Motivo / Justificativa do Mentorado:</span>
 "${cp_esc(justification)}"
 </div>
 ` : ''}
 </div>
 `;
 });

 listContainer.innerHTML = html;
};

// Ajuste manual da leitura automática de uma tarefa (o mentor corrige se a IA errou)
window.cp_dcAbrirAjuste = function(menteeId, idx) {
 const alvo = document.getElementById('cp-dc-ajuste-' + menteeId + '-' + idx);
 if (!alvo || !window.DeverEstrutura) return;
 if (alvo.innerHTML) { alvo.innerHTML = ''; return; }
 const tasks = cp_dcGetTarefas(menteeId); const t = tasks[idx]; if (!t) return;
 const info = DeverEstrutura.analisar(t, cp_dcGetAjustes(menteeId)[t]);
 const id = cp_esc(menteeId);
 alvo.innerHTML = `<div class="dvm-ajuste">
 <label><input type="checkbox" id="cp-dca-sem-${id}-${idx}" ${info.semanal ? 'checked' : ''}> Acompanhamento semanal, com <input type="number" min="1" max="13" id="cp-dca-n-${id}-${idx}" value="${info.semanal ? info.semanas : info.auto.semanas}"> semanas</label>
 <label><input type="checkbox" id="cp-dca-ev-${id}-${idx}" ${info.evidencia ? 'checked' : ''}> Pede comprovação (o mentorado envia foto, print, PDF ou planilha)</label>
 <label><input type="checkbox" id="cp-dca-se-${id}-${idx}" ${info.sensivel ? 'checked' : ''}> Tarefa sensível: o mentorado informa o valor combinado e a meta ganha prazos de 30, 60 e 90 dias</label>
 <div class="dvm-nota">Na tarefa sensível, o mentorado marca "Concluído" no prazo em que atingiu a meta e os prazos seguintes ficam anulados. Se não conseguir no curto prazo, ele justifica e o médio e o longo continuam valendo; se não conseguir em nenhum, justifica cada prazo.</div>
 <div style="display:flex; gap:8px;"><button onclick="cp_dcSalvarAjuste('${id}', ${idx})" style="background:#4F46E5; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Salvar ajuste</button>
 <button onclick="cp_dcSalvarAjuste('${id}', ${idx}, true)" style="background:#fff; color:#475569; border:1px solid #CBD5E1; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">Voltar à leitura automática</button></div>
 </div>`;
};
window.cp_dcSalvarAjuste = async function(menteeId, idx, automatico) {
 const tasks = cp_dcGetTarefas(menteeId); const t = tasks[idx]; if (!t) return;
 const aj = cp_dcGetAjustes(menteeId);
 if (automatico) delete aj[t];
 else {
  const v = k => document.getElementById(`cp-dca-${k}-${menteeId}-${idx}`);
  aj[t] = { semanal: !!(v('sem') && v('sem').checked), semanas: Math.min(13, Math.max(1, parseInt(v('n') && v('n').value, 10) || 4)), evidencia: !!(v('ev') && v('ev').checked), sensivel: !!(v('se') && v('se').checked) };
 }
 const ok = await cp_salvarTarefasDeverDeCasa(menteeId, tasks, aj);
 if (ok) cp_renderDeverDeCasaList(menteeId, true);
};

// ── GENERIC SESSION PARSER & TELEMETRY HELPER ──
function cp_parseGenericSession(s) {
 if (!s) return null;
 let rawTipo = (s.tipo || '').toLowerCase().trim();
 let d = s.dados || {};
 if (typeof d === 'string') {
 try { d = JSON.parse(d); } catch(e) { d = {}; }
 }
 if (d.telemetriaData) d = d.telemetriaData;

 let tipo = rawTipo;
 if (rawTipo.includes('roda') || rawTipo.includes('rodavida') || (d && d.sessType && d.sessType.includes('roda'))) {
 tipo = 'rodavida';
 }

 const date = d.date || d.data || (s.created_at ? s.created_at.split('T')[0] : '');
 const createdAt = d.createdAt || (s.created_at ? new Date(s.created_at).getTime() : 0);
 const num = d.num || 1;
 const context = d.context || d.contexto || '';
 const humor = d.humor || '';
 const aiAnalysis = d.aiAnalysis || d.analiseIa || d.analise || d.relatorio || d.diagnosticoGeral || d.mentorNotes || '';
 const mentorNotes = d.mentorNotes || d.notes || d.notas || d.anotacoes || d.diagnosticoGeral || '';
 const indicators = d.indicators || {};
 const scores = d.scores || d.pontuacao || {};

 return {
 rowId: s.id,
 sessType: tipo,
 id: d.id || s.id,
 num: num,
 date: date,
 context: context,
 humor: humor,
 indicators: indicators,
 scores: scores,
 dadosDirect: d,
 aiAnalysis: aiAnalysis,
 mentorNotes: mentorNotes,
 createdAt: createdAt
 };
}


// ══════════════════════════════════════════════════════════════════
// RESUMO ESTRATÉGICO + PDI DAS FERRAMENTAS
// SMART, SWOT, Análise de Perfil & Compatibilidade (Eneagrama / Mapa de
// Maturidade) e DISC. Montado a partir do que foi salvo na nuvem; alimenta
// a Visão Geral (cards, gráficos, PDI) e o card da linha do tempo.
// ══════════════════════════════════════════════════════════════════
const CP_TIPOS_FORA_VISAO = ['analise_telemetria', 'pdi_mentor', 'onboarding', 'onboarding_config', 'dever_de_casa_resp', 'dever_de_casa_config', 'ferramenta_ia', 'anotacao', 'onboarding_arquivo', 'engajamento_pref', 'engajamento_alerta', 'visao_geral_nota', 'visao_geral_nota_mentor'];

function cp_textoDeHTML(html) {
 if (!html) return '';
 const t = document.createElement('template');
 t.innerHTML = String(html);
 return (t.content.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function cp_listasDeHTML(html) {
 if (!html) return [];
 const t = document.createElement('template');
 t.innerHTML = String(html);
 return Array.from(t.content.querySelectorAll('ul')).map(ul =>
 Array.from(ul.querySelectorAll('li')).map(li => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
}

function cp_itensPDIDeHTML(html) {
 if (!html) return [];
 const t = document.createElement('template');
 t.innerHTML = String(html);
 const blocos = Array.from(t.content.querySelectorAll('div > strong')).map(st => {
 const titulo = st.textContent.replace(/\s+/g, ' ').trim();
 const p = st.parentElement.querySelector('p');
 return titulo + (p ? ' ' + p.textContent.replace(/\s+/g, ' ').trim() : '');
 }).filter(Boolean);
 if (blocos.length) return blocos;
 return cp_listasDeHTML(html).flat();
}

function cp_contarItens(lista) {
 return Array.isArray(lista) ? lista.filter(x => String(typeof x === 'string' ? x : (x && x.text) || '').trim() !== '').length : 0;
}


// ── TELEMETRIAS (via ponte) E REGISTROS DO MENTOR ──
// Indicadores de "risco": quanto MAIOR, pior (ex.: carga traumática, esgotamento).
const CP_TELEMETRIA_RISCO = {
 trauma: { todos: true },
 burnout: { dominios: ['sinais de esgotamento'] },
 lideranca: { dominios: ['gatilhos'], indicadores: ['reatividade emocional', 'microgestão'] }
};
const CP_TELEMETRIA_TITULOS = {
 trauma: 'Telemetria de Traumas', burnout: 'Telemetria de Burnout & Vitalidade', comunicacao: 'Telemetria de Comunicação Assertiva',
 ie: 'Telemetria de Inteligência Emocional', produtividade: 'Telemetria de Produtividade & Foco', transicao: 'Telemetria de Transição de Carreira',
 vendas: 'Telemetria de Vendas & Negociação', lideranca: 'LeaderMap — Liderança'
};
const CP_TIPOS_CONHECIDOS = ['rodavida', 'observacao_manual', 'disc', 'lideranca', 'comunicacao', 'transicao', 'ie', 'produtividade', 'impostor', 'burnout', 'trauma', 'dever_de_casa_resp', 'dever_de_casa_config', 'ferramenta_ia', 'onboarding', 'smart', 'swot', 'perfil_compat'];

function cp_pdiDoTextoIA(texto) {
 if (!texto) return [];
 const linhas = String(texto).split('\n').map(l => l.trim());
 const ehCabecalho = l => /^(🎯|⚠️|⚠|✅|🛠️|🛠|📌|💡|#)/.test(l) || (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 &/()\-:]{8,}$/.test(l) && l === l.toUpperCase());
 let i = linhas.findIndex(l => /🛠|PLANO|DIRECIONAMENTO|PRÓXIMOS PASSOS|PROXIMOS PASSOS|AÇÕES|ACOES|TREINAMENTO|PDI/i.test(l) && ehCabecalho(l));
 if (i < 0) return [];
 const itens = [];
 for (let j = i + 1; j < linhas.length; j++) {
 const l = linhas[j];
 if (!l) continue;
 if (ehCabecalho(l)) break;
 const limpo = l.replace(/^([-•*]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
 if (limpo) itens.push(limpo);
 }
 return itens.slice(0, 8);
}

// ── Mapa de Maturidade: traduz a pontuação (0–100) de cada domínio em 5 níveis ──
const CP_NIVEIS_MATURIDADE = [
 { n: 1, nome: 'Inicial',            cor: '#F87171', desc: 'competência pouco presente; precisa de base' },
 { n: 2, nome: 'Em desenvolvimento', cor: '#FB923C', desc: 'aparece às vezes, sem consistência' },
 { n: 3, nome: 'Funcional',          cor: '#FBBF24', desc: 'presente no dia a dia, com oscilações' },
 { n: 4, nome: 'Avançado',           cor: '#34D399', desc: 'consistente e aplicado com autonomia' },
 { n: 5, nome: 'Referência',         cor: '#10B981', desc: 'domínio pleno; inspira e ensina outros' }
];
function cp_nivelMaturidade(v) { v = Math.max(0, Math.min(100, Number(v) || 0)); return CP_NIVEIS_MATURIDADE[v <= 20 ? 0 : v <= 40 ? 1 : v <= 60 ? 2 : v <= 80 ? 3 : 4]; }
function cp_mapaMaturidade(itens) {
 // domínios de "carga" (sabotadores, gatilhos...): quanto MENOR a carga, MAIOR a maturidade
 const lista = (itens || []).map(i => { const mat = i.carga ? 100 - i.valor : i.valor; return { nome: i.nome, valor: i.valor, carga: !!i.carga, maturidade: mat, nivel: cp_nivelMaturidade(mat) }; });
 if (!lista.length) return null;
 const media = Math.round(lista.reduce((a, b) => a + b.maturidade, 0) / lista.length);
 return { titulo: 'Mapa de Maturidade', media, geral: cp_nivelMaturidade(media), itens: lista };
}
function cp_resumoNarrativo(titulo, doms, criticos) {
 const mapa = cp_mapaMaturidade(doms.map(x => ({ nome: x.titulo, valor: x.media, carga: x.risco })));
 if (!mapa) return titulo;
 const ord = mapa.itens.slice().sort((a, b) => b.maturidade - a.maturidade);
 const nome = (typeof cp_currentMentee !== 'undefined' && cp_currentMentee && cp_currentMentee.nome) ? cp_currentMentee.nome.split(' ')[0] : 'A pessoa mentorada';
 return `${nome} está no nível ${mapa.geral.n} de maturidade — ${mapa.geral.nome} (${mapa.media}/100): ${mapa.geral.desc}.\n\n` +
 `Ponto mais maduro: ${ord[0].nome} (nível ${ord[0].nivel.n}, ${ord[0].nivel.nome}).\n` +
 `Prioridade de desenvolvimento: ${ord[ord.length - 1].nome} (nível ${ord[ord.length - 1].nivel.n}, ${ord[ord.length - 1].nivel.nome}).` +
 (criticos ? `\n${criticos} indicador(es) em alerta merecem atenção nas próximas sessões.` : '');
}
function cp_htmlMaturidade(m) {
 const g = m.geral;
 const ord = (m.itens || []).slice().sort((a, b) => b.maturidade - a.maturidade);
 const forte = ord[0], fraco = ord[ord.length - 1];
 const pontos = CP_NIVEIS_MATURIDADE.map(l => `<span class="cpm-dot" style="background:${l.n <= g.n ? '#5B2DA3' : '#E4DDF7'};"></span>`).join('');
 return `<div class="cpm-card">
   <div class="cpm-lbl">Maturidade geral</div>
   <div class="cpm-num">${m.media}<span>%</span></div>
   <div class="cpm-pill">${cp_esc(g.nome)}</div>
   <div class="cpm-dots" title="Nível ${g.n} de 5">${pontos}<em>Nível ${g.n} de 5</em></div>
   <div class="cpm-desc">${cp_esc(g.desc.charAt(0).toUpperCase() + g.desc.slice(1))}.</div>
   ${forte && fraco && forte !== fraco ? `<div class="cpm-extremos"><div><span>Ponto mais forte</span><b>${cp_esc(forte.nome)}</b><em>${Math.round(forte.maturidade)}%</em></div><div><span>Prioridade de desenvolvimento</span><b>${cp_esc(fraco.nome)}</b><em>${Math.round(fraco.maturidade)}%</em></div></div>` : ''}
 </div>`;
}
(function cp_estilosMaturidade() {
 if (document.getElementById('cpm-estilos')) return;
 const st = document.createElement('style');
 st.id = 'cpm-estilos';
 st.textContent = `
 /* cards do topo mais discretos: nomes longos cabem sem estourar */
 /* cards do topo: tipografia suave e profissional */
 .cp-stat-card-new .cp-sc-label { font-size: 10.5px !important; font-weight: 600 !important; letter-spacing: .08em !important; color: #8A94A6 !important; }
 .cp-stat-card-new .cp-sc-value { font-size: 24px !important; line-height: 1.2 !important; font-weight: 600 !important; color: #1B2559 !important; letter-spacing: -0.01em; margin: 6px 0 2px !important; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
 .cp-stat-card-new .cp-sc-value.cp-sc-texto { font-size: 15px !important; line-height: 1.4 !important; font-weight: 600 !important; color: #334155 !important; letter-spacing: 0; min-height: 42px; }
 .cp-stat-card-new .cp-sc-sub { font-size: 12px !important; color: #94A3B8 !important; font-weight: 400 !important; }
 .cp-stat-card-new .cp-sc-bar-bg { height: 4px !important; background: #EEF2F7 !important; }
 .cp-stat-card-new .cp-sc-bar-fill { background: #8B6FD6 !important; }
 .cpm-card { text-align:center; padding:18px 12px 8px; border-radius:14px; background:#F8F6FE; border:1px solid #E4DDF7; }
 .cpm-lbl { font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#64748B; }
 .cpm-num { font-size:64px; font-weight:800; line-height:1; color:#5B2DA3; margin:10px 0 12px; letter-spacing:-0.02em; }
 .cpm-num span { font-size:32px; color:#64748B; margin-left:2px; }
 .cpm-pill { display:inline-block; font-size:14px; font-weight:700; color:#1B2559; background:#EDE7FB; border:1px solid #D8CCF5; border-radius:999px; padding:5px 16px; }
 .cpm-dots { display:flex; align-items:center; justify-content:center; gap:5px; margin-top:14px; }
 .cpm-dot { width:22px; height:6px; border-radius:3px; }
 .cpm-dots em { font-style:normal; font-size:11px; color:#94A3B8; margin-left:6px; }
 .cpm-desc { font-size:13px; color:#64748B; margin-top:10px; line-height:1.45; }
 .cpm-extremos { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; text-align:left; }
 .cpm-extremos > div { background:#fff; border:1px solid #E4DDF7; border-radius:10px; padding:10px 12px; }
 .cpm-extremos span { display:block; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#94A3B8; }
 .cpm-extremos b { display:block; font-size:13.5px; color:#1B2559; margin-top:3px; line-height:1.3; }
 .cpm-extremos em { font-style:normal; font-size:12px; color:#5B2DA3; font-weight:700; }
 `;
 document.head.appendChild(st);
})();

function cp_resumoTelemetria(tipo, d) {
 const T = d.telemetria || {};
 const cfgR = CP_TELEMETRIA_RISCO[tipo] || {};
 const doms = (T.dominios || []).map(dm => {
 const tit = String(dm.titulo || '');
 const domRisco = !!cfgR.todos || (cfgR.dominios || []).some(k => tit.toLowerCase().includes(k));
 const inds = (dm.indicadores || []).map(i => ({ nome: i.nome, valor: Number(i.valor) || 0,
 risco: domRisco || (cfgR.indicadores || []).some(k => String(i.nome).toLowerCase().includes(k)) }));
 const media = inds.length ? Math.round(inds.reduce((a, b) => a + b.valor, 0) / inds.length) : 0;
 return { titulo: tit, media, risco: domRisco, inds, obs: dm.obs || '' };
 }).filter(x => x.inds.length);
 if (!doms.length) return null;

 const todos = doms.flatMap(x => x.inds);
 const comp = todos.filter(i => !i.risco);
 const risc = todos.filter(i => i.risco);
 const media = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b.valor, 0) / arr.length) : 0;
 const curto = (t, n = 26) => t.length > n ? t.slice(0, n - 1) + '…' : t;
 const cor = (v, r) => r ? (v >= 70 ? '#ef4444' : v >= 45 ? '#f59e0b' : '#10b981') : (v >= 70 ? '#10b981' : v >= 45 ? '#f59e0b' : '#ef4444');
 const criticos = comp.filter(i => i.valor < 40).length + risc.filter(i => i.valor >= 70).length;

 let metricas;
 if (comp.length === 0) {
 const ord = doms.slice().sort((a, b) => b.media - a.media);
 metricas = [
 { lbl: 'CARGA MÉDIA', val: `${media(risc)}%`, sub: 'quanto maior, mais atenção', bar: media(risc) },
 { lbl: 'DOMÍNIO MAIS INTENSO', val: ord[0].titulo, sub: `${ord[0].media}%`, bar: ord[0].media },
 { lbl: 'DOMÍNIO MENOS INTENSO', val: ord[ord.length - 1].titulo, sub: `${ord[ord.length - 1].media}%`, bar: ord[ord.length - 1].media },
 { lbl: 'INDICADORES CRÍTICOS', val: `${criticos}`, sub: 'acima de 70', bar: Math.min(100, criticos / Math.max(1, todos.length) * 100) }
 ];
 } else {
 const pos = doms.filter(x => !x.risco).sort((a, b) => b.media - a.media);
 metricas = [
 { lbl: 'ÍNDICE GERAL', val: `${media(comp)}%`, sub: 'média das competências', bar: media(comp) },
 { lbl: 'MAIOR FORÇA', val: pos[0].titulo, sub: `${pos[0].media}%`, bar: pos[0].media },
 { lbl: 'MAIOR DESENVOLVIMENTO', val: pos[pos.length - 1].titulo, sub: `${pos[pos.length - 1].media}%`, bar: pos[pos.length - 1].media },
 { lbl: 'PONTOS CRÍTICOS', val: `${criticos}`, sub: 'indicadores em alerta', bar: Math.min(100, criticos / Math.max(1, todos.length) * 100) }
 ];
 }

 let pdi = cp_pdiDoTextoIA(d.aiAnalysis);
 if (!pdi.length) {
 pdi = comp.slice().sort((a, b) => a.valor - b.valor).slice(0, 3).map(i => `Priorizar o desenvolvimento de "${i.nome}" (hoje em ${i.valor}/100).`)
 .concat(risc.slice().sort((a, b) => b.valor - a.valor).slice(0, 2).map(i => `Trabalhar a redução de "${i.nome}" (hoje em ${i.valor}/100).`));
 }

 const alertas = comp.filter(i => i.valor < 40).map(i => ({ l: i.nome, v: 100 - i.valor, nivel: i.valor < 25 ? 'Crítico' : 'Atenção' }))
 .concat(risc.filter(i => i.valor >= 60).map(i => ({ l: i.nome, v: i.valor, nivel: i.valor >= 75 ? 'Crítico' : 'Atenção' })));
 Object.keys(T.extras || {}).forEach(k => {
 if (/sabotador|gatilho|gargalo/i.test(k)) String(T.extras[k]).split(',').map(x => x.trim()).filter(Boolean).forEach(x => alertas.push({ l: x, nivel: 'Atenção' }));
 });

 const titulo = tipo === 'trauma' ? CP_TELEMETRIA_TITULOS.trauma : (T.titulo || CP_TELEMETRIA_TITULOS[tipo] || 'Telemetria');
 const prontidao = String((T.extras || {})['Nível de Prontidão'] || '');
 return {
 titulo: titulo,
 tipoTelemetria: tipo,
 apoioEspecializado: /apoio especializado|em crise/i.test(prontidao),
 cor: '#4F46E5',
 resumo: d.aiAnalysis || cp_resumoNarrativo(titulo, doms, criticos),
 metricas: metricas,
 maturidade: cp_mapaMaturidade(doms.map(x => ({ nome: x.titulo, valor: x.media, carga: x.risco }))),
 radar: { titulo: `Radar — ${titulo}`, labels: doms.map(x => x.titulo), data: doms.map(x => x.media) },
 barras: { titulo: 'Domínios avaliados', itens: doms.map(x => ({ name: x.titulo, v: x.media, label: `${x.media}/100${x.risco ? ' (carga)' : ''}`, color: cor(x.media, x.risco) })) },
 pdi: pdi,
 alertasTitulo: 'Pontos de Atenção',
 alertas: alertas.slice(0, 10)
 };
}

function cp_resumoRegistroMentor(d) {
 const cfg = CP_NICHOS_CONFIG[d.nicho] || CP_NICHOS_CONFIG.geral;
 const doms = d.domains || {};
 const lista = (cfg.dominios || []).filter(x => doms[x.key] !== undefined).map(x => ({ n: x.name, v: Number(doms[x.key]) || 0 }));
 Object.keys(doms).forEach(k => { if (!lista.some(x => x.n === ((cfg.dominios || []).find(y => y.key === k) || {}).name)) lista.push({ n: k, v: Number(doms[k]) || 0 }); });
 if (!lista.length) return null;
 const planos = String(d.planoAcao || '').split(/\n|;|•/).map(x => x.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
 const titulo = `Registro do Mentor — ${d.nichoNome || cfg.nome}`;
 return {
 titulo: titulo,
 cor: cfg.color || '#4F46E5',
 resumo: d.analiseMentor || d.mentorNotes || d.aiAnalysis || titulo,
 metricas: lista.slice(0, 4).map(x => ({ lbl: x.n.toUpperCase(), val: `${x.v}%`, sub: d.nichoNome || cfg.nome, bar: x.v })),
 radar: { titulo: `Radar — ${d.nichoNome || cfg.nome}`, labels: lista.map(x => x.n), data: lista.map(x => x.v) },
 maturidade: cp_mapaMaturidade(lista.map(x => ({ nome: x.n, valor: x.v, carga: false }))),
 barras: { titulo: 'Percepção do mentor por domínio', itens: lista.map(x => ({ name: x.n, v: x.v, label: `${x.v}%`, color: cfg.color || '#4F46E5' })) },
 pdi: planos,
 alertasTitulo: 'Gatilhos observados',
 alertas: (Array.isArray(d.tags) ? d.tags : []).map(t => ({ l: t, nivel: 'Atenção' }))
 };
}

function cp_resumoEstrategico(sess) {
 if (!sess) return null;
 const tipo = (sess.sessType || '').toLowerCase();
 const d = sess.dadosDirect || {};
 const nome = (typeof cp_currentMentee !== 'undefined' && cp_currentMentee && cp_currentMentee.nome) || 'a mentorada';

 // Telemetrias salvas pela ponte (Vendas, Liderança, Comunicação, Traumas...)
 if (d.telemetria && Array.isArray(d.telemetria.dominios)) {
 const rt = cp_resumoTelemetria(tipo, d);
 if (rt) return rt;
 }
 // Registro do Mentor: segue o nicho escolhido no registro (nunca trauma por padrão)
 if (tipo === 'observacao_manual' && d.domains) {
 const rm = cp_resumoRegistroMentor(d);
 if (rm) return rm;
 }

 if (tipo === 'smart') {
 const L = d.listas || {};
 const crit = [
 { k: 's', n: 'Específica', c: '#6366f1' }, { k: 'm', n: 'Mensurável', c: '#0ea5e9' },
 { k: 'a', n: 'Alcançável', c: '#10b981' }, { k: 'r', n: 'Relevante', c: '#f59e0b' }, { k: 't', n: 'Temporal', c: '#ef4444' }
 ].map(x => Object.assign(x, { qtd: cp_contarItens(L[x.k]) }));
 const preenchidos = crit.filter(x => x.qtd > 0).length;
 const plano = d.planoAcao || {};
 const pdi = crit.filter(x => (plano[x.k] || '').trim()).map(x => `${x.n}: ${plano[x.k].trim()}`);
 return {
 titulo: 'Gestão de Metas (SMART)',
 cor: '#6366f1',
 resumo: (d.resumo && d.resumo.trim()) || `Meta: ${d.metaNome || '—'}\nPilar: ${d.pilarTelemetria || 'Geral'}\n\n${preenchidos} de 5 critérios SMART definidos e ${pdi.length} ação(ões) no plano.`,
 metricas: [
 { lbl: 'META', val: (d.metaNome || '—').slice(0, 40), sub: d.pilarTelemetria || 'Geral', bar: preenchidos * 20 },
 { lbl: 'CRITÉRIOS SMART', val: `${preenchidos}/5`, sub: 'definidos', bar: preenchidos * 20 },
 { lbl: 'PLANO DE AÇÃO', val: `${pdi.length}/5`, sub: 'ações definidas', bar: pdi.length * 20 },
 { lbl: 'PRAZO (TEMPORAL)', val: (d.temporal || '—').slice(0, 40), sub: 'Temporal', bar: d.temporal ? 100 : 0 }
 ],
 radar: { titulo: 'Radar da Meta SMART', labels: crit.map(x => x.n), data: crit.map(x => Math.min(100, Math.round(x.qtd * 34))) },
 barras: { titulo: 'Critérios SMART — itens definidos', itens: crit.map(x => ({ name: x.n, v: Math.min(100, Math.round(x.qtd * 34)), label: `${x.qtd} item(ns)`, color: x.c })) },
 pdi: pdi,
 alertasTitulo: 'Pontos de Atenção',
 alertas: crit.filter(x => x.qtd === 0).map(x => ({ l: `Critério "${x.n}" sem definição`, nivel: 'Crítico' }))
 .concat(crit.filter(x => x.qtd > 0 && !(plano[x.k] || '').trim()).map(x => ({ l: `${x.n}: sem ação no plano`, nivel: 'Atenção' })))
 };
 }

 if (tipo === 'swot') {
 const L = d.listas || {};
 const q = [
 { k: 's', n: 'Forças', c: '#10b981' }, { k: 'w', n: 'Fraquezas', c: '#ef4444' },
 { k: 'o', n: 'Oportunidades', c: '#0ea5e9' }, { k: 't', n: 'Ameaças', c: '#f59e0b' }
 ].map(x => Object.assign(x, { qtd: cp_contarItens(L[x.k]) }));
 const max = Math.max(1, ...q.map(x => x.qtd));
 const pc = d.planoCruzado || {};
 const nomesPlano = { fo: 'FO — Forças × Oportunidades', fa: 'FA — Forças × Ameaças', do: 'DO — Fraquezas × Oportunidades', da: 'DA — Fraquezas × Ameaças' };
 const pdi = Object.keys(nomesPlano).filter(k => (pc[k] || '').trim()).map(k => `${nomesPlano[k]}: ${pc[k].trim()}`);
 const itens = (k) => (Array.isArray(L[k]) ? L[k] : []).map(x => String(typeof x === 'string' ? x : (x && x.text) || '').trim()).filter(Boolean);
 return {
 titulo: 'Gestão Estratégica (SWOT)',
 cor: '#0ea5e9',
 resumo: (d.titulo ? d.titulo + '\n\n' : '') + ((d.diagnostico && d.diagnostico.trim()) || `Análise estratégica de ${nome}.\n\n${q.map(x => `${x.n}: ${x.qtd}`).join(' · ')}.`),
 metricas: q.map(x => ({ lbl: x.n.toUpperCase(), val: `${x.qtd}`, sub: 'itens mapeados', bar: Math.round(x.qtd / max * 100) })),
 radar: { titulo: 'Radar SWOT — 4 Quadrantes', labels: q.map(x => x.n), data: q.map(x => Math.round(x.qtd / max * 100)) },
 barras: { titulo: 'Quadrantes SWOT', itens: q.map(x => ({ name: x.n, v: Math.round(x.qtd / max * 100), label: `${x.qtd} item(ns)`, color: x.c })) },
 pdi: pdi,
 alertasTitulo: 'Fraquezas e Ameaças',
 alertas: itens('t').map(t => ({ l: t, nivel: 'Crítico' })).concat(itens('w').map(t => ({ l: t, nivel: 'Atenção' }))).slice(0, 8)
 };
 }

 if (tipo === 'perfil_compat') {
 const o = d.outputs || {};
 const m = d.metricas || {};
 const txtCompat = cp_textoDeHTML(o.compatibilidade);
 const txtEnea = cp_textoDeHTML(o.eneagrama);
 const pct = typeof m.compatPct === 'number' ? m.compatPct : (parseInt((txtCompat.match(/(\d{2,3})\s*%/) || [])[1], 10) || 0);
 const tipoEnea = m.tipoEneagrama || ((txtEnea.match(/Tipo\s*\d[^\n.]*/) || [])[0] || '—');
 const inp = d.inputs || {};
 const nF = m.countFortes || String(inp.fortes || '').split('\n').filter(l => l.trim()).length;
 const nM = m.countFracos || String(inp.fracos || '').split('\n').filter(l => l.trim()).length;
 const faixa = m.badgeLabel || (pct <= 50 ? 'Baixa compatibilidade' : pct <= 70 ? 'Média compatibilidade' : 'Alta compatibilidade');
 const listasImpacto = cp_listasDeHTML(o.impacto);
 const negativos = listasImpacto[1] || [];
 const pdi = cp_itensPDIDeHTML(o.pdi);
 const resumo = [
 `Função alvo: ${d.alvo || '—'} · Compatibilidade: ${pct}% (${faixa})`,
 `Eneagrama: ${tipoEnea}`,
 txtEnea ? '\n' + txtEnea.slice(0, 700) : ''
 ].join('\n').trim();
 return {
 titulo: 'Gestão de Talentos (Eneagrama & Compatibilidade)',
 cor: '#8b5cf6',
 resumo: resumo,
 metricas: [
 { lbl: 'COMPATIBILIDADE', val: `${pct}%`, sub: faixa, bar: pct },
 { lbl: 'ENEAGRAMA', val: String(tipoEnea).slice(0, 40), sub: 'Tipo predominante', bar: 100 },
 { lbl: 'FORÇAS MAPEADAS', val: `${nF}`, sub: 'pontos fortes', bar: Math.min(100, nF * 20) },
 { lbl: 'PONTOS DE MELHORIA', val: `${nM}`, sub: 'a desenvolver', bar: Math.min(100, nM * 20) }
 ],
 radar: { titulo: 'Mapa de Maturidade para a Função', labels: ['Compatibilidade', 'Forças', 'Ações no PDI', 'Pontos de melhoria'], data: [pct, Math.min(100, nF * 20), Math.min(100, pdi.length * 25), Math.min(100, nM * 20)] },
 barras: { titulo: `Encaixe na função: ${d.alvo || '—'}`, itens: [
 { name: 'Compatibilidade com a função', v: pct, label: `${pct}%`, color: pct <= 50 ? '#ef4444' : pct <= 70 ? '#f59e0b' : '#10b981' },
 { name: 'Forças mapeadas', v: Math.min(100, nF * 20), label: `${nF}`, color: '#10b981' },
 { name: 'Pontos de melhoria', v: Math.min(100, nM * 20), label: `${nM}`, color: '#ef4444' }
 ] },
 pdi: pdi,
 alertasTitulo: 'Riscos e Gargalos',
 alertas: negativos.map(t => ({ l: t, nivel: 'Atenção' }))
 };
 }

 if (tipo === 'disc') {
 const sc = sess.scores || {};
 const num = (a, b, c) => Number(a !== undefined ? a : (b !== undefined ? b : (c || 0))) || 0;
 const D = num(sc.d, d.domScore, sc.D), I = num(sc.i, d.infScore, sc.I), S = num(sc.s, d.estScore, sc.S), C = num(sc.c, d.conScore, sc.C);
 const an = d.analise || {};
 const listas = cp_listasDeHTML(d.analiseHTML);
 const trabalhar = Array.isArray(an.trabalhar) && an.trabalhar.length ? an.trabalhar : (listas[2] || []);
 const negativos = Array.isArray(an.negativos) && an.negativos.length ? an.negativos : (listas[1] || []);
 const fatores = [{ n: 'Dominância (D)', v: D, c: '#ef4444' }, { n: 'Influência (I)', v: I, c: '#f59e0b' }, { n: 'Estabilidade (S)', v: S, c: '#10b981' }, { n: 'Conformidade (C)', v: C, c: '#3b82f6' }];
 const top = fatores.slice().sort((a, b) => b.v - a.v)[0];
 return {
 titulo: 'Gestão Comportamental (DISC)',
 cor: '#db2777',
 resumo: an.sintese ? `Perfil predominante: ${an.predominancia || top.n}\n\n${an.sintese}` : `Perfil DISC de ${nome}.\n\nPredominância: ${top.n} (${top.v}%). D ${D}% · I ${I}% · S ${S}% · C ${C}%.`,
 metricas: fatores.map(f => ({ lbl: f.n.toUpperCase(), val: `${f.v}%`, sub: 'Perfil DISC', bar: f.v })),
 radar: { titulo: 'Radar de Perfil DISC', labels: ['Dominância', 'Influência', 'Estabilidade', 'Conformidade'], data: [D, I, S, C] },
 barras: { titulo: 'Dimensões do Perfil DISC', itens: fatores.map(f => ({ name: f.n, v: f.v, label: `${f.v}%`, color: f.c })) },
 pdi: trabalhar,
 alertasTitulo: 'Riscos do Perfil',
 alertas: negativos.map(t => ({ l: t, nivel: 'Atenção' }))
 };
 }
 return null;
}

function cp_resumoNeutro(sess) {
 const tipo = (sess.sessType || '').toLowerCase();
 if (CP_TIPOS_CONHECIDOS.includes(tipo)) return null;
 const d = sess.dadosDirect || {};
 const texto = sess.aiAnalysis || sess.mentorNotes || d.texto || '';
 return {
 titulo: 'Registro da Mentoria',
 cor: '#64748B',
 resumo: texto || 'Registro sem indicadores numéricos.',
 metricas: [
 { lbl: 'TIPO', val: tipo ? tipo.replace(/_/g, ' ') : 'Registro', sub: 'registro', bar: 0 },
 { lbl: 'DATA', val: sess.date || '—', sub: '', bar: 0 },
 { lbl: 'INDICADORES', val: '—', sub: 'não se aplica', bar: 0 },
 { lbl: 'PDI', val: '—', sub: 'não se aplica', bar: 0 }
 ],
 radar: { titulo: 'Sem gráfico para este registro', labels: [], data: [] },
 barras: { titulo: 'Sem indicadores para este registro', itens: [] },
 pdi: [],
 alertasTitulo: 'Pontos de Atenção',
 alertas: []
 };
}

// Porcentagem escrita ao lado de cada ponto do radar (só nos radares da ficha)
function cp_registrarValoresRadar() {
 if (typeof Chart === 'undefined' || window.__cpValoresRadar) return;
 window.__cpValoresRadar = true;
 Chart.register({ id: 'cpValoresRadar', afterDatasetsDraw(chart) {
  if (!chart.$cpValores) return;
  const sc = chart.scales && chart.scales.r; const meta = chart.getDatasetMeta(0);
  if (!sc || !meta || !meta.data) return;
  const ctx = chart.ctx; const vals = chart.data.datasets[0].data || [];
  ctx.save(); ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  meta.data.forEach((pt, i) => {
   const v = Math.round(Number(vals[i]) || 0);
   let dx = pt.x - sc.xCenter, dy = pt.y - sc.yCenter; const d = Math.hypot(dx, dy);
   if (d < 1) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
   const x = pt.x + dx * 15, y = pt.y + dy * 13;
   ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.strokeText(v + '%', x, y);
   ctx.fillStyle = '#5B2DA3'; ctx.fillText(v + '%', x, y);
  });
  ctx.restore();
 } });
}

// Estilo único para TODOS os radares da ficha (cores da Mentóra, grade tracejada, rótulos em 2 linhas)
function cp_aplicarEstiloRadar(ch) {
 if (!ch || !ch.options || !ch.options.scales || !ch.options.scales.r) return;
 const r = ch.options.scales.r;
 r.min = 0; r.max = 100;
 r.ticks = Object.assign({}, r.ticks, { display: false, stepSize: 25 });
 r.grid = Object.assign({}, r.grid, { color: '#E2E8F0', lineWidth: 1, borderDash: [4, 4] });
 r.border = Object.assign({}, r.border, { dash: [4, 4] });
 r.angleLines = Object.assign({}, r.angleLines, { color: '#E2E8F0', lineWidth: 1, borderDash: [4, 4] });
 r.pointLabels = Object.assign({}, r.pointLabels, { color: '#64748B', padding: 10, font: { size: 11, weight: '500', family: 'Inter, sans-serif' } });
 ch.options.layout = { padding: 8 };
 ch.options.plugins = Object.assign({}, ch.options.plugins, { legend: { display: false }, tooltip: { backgroundColor: '#1B2559', padding: 10, displayColors: false, callbacks: { title: (it) => [].concat(it[0].label).join(' '), label: (it) => `${Math.round(it.raw)}/100` } } });
 ch.data.labels = cp_quebrarRotulos((ch.data.labels || []).map(l => [].concat(l).join(' ')));
 (ch.data.datasets || []).forEach(d => Object.assign(d, { backgroundColor: 'rgba(91, 45, 163, 0.12)', borderColor: '#5B2DA3', borderWidth: 2, pointBackgroundColor: 'rgba(91, 45, 163, 0.22)', pointBorderColor: '#5B2DA3', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointHoverBackgroundColor: '#5B2DA3' }));
 ch.$cpValores = true;
 ch.update('none');
}

// rótulos longos do radar viram 2 linhas (fica mais limpo, como um mapa)
function cp_quebrarRotulos(labels) {
 return (labels || []).map(t => {
  t = String(t || '').replace(/…$/, '').replace(/\s*&\s*/g, ' e ').trim();
  if (t.length <= 22) return t;
  const linhas = []; let atual = '';
  t.split(' ').forEach(p => { if ((atual + ' ' + p).trim().length > 22 && atual) { linhas.push(atual); atual = p; } else { atual = (atual + ' ' + p).trim(); } });
  if (atual) linhas.push(atual);
  return linhas.length > 3 ? linhas.slice(0, 2).concat([linhas.slice(2).join(' ')]) : linhas;
 });
}

function cp_renderResumoEstrategico(r, refs) {
 const { lblTrust, lblTrauma, lblReg, lblSelf, titleTraumas, titleRadar, bodyEl, traumaEl, ctxRadar, insightsEl, risksEl } = refs;
 const lbls = [lblTrust, lblTrauma, lblReg, lblSelf];
 const ids = ['trust', 'trauma', 'reg', 'self'];
 const linhaCards = document.getElementById('cp-stat-cards');
 if (linhaCards) linhaCards.style.display = r.maturidade ? 'none' : '';
 const mets = r.metricas.slice(0, 4);
 while (mets.length < 4) mets.push({ lbl: '—', val: '—', sub: '', bar: 0 });
 mets.forEach((m, i) => {
 if (lbls[i]) lbls[i].textContent = m.lbl;
 cp_setStatCard('cp-val-' + ids[i], 'cp-sub-' + ids[i], 'cp-bar-' + ids[i], cp_esc(m.val), cp_esc(m.sub), Number(m.bar) || 0);
 });

 if (bodyEl) bodyEl.textContent = r.resumo || '';
 if (titleTraumas) { titleTraumas.textContent = r.maturidade ? '' : r.barras.titulo; titleTraumas.style.display = r.maturidade ? 'none' : ''; }
 // com mapa de maturidade, o radar mostra a maturidade de cada domínio (cargas já invertidas)
 if (r.maturidade) r.radar = { titulo: 'Radar de Maturidade', labels: r.radar.labels, data: r.maturidade.itens.map(i => i.maturidade) };
 if (titleRadar) { titleRadar.textContent = r.radar.titulo; titleRadar.style.textAlign = r.maturidade ? 'center' : ''; }

 if (traumaEl && r.maturidade) {
 traumaEl.innerHTML = cp_htmlMaturidade(r.maturidade);
 } else if (traumaEl) {
 traumaEl.innerHTML = r.barras.itens.map(it => `<div class="cp-bar-row"><div class="cp-bar-lbl"><span>${cp_esc(it.name)}</span><span style="color:${it.color}; font-weight:700;">${cp_esc(it.label)}</span></div>
 <div class="cp-bar-bg"><div class="cp-bar-fill" style="width:${Math.max(0, Math.min(100, it.v))}%; background:${it.color};"></div></div>
 </div>`).join('');
 }

 if (typeof cp_radarChart !== 'undefined' && cp_radarChart) { cp_radarChart.destroy(); cp_radarChart = null; }
 if (ctxRadar && typeof Chart !== 'undefined' && r.radar.labels.length >= 3) {
 cp_radarChart = new Chart(ctxRadar, {
 type: 'radar',
 data: { labels: cp_quebrarRotulos(r.radar.labels), datasets: [{ data: r.radar.data, backgroundColor: 'rgba(91, 45, 163, 0.12)', borderColor: '#5B2DA3', borderWidth: 2,
  pointBackgroundColor: 'rgba(91, 45, 163, 0.22)', pointBorderColor: '#5B2DA3', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointHoverBackgroundColor: '#5B2DA3' }] },
 options: { responsive: true, maintainAspectRatio: false, layout: { padding: 8 },
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1B2559', padding: 10, displayColors: false, callbacks: { title: (it) => [].concat(it[0].label).join(' '), label: (it) => `${it.raw}/100` } } },
  scales: { r: { min: 0, max: 100, beginAtZero: true,
   ticks: { display: false, stepSize: 25 },
   grid: { color: '#E2E8F0', lineWidth: 1, borderDash: [4, 4] },
   border: { dash: [4, 4] },
   angleLines: { color: '#E2E8F0', lineWidth: 1, borderDash: [4, 4] },
   pointLabels: { color: '#64748B', padding: 10, font: { size: 11, weight: '500', family: 'Inter, sans-serif' } } } } }
 });
 cp_aplicarEstiloRadar(cp_radarChart);
 }

 const tIns = document.getElementById('cp-title-insights');
 const tRisk = document.getElementById('cp-title-risks');
 if (tIns) tIns.textContent = 'PDI Estratégico';
 if (tRisk) tRisk.textContent = r.alertasTitulo || 'Pontos de Atenção';

 if (insightsEl) {
 let pdiUsar = r.pdi, pdiFonte = '';
 if (!pdiUsar.length && cp_currentMentee) {
  const recentes = cp_filterTimelineSessions(cp_all_sessions, cp_currentMentee.id).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  for (const row of recentes) { let rr = null; try { rr = cp_resumoEstrategico(cp_parseGenericSession(row)); } catch (e) {} if (rr && rr.pdi && rr.pdi.length) { pdiUsar = rr.pdi; pdiFonte = rr.titulo; break; } }
 }
 r = Object.assign({}, r, { pdi: pdiUsar });
 insightsEl.innerHTML = r.pdi.length === 0
 ? `<div style="padding:12px; font-size:13px; color:#94A3B8; font-style:italic;">Nenhuma ação de PDI ainda. Aplique uma telemetria ou ferramenta, ou gere a análise com Agente Mentóra.</div>`
 : r.pdi.map((acao, i) => `<div class="cp-insight-row ir-green"><div class="cp-insight-title">Ação ${i + 1}</div><div class="cp-insight-text">${cp_esc(acao)}</div></div>`).join('');
 }
 if (risksEl) {
 risksEl.innerHTML = r.alertas.length === 0
 ? `<div style="padding:12px; font-size:13px; color:#10b981; font-weight:600;">Nenhum ponto de atenção registrado.</div>`
 : r.alertas.map(a => {
  const m = String(a.l || '').match(/\((\d{1,3})%?\)\s*$/);
  const alta = a.nivel === 'Crítico' || a.nivel === 'Prioridade alta';
  const v = a.v != null ? Math.min(100, Number(a.v)) : m ? Math.min(100, Number(m[1])) : (alta ? 80 : 55);
  const rotulo = String(a.l || '').replace(/\s*\(\d{1,3}%?\)\s*$/, '');
  const cor = alta ? '#EF4444' : '#F59E0B';
  return `<div class="cp-indicator-row cp-ind-barra"><div class="cp-ind-topo"><span>${cp_esc(rotulo)}</span><span class="cp-badge ${alta ? 'cp-badge-high' : 'cp-badge-med'}">${alta ? 'Prioridade alta' : 'Acompanhar'}</span></div><div class="cp-ind-trilho"><div style="width:${v}%; background:${cor};"></div></div></div>`;
 }).join('');
 }
}

function cp_getTelemetryInfo(sess) {
 if (!sess) return { title: 'Telemetria', color: '#6366f1', bgColor: 'rgba(99,102,241,0.1)', badges: [], cardSummary: { s1: { lbl: 'Score', val: '—' }, s2: { lbl: 'Status', val: '—' }, s3: { lbl: 'Meta', val: '—' } } };
 
 let tipo = (sess.sessType || 'geral').toLowerCase().trim();
 if (tipo.includes('roda') || tipo.includes('rodavida')) {
 tipo = 'rodavida';
 }
 const d = sess.dadosDirect || {};
 const sc = sess.scores || {};

 const estrat = cp_resumoEstrategico(sess) || cp_resumoNeutro(sess);
 if (estrat) {
 const vazio = { lbl: '—', val: '—' };
 const mt = [0, 1].map(i => (estrat.metricas || [])[i] || vazio);
 estrat.pdi = Array.isArray(estrat.pdi) ? estrat.pdi : [];
 return {
 title: estrat.titulo,
 color: estrat.cor,
 bgColor: 'rgba(99,102,241,0.12)',
 badges: [
 { label: `${mt[0].lbl}: ${mt[0].val}`, color: estrat.cor },
 { label: `PDI: ${estrat.pdi.length} ação(ões)`, color: '#10b981' }
 ],
 cardSummary: {
 s1: { lbl: mt[0].lbl, val: mt[0].val },
 s2: { lbl: mt[1].lbl, val: mt[1].val },
 s3: { lbl: 'PDI', val: `${estrat.pdi.length} ação(ões)` }
 }
 };
 }
 if (tipo === 'ferramenta_ia' || tipo === 'onboarding') {
 return {
 title: tipo === 'onboarding' ? 'Onboarding (Diagnóstico da Mentorada)' : 'Ferramenta de IA',
 color: '#4F46E5',
 bgColor: 'rgba(79,70,229,0.12)',
 badges: [],
 cardSummary: { s1: { lbl: 'Tipo', val: tipo === 'onboarding' ? 'Onboarding' : 'IA' }, s2: { lbl: 'Data', val: sess.date || '—' }, s3: { lbl: 'Status', val: 'Registrado' } }
 };
 }

 switch (tipo) {
 case 'rodavida':
 const rvScores = Array.isArray(d.scores) ? d.scores : (Array.isArray(d.dominios) ? d.dominios.map(x => Number(x.score||0)) : []);
 const rvSum = rvScores.reduce((a, b) => a + Number(b||0), 0);
 const rvAvg = rvScores.length> 0 ? (rvSum / rvScores.length).toFixed(1) : (Array.isArray(d.dominios) && d.dominios.length> 0 ? (d.dominios.reduce((a,b) => a + Number(b.score||0), 0) / d.dominios.length).toFixed(1) : '—');
 const criticosArr = Array.isArray(d.camposAtencaoAbaixo5) && d.camposAtencaoAbaixo5.length> 0 
 ? d.camposAtencaoAbaixo5 
 : (Array.isArray(d.dominios) ? d.dominios.filter(x => Number(x.score||0) < 5) : []);
 const criticosCount = criticosArr.length;
 
 return {
 title: 'Gestão de Equilíbrio (Roda da Vida)',
 color: '#2563EB',
 bgColor: 'rgba(37, 99, 235, 0.12)',
 badges: [
 { label: `Média: ${rvAvg}/10`, color: '#2563EB' },
 { label: `Atenção (<5): ${criticosCount} áreas`, color: criticosCount>0 ? '#EF4444' : '#10B981' }
 ],
 cardSummary: {
 s1: { lbl: 'Média Geral', val: `${rvAvg}` },
 s2: { lbl: 'Críticos (<5)', val: `${criticosCount} domínios` },
 s3: { lbl: 'Ações', val: `${criticosCount} planos` }
 }
 };

 case 'observacao_manual':
 const nNome = d.nichoNome || 'Observação Manual';
 const doms = d.domains || {};
 const tagList = Array.isArray(d.tags) ? d.tags : [];
 return {
 title: nNome,
 color: '#5A5FE0',
 bgColor: 'rgba(90,95,224,0.12)',
 badges: tagList.map(t =>({ label: t, color: '#B8873A' })),
 cardSummary: {
 s1: { lbl: 'Domínios', val: Object.keys(doms).length + ' Mapeados' },
 s2: { lbl: 'Relação', val: d.linkType === 'complementar' ? 'Complementar' : 'Independente' },
 s3: { lbl: 'Gatilhos', val: tagList.length + ' Tags' }
 }
 };
 case 'disc':
 const dom = sc.domScore !== undefined ? sc.domScore : (d.domScore !== undefined ? d.domScore : (sc.D || 0));
 const inf = sc.infScore !== undefined ? sc.infScore : (d.infScore !== undefined ? d.infScore : (sc.I || 0));
 const est = sc.estScore !== undefined ? sc.estScore : (d.estScore !== undefined ? d.estScore : (sc.S || 0));
 const con = sc.conScore !== undefined ? sc.conScore : (d.conScore !== undefined ? d.conScore : (sc.C || 0));
 return {
 title: 'Gestão Comportamental (DISC)',
 color: '#db2777',
 bgColor: 'rgba(219,39,119,0.12)',
 badges: [
 { label: `D: ${dom}%`, color: '#ef4444' },
 { label: `I: ${inf}%`, color: '#f59e0b' },
 { label: `S: ${est}%`, color: '#10b981' },
 { label: `C: ${con}%`, color: '#3b82f6' }
 ],
 cardSummary: {
 s1: { lbl: 'Dominância', val: dom + '%' },
 s2: { lbl: 'Influência', val: inf + '%' },
 s3: { lbl: 'Estabilidade', val: est + '%' }
 }
 };

 case 'lideranca':
 const estL = sc.estrategia !== undefined ? sc.estrategia : (d.estrategia || 50);
 const ieL = sc.ie !== undefined ? sc.ie : (d.ie || 50);
 const eqL = sc.equipe !== undefined ? sc.equipe : (d.equipe || 50);
 return {
 title: 'Liderança (LeaderMap)',
 color: '#38b2d8',
 bgColor: 'rgba(56,178,216,0.12)',
 badges: [
 { label: `Estratégia ${estL}%`, color: '#38b2d8' },
 { label: `IE ${ieL}%`, color: '#7c6ee8' },
 { label: `Equipe ${eqL}%`, color: '#2dcc8f' }
 ],
 cardSummary: {
 s1: { lbl: 'Estratégia', val: estL + '%' },
 s2: { lbl: 'Int. Emoc.', val: ieL + '%' },
 s3: { lbl: 'Equipe', val: eqL + '%' }
 }
 };

 case 'comunicacao':
 const claC = sc.clareza !== undefined ? sc.clareza : (d.clareza || 50);
 const empC = sc.empatia !== undefined ? sc.empatia : (d.empatia || 50);
 const assC = sc.assertividade !== undefined ? sc.assertividade : (d.assertividade || 50);
 return {
 title: 'Comunicação',
 color: '#8b5cf6',
 bgColor: 'rgba(139,92,246,0.12)',
 badges: [
 { label: `Clareza ${claC}%`, color: '#8b5cf6' },
 { label: `Empatia ${empC}%`, color: '#ec4899' },
 { label: `Assertividade ${assC}%`, color: '#10b981' }
 ],
 cardSummary: {
 s1: { lbl: 'Clareza', val: claC + '%' },
 s2: { lbl: 'Empatia', val: empC + '%' },
 s3: { lbl: 'Assertividade', val: assC + '%' }
 }
 };

 case 'transicao':
 const claT = sc.clareza !== undefined ? sc.clareza : (d.clareza || 50);
 const proT = sc.prontidao !== undefined ? sc.prontidao : (d.prontidao || 50);
 const adaT = sc.adaptabilidade !== undefined ? sc.adaptabilidade : (d.adaptabilidade || 50);
 return {
 title: 'Transição de Carreira',
 color: '#f59e0b',
 bgColor: 'rgba(245,158,11,0.12)',
 badges: [
 { label: `Clareza ${claT}%`, color: '#f59e0b' },
 { label: `Prontidão ${proT}%`, color: '#10b981' },
 { label: `Adaptabilidade ${adaT}%`, color: '#3b82f6' }
 ],
 cardSummary: {
 s1: { lbl: 'Clareza', val: claT + '%' },
 s2: { lbl: 'Prontidão', val: proT + '%' },
 s3: { lbl: 'Adaptabilidade', val: adaT + '%' }
 }
 };

 case 'ie':
 const autIE = sc.autoconsciencia !== undefined ? sc.autoconsciencia : (d.autoconsciencia || 50);
 const regIE = sc.autoregulacao !== undefined ? sc.autoregulacao : (d.autoregulacao || 50);
 const empIE = sc.empatia !== undefined ? sc.empatia : (d.empatia || 50);
 return {
 title: 'Inteligência Emocional',
 color: '#10b981',
 bgColor: 'rgba(16,185,129,0.12)',
 badges: [
 { label: `Autoconsciência ${autIE}%`, color: '#10b981' },
 { label: `Autorregulação ${regIE}%`, color: '#6366f1' },
 { label: `Empatia ${empIE}%`, color: '#f59e0b' }
 ],
 cardSummary: {
 s1: { lbl: 'Autoconsciência', val: autIE + '%' },
 s2: { lbl: 'Autorregulação', val: regIE + '%' },
 s3: { lbl: 'Empatia', val: empIE + '%' }
 }
 };

 case 'produtividade':
 const focP = sc.foco !== undefined ? sc.foco : (d.foco || 50);
 const temP = sc.gestaoTempo !== undefined ? sc.gestaoTempo : (d.tempo || 50);
 const eneP = sc.energia !== undefined ? sc.energia : (d.energia || 50);
 return {
 title: 'Produtividade & Foco',
 color: '#06b6d4',
 bgColor: 'rgba(6,182,212,0.12)',
 badges: [
 { label: `Foco ${focP}%`, color: '#06b6d4' },
 { label: `Gestão de Tempo ${temP}%`, color: '#8b5cf6' },
 { label: `Energia ${eneP}%`, color: '#f59e0b' }
 ],
 cardSummary: {
 s1: { lbl: 'Foco', val: focP + '%' },
 s2: { lbl: 'Tempo', val: temP + '%' },
 s3: { lbl: 'Energia', val: eneP + '%' }
 }
 };

 case 'impostor':
 const autI = sc.autoeficacia !== undefined ? sc.autoeficacia : (d.autoeficacia || 50);
 const merI = sc.merecimento !== undefined ? sc.merecimento : (d.merecimento || 50);
 const perfI = sc.perfeccionismo !== undefined ? sc.perfeccionismo : (d.perfeccionismo || 50);
 return {
 title: 'Síndrome do Impostor',
 color: '#ec4899',
 bgColor: 'rgba(236,72,153,0.12)',
 badges: [
 { label: `Autoeficácia ${autI}%`, color: '#ec4899' },
 { label: `Merecimento ${merI}%`, color: '#10b981' },
 { label: `Perfeccionismo ${perfI}%`, color: '#ef4444' }
 ],
 cardSummary: {
 s1: { lbl: 'Autoeficácia', val: autI + '%' },
 s2: { lbl: 'Merecimento', val: merI + '%' },
 s3: { lbl: 'Perfeccionismo', val: perfI + '%' }
 }
 };

 case 'burnout':
 const exaB = sc.exaustao !== undefined ? sc.exaustao : (d.exaustao || 50);
 const vitB = sc.vitalidade !== undefined ? sc.vitalidade : (d.vitalidade || 50);
 const reaB = sc.realizacao !== undefined ? sc.realizacao : (d.realizacao || 50);
 return {
 title: 'Burnout & Vitalidade',
 color: '#ef4444',
 bgColor: 'rgba(239,68,68,0.12)',
 badges: [
 { label: `Exaustão ${exaB}%`, color: '#ef4444' },
 { label: `Vitalidade ${vitB}%`, color: '#10b981' },
 { label: `Realização ${reaB}%`, color: '#3b82f6' }
 ],
 cardSummary: {
 s1: { lbl: 'Exaustão', val: exaB + '%' },
 s2: { lbl: 'Vitalidade', val: vitB + '%' },
 s3: { lbl: 'Realização', val: reaB + '%' }
 }
 };

 case 'dever_de_casa_resp':
 const tasksArr = Array.isArray(d.tasks) ? d.tasks : [];
 const doneCount = tasksArr.filter(t => t.completed || t.done).length;
 const justCount = tasksArr.filter(t => !t.completed && !t.done && t.justification && t.justification.trim() !== '').length;
 const totalTasks = tasksArr.length;
 return {
 title: 'Dever de Casa (Retorno do Mentorado)',
 color: '#10b981',
 bgColor: 'rgba(16,185,129,0.12)',
 badges: [
 { label: `Concluídas: ${doneCount}/${totalTasks}`, color: '#10b981' },
 { label: `Justificadas: ${justCount}`, color: '#f59e0b' }
 ],
 cardSummary: {
 s1: { lbl: 'Tarefas', val: `${totalTasks} Total` },
 s2: { lbl: 'Checks', val: `${doneCount} Cumpridas` },
 s3: { lbl: 'Retorno', val: d.submittedAt ? new Date(d.submittedAt).toLocaleDateString('pt-BR') : 'Hoje' }
 }
 };

 case 'dever_de_casa_config':
 return {
 title: 'Dever de Casa (Cadastro de Tarefas)',
 color: '#6366f1',
 bgColor: 'rgba(99,102,241,0.12)',
 badges: [{ label: 'Configuração', color: '#6366f1' }],
 cardSummary: {
 s1: { lbl: 'Tipo', val: 'Configuração' },
 s2: { lbl: 'Status', val: 'Cadastrado' },
 s3: { lbl: 'Ação', val: 'Dever de Casa' }
 }
 };

 case 'trauma':
 default:
 const trustT = sc.trustIdx !== undefined ? sc.trustIdx : 50;
 const traumaT = sc.traumaAvg !== undefined ? sc.traumaAvg : 50;
 const regT = sc.regScore !== undefined ? sc.regScore : 50;
 const customTitle = tipo === 'trauma' ? 'Telemetria de Traumas' : `Telemetria (${tipo.toUpperCase()})`;
 return {
 title: customTitle,
 color: '#6366f1',
 bgColor: 'rgba(99,102,241,0.12)',
 badges: [
 { label: `Confiança ${trustT}`, color: '#6366f1' },
 { label: `Trauma ${traumaT}%`, color: '#c45a6a' },
 { label: `Reg. ${regT}%`, color: '#10b981' }
 ],
 cardSummary: {
 s1: { lbl: 'Confiança', val: trustT },
 s2: { lbl: 'Trauma', val: traumaT + '%' },
 s3: { lbl: 'Regulação', val: regT + '%' }
 }
 };
 }
}

// ── PARSE HISTORY ──
function cp_parseHistory(rawHistory) {
 if (!Array.isArray(rawHistory)) return [];
 return rawHistory.map((h, i) => {
 if (!h) return {};
 if (h.telemetriaData) h = h.telemetriaData;
 const oldDomains = (h.scores && h.scores.domains) || {};
 const oldDetails = (h.scores && h.scores.details) || {};
 const sc = h.scores || {};
 return {
 id: h.id || ('old_' + i),
 num: h.num || (i + 1),
 date: h.date || h.data || '',
 context: h.context || h.contexto || '',
 humor: h.humor || '',
 indicators: h.indicators || oldDetails,
 scores: {
 traumaAvg: sc.traumaAvg !== undefined ? sc.traumaAvg : (oldDomains['Padrões Traumáticos'] || 50),
 trustIdx: sc.trustIdx !== undefined ? sc.trustIdx : (oldDomains['Confiança & Vínculos'] || 50),
 regScore: sc.regScore !== undefined ? sc.regScore : (oldDomains['Regulação Emocional'] || 50),
 behAvg: sc.behAvg !== undefined ? sc.behAvg : (oldDomains['Padrões Comportamentais'] || 50),
 selfScore: sc.selfScore !== undefined ? sc.selfScore : (oldDomains['Identidade & Autoestima'] || 50)
 },
 aiAnalysis: h.aiAnalysis || '',
 mentorNotes: h.mentorNotes || h.notes || '',
 createdAt: h.createdAt || 0
 };
 });
}
function cp_parseHistoryLM(rawHistory) {
 if (!Array.isArray(rawHistory)) return [];
 return rawHistory.map((h, i) => {
 if (!h) return {};
 return {
 id: h.id || ('lm_' + i),
 num: h.num || (i + 1),
 date: h.date || '',
 context: h.context || '',
 humor: '',
 indicators: h.indicators || {},
 scores: h.scores || {},
 aiAnalysis: h.aiAnalysis || '',
 mentorNotes: h.notes || '',
 createdAt: h.createdAt || 0
 };
 });
}

// ── RENDER DASHBOARD ──
function cp_renderDashboardUI(sessions) {
 const emptyState = document.getElementById('cp-empty-state');
 const visaoMain = document.getElementById('cp-visao-main-content');
 try { cp_renderTimeline(sessions); } catch (e) { console.error('Linha do tempo:', e); }
 // a Visão Geral mostra a avaliação "em foco" (escolhida no topo); a linha do tempo segue a ordem normal
 sessions = cp_vgOrdenarFoco(sessions);
 const linhaCardsTopo = document.getElementById('cp-stat-cards'); if (linhaCardsTopo) linhaCardsTopo.style.display = '';
 const latest = sessions[0];
 const prev = sessions[1];

 if (!latest) {
 if (emptyState) emptyState.style.display = 'block';
 if (visaoMain) visaoMain.style.display = 'none';
 return;
 }

 if (emptyState) emptyState.style.display = 'none';
 if (visaoMain) visaoMain.style.display = 'block';

 // Dynamic rendering based on active session type
 const sessType = (latest.sessType || 'geral').toLowerCase();
 const d = latest.dadosDirect || {};
 const sc = latest.scores || {};

 const lblTrust = document.getElementById('cp-lbl-trust');
 const lblTrauma = document.getElementById('cp-lbl-trauma');
 const lblReg = document.getElementById('cp-lbl-reg');
 const lblSelf = document.getElementById('cp-lbl-self');
 const titleTraumas = document.getElementById('cp-title-traumas');
 const titleRadar = document.getElementById('cp-title-radar');

 const eyebrowEl = document.getElementById('cp-ai-eyebrow');
 const titleEl = document.getElementById('cp-ai-title');
 const bodyEl = document.getElementById('cp-ai-body');
 const traumaEl = document.getElementById('cp-traumas');
 const ctxRadar = document.getElementById('cp-radar');
 const insightsEl = document.getElementById('cp-insights');
 const risksEl = document.getElementById('cp-risks');

 const latestInfo = cp_getTelemetryInfo(latest);
 if (eyebrowEl) eyebrowEl.textContent = ` ${latestInfo.title} — Sessão ${latest.num} · ${latest.date}`;
 if (titleEl) titleEl.textContent = `Diagnóstico — ${latestInfo.title}`;

 const tInsPadrao = document.getElementById('cp-title-insights');
 const tRiskPadrao = document.getElementById('cp-title-risks');
 if (tInsPadrao) tInsPadrao.textContent = 'Insights';
 if (tRiskPadrao) tRiskPadrao.textContent = 'Indicadores de Atenção';

 // SMART, SWOT, Perfil & Compatibilidade e DISC: resumo + PDI estratégico
 const estrat = cp_resumoEstrategico(latest) || cp_resumoNeutro(latest);
 if (estrat) {
 cp_renderResumoEstrategico(estrat, { lblTrust, lblTrauma, lblReg, lblSelf, titleTraumas, titleRadar, bodyEl, traumaEl, ctxRadar, insightsEl, risksEl });
 return;
 }

 if (sessType === 'rodavida') {
 const rvScores = Array.isArray(d.scores) ? d.scores : (Array.isArray(d.dominios) ? d.dominios.map(x => x.score) : []);
 const domNames = [
 'Saúde e disposição', 'Desenvolvimento intelectual', 'Equilíbrio emocional',
 'Realização & propósito', 'Recursos financeiros', 'Contribuição social',
 'Família', 'Desenvolvimento amoroso', 'Vida social',
 'Criatividade & hobbies', 'Plenitude e felicidade', 'Espiritualidade'
 ];
 const domColors = [
 '#FF3B30', '#FF2D55', '#AF52DE',
 '#5856D6', '#007AFF', '#00C7BE',
 '#34C759', '#30B0C7', '#32ADE6',
 '#FFCC00', '#FF9500', '#FF6B00'
 ];

 const scores12 = domNames.map((_, i) => (typeof rvScores[i] === 'number' ? rvScores[i] : 5));
 const rvSum = scores12.reduce((a, b) => a + b, 0);
 const rvAvg = (rvSum / 12).toFixed(1);

 const quadPessoal = parseFloat(((scores12[0] + scores12[1] + scores12[2]) / 3).toFixed(1));
 const quadProf = parseFloat(((scores12[3] + scores12[4] + scores12[5]) / 3).toFixed(1));
 const quadRel = parseFloat(((scores12[6] + scores12[7] + scores12[8]) / 3).toFixed(1));
 const quadQual = parseFloat(((scores12[9] + scores12[10] + scores12[11]) / 3).toFixed(1));

 const quads = [
 { name: 'Pessoal', avg: quadPessoal },
 { name: 'Profissional', avg: quadProf },
 { name: 'Relacionamentos', avg: quadRel },
 { name: 'Qualidade de Vida', avg: quadQual }
 ];

 quads.sort((a, b) => b.avg - a.avg);
 const maxQuad = quads[0];
 const minQuad = quads[3];

 const criticos = Array.isArray(d.camposAtencaoAbaixo5) && d.camposAtencaoAbaixo5.length> 0
 ? d.camposAtencaoAbaixo5
 : domNames.map((n, i) => ({ name: n, score: scores12[i] })).filter(x => x.score < 5);
 const criticosCount = criticos.length;

 if (lblTrust) lblTrust.textContent = 'MÉDIA GERAL (RODA)';
 if (lblTrauma) lblTrauma.textContent = 'CAMPOS DE ATENÇÃO';
 if (lblReg) lblReg.textContent = 'MAIOR FORÇA';
 if (lblSelf) lblSelf.textContent = 'MAIOR ATENÇÃO';

 cp_setStatCard('cp-val-trust', 'cp-sub-trust', 'cp-bar-trust', `${rvAvg} / 10`, `${(rvAvg * 10).toFixed(0)}% Equilíbrio`, rvAvg * 10);
 cp_setStatCard('cp-val-trauma', 'cp-sub-trauma', 'cp-bar-trauma', `${criticosCount}`, `${criticosCount} área(s) < 5`, (criticosCount / 12) * 100);
 cp_setStatCard('cp-val-reg', 'cp-sub-reg', 'cp-bar-reg', maxQuad.name, `Média ${maxQuad.avg}/10`, maxQuad.avg * 10);
 cp_setStatCard('cp-val-self', 'cp-sub-self', 'cp-bar-self', minQuad.name, `Média ${minQuad.avg}/10`, minQuad.avg * 10);

 if (bodyEl) {
 const diagText = d.diagnosticoGeral || latest.aiAnalysis || latest.mentorNotes;
 bodyEl.textContent = diagText || `Diagnóstico da Roda da Vida & Mapa de Impacto para ${cp_currentMentee.nome}.\n\nMédia geral de ${rvAvg}/10 nos 12 domínios. Quadrante de maior força: ${maxQuad.name} (${maxQuad.avg}/10). Quadrante de maior atenção: ${minQuad.name} (${minQuad.avg}/10) com ${criticosCount} área(s) < 5.`;
 }

 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Pontuação dos 12 Domínios — Roda da Vida';
 if (titleRadar) titleRadar.textContent = 'Mapa de Impacto — 4 Quadrantes';

 if (traumaEl) {
 traumaEl.innerHTML = domNames.map((n, i) => {
 const scVal = scores12[i];
 const col = scVal < 5 ? '#ef4444' : domColors[i];
 return `<div class="cp-bar-row"><div class="cp-bar-lbl"><span>${n}</span><span style="color:${col}; font-weight:700;">${scVal}/10</span></div>
 <div class="cp-bar-bg"><div class="cp-bar-fill" style="width:${scVal * 10}%; background:${col};"></div></div>
 </div>`;
 }).join('');
 }

 if (cp_radarChart) { cp_radarChart.destroy(); cp_radarChart = null; }
 if (ctxRadar) {
 cp_radarChart = new Chart(ctxRadar, {
 type: 'radar',
 data: {
 labels: ['Pessoal', 'Profissional', 'Relacionamentos', 'Qualidade de Vida'],
 datasets: [{
 data: [quadPessoal * 10, quadProf * 10, quadRel * 10, quadQual * 10],
 backgroundColor: 'rgba(37, 99, 235, 0.15)',
 borderColor: '#2563EB',
 borderWidth: 2,
 pointBackgroundColor: '#2563EB',
 pointRadius: 5
 }]
 },
 options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25 }, pointLabels: { font: { size: 11, weight: 'bold' } } } } }
 });
 cp_aplicarEstiloRadar(cp_radarChart);
 }

 const pdiRoda = (Array.isArray(d.dominios) ? d.dominios : []).filter(x => (x.planoAcao || '').trim());
 const tInsRoda = document.getElementById('cp-title-insights');
 if (tInsRoda) tInsRoda.textContent = 'PDI Estratégico & Insights';
 if (insightsEl) {
 insightsEl.innerHTML = pdiRoda.map(x => `<div class="cp-insight-row ir-green"><div class="cp-insight-title">${cp_esc(x.name)} (${cp_esc(x.score)}/10)</div><div class="cp-insight-text">${cp_esc(x.planoAcao)}</div></div>`).join('') + [
 { t: `Força em ${maxQuad.name}`, tx: `Maior equilíbrio do mentorado no quadrante ${maxQuad.name} (${maxQuad.avg}/10).`, c: 'green' },
 { t: `Atenção em ${minQuad.name}`, tx: `Intervenção direcionada recomendada para ${minQuad.name} (${minQuad.avg}/10).`, c: minQuad.avg < 5 ? 'red' : 'yellow' },
 { t: `Campos Críticos (< 5)`, tx: criticosCount> 0 ? `${criticosCount} área(s) necessitam plano de ação imediato.` : 'Todas as notas ≥ 5.', c: criticosCount> 0 ? 'red' : 'green' }
 ].map(i => `<div class="cp-insight-row ir-${i.c}"><div class="cp-insight-title">${i.t}</div><div class="cp-insight-text">${i.tx}</div></div>`).join('');
 }

 if (risksEl) {
 const risks = domNames.map((n, i) => ({ l: n, v: scores12[i] })).filter(x => x.v < 6);
 risksEl.innerHTML = risks.length === 0
 ? `<div style="padding:12px; font-size:13px; color:#10b981; font-weight:600;">Todos os domínios satisfatórios (≥ 6/10).</div>`
 : risks.map(r => `<div class="cp-indicator-row"><span>${r.l}</span><span class="cp-badge ${r.v < 5 ? 'cp-badge-high' : 'cp-badge-med'}">${r.v < 5 ? 'Crítico' : 'Atenção'} (${r.v}/10)</span></div>`).join('');
 }
 return;
 }

 // Dynamic metrics helper for standard telemetries
 let m1 = { lbl: 'DOMÍNIOS', val: 50, sub: '%', bar: 50 };
 let m2 = { lbl: 'ÍNDICE', val: 50, sub: '%', bar: 50 };
 let m3 = { lbl: 'MÉDIA', val: 50, sub: '%', bar: 50 };
 let m4 = { lbl: 'STATUS', val: 50, sub: '%', bar: 50 };
 let chartLabels = [];
 let chartData = [];
 let barItems = [];

 if (sessType === 'disc') {
 const dom = sc.domScore !== undefined ? sc.domScore : (d.domScore !== undefined ? d.domScore : (sc.D || 0));
 const inf = sc.infScore !== undefined ? sc.infScore : (d.infScore !== undefined ? d.infScore : (sc.I || 0));
 const est = sc.estScore !== undefined ? sc.estScore : (d.estScore !== undefined ? d.estScore : (sc.S || 0));
 const con = sc.conScore !== undefined ? sc.conScore : (d.conScore !== undefined ? d.conScore : (sc.C || 0));

 m1 = { lbl: 'DOMINÂNCIA (D)', val: `${dom}%`, sub: 'Perfil DISC', bar: dom };
 m2 = { lbl: 'INFLUÊNCIA (I)', val: `${inf}%`, sub: 'Perfil DISC', bar: inf };
 m3 = { lbl: 'ESTABILIDADE (S)', val: `${est}%`, sub: 'Perfil DISC', bar: est };
 m4 = { lbl: 'CONFORMIDADE (C)', val: `${con}%`, sub: 'Perfil DISC', bar: con };

 chartLabels = ['Dominância', 'Influência', 'Estabilidade', 'Conformidade'];
 chartData = [dom, inf, est, con];
 barItems = [
 { name: 'Dominância (D)', v: dom, color: '#ef4444' },
 { name: 'Influência (I)', v: inf, color: '#f59e0b' },
 { name: 'Estabilidade (S)', v: est, color: '#10b981' },
 { name: 'Conformidade (C)', v: con, color: '#3b82f6' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Perfil DISC de ${cp_currentMentee.nome}.\n\nDominância: ${dom}%, Influência: ${inf}%, Estabilidade: ${est}%, Conformidade: ${con}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Dimensões do Perfil DISC';
 if (titleRadar) titleRadar.textContent = 'Radar de Perfil DISC';

 } else if (sessType === 'lideranca') {
 const estL = sc.estrategia !== undefined ? sc.estrategia : (d.estrategia || 50);
 const ieL = sc.ie !== undefined ? sc.ie : (d.ie || 50);
 const eqL = sc.equipe !== undefined ? sc.equipe : (d.equipe || 50);
 const avgL = Math.round((estL + ieL + eqL) / 3);

 m1 = { lbl: 'ESTRATÉGIA', val: `${estL}%`, sub: 'LeaderMap', bar: estL };
 m2 = { lbl: 'INTEL. EMOCIONAL', val: `${ieL}%`, sub: 'LeaderMap', bar: ieL };
 m3 = { lbl: 'GESTÃO DE EQUIPE', val: `${eqL}%`, sub: 'LeaderMap', bar: eqL };
 m4 = { lbl: 'MÉDIA LIDERANÇA', val: `${avgL}%`, sub: 'Geral', bar: avgL };

 chartLabels = ['Estratégia', 'Inteligência Emocional', 'Gestão de Equipe'];
 chartData = [estL, ieL, eqL];
 barItems = [
 { name: 'Visão Estratégica', v: estL, color: '#38b2d8' },
 { name: 'Inteligência Emocional', v: ieL, color: '#7c6ee8' },
 { name: 'Gestão de Equipe', v: eqL, color: '#2dcc8f' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Liderança (LeaderMap) de ${cp_currentMentee.nome}.\n\nEstratégia em ${estL}%, Inteligência Emocional em ${ieL}% e Gestão de Equipe em ${eqL}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Competências de Liderança';
 if (titleRadar) titleRadar.textContent = 'Radar LeaderMap';

 } else if (sessType === 'comunicacao') {
 const claC = sc.clareza !== undefined ? sc.clareza : (d.clareza || 50);
 const empC = sc.empatia !== undefined ? sc.empatia : (d.empatia || 50);
 const assC = sc.assertividade !== undefined ? sc.assertividade : (d.assertividade || 50);
 const avgC = Math.round((claC + empC + assC) / 3);

 m1 = { lbl: 'CLAREZA', val: `${claC}%`, sub: 'Comunicação', bar: claC };
 m2 = { lbl: 'EMPATIA', val: `${empC}%`, sub: 'Comunicação', bar: empC };
 m3 = { lbl: 'ASSERTIVIDADE', val: `${assC}%`, sub: 'Comunicação', bar: assC };
 m4 = { lbl: 'MÉDIA GERAL', val: `${avgC}%`, sub: 'Comunicação', bar: avgC };

 chartLabels = ['Clareza', 'Empatia', 'Assertividade'];
 chartData = [claC, empC, assC];
 barItems = [
 { name: 'Clareza de Expressão', v: claC, color: '#8b5cf6' },
 { name: 'Empatia & Escuta', v: empC, color: '#ec4899' },
 { name: 'Assertividade', v: assC, color: '#10b981' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Comunicação de ${cp_currentMentee.nome}.\n\nClareza em ${claC}%, Empatia em ${empC}% e Assertividade em ${assC}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Pilares da Comunicação';
 if (titleRadar) titleRadar.textContent = 'Radar de Comunicação';

 } else if (sessType === 'transicao') {
 const claT = sc.clareza !== undefined ? sc.clareza : (d.clareza || 50);
 const proT = sc.prontidao !== undefined ? sc.prontidao : (d.prontidao || 50);
 const adaT = sc.adaptabilidade !== undefined ? sc.adaptabilidade : (d.adaptabilidade || 50);
 const avgT = Math.round((claT + proT + adaT) / 3);

 m1 = { lbl: 'CLAREZA DE CARREIRA', val: `${claT}%`, sub: 'Transição', bar: claT };
 m2 = { lbl: 'PRONTIDÃO', val: `${proT}%`, sub: 'Transição', bar: proT };
 m3 = { lbl: 'ADAPTABILIDADE', val: `${adaT}%`, sub: 'Transição', bar: adaT };
 m4 = { lbl: 'ÍNDICE DE PREPARO', val: `${avgT}%`, sub: 'Transição', bar: avgT };

 chartLabels = ['Clareza', 'Prontidão', 'Adaptabilidade'];
 chartData = [claT, proT, adaT];
 barItems = [
 { name: 'Clareza Objetiva', v: claT, color: '#f59e0b' },
 { name: 'Prontidão para Mudança', v: proT, color: '#10b981' },
 { name: 'Adaptabilidade', v: adaT, color: '#3b82f6' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Transição de Carreira de ${cp_currentMentee.nome}.\n\nClareza em ${claT}%, Prontidão em ${proT}% e Adaptabilidade em ${adaT}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Fatores de Transição';
 if (titleRadar) titleRadar.textContent = 'Radar de Transição';

 } else if (sessType === 'ie') {
 const autIE = sc.autoconsciencia !== undefined ? sc.autoconsciencia : (d.autoconsciencia || 50);
 const regIE = sc.autoregulacao !== undefined ? sc.autoregulacao : (d.autoregulacao || 50);
 const empIE = sc.empatia !== undefined ? sc.empatia : (d.empatia || 50);
 const avgIE = Math.round((autIE + regIE + empIE) / 3);

 m1 = { lbl: 'AUTOCONSCIÊNCIA', val: `${autIE}%`, sub: 'Int. Emocional', bar: autIE };
 m2 = { lbl: 'AUTORREGULAÇÃO', val: `${regIE}%`, sub: 'Int. Emocional', bar: regIE };
 m3 = { lbl: 'EMPATIA', val: `${empIE}%`, sub: 'Int. Emocional', bar: empIE };
 m4 = { lbl: 'MÉDIA IE', val: `${avgIE}%`, sub: 'Int. Emocional', bar: avgIE };

 chartLabels = ['Autoconsciência', 'Autorregulação', 'Empatia'];
 chartData = [autIE, regIE, empIE];
 barItems = [
 { name: 'Autoconsciência', v: autIE, color: '#10b981' },
 { name: 'Autorregulação Emocional', v: regIE, color: '#6366f1' },
 { name: 'Empatia Interpessoal', v: empIE, color: '#f59e0b' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Inteligência Emocional de ${cp_currentMentee.nome}.\n\nAutoconsciência em ${autIE}%, Autorregulação em ${regIE}% e Empatia em ${empIE}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Competências Emocionais';
 if (titleRadar) titleRadar.textContent = 'Radar de Inteligência Emocional';

 } else if (sessType === 'produtividade') {
 const focP = sc.foco !== undefined ? sc.foco : (d.foco || 50);
 const temP = sc.gestaoTempo !== undefined ? sc.gestaoTempo : (d.tempo || 50);
 const eneP = sc.energia !== undefined ? sc.energia : (d.energia || 50);
 const avgP = Math.round((focP + temP + eneP) / 3);

 m1 = { lbl: 'FOCO & ATENÇÃO', val: `${focP}%`, sub: 'Produtividade', bar: focP };
 m2 = { lbl: 'GESTÃO DE TEMPO', val: `${temP}%`, sub: 'Produtividade', bar: temP };
 m3 = { lbl: 'ENERGIA', val: `${eneP}%`, sub: 'Produtividade', bar: eneP };
 m4 = { lbl: 'MÉDIA PRODUTIVIDADE', val: `${avgP}%`, sub: 'Produtividade', bar: avgP };

 chartLabels = ['Foco', 'Gestão de Tempo', 'Energia'];
 chartData = [focP, temP, eneP];
 barItems = [
 { name: 'Foco & Concentração', v: focP, color: '#06b6d4' },
 { name: 'Gestão de Tempo & Prioridades', v: temP, color: '#8b5cf6' },
 { name: 'Energia & Disposição', v: eneP, color: '#f59e0b' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Produtividade & Foco de ${cp_currentMentee.nome}.\n\nFoco em ${focP}%, Gestão de Tempo em ${temP}% e Energia em ${eneP}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Pilares de Produtividade';
 if (titleRadar) titleRadar.textContent = 'Radar de Produtividade';

 } else if (sessType === 'impostor') {
 const autI = sc.autoeficacia !== undefined ? sc.autoeficacia : (d.autoeficacia || 50);
 const merI = sc.merecimento !== undefined ? sc.merecimento : (d.merecimento || 50);
 const perfI = sc.perfeccionismo !== undefined ? sc.perfeccionismo : (d.perfeccionismo || 50);
 const riskI = Math.round((100 - merI + perfI) / 2);

 m1 = { lbl: 'AUTOEFICÁCIA', val: `${autI}%`, sub: 'Síndrome Impostor', bar: autI };
 m2 = { lbl: 'MERECIMENTO', val: `${merI}%`, sub: 'Síndrome Impostor', bar: merI };
 m3 = { lbl: 'PERFECCIONISMO', val: `${perfI}%`, sub: 'Síndrome Impostor', bar: perfI };
 m4 = { lbl: 'NÍVEL IMPOSTOR', val: `${riskI}%`, sub: 'Risco', bar: riskI };

 chartLabels = ['Autoeficácia', 'Merecimento', 'Perfeccionismo'];
 chartData = [autI, merI, perfI];
 barItems = [
 { name: 'Autoeficácia percebida', v: autI, color: '#ec4899' },
 { name: 'Sentimento de Merecimento', v: merI, color: '#10b981' },
 { name: 'Perfeccionismo disfuncional', v: perfI, color: '#ef4444' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Síndrome do Impostor de ${cp_currentMentee.nome}.\n\nAutoeficácia em ${autI}%, Merecimento em ${merI}% e Perfeccionismo em ${perfI}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Indicadores de Autoimagem';
 if (titleRadar) titleRadar.textContent = 'Radar de Autoeficácia';

 } else if (sessType === 'burnout') {
 const exaB = sc.exaustao !== undefined ? sc.exaustao : (d.exaustao || 50);
 const vitB = sc.vitalidade !== undefined ? sc.vitalidade : (d.vitalidade || 50);
 const reaB = sc.realizacao !== undefined ? sc.realizacao : (d.realizacao || 50);
 const riskB = exaB>= 70 ? 'Alto' : exaB>= 45 ? 'Moderado' : 'Leve';

 m1 = { lbl: 'EXAUSTÃO EMOCIONAL', val: `${exaB}%`, sub: 'Burnout', bar: exaB };
 m2 = { lbl: 'VITALIDADE', val: `${vitB}%`, sub: 'Vitalidade', bar: vitB };
 m3 = { lbl: 'REALIZAÇÃO', val: `${reaB}%`, sub: 'Realização', bar: reaB };
 m4 = { lbl: 'RISCO DE BURNOUT', val: riskB, sub: 'Avaliação', bar: exaB };

 chartLabels = ['Exaustão', 'Vitalidade', 'Realização'];
 chartData = [exaB, vitB, reaB];
 barItems = [
 { name: 'Exaustão Emocional', v: exaB, color: '#ef4444' },
 { name: 'Nível de Vitalidade', v: vitB, color: '#10b981' },
 { name: 'Realização Pessoal', v: reaB, color: '#3b82f6' }
 ];

 if (bodyEl) bodyEl.textContent = latest.aiAnalysis || `Avaliação de Burnout & Vitalidade de ${cp_currentMentee.nome}.\n\nExaustão em ${exaB}%, Vitalidade em ${vitB}% e Realização em ${reaB}%.`;
 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Dimensões de Vitalidade & Burnout';
 if (titleRadar) titleRadar.textContent = 'Radar de Burnout & Vitalidade';

 } else {
 // Fallback for Trauma / Geral
 const latestTrauma = sessions.find(s => s.sessType === 'trauma') || latest || { scores: { traumaAvg: 50, trustIdx: 50, regScore: 50, selfScore: 50 } };
 const sT = latestTrauma.scores || { traumaAvg: 50, trustIdx: 50, regScore: 50, selfScore: 50 };
 const trAvg = sT.traumaAvg !== undefined ? sT.traumaAvg : 50;
        const trIdx = sT.trustIdx !== undefined ? sT.trustIdx : 50;
        const rScore = sT.regScore !== undefined ? sT.regScore : 50;
        const sScore = sT.selfScore !== undefined ? sT.selfScore : 50;
        const tLoad = trAvg >= 70 ? 'Severo' : trAvg >= 50 ? 'Alto' : trAvg >= 30 ? 'Moderado' : 'Leve';

        m1 = { lbl: 'ÍNDICE DE CONFIANÇA', val: trIdx, sub: 'de 100', bar: trIdx };
        m2 = { lbl: 'CARGA TRAUMÁTICA', val: tLoad, sub: `${trAvg}%`, bar: trAvg };
        m3 = { lbl: 'REGULAÇÃO EMOCIONAL', val: `${rScore}%`, sub: 'Regulação', bar: rScore };
        m4 = { lbl: 'AUTOESTIMA', val: `${sScore}%`, sub: 'Autoestima', bar: sScore };

 function getInd(keyOrName, fallback=50) {
 if (!latest.indicators) return fallback;
 if (latest.indicators[keyOrName] !== undefined) return latest.indicators[keyOrName];
 const lowerKey = keyOrName.toLowerCase();
 for (let k in latest.indicators) {
 if (k.toLowerCase().includes(lowerKey)) return latest.indicators[k];
 if (lowerKey.includes(k.toLowerCase())) return latest.indicators[k];
 }
 return fallback;
 }

 chartLabels = ['Confiança\nInterpessoal', 'Autoconfiança', 'Esperança', 'Pede\nApoio', 'Segurança\nVincular', 'Equilíbrio\nRelacional'];
 chartData = [
 getInd('confianca_geral', getInd('Confiança', sT.trustIdx)),
 getInd('autoconfianca', getInd('Autoconfiança e segurança pessoal', sT.selfScore)),
 getInd('esperanca', getInd('Visão positiva de futuro (esperança)', 60)),
 getInd('pedir_apoio', getInd('Capacidade de pedir apoio', 55)),
 100 - getInd('medo_abandono', getInd('Medo de abandono (insegurança)', 50)),
 100 - getInd('idealizacao', getInd('Tendência à idealização/desvalorização', 50))
 ];

 barItems = CP_TRAUMA_INDICATORS.map(t => {
 const valK = getInd(t.k, null);
 const valName = getInd(t.name, null);
 const v = valK !== null ? valK : (valName !== null ? valName : 50);
 return { name: t.name, v: v, color: t.color };
 });

 if (bodyEl) {
 if (latest.aiAnalysis) {
 bodyEl.textContent = latest.aiAnalysis;
 } else {
 const tl = sT.traumaAvg>= 70 ? 'severa' : sT.traumaAvg>= 50 ? 'alta' : sT.traumaAvg>= 30 ? 'moderada' : 'leve';
 bodyEl.textContent = `Sessão ${latest.num} (${latestInfo.title}) de ${cp_currentMentee.nome}.\n\nO perfil desta sessão revela carga traumática ${tl} (${sT.traumaAvg}%) com índice de confiança em ${sT.trustIdx}/100. A regulação emocional apresenta-se em ${sT.regScore}%.`;
 }
 }

 if (titleTraumas) (titleTraumas.style.display = '', titleTraumas).textContent = 'Mapa de Padrões Traumáticos';
 if (titleRadar) titleRadar.textContent = 'Domínios de Confiança — Radar';
 }

 // Apply Stat Cards
 if (lblTrust) lblTrust.textContent = m1.lbl;
 if (lblTrauma) lblTrauma.textContent = m2.lbl;
 if (lblReg) lblReg.textContent = m3.lbl;
 if (lblSelf) lblSelf.textContent = m4.lbl;

 cp_setStatCard('cp-val-trust', 'cp-sub-trust', 'cp-bar-trust', m1.val, m1.sub, m1.bar);
 cp_setStatCard('cp-val-trauma', 'cp-sub-trauma', 'cp-bar-trauma', m2.val, m2.sub, m2.bar);
 cp_setStatCard('cp-val-reg', 'cp-sub-reg', 'cp-bar-reg', m3.val, m3.sub, m3.bar);
 cp_setStatCard('cp-val-self', 'cp-sub-self', 'cp-bar-self', m4.val, m4.sub, m4.bar);

 // Apply Left Bars
 if (traumaEl && barItems.length> 0) {
 traumaEl.innerHTML = barItems.map(item => `
 <div class="cp-bar-row"><div class="cp-bar-lbl"><span>${item.name}</span><span style="color:${item.color}; font-weight:600;">${item.v}%</span></div>
 <div class="cp-bar-bg"><div class="cp-bar-fill" style="width:${Math.min(100, Math.max(0, item.v))}%; background:${item.color};"></div></div>
 </div>
 `).join('');
 }

 // Apply Radar Chart
 if (cp_radarChart) { cp_radarChart.destroy(); cp_radarChart = null; }
 if (ctxRadar && chartLabels.length> 0) {
 cp_radarChart = new Chart(ctxRadar, {
 type: 'radar',
 data: {
 labels: chartLabels,
 datasets: [{
 data: chartData,
 backgroundColor: 'rgba(99,102,241,0.12)',
 borderColor: '#6366f1',
 borderWidth: 2,
 pointBackgroundColor: '#6366f1',
 pointRadius: 4
 }]
 },
 options: {
 responsive: true,
 maintainAspectRatio: false,
 plugins: { legend: { display: false } },
 scales: {
 r: {
 min: 0, max: 100,
 ticks: { stepSize: 25, font: { size: 9 }, color: '#94a3b8', backdropColor: 'transparent' },
 grid: { color: 'rgba(226,232,240,0.8)' },
 pointLabels: { font: { size: 9 }, color: '#64748b' }
 }
 }
 }
 });
 cp_aplicarEstiloRadar(cp_radarChart);
 }

 // Apply Insights & Risks
 if (insightsEl) {
 const insights = barItems.map(b => ({
 t: b.name,
 tx: `Pontuação registrada: ${b.v}%.`,
 c: b.v>= 70 ? 'green' : b.v>= 45 ? 'yellow' : 'red'
 }));
 insightsEl.innerHTML = insights.slice(0, 4).map(i =>
 `<div class="cp-insight-row ir-${i.c}"><div class="cp-insight-title">${i.t}</div>
 <div class="cp-insight-text">${i.tx}</div>
 </div>`
 ).join('');
 }

 if (risksEl) {
 const risks = barItems.map(b => ({ l: b.name, v: b.v }));
 risksEl.innerHTML = risks.map(r => {
 const cls = r.v < 40 ? 'cp-badge-high' : r.v < 60 ? 'cp-badge-med' : 'cp-badge-low';
 const lv = r.v < 40 ? 'Atenção Elevada' : r.v < 60 ? 'Moderado' : 'Estável';
 return `<div class="cp-indicator-row"><span>${r.l}</span>
 <span class="cp-badge ${cls}">${lv} (${r.v}%)</span>
 </div>`;
 }).join('');
 }

 }

// Linha do tempo do Histórico: renderizada SEMPRE (antes, alguns tipos de sessão
// saíam da função antes de chegar aqui e o Histórico ficava vazio)
function cp_renderTimeline(sessions) {
 // ── TIMELINE ──
 const timelineEl = document.getElementById('cp-timeline');
 if (timelineEl) {
 // Uma sessão por DIA: tudo o que foi feito no mesmo dia (telemetrias, Roda da Vida,
 // dever de casa, bloco de notas...) aparece junto numa única entrada da linha do tempo.
 const dias = cp_agruparPorDia(sessions, cp_currentMentee ? cp_currentMentee.id : null);
 window.cp_diasTimeline = dias;
 timelineEl.innerHTML = dias.length ? dias.map((dia, k) => {
 const nomes = [...new Set(dia.itens.map(it => it.nome))];
 return `
 <div class="cp-timeline-item cp-dia ${k !== 0 ? 'old' : ''}" data-dia="${k}" style="cursor:pointer; transition:0.2s;" onclick="cp_abrirDia(${k})"><div class="cp-timeline-date">${cp_esc(dia.rotulo)} · Sessão ${dia.numero}</div>
 <div class="cp-timeline-card"><div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px;"><div style="font-weight:600; font-size:13px; color:#0f172a; line-height:1.4; flex:1;">${cp_esc(nomes.join(' · '))}</div>
 ${k === 0 ? '<span style="font-size:10px; background:#EDE7FB; color:#5B2DA3; padding:2px 8px; border-radius:12px; font-weight:600; white-space:nowrap; flex-shrink:0;">Mais recente</span>' : ''}
 </div>
 <div style="display:flex; gap:6px; flex-wrap:wrap;"><span class="cp-badge" style="background:#F5F3FF; color:#5B2DA3;">${dia.itens.length} ${dia.itens.length === 1 ? 'atividade' : 'atividades'}</span></div>
 </div>
 </div>`;
 }).join('') : '<div style="padding:12px; font-size:13px; color:#94A3B8;">Nenhuma sessão registrada ainda.</div>';

 window.cp_showSessionDetail = function(idx) {
 const sess = sessions[idx];
 if (!sess) return;
 const info = cp_getTelemetryInfo(sess);
 const contextStr = cp_esc(sess.context || 'Sessão individual');
 const humorStr = sess.humor ? ` · Humor: ${cp_esc(sess.humor)}` : '';
 const currentSessType = (sess.sessType || '').toLowerCase().trim();
 const menteeId = cp_currentMentee ? cp_currentMentee.id : '';
 
 // ── 1. RENDERIZAÇÃO DEDICADA PARA RODA DA VIDA & MAPA DE IMPACTO ──
 if (currentSessType.includes('roda') || currentSessType.includes('rodavida')) {
 const d = sess.dadosDirect || {};
 const criticos = Array.isArray(d.camposAtencaoAbaixo5) ? d.camposAtencaoAbaixo5 : [];
 const diagGeralText = d.diagnosticoGeral || sess.mentorNotes || 'Nenhum diagnóstico geral informado.';
 
 let criticosHTML = '';
 if (criticos.length === 0) {
 criticosHTML = `<div style="padding:12px 14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; color:#166534; font-size:13px;">Nenhum campo crítico (pontuação &lt; 5) nesta avaliação.</div>`;
 } else {
 criticos.forEach(c => {
 criticosHTML += `
 <div style="margin-bottom:12px; padding:12px 14px; background:#fffafa; border:1px solid #fee2e2; border-left:4px solid #ef4444; border-radius:8px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><strong style="font-size:14px; color:#1e293b;">${cp_esc(c.name)} (${cp_esc(c.quad || '')})</strong>
 <span style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:11px; padding:2px 8px; border-radius:10px;">Score: ${cp_esc(c.score)} / 10 — Crítico</span>
 </div>
 ${c.obs ? `<div style="font-size:12px; color:#475569; margin-bottom:6px;"><em>Observação:</em> ${cp_esc(c.obs)}</div>` : ''}
 <div style="padding:8px 10px; background:#fff; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; color:#334155;"><strong>Plano de Ação:</strong> ${cp_esc(c.planoAcao || 'Nenhum plano de ação registrado.')}
 </div>
 </div>`;
 });
 }

 let dominiosHTML = '';
 if (Array.isArray(d.dominios)) {
 dominiosHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; margin-top:10px;">`;
 d.dominios.forEach(dom => {
 const isCritico = dom.score < 5;
 dominiosHTML += `
 <div style="background:#f8fafc; border:1px solid ${isCritico ? '#fca5a5' : '#e2e8f0'}; border-radius:8px; padding:10px;"><div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:#1e293b;"><span>${cp_esc(dom.name)}</span>
 <span style="background:${isCritico ? '#ef4444' : '#4f46e5'}; color:#fff; padding:2px 6px; border-radius:6px; font-size:11px;">${cp_esc(dom.score)}/10</span>
 </div>
 ${dom.obs ? `<div style="font-size:11px; color:#64748b; margin-top:4px; font-style:italic;">"${cp_esc(dom.obs)}"</div>` : ''}
 </div>`;
 });
 dominiosHTML += `</div>`;
 }

 document.getElementById('cp-session-detail-content').innerHTML = `
 <div style="margin-bottom:1.5rem; padding-bottom:1.5rem; border-bottom:1px solid #e2e8f0;"><div style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:6px;">Sessão ${cp_esc(sess.num||idx+1)} — Roda da Vida & Mapa de Impacto (${cp_esc(sess.date||'--')})</div>
 <div style="font-size:13px; color:#64748b;">Diagnóstico completo dos 12 domínios de desenvolvimento</div>
 </div>
 
 <div style="margin-bottom:1.5rem;"><div style="font-size:11px; font-weight:700; color:#ef4444; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">CAMPOS DE MAIOR ATENÇÃO (&lt; 5) & PLANO DE AÇÃO
 </div>
 <div>${criticosHTML}</div>
 </div>

 <div><div style="font-size:11px; font-weight:700; color:#4f46e5; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">PONTUAÇÃO DOS 12 DOMÍNIOS
 </div>
 <div>${dominiosHTML}</div>
 </div>
 `;

 document.getElementById('cp-mentor-analysis-wrapper').innerHTML = `
 <div class="cp-panel" style="margin-bottom:0;"><div class="cp-panel-title" style="font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:12px; border:none; padding:0;">DIAGNÓSTICO ESTRATÉGICO DO MENTOR</div>
 <div style="font-size:14px; color:#334155; line-height:1.6; white-space:pre-wrap;">${cp_esc(diagGeralText)}
 </div>
 </div>
 `;

 document.querySelectorAll('.cp-timeline-item').forEach((el, i) => {
 const card = el.querySelector('.cp-timeline-card');
 const dot = el.querySelector('.cp-timeline-date');
 if (i === idx) {
 el.style.opacity = '1';
 if (card) {
 card.style.borderColor = info.color || '#6366f1';
 card.style.background = '#f8fafc';
 }
 if (dot) dot.style.color = '#5b2da3';
 } else {
 el.style.opacity = '0.6';
 if (card) {
 card.style.borderColor = '#e2e8f0';
 card.style.background = '#ffffff';
 }
 if (dot) dot.style.color = '#64748b';
 }
 });
 return;
 }

 // ── 1.5. RENDERIZAÇÃO DEDICADA PARA RETORNO DO DEVER DE CASA ──
 if (currentSessType === 'dever_de_casa_resp') {
 const d = sess.dadosDirect || {};
 const tasksArr = Array.isArray(d.tasks) ? d.tasks : [];
 const submittedFmt = d.submittedAt 
 ? new Date(d.submittedAt).toLocaleDateString('pt-BR') + ' às ' + new Date(d.submittedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
 : (sess.date || 'Data não registrada');

 const doneCount = tasksArr.filter(t => t.completed || t.done).length;
 const totalTasks = tasksArr.length;
 const isComplete = totalTasks> 0 && doneCount === totalTasks;

 let tasksListHtml = '';
 tasksArr.forEach((t, i) => {
 const isDone = t.completed || t.done;
 const just = t.justification || t.justificativa || '';
 const dateReturn = t.completedAt ? new Date(t.completedAt).toLocaleDateString('pt-BR') : '';

 const badgeHtml = isDone 
 ? '<span style="background:#D1FAE5; color:#047857; font-weight:700; font-size:11px; padding:3px 10px; border-radius:100px;">[Concluída]</span>'
 : (just ? '<span style="background:#FEF3C7; color:#B45309; font-weight:700; font-size:11px; padding:3px 10px; border-radius:100px;">[Justificada]</span>'
 : '<span style="background:#F1F5F9; color:#64748B; font-weight:600; font-size:11px; padding:3px 10px; border-radius:100px;">[Pendente]</span>');

 tasksListHtml += `
 <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:14px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.02);"><div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:6px;"><div style="font-size:14px; font-weight:600; color:#1E293B;">${i + 1}. ${cp_esc(String(t.taskText || t.text || t.task || 'Tarefa'))}</div>
 ${badgeHtml}
 </div>
 ${dateReturn ? `<div style="font-size:11px; color:#64748B; margin-bottom:6px;">Data do retorno: ${dateReturn}</div>` : ''}
 ${window.DeverEstrutura ? DeverEstrutura.htmlRespostaMentor(t) : ''}
 ${just && !(Array.isArray(t.semanas) && t.semanas.length) && !(Array.isArray(t.prazos) && t.prazos.length) ? `
 <div style="margin-top:8px; padding:10px 12px; background:#FFFBEB; border-left:3px solid #F59E0B; border-radius:6px; font-size:12px; color:#92400E; line-height:1.4;"><strong>Justificativa do Mentorado:</strong> "${cp_esc(String(just))}"
 </div>
 ` : ''}
 </div>
 `;
 });

 const mentorNotesText = d.anotacoesMentor || d.analiseMentor || d.notes || sess.mentorNotes || '';

 document.getElementById('cp-session-detail-content').innerHTML = `
 <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;"><div><div style="font-size:18px; font-weight:700; color:#0f172a; margin-bottom:4px;">Sessão ${cp_esc(sess.num||idx+1)} — Dever de Casa (Retorno do Mentorado)
 </div>
 <div style="font-size:13px; color:#64748b;">Entregue pelo mentorado em: <strong>${cp_esc(submittedFmt)}</strong>
 </div>
 </div>
 <span style="background:${isComplete ? '#D1FAE5' : '#EEF2FF'}; color:${isComplete ? '#047857' : '#4F46E5'}; font-weight:700; font-size:12px; padding:6px 14px; border-radius:100px;">${isComplete ? '100% Concluído' : 'Entrega Registrada (' + doneCount + '/' + totalTasks + ')'}
 </span>
 </div>
 </div>

 <div style="margin-bottom:1.5rem;"><div style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; margin-bottom:12px;">LISTA DE TAREFAS, CHECKS E JUSTIFICATIVAS
 </div>
 ${tasksListHtml || '<div style="color:#64748b;">Nenhuma tarefa encontrada neste retorno.</div>'}
 </div>
 `;

 document.getElementById('cp-mentor-analysis-wrapper').innerHTML = `
 <div class="cp-panel" style="margin-bottom:0;"><div class="cp-panel-title" style="font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:12px; border:none; padding:0;">ANOTAÇÕES DO MENTOR SOBRE O DEVER DE CASA</div>
 <div style="font-size:14px; color:#334155; line-height:1.6; white-space:pre-wrap;">${cp_esc(mentorNotesText || 'Nenhuma observação registrada pelo mentor para esta entrega do dever de casa.')}
 </div>
 </div>
 `;

 document.querySelectorAll('.cp-timeline-item').forEach((el, i) => {
 const card = el.querySelector('.cp-timeline-card');
 const dot = el.querySelector('.cp-timeline-date');
 if (i === idx) {
 el.style.opacity = '1';
 if (card) { card.style.borderColor = '#10b981'; card.style.background = '#f8fafc'; }
 if (dot) dot.style.color = '#047857';
 } else {
 el.style.opacity = '0.6';
 if (card) { card.style.borderColor = '#e2e8f0'; card.style.background = '#ffffff'; }
 if (dot) dot.style.color = '#64748b';
 }
 });
 return;
 }

 // ── 2. RENDERIZAÇÃO DEDICADA PARA ANÁLISE DO MENTOR (OBSERVAÇÃO MANUAL / ONBOARDING) ──
 const isMentorAnalysisTab = currentSessType === 'observacao_manual' || currentSessType === 'onboarding' || currentSessType === 'geral' || currentSessType === 'telemetria';

 if (isMentorAnalysisTab) {
 const { metricsHtml, domsHtml, tagsHtml, menteeRespHtml, d } = cp_partesAnaliseMentor(sess, menteeId, currentSessType);

 document.getElementById('cp-session-detail-content').innerHTML = `
 <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #e2e8f0;"><div style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:6px;">${cp_esc(info.title)} · ${sess.createdAt ? new Date(sess.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : cp_esc(sess.date || '--')}</div>
 <div style="font-size:13px; color:#64748b;">${contextStr}${humorStr}</div>
 </div>
 
 ${metricsHtml}
 ${domsHtml}
 ${tagsHtml}
 ${menteeRespHtml}
 ${d.caderno ? `<div style="margin-bottom:1rem; padding:12px 14px; background:#FFFDF5; border:1px solid #F1E7C8; border-radius:10px;"><strong style="font-size:11px; font-weight:700; color:#B8873A; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">BLOCO DE NOTAS DA SESSÃO</strong><div style="font-size:14px; color:#334155; line-height:1.6; white-space:pre-wrap;">${cp_esc(d.caderno)}</div></div>` : ''}
 `;
 
 const mentorNotesText = sess.mentorNotes || d.anotacoes || 'Nenhum registro de anotação do mentor para esta sessão.';

 document.getElementById('cp-mentor-analysis-wrapper').innerHTML = `
 <div class="cp-panel" style="margin-bottom:0;"><div class="cp-panel-title" style="font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:12px; border:none; padding:0;">ANOTAÇÕES DO MENTOR</div>
 <div style="font-size:14px; color:${sess.mentorNotes || d.anotacoes ? '#334155' : '#64748b'}; font-style:${sess.mentorNotes || d.anotacoes ? 'normal' : 'italic'}; line-height:1.6; white-space:pre-wrap;">${cp_esc(mentorNotesText)}
 </div>
 </div>
 `;
 
 document.querySelectorAll('.cp-timeline-item').forEach((el, i) => {
 const card = el.querySelector('.cp-timeline-card');
 const dot = el.querySelector('.cp-timeline-date');
 if (i === idx) {
 el.style.opacity = '1';
 if (card) {
 card.style.borderColor = info.color || '#6366f1';
 card.style.background = '#f8fafc';
 }
 if (dot) dot.style.color = '#5b2da3';
 } else {
 el.style.opacity = '0.6';
 if (card) {
 card.style.borderColor = '#e2e8f0';
 card.style.background = '#ffffff';
 }
 if (dot) dot.style.color = '#64748b';
 }
 });
 return;
 }

 // ── 3. TELEMETRIAS E FERRAMENTAS ──
 // A análise do Agente Mentóra de cada telemetria fica salva à parte (tipo 'analise_telemetria',
 // ligada pelo sessao_id). Antes a linha do tempo não lia essa análise e mostrava um texto genérico.
 const aiHtml = cp_histAgenteHtml(sess, info);
 const pdiMentorHist = cp_histPdiMentorHtml(sess);
 const mentorAnalysis = sess.mentorNotes || (pdiMentorHist ? '' : 'Nenhum registro de observação do mentor para esta sessão.');

 document.getElementById('cp-session-detail-content').innerHTML = `
 <div style="margin-bottom:1.5rem; padding-bottom:1.5rem; border-bottom:1px solid #e2e8f0;"><div style="font-size:18px; font-weight:600; color:#0f172a; margin-bottom:6px;">${cp_esc(info.title)} · ${sess.createdAt ? new Date(sess.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : cp_esc(sess.date || '--')}</div>
 <div style="font-size:13px; color:#64748b;">${contextStr}${humorStr}</div>
 </div>
 
 <div><div style="font-size:11px; font-weight:700; color:#5b2da3; letter-spacing:1px; text-transform:uppercase; margin-bottom:12px; display:flex; align-items:center; gap:6px;">ANÁLISE DO AGENTE MENTÓRA DESTA SESSÃO
 </div>
 <div>${aiHtml}</div>
 </div>
 `;
 
 document.getElementById('cp-mentor-analysis-wrapper').innerHTML = `
 <div class="cp-panel" style="margin-bottom:0;"><div class="cp-panel-title" style="font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:12px; border:none; padding:0;">ANÁLISE DO MENTOR</div>
 ${mentorAnalysis ? `<div style="font-size:14px; color:${sess.mentorNotes ? '#334155' : '#64748b'}; font-style:${sess.mentorNotes ? 'normal' : 'italic'}; line-height:1.6; white-space:pre-wrap;">${cp_esc(mentorAnalysis)}</div>` : ''}
 ${pdiMentorHist}
 </div>
 `;
 
 document.querySelectorAll('.cp-timeline-item').forEach((el, i) => {
 const card = el.querySelector('.cp-timeline-card');
 const dot = el.querySelector('.cp-timeline-date');
 if (i === idx) {
 el.style.opacity = '1';
 if (card) {
 card.style.borderColor = info.color || '#6366f1';
 card.style.background = '#f8fafc';
 }
 if (dot) dot.style.color = '#5b2da3';
 } else {
 el.style.opacity = '0.6';
 if (card) {
 card.style.borderColor = '#e2e8f0';
 card.style.background = '#ffffff';
 }
 if (dot) dot.style.color = '#64748b';
 }
 });
 };
 window.cp_showSessionDetail(0);
 }
}

function cp_setStatCard(valId, subId, barId, val, sub, pct) {
 const el = document.getElementById(valId);
 if (el) el.classList.toggle('cp-sc-texto', String(val == null ? '' : val).replace(/<[^>]*>/g, '').trim().length > 8);
 const subEl = document.getElementById(subId);
 const barEl = document.getElementById(barId);
 if (el) el.innerHTML = val;
 if (subEl) subEl.innerHTML = sub;
 if (barEl) barEl.style.width = Math.min(pct, 100) + '%';
}


// ══════════════════════════════════════════════════════════════════════
// SESSÃO POR DIA: tudo o que o mentor faz no mesmo dia vira UMA sessão
// ══════════════════════════════════════════════════════════════════════
function cp_chaveDia(t) { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function cp_rotuloDia(chave) { const [a, m, d] = chave.split('-'); return `${d}/${m}/${a}`; }
function cp_extrasDoDia(menteeId) {
 // atividades que não são "registro de sessão", mas pertencem ao dia: bloco de notas e tarefas do dever de casa
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && ['caderno', 'dever_de_casa_config', 'pdi_mentor'].includes((s.tipo || '').toLowerCase()))
  .map(s => ({ extra: s, nome: s.tipo === 'caderno' ? 'Bloco de notas' : s.tipo === 'pdi_mentor' ? 'PDI do mentor' : 'Dever de casa (tarefas)', t: new Date(s.created_at || Date.now()).getTime() }));
}
function cp_agruparPorDia(sessions, menteeId) {
 const itens = (sessions || []).map((sess, idx) => {
  let nome = 'Registro';
  try { nome = cp_getTelemetryInfo(sess).title || nome; } catch (e) {}
  return { idx, nome, t: sess.createdAt || 0 };
 }).concat(menteeId ? cp_extrasDoDia(menteeId) : []);
 const mapa = {};
 itens.forEach(it => { const k = cp_chaveDia(it.t); (mapa[k] = mapa[k] || []).push(it); });
 const chaves = Object.keys(mapa).sort();                          // mais antigo → mais novo (para numerar)
 const dias = chaves.map((k, i) => ({ chave: k, rotulo: cp_rotuloDia(k), numero: i + 1, itens: mapa[k].sort((a, b) => a.t - b.t) }));
 return dias.reverse();                                           // mais recente primeiro
}
function cp_contarDiasSessao(menteeId) {
 const regs = cp_filterTimelineSessions(cp_all_sessions, menteeId).map(s => cp_parseGenericSession(s)).filter(Boolean).map(s => s.createdAt);
 const extras = cp_extrasDoDia(menteeId).map(x => x.t);
 return new Set(regs.concat(extras).filter(Boolean).map(cp_chaveDia)).size;
}

window.cp_abrirDia = function (k, i) {
 const dias = window.cp_diasTimeline || [];
 const dia = dias[k];
 const card = document.getElementById('cp-session-detail-card');
 if (!dia || !card) return;
 let bar = document.getElementById('cp-dia-atividades');
 if (!bar) {
  bar = document.createElement('div');
  bar.id = 'cp-dia-atividades';
  const conteudo = document.getElementById('cp-session-detail-content');
  card.insertBefore(bar, conteudo);
 }
 i = Number(i) || 0;
 bar.innerHTML = `<div class="cpd-cab">Sessão ${dia.numero} · ${cp_esc(dia.rotulo)} — ${dia.itens.length} ${dia.itens.length === 1 ? 'atividade' : 'atividades'} neste dia</div>
  <div class="cpd-chips">${dia.itens.map((it, j) => `<button type="button" class="cpd-chip ${j === i ? 'ativo' : ''}" onclick="cp_abrirDia(${k}, ${j})">${cp_esc(it.nome)}<small>${new Date(it.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></button>`).join('')}</div>`;
 const it = dia.itens[i];
 if (it && it.idx != null && typeof window.cp_showSessionDetail === 'function') {
  window.cp_showSessionDetail(it.idx);
 } else if (it && it.extra) {
  cp_detalheExtra(it.extra);
 }
 // destaque do dia escolhido na linha do tempo
 document.querySelectorAll('.cp-timeline-item.cp-dia').forEach(el => {
  const on = Number(el.getAttribute('data-dia')) === k;
  el.style.opacity = on ? '1' : '0.6';
  const c = el.querySelector('.cp-timeline-card'); const d = el.querySelector('.cp-timeline-date');
  if (c) { c.style.borderColor = on ? '#5B2DA3' : '#e2e8f0'; c.style.background = on ? '#F8F6FE' : '#ffffff'; }
  if (d) d.style.color = on ? '#5B2DA3' : '';
 });
};

function cp_detalheExtra(row) {
 const alvo = document.getElementById('cp-session-detail-content');
 const analise = document.getElementById('cp-mentor-analysis-wrapper');
 if (analise) analise.innerHTML = '';
 if (!alvo) return;
 const d = cp_parseDados(row.dados) || {};
 const quando = new Date(row.created_at || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
 if (row.tipo === 'caderno') {
  alvo.innerHTML = `<div class="cpc-salva"><div class="cpc-salva-top"><span>Bloco de notas · ${cp_esc(quando)}</span>
   <span><button type="button" class="cpc-lnk" onclick="cp_cadernoBaixarRegistro('${cp_esc(row.id)}')">Baixar</button>
   <button type="button" class="cpc-lnk perigo" onclick="cp_cadernoExcluir('${cp_esc(row.id)}')">Excluir</button></span></div>
   <div class="cpc-folha cpc-folha-leitura">${cp_esc(d.texto || '')}</div></div>`;
 } else if (row.tipo === 'pdi_mentor') {
  const acoes = Array.isArray(d.acoes) ? d.acoes : [];
  alvo.innerHTML = `<div class="cpc-salva"><div class="cpc-salva-top"><span>PDI do mentor${d.titulo ? ' · ' + cp_esc(d.titulo) : ''} · ${cp_esc(quando)}</span></div>
   ${acoes.length ? `<ol class="cpd-tarefas">${acoes.map(a => `<li>${cp_esc(a.acao)}${a.como ? ` — ${cp_esc(a.como)}` : ''}${a.prazo ? ` (prazo: ${cp_esc(a.prazo)})` : ''}</li>`).join('')}</ol>` : '<p style="font-size:13px; color:#94A3B8; padding:8px 0;">O PDI do mentor foi esvaziado nesta atualização.</p>'}</div>`;
 } else {
  const tarefas = (Array.isArray(d.tasks) ? d.tasks : []).map(t => typeof t === 'string' ? t : (t && (t.text || t.titulo || t.taskText)) || '').filter(Boolean);
  alvo.innerHTML = `<div class="cpc-salva"><div class="cpc-salva-top"><span>Dever de casa · tarefas definidas · ${cp_esc(quando)}</span></div>
   ${tarefas.length ? `<ol class="cpd-tarefas">${tarefas.map(t => `<li>${cp_esc(t)}</li>`).join('')}</ol>` : '<p style="font-size:13px; color:#94A3B8; padding:8px 0;">A lista de tarefas foi esvaziada nesta atualização.</p>'}</div>`;
 }
}

// ══════════════════════════════════════════════════════════════════════
// BLOCO DE NOTAS (folha de caderno) — Análise do Mentor
// ══════════════════════════════════════════════════════════════════════
function cp_cadernoAjustarAltura(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 14 * 36) + 'px'; }
function cp_cadernoRegistros(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo === 'caderno')
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
window.cp_renderCaderno = function (menteeId) {
 const wrap = document.getElementById('cp-caderno-wrap');
 if (!wrap || !menteeId) return;
 const hoje = new Date();
 const dataHoje = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
 const regs = cp_cadernoRegistros(menteeId);
 const rascunho = (() => { try { return sessionStorage.getItem('cp_caderno_rascunho_' + menteeId) || ''; } catch (e) { return ''; } })();
 wrap.innerHTML = `<div class="cp-panel cpc-painel">
  <div class="cpc-topo"><div><div class="cp-panel-title" style="margin:0;">Bloco de notas da sessão</div>
   <div class="cpc-sub">${cp_esc(dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1))} · escreva abaixo; tudo entra no histórico junto com o registro da sessão, ao clicar em Salvar Registro do Mentor</div></div>
   <div class="cpc-botoes"><span class="cpc-selo" id="cpc-selo" title="O que você escreve fica guardado neste navegador até você salvar">Rascunho automático</span><button type="button" class="cpc-btn" onclick="cp_cadernoBaixarAtual()">Baixar</button>
   <button type="button" class="cpc-btn" onclick="cp_cadernoLimpar()">Limpar folha</button></div></div>
  <div class="cpc-caderno"><textarea id="cpc-texto" class="cpc-folha" spellcheck="true" placeholder="Digite aqui as anotações da sessão..." oninput="cp_cadernoAjustarAltura(this); cp_cadernoRascunho(this.value)">${cp_esc(rascunho)}</textarea></div>
  ${typeof cp_engajPercepcaoHtml === 'function' ? cp_engajPercepcaoHtml() : ''}
 </div>`;
 cp_cadernoAjustarAltura(document.getElementById('cpc-texto'));
 // se a ficha ficar aberta e virar o dia, a data do cabeçalho troca sozinha à meia-noite
 clearTimeout(window.__cpcVirada);
 const meiaNoite = new Date(); meiaNoite.setHours(24, 0, 5, 0);
 window.__cpcVirada = setTimeout(() => {
  const sub = document.querySelector('#cp-caderno-wrap .cpc-sub'); if (!sub) return;
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  sub.textContent = d.charAt(0).toUpperCase() + d.slice(1) + ' · escreva abaixo; tudo entra no histórico junto com o registro da sessão, ao clicar em Salvar Registro do Mentor';
 }, meiaNoite - new Date());
};
window.cp_cadernoRascunho = function (txt) {
 try { if (cp_currentMentee) sessionStorage.setItem('cp_caderno_rascunho_' + cp_currentMentee.id, txt); } catch (e) {}
 const selo = document.getElementById('cpc-selo'); if (selo) { selo.classList.add('pulso'); clearTimeout(selo._t); selo._t = setTimeout(() => selo.classList.remove('pulso'), 600); }
};
window.cp_cadernoLimpar = function () {
 const el = document.getElementById('cpc-texto'); if (!el || !el.value.trim()) return;
 if (!confirm('Limpar a folha? O que ainda não foi salvo será perdido.')) return;
 el.value = ''; cp_cadernoRascunho(''); cp_cadernoAjustarAltura(el);
};
function cp_cadernoBaixar(texto, quando) {
 const nome = cp_currentMentee ? (cp_currentMentee.nome || 'mentorado') : 'mentorado';
 const conteudo = `Mentóra — Anotações da sessão\nMentorado(a): ${nome}\nData: ${quando}\n${'─'.repeat(40)}\n\n${texto}\n`;
 const blob = new Blob(['\ufeff' + conteudo], { type: 'text/plain;charset=utf-8' });
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = `anotacoes-${nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${quando.slice(0, 10).split('/').reverse().join('-')}.txt`;
 document.body.appendChild(a); a.click(); a.remove();
 setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
window.cp_cadernoBaixarAtual = function () {
 const el = document.getElementById('cpc-texto'); if (!el || !el.value.trim()) { alert('A folha está vazia.'); return; }
 cp_cadernoBaixar(el.value, new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
};
window.cp_cadernoBaixarRegistro = function (id) {
 const r = (cp_all_sessions || []).find(s => String(s.id) === String(id)); if (!r) return;
 const d = cp_parseDados(r.dados) || {};
 cp_cadernoBaixar(d.texto || '', new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
};
function cp_recarregarFichaMantendoAba(abaForcada, alvoId) {
 if (typeof cp_teleEstado !== 'undefined' && cp_teleEstado.aba === 'resultado' && cp_teleAreaVisivel()) {
  cp_teleRenderResultado(cp_teleEstado.rowId);
  if (alvoId) setTimeout(() => { const alvo = document.getElementById(alvoId); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
  return;
 }
 const aba = abaForcada || ['telemetria', 'visao', 'historico'].find(t => { const b = document.getElementById('cp-tab-' + t); return b && b.classList.contains('active'); }) || 'telemetria';
 if (cp_currentMentee && typeof window.cp_openProfile === 'function') window.cp_openProfile(cp_currentMentee.id);
 if (aba !== 'telemetria' && typeof cp_switchTab === 'function') cp_switchTab(aba);
 // volta a tela para o ponto onde o mentor estava (ex.: a análise que acabou de ser gerada)
 if (alvoId) setTimeout(() => { const alvo = document.getElementById(alvoId); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
}
window.cp_cadernoSalvar = async function () {
 const el = document.getElementById('cpc-texto'); const btn = document.getElementById('cpc-salvar');
 const texto = el ? el.value.trim() : '';
 if (!texto) { alert('Escreva alguma anotação antes de salvar.'); return; }
 if (!window.supabaseClient || !cp_currentMentee) return;
 btn.disabled = true; btn.textContent = 'Salvando...';
 const { data, error } = await window.supabaseClient.from('Sessoes_Mentoria')
  .insert([{ mentorado_id: cp_currentMentee.id, tipo: 'caderno', dados: { texto, salvoEm: new Date().toISOString() } }]).select();
 btn.disabled = false; btn.textContent = 'Salvar anotação';
 if (error || !data || !data.length) { alert('Não foi possível salvar a anotação. Tente novamente.' + (error ? '\n\nDetalhe: ' + error.message : '')); return; }
 cp_all_sessions.unshift(data[0]);
 try { sessionStorage.removeItem('cp_caderno_rascunho_' + cp_currentMentee.id); } catch (e) {}
 cp_recarregarFichaMantendoAba();
};
window.cp_cadernoExcluir = async function (id) {
 if (!confirm('Excluir esta anotação? Essa ação não pode ser desfeita.')) return;
 const { data, error } = await window.supabaseClient.from('Sessoes_Mentoria').delete().eq('id', id).eq('tipo', 'caderno').select('id');
 if (error || !data || !data.length) { alert('Não foi possível excluir a anotação.' + (error ? '\n\nDetalhe: ' + error.message : '\n\nConfira se o caderno_anotacoes.sql foi aplicado no Supabase.')); return; }
 cp_all_sessions = cp_all_sessions.filter(s => String(s.id) !== String(id));
 cp_recarregarFichaMantendoAba();
};

(function cp_estilosCaderno() {
 if (document.getElementById('cpc-estilos')) return;
 const st = document.createElement('style');
 st.id = 'cpc-estilos';
 st.textContent = `
 .cpc-painel { margin-bottom:1.5rem; }
 .cpc-topo { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
 .cpc-sub { font-size:12px; color:#94A3B8; margin-top:4px; }
 .cpc-botoes { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
 .cpc-btn { background:#fff; color:#5B2DA3; border:1.5px solid #DDD6FE; border-radius:100px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
 .cpc-btn:hover { background:#F8F6FE; }
 .cpc-btn.prim { background:#5B2DA3; color:#fff; border-color:#5B2DA3; }
 .cpc-btn.prim:hover { background:#4A2386; }
 .cpc-btn:disabled { opacity:.6; cursor:wait; }
 .cpc-caderno { border-top:1px solid #CBD5E1; }
 .cpc-folha { display:block; width:100%; box-sizing:border-box; border:none; outline:none; resize:none; overflow:hidden;
   font-family:'Inter', sans-serif; font-size:15px; line-height:36px; color:#1B2559;
   padding:0 10px; min-height:${14 * 36}px;
   background-color:#FFFFFF;
   background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 35px, #CBD5E1 35px, #CBD5E1 36px);
   background-size: 100% 36px; background-attachment: local; }
 .cpc-folha::placeholder { color:#94A3B8; font-style:italic; font-family:'Courier New', monospace; }
 .cpc-folha:focus { background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 35px, #B9A8E8 35px, #B9A8E8 36px); }
 .cpc-folha-leitura { min-height:0; white-space:pre-wrap; word-break:break-word; }
 .cpc-selo { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#5B2DA3; background:#F5F3FF; border:1px solid #DDD6FE; border-radius:100px; padding:4px 10px; transition:background .3s; }
 .cpc-selo.pulso { background:#EDE7FB; }
 .cpc-lista-tit { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#64748B; margin:22px 0 10px; }
 .cpc-lista { display:flex; flex-direction:column; gap:14px; }
 .cpc-salva { border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; background:#fff; }
 .cpc-salva-top { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 14px; background:#F8F6FE; border-bottom:1px solid #E4DDF7; font-size:12px; font-weight:600; color:#5B2DA3; }
 .cpc-lnk { background:none; border:none; color:#5B2DA3; font-weight:600; font-size:12px; cursor:pointer; padding:0 0 0 12px; font-family:inherit; }
 .cpc-lnk:hover { text-decoration:underline; }
 .cpc-lnk.perigo { color:#DC2626; }
 #cp-dia-atividades { margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #F1F5F9; }
 .cpd-cab { font-size:12px; font-weight:600; color:#64748B; margin-bottom:8px; }
 .cpd-chips { display:flex; flex-wrap:wrap; gap:6px; }
 .cpd-chip { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1.5px solid #E4DDF7; color:#1B2559; border-radius:100px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; }
 .cpd-chip small { color:#94A3B8; font-weight:500; }
 .cpd-chip.ativo { background:#5B2DA3; border-color:#5B2DA3; color:#fff; }
 .cpd-chip.ativo small { color:#E4DDF7; }
 .cpd-tarefas { margin:10px 0 12px 22px; font-size:14px; color:#334155; line-height:1.7; padding:0 14px 0 0; }
 `;
 document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════════════
// GRÁFICOS DE EVOLUÇÃO (Visão Geral) — maturidade ao longo das sessões
// ══════════════════════════════════════════════════════════════════════
function cp_renderTelemetriaCharts() {
 try { cp_vgRender(); } catch (e) { console.warn('Visão Geral:', e); }
 try { cp_renderTodasAvaliacoes(); } catch (e) { console.warn('Todas as avaliações:', e); }
 const nota = document.getElementById('cpv-chart-nota'), cvReg = document.getElementById('cp-chart-reg');
 const mostrarNota = (t) => { if (nota) { nota.textContent = t; nota.style.display = t ? 'flex' : 'none'; } if (cvReg) cvReg.style.visibility = t ? 'hidden' : 'visible'; };
 mostrarNota('');
 if (!cp_currentMentee || typeof Chart === 'undefined') return;
 const id = cp_currentMentee.id;
 const pontos = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(id))
  .map(s => ({ row: s, d: cp_parseDados(s.dados) || {} }))
  .filter(x => x.d.telemetria && Array.isArray(x.d.telemetria.dominios) && x.d.telemetria.dominios.length)
  .sort((a, b) => new Date(a.row.created_at) - new Date(b.row.created_at))
  .map(x => { const rt = cp_resumoTelemetria((x.row.tipo || '').toLowerCase(), x.d); return rt && rt.maturidade ? { rowId: x.row.id, data: new Date(x.row.created_at), nome: rt.titulo, mat: rt.maturidade } : null; })
  .filter(Boolean);
 if (!pontos.length) return cp_renderTelemetriaChartsLegado();

 const ctxT = document.getElementById('cp-chart-trust');
 const ctxR = document.getElementById('cp-chart-reg');
 const titulo = (ctx, t) => { if (ctx && ctx.parentElement && ctx.parentElement.previousElementSibling) ctx.parentElement.previousElementSibling.textContent = t; };
 const rot = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
 const base = (legenda) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: legenda, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, color: '#64748B', font: { size: 11 } } },
   tooltip: { backgroundColor: '#1B2559', padding: 10, callbacks: { label: c => ` ${c.dataset.label}: ${Math.round(c.parsed.y)}%` } } },
  scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 11 } } },
   y: { min: 0, max: 100, grid: { color: '#EEF2F7', borderDash: [4, 4] }, ticks: { color: '#94A3B8', font: { size: 11 }, stepSize: 25, callback: v => v + '%' } } }
 });
 if (cp_trustChart) { cp_trustChart.destroy(); cp_trustChart = null; }
 if (cp_regChart) { cp_regChart.destroy(); cp_regChart = null; }

 // 1) Maturidade geral de cada telemetria aplicada
 titulo(ctxT, 'Evolução da maturidade geral');
 if (ctxT) cp_trustChart = new Chart(ctxT, { type: 'line',
  data: { labels: pontos.map(p => rot(p.data)), datasets: [{ label: 'Maturidade', data: pontos.map(p => p.mat.media), borderColor: '#5B2DA3', backgroundColor: 'rgba(91,45,163,0.10)', borderWidth: 2.5, tension: 0.35, fill: true, pointBackgroundColor: '#fff', pointBorderColor: '#5B2DA3', pointBorderWidth: 2, pointRadius: 5 }] },
  options: Object.assign(base(false), { plugins: Object.assign(base(false).plugins, { tooltip: { backgroundColor: '#1B2559', padding: 10, callbacks: { title: it => `${pontos[it[0].dataIndex].nome} · ${it[0].label}`, label: c => ` Maturidade: ${Math.round(c.parsed.y)}% (${pontos[c.dataIndex].mat.geral.nome})` } } }) }) });

 // 2) Maturidade de cada domínio, nas aplicações da telemetria EM FOCO (ou da mais recente)
 let focoInfo = null; try { focoInfo = cp_vgFocoAtual(); } catch (e) {}
 const foco = focoInfo && focoInfo.foco;
 if (foco && !foco.ehTelemetria) { titulo(ctxR, 'Maturidade por domínio'); mostrarNota('A evolução por domínio aparece quando uma telemetria está em foco. Escolha uma telemetria no topo da Visão Geral.'); return; }
 const ult = (foco && pontos.filter(p => String(p.rowId) === String(foco.row.id)).pop()) || pontos[pontos.length - 1];
 const mesmas = pontos.filter(p => p.nome === ult.nome && p.data <= ult.data);
 const cores = ['#5B2DA3', '#1B2559', '#8B5CF6', '#6366F1', '#C4B5FD', '#4C1D95', '#A78BFA', '#312E81'];
 titulo(ctxR, `Maturidade por domínio — ${ult.nome}`);
 if (mesmas.length < 2) { mostrarNota(`A evolução de cada domínio aparece a partir da 2ª aplicação desta telemetria. A aplicação de ${ult.data.toLocaleDateString('pt-BR')} é a linha de base.`); return; }
 if (ctxR) cp_regChart = new Chart(ctxR, { type: 'line',
  data: { labels: mesmas.map(p => rot(p.data)), datasets: ult.mat.itens.map((it, i) => ({ label: it.nome.replace(/\s*&\s*/g, ' e '),
   data: mesmas.map(p => { const f = p.mat.itens.find(x => x.nome === it.nome); return f ? f.maturidade : null; }),
   borderColor: cores[i % cores.length], backgroundColor: cores[i % cores.length], borderWidth: 2, tension: 0.35, pointRadius: 4, spanGaps: true })) },
  options: base(true) });
}

// ── TELEMETRIA CHARTS ──
function cp_renderTelemetriaChartsLegado() {
 if (!cp_currentMentee) return;
 const id = cp_currentMentee.id;
 
 const relevantSessions = cp_all_sessions
 .filter(s => s.mentorado_id === id && (s.tipo === 'trauma' || s.tipo === 'lideranca' || s.tipo === 'observacao_manual'))
 .map(s => s.dados);
 
 let isLider = cp_currentMentee.metodo === 'Liderança';
 const rawLM = cp_all_sessions.filter(s => s.mentorado_id === id && s.tipo === 'lideranca').map(s => s.dados);
 if (rawLM.length> 0 && relevantSessions.length === rawLM.length) isLider = true;
 
 let sessions = [];
 if (isLider) {
 sessions = cp_parseHistoryLM(relevantSessions).reverse();
 } else {
 sessions = cp_parseHistory(relevantSessions).reverse();
 }

 if (sessions.length < 1) return;

 const labels = sessions.map(s => `S${s.num||(sessions.indexOf(s)+1)}`);
 
 const data1 = isLider ? sessions.map(s => s.scores.estrategia||0) : sessions.map(s => s.scores.trustIdx||0);
 const data2 = isLider ? sessions.map(s => s.scores.ie||0) : sessions.map(s => s.scores.regScore||0);

 // If there is only 1 session, duplicate it to "Hoje" so a line is drawn
 if (sessions.length === 1) {
 labels.push('Hoje');
 data1.push(data1[0]);
 data2.push(data2[0]);
 }

 const title1 = isLider ? 'Evolução da Liderança Estratégica' : 'Evolução do Índice de Confiança';
 const title2 = isLider ? 'Inteligência Emocional ao Longo do Tempo' : 'Regulação Emocional ao Longo do Tempo';

 const ctxT = document.getElementById('cp-chart-trust');
 if (ctxT && ctxT.parentElement && ctxT.parentElement.previousElementSibling) {
 ctxT.parentElement.previousElementSibling.textContent = title1;
 }
 const ctxR = document.getElementById('cp-chart-reg');
 if (ctxR && ctxR.parentElement && ctxR.parentElement.previousElementSibling) {
 ctxR.parentElement.previousElementSibling.textContent = title2;
 }

 const chartOpts = (label, color) => ({
 responsive: true,
 maintainAspectRatio: false,
 plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${label}: ${ctx.parsed.y}` } } },
 scales: {
 x: { grid: { color: 'rgba(226,232,240,0.5)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
 y: { min: 0, max: 100, grid: { color: 'rgba(226,232,240,0.5)' }, ticks: { color: '#94a3b8', font: { size: 11 } } }
 }
 });

 if (cp_trustChart) { cp_trustChart.destroy(); cp_trustChart = null; }
 if (cp_regChart) { cp_regChart.destroy(); cp_regChart = null; }

 if (ctxT) {
 cp_trustChart = new Chart(ctxT, {
 type: 'line',
 data: { labels, datasets: [{ data: data1, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#6366f1', pointRadius: 4 }] },
 options: chartOpts(isLider ? 'Estratégia' : 'Confiança', '#6366f1')
 });
 }

 if (ctxR) {
 cp_regChart = new Chart(ctxR, {
 type: 'line',
 data: { labels, datasets: [{ data: data2, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#10b981', pointRadius: 4 }] },
 options: chartOpts(isLider ? 'IE' : 'Regulação', '#10b981')
 });
 }
}

// ── INSIGHTS GENERATOR ──
function cp_generateInsights(s, ind) {
 const insights = [];

 // Núcleo traumático crítico
 const traumaKeys = [
 { k: 'intrusao', name: 'Pensamentos intrusivos' },
 { k: 'abandono', name: 'Abandono / Rejeição' },
 { k: 'dissociacao', name: 'Dissociação' },
 { k: 'vergonha', name: 'Vergonha / Humilhação' },
 { k: 'abuso', name: 'Marcas de abuso' },
 { k: 'evitacao', name: 'Evitação de memórias' }
 ];
 const topTrauma = traumaKeys
 .map(t => ({ name: t.name, val: ind[t.k] || 50 }))
 .sort((a, b) => b.val - a.val)[0];

 if (topTrauma && topTrauma.val>= 55) {
 insights.push({
 c: 'rose',
 t: 'Núcleo Traumático Crítico',
 tx: `${topTrauma.name} com intensidade ${topTrauma.val}% — padrão primário que organiza as reações emocionais.`
 });
 }

 if (s.regScore < 50) {
 insights.push({
 c: 'amber',
 t: 'Atenção — Regulação Emocional',
 tx: `Regulação em ${s.regScore}% indica janela de tolerância reduzida. Priorizar técnicas de estabilização.`
 });
 } else {
 insights.push({
 c: 'teal',
 t: 'Recurso — Regulação Emocional',
 tx: `Regulação em ${s.regScore}% disponível como recurso para aprofundamento terapêutico.`
 });
 }

 if (s.trustIdx>= 55) {
 insights.push({
 c: 'indigo',
 t: 'Aliança Terapêutica',
 tx: `Índice de confiança em ${s.trustIdx}/100 indica boa aliança. Momento favorável para intervenções mais profundas.`
 });
 }

 return insights.slice(0, 3);
}


// ══════════════════════════════════════════════════════════════════
// PONTE COM AS TELEMETRIAS (iframe): lista de mentoradas + gravação
// ══════════════════════════════════════════════════════════════════
(function () {
 const TIPOS_TELEMETRIA = ['trauma', 'burnout', 'comunicacao', 'ie', 'produtividade', 'transicao', 'vendas', 'lideranca'];
 window.addEventListener('message', async (ev) => {
 const iframe = document.getElementById('telemetria-iframe');
 if (!iframe || ev.source !== iframe.contentWindow) return; // só aceita a telemetria aberta pela plataforma
 const msg = ev.data || {};
 const responder = (extra) => ev.source.postMessage(Object.assign({ requestId: msg.requestId }, extra), '*');

 if (msg.tipo === 'mentora:pedir-mentorados') {
 const lista = (typeof cp_mentees !== 'undefined' && Array.isArray(cp_mentees)) ? cp_mentees.map(m => ({ id: m.id, nome: m.nome })) : [];
 responder({ ok: true, lista: lista, atual: (typeof cp_currentMentee !== 'undefined' && cp_currentMentee) ? cp_currentMentee.id : '' });
 return;
 }

 if (msg.tipo === 'mentora:salvar-telemetria') {
 const reg = msg.registro || {};
 if (!TIPOS_TELEMETRIA.includes(reg.tipo)) return responder({ ok: false, erro: 'Tipo de telemetria desconhecido.' });
 if (!cp_mentees.some(m => String(m.id) === String(reg.mentorado_id))) return responder({ ok: false, erro: 'Mentorado não encontrado na sua lista.' });
 // Telemetria de Traumas: dado pessoal sensível (LGPD) — só grava com o consentimento registrado
 if (reg.tipo === 'trauma' && !(reg.dados && reg.dados.consentimento && reg.dados.consentimento.confirmado === true)) return responder({ ok: false, erro: 'Confirme o consentimento do mentorado (LGPD) antes de salvar esta telemetria.' });
 if (reg.tipo === 'trauma') reg.dados.consentimento.habilitacao_mentor = cp_nivelHab; // quem conduziu: padrao, psicanalitica ou clinica
 if (!window.supabaseClient) return responder({ ok: false, erro: 'Banco de dados não conectado.' });
 const { data, error } = await window.supabaseClient
 .from('Sessoes_Mentoria')
 .insert([{ mentorado_id: reg.mentorado_id, tipo: reg.tipo, dados: reg.dados }])
 .select();
 if (error) return responder({ ok: false, erro: String(error.message || error).replace(/^.*(LIMITE_PLANO|CONSENTIMENTO_LGPD):\s*/, '') });
 if (Array.isArray(data)) data.forEach(row => cp_all_sessions.unshift(row));
 responder({ ok: true, id: Array.isArray(data) && data[0] ? data[0].id : null });
 }

 // Depois de salvar, a telemetria abre a aba "Resultado e análise" (e gera a análise do Agente)
 if (msg.tipo === 'mentora:abrir-resultado') {
  cp_teleEstado.rowId = msg.rowId || null;
  if (msg.mentorado_id) cp_teleEstado.menteeId = msg.mentorado_id;
  cp_teleMostrar('resultado');
  if (msg.gerar && msg.rowId && typeof window.cp_gerarAnaliseTelemetria === 'function') setTimeout(() => window.cp_gerarAnaliseTelemetria(msg.rowId), 60);
  return;
 }

 // "Voltar" sem mentorado escolhido: fecha a telemetria e volta à Gestão de Mentorados
 if (msg.tipo === 'mentora:voltar-gestao') {
  const area = document.getElementById('area-telemetria-iframe'); if (area) area.style.display = 'none';
  if (typeof irParaGestaoMentorados === 'function') irParaGestaoMentorados();
  return;
 }

 // Depois de salvar, a telemetria pede para abrir a Visão Geral do mentorado (onde se gera a análise e o PDI)
 if (msg.tipo === 'mentora:ir-visao-geral') {
  const id = String(msg.mentorado_id || '');
  if (!cp_mentees.some(m => String(m.id) === id)) return;
  const area = document.getElementById('area-telemetria-iframe'); if (area) area.style.display = 'none';
  if (typeof irParaGestaoMentorados === 'function') irParaGestaoMentorados();
  await cp_init();
  cp_openProfile(id);
  cp_switchTab('visao');
  setTimeout(() => { const alvo = document.getElementById('cp-todas-avaliacoes'); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
 }
 });
})();

// ══════════════════════════════════════════════════════════════════════
// INSIGHTS PARA O MENTOR (Visão Geral): leitura de todo o histórico da mentorada
// ══════════════════════════════════════════════════════════════════════
// estilos novos: card do mentorado e barrinhas dos pontos de atenção
(function () {
 if (document.getElementById('cp-estilos-v2')) return;
 const st = document.createElement('style'); st.id = 'cp-estilos-v2';
 st.textContent = `
 .cp-card-stat { background:rgba(255,255,255,0.1); border-radius:8px; padding:10px 6px; text-align:center; display:flex; flex-direction:column; justify-content:center; gap:4px; min-height:62px; }
 .cp-card-stat .v { font-size:13px; font-weight:700; color:#fff; text-transform:uppercase; letter-spacing:.3px; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; }
 .cp-card-stat .l { font-size:10px; color:rgba(255,255,255,0.7); text-transform:uppercase; letter-spacing:.3px; }
 .cp-ind-barra { display:block !important; }
 .cp-ind-topo { display:flex; justify-content:space-between; align-items:center; gap:10px; }
 .cp-ind-trilho { height:6px; background:#F1F5F9; border-radius:100px; overflow:hidden; margin-top:8px; }
 .cp-ind-trilho > div { height:100%; border-radius:100px; transition:width .6s ease; }
 `;
 document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════════════
// VISÃO GERAL: resultados e respostas de TODAS as telemetrias e ferramentas
// (a aplicação mais recente de cada uma, com índices e respostas; análise e PDI ficam no topo)
// ══════════════════════════════════════════════════════════════════════
function cp_renderTodasAvaliacoes() {
 const alvo = document.getElementById('cp-todas-avaliacoes');
 if (!alvo || !cp_currentMentee) return;
 const f = cp_vgFocoAtual();
 const lista = f.lista;
 if (!lista.length) { alvo.innerHTML = '<div style="padding:12px; font-size:13px; color:#94A3B8; font-style:italic;">Quando você aplicar telemetrias ou ferramentas com este mentorado, os resultados e as respostas de cada uma aparecem aqui.</div>'; return; }
 const barra = (nome, v, cor, rot) => `<div class="cpa-bar"><div class="cpa-bar-top"><span>${cp_esc(nome)}</span><b>${cp_esc(rot || (Math.round(v) + '%'))}</b></div><div class="cpa-trilho"><div style="width:${Math.max(0, Math.min(100, v))}%; background:${cor || '#5B2DA3'};"></div></div></div>`;
 const ruido = (k, v) => /mentorad|^sess[aã]o$|^tipo$|^data$|^id$/i.test(k) || /^(n\/?a|não informado|nao informado|-|—)$/i.test(String(v).trim()) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(v));
 alvo.innerHTML = lista.map(g => {
  const { r, d, t, row } = g;
  const T = d.telemetria || null;
  const m0 = r.maturidade ? { val: r.maturidade.media + '%', lbl: 'Maturidade geral' } : (r.metricas || [])[0];
  const quando = new Date(t).toLocaleDateString('pt-BR');
  let respostas = '';
  if (T && Array.isArray(T.dominios)) {
   respostas = '<div class="cpa-resp-grid">' + T.dominios.map(dm => `<div class="cpa-dom"><div class="cpa-dom-t">${cp_esc(dm.titulo)}</div>${(dm.indicadores || []).map(i => `<div class="cpa-resp"><span>${cp_esc(i.nome)}</span><b>${Number(i.valor) || 0}</b></div>`).join('')}${dm.obs ? `<div class="cpa-obs">Observação: ${cp_esc(dm.obs)}</div>` : ''}</div>`).join('');
   const ex = Object.assign({}, T.contexto || {}, T.extras || {});
   const exOk = Object.keys(ex).filter(k => !ruido(k, ex[k]));
   if (exOk.length) respostas += `<div class="cpa-dom"><div class="cpa-dom-t">Destaques</div>${exOk.map(k => `<div class="cpa-resp"><span>${cp_esc(k)}</span><b>${cp_esc(ex[k])}</b></div>`).join('')}</div>`;
   respostas += '</div>';
  }
  const corMat = v => v >= 61 ? '#10b981' : v >= 41 ? '#f59e0b' : '#ef4444';
  const itensBarra = r.maturidade ? r.maturidade.itens.map(i => ({ name: i.nome, v: i.maturidade, label: Math.round(i.maturidade) + '%', color: corMat(i.maturidade) })) : ((r.barras && r.barras.itens) || []);
  return `<div class="cpa-linha">
   <div class="cpa-cab"><div><div class="cpa-tit">${cp_esc(r.titulo)}</div><div class="cpa-sub">Última aplicação em ${quando}${g.n > 1 ? ` · aplicada ${g.n} vezes` : ''}</div></div>
    ${m0 ? `<div class="cpa-destaque"><b>${cp_esc(String(m0.val).replace(/<[^>]*>/g, ''))}</b><span>${cp_esc(m0.lbl)}</span></div>` : ''}</div>
   <div class="cpa-barras">${itensBarra.map(it => barra(it.name, Number(it.v) || 0, it.color, it.label)).join('')}</div>
   ${respostas ? `<details class="cpa-det"><summary>Ver todas as respostas</summary>${respostas}</details>` : ''}
   ${cp_vgRodapeAvaliacao(g, f.foco)}
  </div>`;
 }).join('');
}
(function () {
 if (document.getElementById('cp-estilos-v3')) return;
 const st = document.createElement('style'); st.id = 'cp-estilos-v3';
 st.textContent = `
 .cpa-linha { border:1px solid #E2E8F0; border-radius:14px; padding:14px 18px; background:#fff; margin-bottom:12px; }
 .cpa-barras { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); column-gap:24px; }
 .cpa-resp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:10px; }
 .cpa-card { border:1px solid #E2E8F0; border-radius:14px; padding:14px 16px; background:#fff; }
 .cpa-cab { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px; }
 .cpa-tit { font-weight:700; color:#1B2559; font-size:15px; }
 .cpa-sub { font-size:12px; color:#94A3B8; margin-top:2px; }
 .cpa-destaque { text-align:right; flex-shrink:0; max-width:45%; }
 .cpa-destaque b { display:block; font-size:16px; color:#5B2DA3; line-height:1.2; }
 .cpa-destaque span { font-size:10px; color:#64748B; text-transform:uppercase; letter-spacing:.3px; }
 .cpa-bar { margin-bottom:8px; }
 .cpa-bar-top { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:#334155; }
 .cpa-bar-top b { color:#1B2559; white-space:nowrap; }
 .cpa-trilho { height:6px; background:#F1F5F9; border-radius:100px; overflow:hidden; margin-top:4px; }
 .cpa-trilho > div { height:100%; border-radius:100px; }
 .cpa-det { margin-top:8px; border-top:1px dashed #E2E8F0; padding-top:8px; }
 .cpa-det summary { cursor:pointer; font-size:13px; font-weight:600; color:#5B2DA3; }
 .cpa-dom { margin-top:10px; background:#F8FAFC; border:1px solid #EEF2F7; border-radius:10px; padding:10px 12px; }
 .cpa-dom-t { font-size:11px; font-weight:700; color:#4F46E5; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
 .cpa-resp { display:flex; justify-content:space-between; gap:10px; font-size:12.5px; color:#334155; padding:3px 0; border-bottom:1px solid #EEF2F7; }
 .cpa-resp:last-child { border-bottom:none; }
 .cpa-resp b { color:#1B2559; text-align:right; }
 .cpa-obs { font-size:12px; color:#92400E; margin-top:6px; }
 .cpa-texto { font-size:13px; color:#334155; line-height:1.55; white-space:pre-wrap; }
 `;
 document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════════════
// IA CENTRAL DA VISÃO GERAL — o "coração" da plataforma.
// Lê TUDO da mentorada antes de gerar o PDI e os insights: linha do tempo por dia,
// resultados e análises de cada telemetria e ferramenta (as outras IAs), registros
// do mentor (anotações, bloco de notas, tags, domínios), onboarding e dever de casa.
// ══════════════════════════════════════════════════════════════════════
function cp_ultimaAnaliseCentral(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo === 'analise_central')
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}
function cp_montarContextoCentral(menteeId) {
 const corta = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
 const linhas = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo !== 'analise_central' && s.tipo !== 'analise_telemetria')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 const hojeChave = cp_chaveDia(Date.now());
 const blocos = [];
 const dias = {};
 linhas.forEach(r => { const k = cp_chaveDia(r.created_at); (dias[k] = dias[k] || []).push(r); });
 const chaves = Object.keys(dias).sort();
 chaves.forEach((k, idxDia) => {
  const recente = idxDia >= chaves.length - 3 || k === hojeChave; // os dias mais recentes vão com mais detalhe
  const partes = [];
  dias[k].forEach(r => {
   const d = cp_parseDados(r.dados) || {};
   const tipo = (r.tipo || '').toLowerCase();
   if (d.telemetria && Array.isArray(d.telemetria.dominios)) {
    const doms = d.telemetria.dominios.map(dm => `${dm.titulo}: ${(dm.indicadores || []).map(i => `${i.nome} ${i.valor}`).join(', ')}${dm.obs ? ` (obs: ${corta(dm.obs, 120)})` : ''}`).join(' | ');
    const ex = Object.assign({}, d.telemetria.contexto || {}, d.telemetria.extras || {});
    partes.push(`[Telemetria ${d.telemetria.titulo || tipo}] ${recente ? doms : corta(doms, 300)}${Object.keys(ex).length ? ' | Destaques: ' + corta(Object.keys(ex).map(x => x + ': ' + ex[x]).join('; '), 250) : ''}${d.aiAnalysis ? ' | Análise da IA da telemetria: ' + corta(d.aiAnalysis, recente ? 700 : 250) : ''}`);
   } else if (tipo === 'observacao_manual') {
    partes.push(`[Registro do mentor] ${d.nichoNome ? 'Nicho: ' + d.nichoNome + '. ' : ''}${d.tags && d.tags.length ? 'Tags: ' + d.tags.join(', ') + '. ' : ''}${d.domains ? 'Percepção do mentor por domínio: ' + Object.keys(d.domains).map(x => x + ' ' + d.domains[x]).join(', ') + '. ' : ''}${d.anotacoes ? 'Anotações: ' + corta(d.anotacoes, recente ? 700 : 250) + '. ' : ''}${d.caderno ? 'Bloco de notas: ' + corta(d.caderno, recente ? 700 : 250) : ''}`);
   } else if (tipo === 'caderno') {
    partes.push(`[Bloco de notas] ${corta(d.texto, recente ? 500 : 200)}`);
   } else if (tipo === 'pdi_mentor') {
    const ac = Array.isArray(d.acoes) ? d.acoes : [];
    if (ac.length) partes.push(`[PDI definido pelo mentor${d.titulo ? ' para ' + d.titulo : ''}] ${corta(ac.map((a, i) => `${i + 1}. ${a.acao}${a.prazo ? ' (prazo: ' + a.prazo + ')' : ''}`).join(' '), recente ? 600 : 200)}`);
   } else if (tipo === 'dever_de_casa_config' || tipo === 'onboarding_config' || tipo === 'onboarding_arquivo' || tipo === 'anotacao') {
    // tratados à parte (dever de casa e onboarding)
   } else {
    let r2 = null; try { r2 = cp_resumoEstrategico(cp_parseGenericSession(r)); } catch (e) {}
    if (r2) partes.push(`[Ferramenta ${r2.titulo}] ${(r2.metricas || []).map(m => `${m.lbl}: ${String(m.val).replace(/<[^>]*>/g, '')}`).join('; ')}${r2.barras && r2.barras.itens ? ' | ' + r2.barras.itens.map(i => `${i.name} ${i.label || i.v}`).join(', ') : ''}${r2.resumo ? ' | Análise: ' + corta(r2.resumo, recente ? 600 : 200) : ''}`);
   }
  });
  if (partes.length) blocos.push(`DIA ${cp_rotuloDia(k)}${k === hojeChave ? ' (HOJE)' : ''}:\n- ` + partes.join('\n- '));
 });
 let extras = '';
 try {
  const ob = typeof cp_getOnboardingResp === 'function' ? cp_getOnboardingResp(menteeId) : null;
  if (ob && Array.isArray(ob.respostas) && ob.respostas.length) extras += `ONBOARDING (respostas da mentorada):\n${ob.respostas.map(r => `- ${corta(r.pergunta, 90)}: ${corta(r.resposta, 200)}`).join('\n')}\n\n`;
  else if (ob) extras += `ONBOARDING: momento: ${corta(ob.momento, 150)}; dor: ${corta(ob.estopimTempo, 150)}; expectativa: ${corta(ob.expectativaFinal, 150)}; prioridade: ${corta(ob.prioridade, 150)}\n\n`;
 } catch (e) {}
 try {
  const tarefas = cp_dcGetTarefas(menteeId), resp = cp_dcGetResposta(menteeId);
  if (tarefas.length) extras += `DEVER DE CASA:\n${tarefas.map((t, i) => { const r = resp.find(x => x.taskText === t) || resp.find(x => x.taskIndex === i) || {}; return `- ${corta(t, 120)}: ${r.completed === true ? 'concluída' : r.completed === false ? 'não concluída' : 'pendente'}${r.justification ? ' (justificativa: ' + corta(r.justification, 150) + ')' : ''}`; }).join('\n')}\n\n`;
 } catch (e) {}
 // cabe no limite da IA: se passar, os dias mais antigos saem primeiro
 let hist = blocos.join('\n\n');
 while (hist.length + extras.length > 8500 && blocos.length > 1) { blocos.shift(); hist = '(dias mais antigos resumidos por limite de tamanho)\n\n' + blocos.join('\n\n'); }
 if (hist.length + extras.length > 8500) hist = hist.slice(-(8500 - extras.length));
 return extras + 'LINHA DO TEMPO (do mais antigo para o mais recente):\n' + hist;
}
(function () {
 if (document.getElementById('cp-estilos-v4')) return;
 const st = document.createElement('style'); st.id = 'cp-estilos-v4';
 st.textContent = `
 .cpc-ia-topo { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
 .cpc-ia-btn { background:linear-gradient(135deg,#1B2559 0%,#5B2DA3 100%); color:#fff; border:none; border-radius:100px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
 .cpc-ia-btn:disabled { opacity:.7; cursor:wait; }
 .cpc-ia-quando { font-size:12px; color:#94A3B8; }
 .cpc-ia-texto { white-space:pre-wrap; font-size:13px; line-height:1.6; color:#334155; background:#F8F6FE; border:1px solid #E9E3FF; border-radius:12px; padding:12px 14px; margin-bottom:12px; max-height:420px; overflow-y:auto; }
 .cpc-ia-sep { font-size:11px; font-weight:700; color:#94A3B8; text-transform:uppercase; letter-spacing:.5px; margin:6px 0 8px; }
 `;
 document.head.appendChild(st);
})();

// Divide o texto do Agente Mentóra nas partes: insights, evolução, PDI e próxima sessão
function cp_secoesCentral(texto) {
 const out = { insights: [], evolucao: '', pdi: [], proxima: '' };
 let atual = null;
 String(texto || '').split(/\r?\n/).forEach(l => {
  const t = l.trim(); if (!t) return;
  const u = t.toUpperCase();
  if (/^INSIGHTS/.test(u)) { atual = 'insights'; return; }
  if (/^EVOLU/.test(u)) { atual = 'evolucao'; return; }
  if (/^PDI/.test(u)) { atual = 'pdi'; return; }
  if (/^PARA A PR[ÓO]XIMA/.test(u)) { atual = 'proxima'; return; }
  const item = t.replace(/^(\d+[\.\)]|[-•])\s*/, '');
  if (atual === 'insights') out.insights.push(item);
  else if (atual === 'pdi') out.pdi.push(item);
  else if (atual === 'evolucao') out.evolucao += (out.evolucao ? '\n' : '') + t;
  else if (atual === 'proxima') out.proxima += (out.proxima ? '\n' : '') + t;
 });
 return out;
}
// ══════════════════════════════════════════════════════════════════════
// ANÁLISE + PDI DE CADA TELEMETRIA (Agente Mentóra) — gerada na Visão Geral
// A análise de cada telemetria salva fica guardada como 'analise_telemetria',
// ligada ao registro da telemetria (sessao_id). O PDI considera tudo o que já
// foi salvo da mentorada: evolução, pontos de avanço e as análises do mentor.
// ══════════════════════════════════════════════════════════════════════
function cp_analiseDaTelemetria(rowId) {
 return (cp_all_sessions || []).filter(s => s && s.tipo === 'analise_telemetria' && String((cp_parseDados(s.dados) || {}).sessao_id) === String(rowId))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}
function cp_secoesTelemetria(texto) {
 const out = { analise: '', avancos: [], atencao: [], pdi: [] };
 let atual = 'analise';
 String(texto || '').replace(/\*\*/g, '').split('\n').forEach(l => {
  const t = l.trim(); if (!t) return;
  const u = t.toUpperCase().replace(/[:\-–—]+$/, '').trim();
  if (/^AN[AÁ]LISE/.test(u)) { atual = 'analise'; return; }
  if (/^PONTOS DE AVAN[CÇ]O/.test(u)) { atual = 'avancos'; return; }
  if (/^PONTOS DE ATEN[CÇ][AÃ]O/.test(u)) { atual = 'atencao'; return; }
  if (/^PDI\b/.test(u)) { atual = 'pdi'; return; }
  const item = t.replace(/^(\d+[\.\)]|[-•*])\s*/, '').trim();
  if (atual === 'analise') out.analise += (out.analise ? ' ' : '') + t;
  else if (item) out[atual].push(item);
 });
 return out;
}
// "Ação: X | Como: Y | Indicador de progresso: Z | Prazo: W" → partes
function cp_partesAcao(a) {
 const p = {};
 String(a).split('|').forEach(x => { const m = x.match(/^\s*([^:]+):\s*(.+)$/); if (m) p[m[1].trim().toLowerCase()] = m[2].trim(); });
 return { acao: p['ação'] || p['acao'] || String(a).split('|')[0].trim(), como: p['como'] || '', indicador: p['indicador de progresso'] || p['indicador'] || '', prazo: p['prazo'] || '' };
}
// Contexto: a aplicação atual em detalhe, as anteriores (evolução) e o histórico geral
function cp_contextoTelemetria(row) {
 const d = cp_parseDados(row.dados) || {};
 const T = d.telemetria || {};
 const media = dm => { const v = (dm.indicadores || []).map(i => Number(i.valor) || 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
 const atual = (T.dominios || []).map(dm => `- ${dm.titulo} (média ${media(dm)}/100): ${(dm.indicadores || []).map(i => `${i.nome} ${i.valor}/100`).join('; ')}${dm.obs ? ` | observação do mentor: ${dm.obs}` : ''}`).join('\n');
 const ex = Object.assign({}, T.contexto || {}, T.extras || {});
 const extras = Object.keys(ex).filter(k => !/mentorad|^id$/i.test(k)).map(k => `- ${k}: ${ex[k]}`).join('\n');
 const anteriores = (cp_all_sessions || []).filter(s => s && s.id !== row.id && String(s.mentorado_id) === String(row.mentorado_id) && s.tipo === row.tipo && new Date(s.created_at) < new Date(row.created_at))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3)
  .map(s => { const T2 = (cp_parseDados(s.dados) || {}).telemetria || {}; return `- ${new Date(s.created_at).toLocaleDateString('pt-BR')}: ${(T2.dominios || []).map(dm => `${dm.titulo} ${media(dm)}`).join('; ')}`; }).join('\n');
 // PDI da aplicação anterior desta mesma telemetria (para avaliar a execução)
 const idsAnteriores = (cp_all_sessions || []).filter(s => s && s.id !== row.id && String(s.mentorado_id) === String(row.mentorado_id) && s.tipo === row.tipo && new Date(s.created_at) < new Date(row.created_at)).map(s => String(s.id));
 const anPrev = (cp_all_sessions || []).filter(s => s && s.tipo === 'analise_telemetria' && idsAnteriores.includes(String((cp_parseDados(s.dados) || {}).sessao_id)))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 let pdiAnterior = '';
 if (anPrev && window.MentoraCerebros) {
  const acoesPrev = MentoraCerebros.secoes((cp_parseDados(anPrev.dados) || {}).texto || '').pdi.map(MentoraCerebros.partesAcao);
  pdiAnterior = acoesPrev.map((a, i) => `${i + 1}. ${a.acao}${a.indicador ? ` (indicador: ${a.indicador})` : ''}`).join('\n');
 }
 // O que o mentorado fez no dever de casa (respostas mais recentes)
 const respostas = (cp_all_sessions || []).filter(s => s && s.tipo === 'dever_de_casa_resp' && String(s.mentorado_id) === String(row.mentorado_id))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 2);
 const execucao = respostas.map(r => {
  const tks = (cp_parseDados(r.dados) || {}).tasks || [];
  return `Resposta de ${new Date(r.created_at).toLocaleDateString('pt-BR')}:\n` + tks.map(t => `- ${t.taskText || t.text || 'tarefa'}: ${t.completed ? 'FEITA' : 'NÃO FEITA'}${t.comment ? ` | comentário do mentorado: ${t.comment}` : ''}`).join('\n');
 }).join('\n');
 let geral = ''; try { geral = cp_montarContextoCentral(row.mentorado_id); } catch (e) {}
 return { titulo: T.titulo || row.tipo, quando: new Date(row.created_at).toLocaleDateString('pt-BR'), atual, extras, anteriores, geral, pdiAnterior, execucao };
}
window.cp_gerarAnaliseTelemetria = async function (rowId) {
 if (!cp_currentMentee || !window.supabaseClient) return;
 const row = (cp_all_sessions || []).find(s => String(s.id) === String(rowId)); if (!row) return;
 const btn = document.getElementById('cpt-btn-' + rowId);
 const nome = String(cp_currentMentee.nome || 'o mentorado').trim().split(/\s+/)[0]; // só o primeiro nome vai para a IA (minimização, LGPD)
 const c = cp_contextoTelemetria(row);
 const dados = `DADOS DA TELEMETRIA "${c.titulo}" — aplicada em ${c.quando} (escala 0 a 100)
${c.atual || '(sem indicadores)'}
${c.extras ? '\nRESPOSTAS E DESTAQUES:\n' + c.extras : ''}
${c.anteriores ? '\nAPLICAÇÕES ANTERIORES DESTA TELEMETRIA (médias por domínio):\n' + c.anteriores : '\nPRIMEIRA APLICAÇÃO desta telemetria: estabeleça a linha de base.'}
${c.pdiAnterior ? '\nPDI ANTERIOR DESTA TELEMETRIA (avalie a execução):\n' + c.pdiAnterior : ''}
${c.execucao ? '\nEXECUÇÃO DO DEVER DE CASA PELO MENTORADO:\n' + c.execucao : '\nSem respostas de dever de casa registradas.'}`;
 if (btn) { btn.disabled = true; btn.textContent = 'O Agente Mentóra está analisando...'; }
 try {
  const { data, error } = await window.supabaseClient.functions.invoke('proxy-ia', { body: { finalidade: 'telemetria', cerebro: { chave: row.tipo, nome, metodo: cp_currentMentee.metodo || '' }, dados, historico: String(c.geral || '').slice(-14000) } });
  if (error) {
   let msg = error.message || 'erro';
   try {
    const ctx = error.context && await error.context.json();
    if (ctx && ctx.error) msg = ctx.error;
    if (ctx && ctx.limite === 'diario' && typeof window.mentoraOfertaPacote === 'function') { if (btn) { btn.disabled = false; btn.textContent = 'Gerar análise e PDI com Agente Mentóra'; } window.mentoraOfertaPacote(ctx.pacote); return; }
   } catch (e) {}
   throw new Error(msg);
  }
  const texto = String((data && data.resposta) || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
  if (!texto) throw new Error('O Agente Mentóra não retornou texto.');
  const { error: ei } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{ mentorado_id: row.mentorado_id, tipo: 'analise_telemetria', dados: { sessao_id: row.id, titulo: c.titulo, texto, geradoEm: new Date().toISOString() } }]);
  if (ei) throw new Error('a análise foi gerada, mas não pôde ser salva (' + ei.message + ')');
  await cp_init();
  cp_recarregarFichaMantendoAba('visao', 'cpv-analise');
 } catch (e) {
  alert('O Agente Mentóra não conseguiu gerar a análise agora: ' + (e.message || e));
  if (btn) { btn.disabled = false; btn.textContent = 'Gerar análise e PDI com Agente Mentóra'; }
 }
};
// PDI → dever de casa: as ações entram na lista atual de tarefas e o link é copiado
window.cp_pdiParaDeverDeCasa = async function (analiseId) {
 const an = (cp_all_sessions || []).find(s => String(s.id) === String(analiseId)); if (!an) return;
 const menteeId = an.mentorado_id;
 const acoes = cp_secoesTelemetria((cp_parseDados(an.dados) || {}).texto || '').pdi.map(cp_partesAcao)
  .map(a => a.acao + (a.como ? ` — ${a.como}` : '') + (a.prazo ? ` (prazo: ${a.prazo})` : ''));
 if (!acoes.length) { alert('Este PDI não tem ações para enviar.'); return; }
 const atuais = cp_dcGetTarefas(menteeId);
 const novas = acoes.filter(a => !atuais.includes(a));
 if (!novas.length) { alert('As ações deste PDI já estão no dever de casa. O link será copiado para você enviar.'); if (typeof cp_copiarLinkDeverDeCasa === 'function') cp_copiarLinkDeverDeCasa(menteeId); return; }
 if (!confirm(`Adicionar ${novas.length} ação(ões) deste PDI ao dever de casa do mentorado?\n\nAs tarefas que ele já tem continuam na lista. Em seguida, o link do dever de casa é copiado para você enviar.`)) return;
 const ok = await cp_salvarTarefasDeverDeCasa(menteeId, atuais.concat(novas));
 if (!ok) return;
 if (typeof cp_copiarLinkDeverDeCasa === 'function') cp_copiarLinkDeverDeCasa(menteeId);
};
(function () {
 if (document.getElementById('cp-estilos-telemetria-ia')) return;
 const st = document.createElement('style'); st.id = 'cp-estilos-telemetria-ia';
 st.textContent = `
 .cpt-ia { margin-top:12px; border-top:1px dashed #E2E8F0; padding-top:12px; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
 .cpt-ia-pronta { display:block; background:#F8F6FE; border:1px solid #E9E3FF; border-radius:12px; padding:14px 16px; }
 .cpt-rot { font-size:11px; font-weight:700; color:#5B2DA3; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
 .cpt-rot span { color:#94A3B8; font-weight:600; text-transform:none; letter-spacing:0; }
 .cpt-texto { font-size:13.5px; line-height:1.6; color:#1E293B; margin:0 0 10px; }
 .cpt-cols { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-bottom:6px; }
 .cpt-sub { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }
 .cpt-verde { color:#059669; } .cpt-ambar { color:#B45309; }
 .cpt-lista { margin:0; padding-left:18px; font-size:13px; line-height:1.5; color:#334155; }
 .cpt-pdi { background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; margin-top:10px; }
 .cpt-pdi-cab { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
 .cpt-pdi-cab b { color:#1B2559; font-size:14px; letter-spacing:.5px; }
 .cpt-btn-dever { background:#4F46E5; color:#fff; border:none; border-radius:100px; padding:6px 14px; font-size:12px; font-weight:700; cursor:pointer; }
 .cpt-acao { display:flex; gap:10px; padding:8px 0; border-top:1px solid #F1F5F9; }
 .cpt-acao:first-of-type { border-top:none; }
 .cpt-num { flex-shrink:0; width:22px; height:22px; border-radius:50%; background:#EDE9FE; color:#5B2DA3; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
 .cpt-acao-t { font-size:13.5px; font-weight:600; color:#1E293B; }
 .cpt-acao-d { font-size:12.5px; color:#475569; margin-top:2px; }
 .cpt-rodape { margin-top:8px; text-align:right; }
 .cpt-link { background:none; border:none; color:#5B2DA3; font-size:12px; font-weight:600; cursor:pointer; }
 .cpt-nota { margin-top:10px; font-size:12.5px; color:#64748B; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; padding:8px 12px; }
 `;
 document.head.appendChild(st);
})();

// Fase 6: as funções que desenham gráficos esperam o Chart.js, que agora é baixado sob demanda.
(function () {
 ['cp_renderDashboardUI', 'cp_renderResumoEstrategico', 'cp_renderTelemetriaCharts', 'cp_renderTelemetriaChartsLegado'].forEach(function (nome) {
  var original = window[nome];
  if (typeof original !== 'function') return;
  window[nome] = function () {
   var self = this, args = arguments;
   if (typeof Chart !== 'undefined' || !window.mentoraCarregarChart) { cp_registrarValoresRadar(); return original.apply(self, args); }
   return window.mentoraCarregarChart().then(function () {
    cp_registrarValoresRadar(); return original.apply(self, args);
   }, function (e) { console.warn('Gráficos indisponíveis:', e.message); });
  };
 });
})();


// ══════════════════════════════════════════════════════════════════════
// VISÃO GERAL v5 — layout simples, sem repetição:
// 1) topo: avaliação em foco + botão do Agente Mentóra
// 2) números-chave  3) análise (uma só)  4) PDI do Agente + PDI do mentor
// 5) insights = perguntas para a próxima sessão  +  pontos de atenção
// 6) maturidade e radar  7) evolução por domínio + acompanhamento
// 8) resultados e respostas de cada avaliação
// ══════════════════════════════════════════════════════════════════════
var cp_vgFoco = null, cp_vgFocoMentee = null, cp_vgPdiEdicao = null;

// Todas as avaliações (telemetrias e ferramentas): a aplicação mais recente de cada uma
function cp_vgAvaliacoes(menteeId) {
 const grupos = {};
 cp_filterTimelineSessions(cp_all_sessions, menteeId).forEach(row => {
  const sess = cp_parseGenericSession(row); if (!sess) return;
  if ((sess.sessType || '').toLowerCase() === 'observacao_manual') return; // registros do mentor ficam no Histórico
  let r = null; try { r = cp_resumoEstrategico(sess); } catch (e) {}
  if (!r) return;
  const d = cp_parseDados(row.dados) || {};
  const t = new Date(row.created_at || sess.createdAt || Date.now()).getTime();
  const g = grupos[r.titulo] = grupos[r.titulo] || { n: 0, ult: null };
  g.n++;
  if (!g.ult || t > g.ult.t) g.ult = { t, r, d, row };
 });
 return Object.values(grupos).sort((a, b) => b.ult.t - a.ult.t).map(g => ({
  n: g.n, t: g.ult.t, r: g.ult.r, d: g.ult.d, row: g.ult.row, titulo: g.ult.r.titulo,
  ehTelemetria: !!(g.ult.d.telemetria && Array.isArray(g.ult.d.telemetria.dominios))
 }));
}
function cp_vgFocoAtual() {
 if (!cp_currentMentee) return { lista: [], foco: null };
 if (String(cp_vgFocoMentee) !== String(cp_currentMentee.id)) { cp_vgFoco = null; cp_vgFocoMentee = cp_currentMentee.id; cp_vgPdiEdicao = null; }
 const lista = cp_vgAvaliacoes(cp_currentMentee.id);
 return { lista, foco: lista.find(a => String(a.row.id) === String(cp_vgFoco)) || lista[0] || null };
}
function cp_vgOrdenarFoco(sessions) {
 try {
  const f = cp_vgFocoAtual(); if (!f.foco) return sessions;
  const i = sessions.findIndex(s => String(s.rowId) === String(f.foco.row.id));
  if (i > 0) { const c = sessions.slice(); c.unshift(c.splice(i, 1)[0]); return c; }
 } catch (e) {}
 return sessions;
}
window.cp_vgFocar = function (rowId) {
 cp_vgFoco = rowId; cp_vgPdiEdicao = null;
 cp_recarregarFichaMantendoAba('visao', 'cpv-topo');
};
function cp_vgData(t, comHora) { const d = new Date(t); return comHora ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('pt-BR'); }
function cp_vgAnalises(rowId) {
 return (cp_all_sessions || []).filter(s => s && s.tipo === 'analise_telemetria' && String((cp_parseDados(s.dados) || {}).sessao_id) === String(rowId))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
function cp_vgSecoes(an) {
 const texto = an ? ((cp_parseDados(an.dados) || {}).texto || '') : '';
 if (!texto) return null;
 if (window.MentoraCerebros) return MentoraCerebros.secoes(texto);
 return { leitura: texto, ponderacao: [], evolucao: '', direcionamento: '', pdi: [], proxima: [], avancos: [], atencao: [], especificas: [] };
}
function cp_vgAcoesAgente(foco, sec) {
 if (!foco) return [];
 if (foco.ehTelemetria) return sec && window.MentoraCerebros ? sec.pdi.map(MentoraCerebros.partesAcao) : [];
 return (foco.r.pdi || []).map(x => ({ acao: String(x) }));
}
// Perguntas para a próxima sessão (sem repetir): as da ponderação e as do fim da análise
function cp_vgPerguntas(sec) {
 if (!sec) return [];
 const out = [], vistos = new Set();
 const add = q => {
  q = String(q || '').replace(/^perguntas?[^:]{0,30}:\s*/i, '').trim(); if (q.length < 8) return;
  const k = q.toLowerCase().replace(/[^a-z0-9à-ú]/g, ''); if (vistos.has(k)) return;
  vistos.add(k); out.push(q);
 };
 const quebrar = t => { const p = String(t).split(/\s*\b\d\)\s+/).map(x => x.trim()).filter(Boolean); return p.length > 1 ? p : [String(t)]; };
 (sec.ponderacao || []).filter(p => p.includes('?')).forEach(p => quebrar(p.replace(/^perguntas?[^:]{0,30}:\s*/i, '')).forEach(add));
 (sec.proxima || []).forEach(p => quebrar(p).forEach(add));
 return out;
}

// 1) TOPO
function cp_vgTopo(lista, foco, an) {
 const el = document.getElementById('cpv-topo'); if (!el) return;
 if (!foco) { el.innerHTML = `<div><div class="cpv-rot">Avaliação em foco</div><div class="cpv-mini">Aplique uma telemetria ou ferramenta com este mentorado para ver a análise aqui.</div></div>`; return; }
 const escolha = lista.length > 1
  ? `<div class="cpv-chips">${lista.map(a => `<button type="button" class="cpv-chip ${a === foco ? 'ativo' : ''}" onclick="cp_vgFocar('${cp_esc(a.row.id)}')">${cp_esc(a.titulo)}<small>${cp_vgData(a.t)}</small></button>`).join('')}</div>`
  : `<div class="cpv-foco-unico">${cp_esc(foco.titulo)} <small>· ${cp_vgData(foco.t)}</small></div>`;
 const id = cp_esc(foco.row.id);
 const acao = foco.ehTelemetria
  ? `<button type="button" class="cpc-ia-btn cpv-btn-ia" id="cpt-btn-${id}" onclick="cp_gerarAnaliseTelemetria('${id}')">${an ? 'Atualizar análise e PDI' : 'Gerar análise e PDI com Agente Mentóra'}</button>
     <span class="cpv-mini">${an ? 'Última análise: ' + cp_esc(cp_vgData(an.created_at, true)) : 'Lê esta telemetria, as aplicações anteriores, o dever de casa e o histórico'}</span>`
  : `<span class="cpv-mini" style="max-width:320px; text-align:right;">Nas ferramentas, a análise com Agente Mentóra é feita dentro da própria ferramenta e fica salva no Histórico.</span>`;
 el.innerHTML = `<div class="cpv-topo-esq"><div class="cpv-rot">${lista.length > 1 ? 'Avaliação em foco — escolha qual analisar' : 'Avaliação em foco'}</div>${escolha}</div><div class="cpv-topo-dir">${acao}</div>${cp_vgAvisos(foco)}`;
}
// Telemetrias psicoemocionais: leitura de apoio (não é diagnóstico) e orientação de encaminhamento
const CP_TELEMETRIAS_SENSIVEIS = ['trauma', 'burnout'];
function cp_vgAvisos(foco) {
 const tipo = foco && foco.r ? foco.r.tipoTelemetria : '';
 if (!CP_TELEMETRIAS_SENSIVEIS.includes(tipo)) return '';
 const altas = (foco.r.alertas || []).filter(a => a.nivel === 'Crítico').length;
 const encaminhar = foco.r.apoioEspecializado || altas >= 3;
 const aviso = {
  clinica: 'Leitura de apoio ao profissional (habilitação de psicólogo verificada pela Mentóra). Hipóteses clínicas são subsídio à sua avaliação; a decisão clínica e o registro profissional são de sua responsabilidade. Dados sensíveis: use somente nesta mentoria.',
  psicanalitica: 'Leitura de apoio ao mentor, com linguagem psicanalítica (formação verificada pela Mentóra). Não é diagnóstico psicológico e não substitui avaliação de psicólogo ou médico. Dados sensíveis: use somente nesta mentoria.',
  padrao: 'Leitura de apoio ao mentor, feita a partir da sua observação. Não é diagnóstico e não substitui avaliação de psicólogo ou médico. Dados sensíveis: use somente nesta mentoria.'
 }[cp_nivelHab] || '';
 let alerta = '';
 if (encaminhar) {
  const motivo = foco.r.apoioEspecializado ? 'Você marcou que o mentorado precisa de apoio especializado.' : 'Há vários pontos em prioridade alta nesta avaliação.';
  alerta = cp_nivelHab === 'clinica'
   ? `<div class="cpv-aviso cpv-aviso-forte"><b>Atenção à avaliação de risco e à rede de apoio.</b> ${motivo} Em situação de risco imediato: CVV 188 (24 horas, gratuito) ou SAMU 192.</div>`
   : `<div class="cpv-aviso cpv-aviso-forte"><b>Considere orientar a busca de apoio especializado.</b> ${motivo} Converse com cuidado e sugira um psicólogo ou médico. Em situação de risco imediato: CVV 188 (24 horas, gratuito) ou SAMU 192.</div>`;
 }
 return `<div class="cpv-aviso">${aviso}</div>` + alerta;
}

// 3) ANÁLISE (uma só)
function cp_vgAnalise(foco, an, sec, anteriores) {
 const el = document.getElementById('cpv-analise'); if (!el) return;
 const cab = (t, sub) => `<div class="cpv-cab"><div><div class="cpv-titulo">${t}</div>${sub ? `<div class="cpv-sub">${sub}</div>` : ''}</div></div>`;
 if (!foco) { el.innerHTML = cab('Análise com Agente Mentóra') + '<div class="cpv-vazio">Ainda não há telemetrias ou ferramentas aplicadas.</div>'; return; }
 if (!foco.ehTelemetria) {
  el.innerHTML = cab('Resumo da ferramenta', cp_esc(foco.titulo) + ' · ' + cp_vgData(foco.t))
   + (foco.r.resumo ? `<p class="cpv-txt" style="white-space:pre-line;">${cp_esc(foco.r.resumo)}</p>` : '<div class="cpv-vazio">Sem resumo registrado para esta ferramenta.</div>');
  return;
 }
 if (!an || !sec) {
  el.innerHTML = cab('Análise com Agente Mentóra', cp_esc(foco.titulo) + ' · aplicada em ' + cp_vgData(foco.t))
   + '<div class="cpv-vazio">Esta telemetria ainda não foi analisada. Use o botão <b>Gerar análise e PDI com Agente Mentóra</b>, no topo desta página.</div>';
  return;
 }
 const bloco = (rot, html) => html ? `<div class="cpv-bloco"><div class="cpv-bloco-rot">${rot}</div>${html}</div>` : '';
 const par = t => t ? `<p class="cpv-txt">${cp_esc(t)}</p>` : '';
 const lista = it => it.length ? `<ul class="cpv-lista">${it.map(i => `<li>${cp_esc(i)}</li>`).join('')}</ul>` : '';
 const lacunas = (sec.ponderacao || []).filter(p => !p.includes('?'));
 const ant = anteriores.length ? `<details class="cpv-anteriores"><summary>Análises anteriores (${anteriores.length})</summary>${anteriores.map(a => `<div class="cpv-ant-item"><div class="cpv-ant-data">${cp_esc(cp_vgData(a.created_at, true))}</div><div class="cpv-ant-txt">${cp_esc((cp_parseDados(a.dados) || {}).texto || '')}</div></div>`).join('')}</details>` : '';
 el.innerHTML = cab('Análise com Agente Mentóra', `${cp_esc(foco.titulo)} · gerada em ${cp_esc(cp_vgData(an.created_at, true))}`)
  + bloco('Leitura', par(sec.leitura))
  + bloco('Pontos de avanço', lista(sec.avancos || []))
  + (sec.especificas || []).map(e => bloco(cp_esc(e.titulo.charAt(0) + e.titulo.slice(1).toLowerCase()), `<p class="cpv-txt" style="white-space:pre-line;">${cp_esc(e.linhas.join('\n'))}</p>`)).join('')
  + bloco('O que os dados ainda não mostram', lista(lacunas))
  + bloco('Evolução e execução', par(sec.evolucao))
  + bloco('Direcionamento', par(sec.direcionamento))
  + ant;
}

// 4a) PDI DO AGENTE
function cp_vgPdiAgente(foco, acoes) {
 const el = document.getElementById('cpv-pdi-agente'); if (!el) return;
 const titulo = foco && !foco.ehTelemetria ? 'PDI da ferramenta' : 'PDI do Agente Mentóra';
 if (!acoes.length) {
  el.innerHTML = `<div class="cpv-cab"><div class="cpv-titulo">${titulo}</div></div><div class="cpv-vazio">${foco && foco.ehTelemetria ? 'O PDI do Agente aparece aqui quando você gerar a análise desta telemetria.' : 'Nenhuma ação de PDI registrada para esta avaliação.'}</div>`;
  return;
 }
 el.innerHTML = window.MentoraCerebros
  ? MentoraCerebros.htmlPDI(acoes, cp_currentMentee.id, { titulo, solto: true })
  : `<div class="cpv-titulo">${titulo}</div><ol class="cpv-lista">${acoes.map(a => `<li>${cp_esc(a.acao)}</li>`).join('')}</ol>`;
}

// 4b) PDI DO MENTOR (o mentor monta o próprio; cada salvamento é uma nova versão, nada se perde)
function cp_vgPdisMentor(sessaoId) {
 return (cp_all_sessions || []).filter(s => s && s.tipo === 'pdi_mentor' && cp_currentMentee && String(s.mentorado_id) === String(cp_currentMentee.id)
  && String((cp_parseDados(s.dados) || {}).sessao_id || '') === String(sessaoId || ''))
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
function cp_vgPdiMentor(foco, acoesAgente) {
 const el = document.getElementById('cpv-pdi-mentor'); if (!el || !cp_currentMentee) return;
 const sessaoId = foco ? foco.row.id : null;
 const versoes = cp_vgPdisMentor(sessaoId);
 const atual = versoes[0], acoes = atual ? ((cp_parseDados(atual.dados) || {}).acoes || []) : [];
 const ed = cp_vgPdiEdicao && String(cp_vgPdiEdicao.sessaoId || '') === String(sessaoId || '') ? cp_vgPdiEdicao : null;
 const cab = `<div class="cpv-cab"><div><div class="cpv-titulo">PDI do mentor</div><div class="cpv-sub">${atual ? 'Salvo em ' + cp_esc(cp_vgData(atual.created_at, true)) : 'As ações que você define para este mentorado'}</div></div></div>`;
 if (ed) {
  el.innerHTML = cab + ed.acoes.map((a, i) => `<div class="cpv-ed-linha"><div class="mcb-num">${i + 1}</div><div class="cpv-ed-campos">
    <input class="cpv-in" placeholder="Ação: o que o mentorado vai fazer" value="${cp_esc(a.acao)}" oninput="cp_vgPdiCampo(${i}, 'acao', this.value)">
    <div class="cpv-ed-duplo"><input class="cpv-in" placeholder="Como (opcional)" value="${cp_esc(a.como)}" oninput="cp_vgPdiCampo(${i}, 'como', this.value)">
    <input class="cpv-in" placeholder="Prazo (opcional)" value="${cp_esc(a.prazo)}" oninput="cp_vgPdiCampo(${i}, 'prazo', this.value)"></div></div>
    <button type="button" class="cpv-lnk perigo" onclick="cp_vgPdiRemover(${i})">Remover</button></div>`).join('')
   + `<div class="cpv-acoes-bar"><button type="button" class="cpv-btn sec" onclick="cp_vgPdiAdicionar()">Adicionar ação</button>
     <button type="button" class="cpv-btn" id="cpv-pdi-salvar" onclick="cp_vgPdiSalvar()">Salvar PDI do mentor</button>
     <button type="button" class="cpv-lnk" onclick="cp_vgPdiCancelar()">Cancelar</button></div>`;
  return;
 }
 const ant = versoes.length > 1 ? `<details class="cpv-anteriores"><summary>Versões anteriores (${versoes.length - 1})</summary>${versoes.slice(1).map(v => { const ac = (cp_parseDados(v.dados) || {}).acoes || []; return `<div class="cpv-ant-item"><div class="cpv-ant-data">${cp_esc(cp_vgData(v.created_at, true))}</div>${ac.length ? `<ol>${ac.map(a => `<li>${cp_esc(a.acao)}</li>`).join('')}</ol>` : '<div class="cpv-ant-txt">PDI esvaziado.</div>'}</div>`; }).join('')}</details>` : '';
 if (acoes.length) {
  const editar = `<button type="button" class="cpv-btn sec cpv-btn-peq" onclick="cp_vgPdiEditar()">Editar</button>`;
  el.innerHTML = (window.MentoraCerebros
   ? MentoraCerebros.htmlPDI(acoes, cp_currentMentee.id, { titulo: 'PDI do mentor', solto: true, extra: editar })
   : cab + `<ol class="cpv-lista">${acoes.map(a => `<li>${cp_esc(a.acao)}</li>`).join('')}</ol>` + editar)
   + `<div class="cpv-sub" style="margin-top:6px;">Salvo em ${cp_esc(cp_vgData(atual.created_at, true))}</div>` + ant;
  return;
 }
 // Botão "Dever de casa" sempre visível: sem PDI salvo, explica o que fazer antes
 const deverVazio = `<div style="display:flex;justify-content:flex-end;margin:-4px 0 8px;"><button type="button" class="mcb-btn-dever" onclick="alert('Crie e salve o PDI do mentor primeiro. Depois, este botão envia as ações dele para o dever de casa do mentorado.')">Dever de casa</button></div>`;
 el.innerHTML = cab + deverVazio + '<div class="cpv-vazio">Monte o seu próprio PDI com as ações que você considera prioritárias. Ele fica salvo junto desta avaliação e o Agente Mentóra passa a considerá-lo nas próximas análises.</div>'
  + `<div class="cpv-acoes-bar"><button type="button" class="cpv-btn" onclick="cp_vgPdiNovo(false)">Criar PDI do mentor</button>${acoesAgente.length ? '<button type="button" class="cpv-btn sec" onclick="cp_vgPdiNovo(true)">Partir do PDI do Agente</button>' : ''}</div>` + ant;
}
function cp_vgRenderPdiMentor() {
 const f = cp_vgFocoAtual(); const an = f.foco && f.foco.ehTelemetria ? cp_vgAnalises(f.foco.row.id)[0] : null;
 cp_vgPdiMentor(f.foco, cp_vgAcoesAgente(f.foco, cp_vgSecoes(an)));
}
window.cp_vgPdiNovo = function (usarAgente) {
 const f = cp_vgFocoAtual(); const foco = f.foco;
 const an = foco && foco.ehTelemetria ? cp_vgAnalises(foco.row.id)[0] : null;
 const base = usarAgente ? cp_vgAcoesAgente(foco, cp_vgSecoes(an)) : [];
 cp_vgPdiEdicao = { sessaoId: foco ? foco.row.id : null, titulo: foco ? foco.titulo : '',
  acoes: base.length ? base.map(a => ({ acao: a.acao || '', como: a.como || '', prazo: a.prazo || '' })) : [{ acao: '', como: '', prazo: '' }] };
 cp_vgRenderPdiMentor();
};
window.cp_vgPdiEditar = function () {
 const f = cp_vgFocoAtual(); const foco = f.foco;
 const atual = cp_vgPdisMentor(foco ? foco.row.id : null)[0];
 const acoes = atual ? ((cp_parseDados(atual.dados) || {}).acoes || []) : [];
 cp_vgPdiEdicao = { sessaoId: foco ? foco.row.id : null, titulo: foco ? foco.titulo : '', acoes: acoes.map(a => ({ acao: a.acao || '', como: a.como || '', prazo: a.prazo || '' })) };
 if (!cp_vgPdiEdicao.acoes.length) cp_vgPdiEdicao.acoes.push({ acao: '', como: '', prazo: '' });
 cp_vgRenderPdiMentor();
};
window.cp_vgPdiCampo = function (i, campo, valor) { if (cp_vgPdiEdicao && cp_vgPdiEdicao.acoes[i]) cp_vgPdiEdicao.acoes[i][campo] = valor; };
window.cp_vgPdiAdicionar = function () { if (!cp_vgPdiEdicao) return; cp_vgPdiEdicao.acoes.push({ acao: '', como: '', prazo: '' }); cp_vgRenderPdiMentor(); };
window.cp_vgPdiRemover = function (i) { if (!cp_vgPdiEdicao) return; cp_vgPdiEdicao.acoes.splice(i, 1); if (!cp_vgPdiEdicao.acoes.length) cp_vgPdiEdicao.acoes.push({ acao: '', como: '', prazo: '' }); cp_vgRenderPdiMentor(); };
window.cp_vgPdiCancelar = function () { cp_vgPdiEdicao = null; cp_vgRenderPdiMentor(); };
window.cp_vgPdiSalvar = async function () {
 const ed = cp_vgPdiEdicao; if (!ed || !cp_currentMentee || !window.supabaseClient) return;
 const acoes = ed.acoes.map(a => ({ acao: String(a.acao || '').trim(), como: String(a.como || '').trim(), prazo: String(a.prazo || '').trim() })).filter(a => a.acao);
 const tinha = cp_vgPdisMentor(ed.sessaoId).length > 0;
 if (!acoes.length && !tinha) { alert('Escreva pelo menos uma ação antes de salvar.'); return; }
 if (!acoes.length && !confirm('Nenhuma ação preenchida. Deseja salvar o PDI do mentor vazio? A versão anterior continua guardada no histórico.')) return;
 const btn = document.getElementById('cpv-pdi-salvar'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
 const { data, error } = await window.supabaseClient.from('Sessoes_Mentoria')
  .insert([{ mentorado_id: cp_currentMentee.id, tipo: 'pdi_mentor', dados: { sessao_id: ed.sessaoId, titulo: ed.titulo, acoes, salvoEm: new Date().toISOString() } }]).select();
 if (error || !data || !data.length) {
  alert('Não foi possível salvar o PDI do mentor. Tente novamente.' + (error ? '\n\nDetalhe: ' + error.message : ''));
  if (btn) { btn.disabled = false; btn.textContent = 'Salvar PDI do mentor'; }
  return;
 }
 cp_all_sessions.unshift(data[0]);
 cp_vgPdiEdicao = null;
 cp_recarregarFichaMantendoAba('visao', 'cpv-pdi-mentor');
};

// 5) INSIGHTS PARA A PRÓXIMA SESSÃO
function cp_vgInsights(foco, sec) {
 const el = document.getElementById('cp-insights-mentor'); if (!el) return;
 const perguntas = cp_vgPerguntas(sec);
 if (!perguntas.length) {
  el.innerHTML = `<div class="cpv-vazio">${foco && foco.ehTelemetria ? 'As perguntas para o mentor levar à próxima sessão aparecem aqui quando o Agente Mentóra analisar esta telemetria.' : 'As perguntas para a próxima sessão aparecem quando uma telemetria analisada pelo Agente Mentóra está em foco.'}</div>`;
  return;
 }
 el.innerHTML = '<div class="cpv-sub" style="margin:-4px 0 10px;">Perguntas para confirmar as hipóteses da análise e decidir as prioridades com o mentorado.</div>'
  + perguntas.map((q, i) => `<div class="cpv-pergunta"><div class="n">${i + 1}</div><div>${cp_esc(q)}</div></div>`).join('');
}

// 7b) ACOMPANHAMENTO (o que não aparece em nenhum outro campo)
function cp_vgAcompanhamento(foco) {
 const el = document.getElementById('cpv-acompanhamento'); if (!el || !cp_currentMentee) return;
 const id = cp_currentMentee.id;
 const itens = [];
 const add = (tipo, titulo, texto) => itens.push({ tipo, titulo, texto });
 const linhas = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 // evolução da telemetria em foco (só quando há mais de uma aplicação)
 if (foco && foco.ehTelemetria) {
  const ap = linhas.filter(r => r.tipo === foco.row.tipo && new Date(r.created_at) <= new Date(foco.row.created_at)).map(r => { const d = cp_parseDados(r.dados) || {}; const rt = d.telemetria ? cp_resumoTelemetria((r.tipo || '').toLowerCase(), d) : null; return rt && rt.maturidade ? rt.maturidade.media : null; }).filter(v => v != null);
  if (ap.length > 1) {
   const dif = Math.round(ap[ap.length - 1] - ap[ap.length - 2]);
   add(dif < 0 ? 'alerta' : 'ok', 'Evolução desta telemetria', `Maturidade geral foi de ${Math.round(ap[ap.length - 2])}% para ${Math.round(ap[ap.length - 1])}% (${dif > 0 ? '+' : ''}${dif} pontos) desde a aplicação anterior.${dif < 0 ? ' Vale investigar o que mudou.' : ''}`);
  } else add('info', 'Evolução desta telemetria', 'Primeira aplicação: ela é a linha de base para medir a evolução nas próximas.');
 }
 // dever de casa
 try {
  const tarefas = cp_dcGetTarefas(id), resp = cp_dcGetResposta(id);
  if (tarefas.length) {
   const st = tarefas.map((t, i) => { const r = resp.find(x => x.taskText === t) || resp.find(x => x.taskIndex === i); return r ? r.completed : null; });
   const feitas = st.filter(x => x === true).length, nao = st.filter(x => x === false).length, pend = tarefas.length - feitas - nao;
   add(feitas < tarefas.length ? 'alerta' : 'ok', 'Dever de casa', `${feitas} de ${tarefas.length} tarefas concluídas${nao ? `, ${nao} não feita(s) com justificativa` : ''}${pend ? `, ${pend} sem resposta` : ''}.${feitas < tarefas.length ? ' Retome as pendências na próxima sessão.' : ' Bom sinal de engajamento.'}`);
  } else add('info', 'Dever de casa', 'Nenhuma tarefa enviada ainda. O botão Dever de casa, em cada PDI, envia as ações para o mentorado.');
 } catch (e) {}
 // onboarding
 try { const ob = cp_getOnboardingResp(id); add(ob ? 'ok' : 'info', 'Onboarding', ob ? 'Respondido pelo mentorado (as respostas entram nas análises).' : 'Ainda não respondido pelo mentorado.'); } catch (e) {}
 // temas que se repetem nos registros do mentor
 const tags = {};
 linhas.filter(r => r.tipo === 'observacao_manual').forEach(r => { const d = cp_parseDados(r.dados) || {}; (d.tags || []).forEach(t => { const k = String(t).trim(); if (k) tags[k] = (tags[k] || 0) + 1; }); });
 const rep = Object.entries(tags).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
 if (rep.length) add('alerta', 'Temas recorrentes', `${rep.map(([t, n]) => `"${t}" (${n}x)`).join(', ')} aparecem em mais de uma sessão.`);
 // ritmo das sessões
 const dias = [...new Set(cp_filterTimelineSessions(cp_all_sessions, id).map(r => cp_chaveDia(r.created_at)))].sort();
 if (dias.length) {
  const semDias = Math.max(0, Math.round((new Date(cp_chaveDia(Date.now()) + 'T12:00:00') - new Date(dias[dias.length - 1] + 'T12:00:00')) / 86400000));
  const quando = semDias === 0 ? 'hoje' : semDias === 1 ? 'ontem' : `há ${semDias} dias`;
  add(semDias > 21 ? 'alerta' : 'info', 'Ritmo das sessões', `${dias.length} ${dias.length === 1 ? 'dia de sessão registrado' : 'dias de sessão registrados'}; o último foi ${quando}.${semDias > 21 ? ' Considere retomar o contato.' : ''}`);
 }
 const cor = { alerta: ['#FEF3C7', '#B45309'], ok: ['#DCFCE7', '#166534'], info: ['#F1F5F9', '#475569'] };
 el.innerHTML = itens.map(i => `<div class="cpv-acomp" style="background:${cor[i.tipo][0]};"><b style="color:${cor[i.tipo][1]};">${cp_esc(i.titulo)}</b><span>${cp_esc(i.texto)}</span></div>`).join('') || '<div class="cpv-vazio">Sem dados de acompanhamento ainda.</div>';
}

// Rodapé de cada card em "Resultados de todas as avaliações"
function cp_vgRodapeAvaliacao(g, foco) {
 const ehFoco = foco && String(foco.row.id) === String(g.row.id);
 const an = g.ehTelemetria ? cp_vgAnalises(g.row.id)[0] : null;
 const info = g.ehTelemetria ? (an ? 'Análise do Agente gerada em ' + cp_vgData(an.created_at) : 'Ainda sem análise do Agente Mentóra') : 'Análise do Agente feita na própria ferramenta (salva no Histórico)';
 return `<div class="cpv-rodape-aval">${ehFoco ? '<span class="cpv-tag-foco">Em foco no topo da Visão Geral</span>' : `<button type="button" class="cpv-lnk" onclick="cp_vgFocar('${cp_esc(g.row.id)}')">Ver análise e PDI desta avaliação</button>`}<span class="cpv-mini">${cp_esc(info)}</span></div>`;
}

function cp_vgRender() {
 // Visão Geral virou dashboard (cp_vgDashboard). Análise, PDI e perguntas ficam na página de resultado da telemetria.
 if (typeof cp_vgDashboard === 'function') { try { cp_vgDashboard(); } catch (e) {} }
 return;
 if (!cp_currentMentee) return;
 const f = cp_vgFocoAtual(), foco = f.foco;
 const analises = foco && foco.ehTelemetria ? cp_vgAnalises(foco.row.id) : [];
 const an = analises[0] || null, sec = cp_vgSecoes(an);
 const acoesAgente = cp_vgAcoesAgente(foco, sec);
 cp_vgTopo(f.lista, foco, an);
 cp_vgAnalise(foco, an, sec, analises.slice(1));
 cp_vgPdiAgente(foco, acoesAgente);
 cp_vgPdiMentor(foco, acoesAgente);
 cp_vgInsights(foco, sec);
 cp_vgAcompanhamento(foco);
 const tR = document.getElementById('cp-title-risks'); if (tR) tR.textContent = 'Pontos de atenção';
}

(function () {
 if (document.getElementById('cp-estilos-v5')) return;
 const st = document.createElement('style'); st.id = 'cp-estilos-v5';
 st.textContent = `
 .cpv-topo { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; background:#fff; border:1px solid #E2E8F0; border-radius:16px; padding:16px 20px; margin-bottom:1.25rem; }
 .cpv-rot { font-size:11px; font-weight:700; color:#94A3B8; text-transform:uppercase; letter-spacing:.6px; margin-bottom:8px; }
 .cpv-chips { display:flex; flex-wrap:wrap; gap:8px; }
 .cpv-chip { border:1px solid #E2E8F0; background:#F8FAFC; color:#334155; border-radius:100px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; display:inline-flex; gap:6px; align-items:baseline; }
 .cpv-chip small { font-size:11px; color:#94A3B8; font-weight:500; }
 .cpv-chip.ativo { background:#5B2DA3; border-color:#5B2DA3; color:#fff; }
 .cpv-chip.ativo small { color:rgba(255,255,255,.8); }
 .cpv-foco-unico { font-size:16px; font-weight:700; color:#1B2559; }
 .cpv-foco-unico small { font-size:12px; color:#94A3B8; font-weight:500; }
 .cpv-topo-dir { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
 .cpv-btn-ia { padding:11px 20px; font-size:14px; }
 .cpv-mini { font-size:12px; color:#94A3B8; line-height:1.4; }
 .cpv-painel { margin-bottom:1.5rem; }
 .cpv-cab { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; }
 .cpv-titulo { font-size:12px; font-weight:700; color:#5B2DA3; text-transform:uppercase; letter-spacing:.6px; }
 .cpv-sub { font-size:12px; color:#94A3B8; margin-top:3px; }
 .cpv-bloco { margin-top:14px; }
 .cpv-bloco-rot { font-size:13px; font-weight:700; color:#1B2559; margin-bottom:4px; }
 .cpv-txt { font-size:14px; line-height:1.65; color:#334155; margin:0; }
 .cpv-lista { margin:0; padding-left:18px; font-size:14px; line-height:1.6; color:#334155; }
 .cpv-vazio { font-size:13px; color:#94A3B8; line-height:1.55; padding:4px 0; }
 .cpv-pergunta { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border-radius:10px; background:#F8F6FE; border:1px solid #EDE9FE; margin-bottom:8px; font-size:13.5px; color:#1E293B; line-height:1.5; }
 .cpv-pergunta .n { flex-shrink:0; width:22px; height:22px; border-radius:50%; background:#5B2DA3; color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
 .cpv-acomp { padding:10px 12px; border-radius:10px; margin-bottom:8px; }
 .cpv-acomp b { display:block; font-size:11.5px; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
 .cpv-acomp span { font-size:13px; color:#334155; line-height:1.5; }
 .cpv-btn { background:#5B2DA3; color:#fff; border:1px solid #5B2DA3; border-radius:100px; padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
 .cpv-btn.sec { background:#fff; color:#5B2DA3; border-color:#D9CCF5; }
 .cpv-btn-peq { padding:5px 12px; font-size:12px; }
 .cpv-btn:disabled { opacity:.6; cursor:wait; }
 .cpv-lnk { background:none; border:none; color:#5B2DA3; font-weight:600; font-size:13px; cursor:pointer; padding:0; font-family:inherit; }
 .cpv-lnk.perigo { color:#B91C1C; font-size:12px; margin-top:8px; }
 .cpv-acoes-bar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:12px; }
 .cpv-ed-linha { display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-top:1px solid #F1F5F9; }
 .cpv-ed-linha:first-of-type { border-top:none; }
 .cpv-ed-campos { flex:1; display:flex; flex-direction:column; gap:6px; }
 .cpv-ed-duplo { display:grid; grid-template-columns:2fr 1fr; gap:6px; }
 .cpv-in { width:100%; box-sizing:border-box; border:1px solid #E2E8F0; border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit; color:#1E293B; background:#fff; }
 .cpv-in:focus { outline:none; border-color:#8B5CF6; }
 .cpv-anteriores { margin-top:12px; font-size:12px; color:#94A3B8; }
 .cpv-anteriores summary { cursor:pointer; }
 .cpv-ant-item { border-top:1px solid #F1F5F9; padding:8px 0; }
 .cpv-ant-data { font-weight:600; color:#94A3B8; margin-bottom:3px; }
 .cpv-ant-txt { white-space:pre-wrap; color:#94A3B8; line-height:1.5; max-height:220px; overflow-y:auto; }
 .cpv-anteriores ol { margin:4px 0 0; padding-left:18px; color:#94A3B8; }
 .cpv-chart-nota { position:absolute; inset:0; align-items:center; justify-content:center; text-align:center; padding:24px; font-size:13px; color:#94A3B8; line-height:1.55; }
 .cpv-rodape-aval { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px dashed #E2E8F0; }
 .cpv-aviso { flex-basis:100%; font-size:12.5px; color:#475569; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:9px 12px; line-height:1.5; }
 .cpv-aviso-forte { color:#7C2D12; background:#FFF7ED; border-color:#FED7AA; }
 .cpv-tag-foco { font-size:12px; font-weight:700; color:#5B2DA3; background:#F3EEFF; border-radius:100px; padding:4px 10px; }
 @media (max-width: 760px) { .cpv-topo-dir { align-items:flex-start; } .cpv-ed-duplo { grid-template-columns:1fr; } }
 `;
 document.head.appendChild(st);
})();

// ══════════════════════════════════════════════════════════════════════
// RESULTADO E ANÁLISE DENTRO DA TELEMETRIA (02/10/2026)
// A telemetria abre com duas abas: "Aplicação" (o formulário, no iframe) e "Resultado e análise"
// (página desenhada pela plataforma, com o login da mentora): resultado por domínio, análise do
// Agente Mentóra, pontos de atenção, perguntas para a próxima sessão, PDI do Agente (dever de casa)
// e PDI do mentor. Nada disso aparece mais na Visão Geral, que virou um dashboard do conjunto.
// ══════════════════════════════════════════════════════════════════════
const CP_TELE_ARQUIVOS = {
 trauma: 'telemetria_traumas.html', burnout: 'telemetria_burnout_vitalidade.html', comunicacao: 'telemetria_comunicacao.html',
 ie: 'telemetria_inteligencia_emocional.html', produtividade: 'telemetria_produtividade.html', transicao: 'telemetria_transicao_carreira.html',
 vendas: 'telemetria_vendas.html', lideranca: 'telemetria_lideranca.html'
};
const CP_TELE_ORDEM = ['trauma', 'ie', 'burnout', 'lideranca', 'produtividade', 'comunicacao', 'transicao', 'vendas'];
const CP_TELE_NOMES = { trauma: 'Traumas', ie: 'Inteligência Emocional', burnout: 'Burnout e Vitalidade', lideranca: 'Liderança', produtividade: 'Produtividade', comunicacao: 'Comunicação', transicao: 'Transição de Carreira', vendas: 'Vendas' };
const cp_teleEstado = { tipo: null, rowId: null, aba: 'aplicacao' };

function cp_teleTipoDaUrl(url) {
 const arq = String(url || '').split('?')[0].split('/').pop();
 return Object.keys(CP_TELE_ARQUIVOS).find(k => CP_TELE_ARQUIVOS[k] === arq) || null;
}
function cp_teleAreaVisivel() {
 const area = document.getElementById('area-telemetria-iframe');
 return !!(area && area.style.display !== 'none' && area.offsetParent !== null);
}

// Chamada por abrirTelemetriaIframe (index.html) sempre que uma telemetria abre
window.cp_telePreparar = function (url) {
 const area = document.getElementById('area-telemetria-iframe'); if (!area) return;
 cp_teleInjetarEstilo();
 if (!document.getElementById('tele-abas')) {
 const abas = document.createElement('div');
 abas.id = 'tele-abas';
 abas.innerHTML = `<button type="button" id="tele-aba-aplicacao" onclick="cp_teleMostrar('aplicacao')">Aplicação</button><button type="button" id="tele-aba-resultado" onclick="cp_teleMostrar('resultado')">Resultado e análise</button>`;
 area.insertBefore(abas, area.firstChild);
 const res = document.createElement('div');
 res.id = 'tele-resultado';
 area.appendChild(res);
 }
 cp_teleEstado.tipo = cp_teleTipoDaUrl(url);
 cp_teleEstado.rowId = null;
 const idUrl = (String(url).split('?')[1] || '').split('&').map(p => p.split('=')).find(p => p[0] === 'id');
 cp_teleEstado.menteeId = idUrl ? decodeURIComponent(idUrl[1]) : (cp_currentMentee ? cp_currentMentee.id : null);
 const abasEl = document.getElementById('tele-abas'); if (abasEl) abasEl.style.display = cp_teleEstado.tipo ? 'flex' : 'none';
 cp_teleMostrar('aplicacao');
};

window.cp_teleMostrar = function (aba) {
 cp_teleEstado.aba = aba;
 const ifr = document.getElementById('telemetria-iframe'), res = document.getElementById('tele-resultado');
 const bA = document.getElementById('tele-aba-aplicacao'), bR = document.getElementById('tele-aba-resultado');
 if (bA) bA.classList.toggle('ativa', aba === 'aplicacao');
 if (bR) bR.classList.toggle('ativa', aba === 'resultado');
 if (ifr) ifr.style.display = aba === 'aplicacao' ? 'block' : 'none';
 if (res) res.style.display = aba === 'resultado' ? 'block' : 'none';
 if (aba === 'resultado') {
 let id = cp_teleEstado.rowId;
 if (!id && cp_teleEstado.tipo && cp_teleEstado.menteeId) {
 const ult = (cp_all_sessions || []).filter(s => s && s.tipo === cp_teleEstado.tipo && String(s.mentorado_id) === String(cp_teleEstado.menteeId))
 .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 if (ult) id = ult.id;
 }
 cp_teleRenderResultado(id);
 }
 window.scrollTo(0, 0);
};

// Abre a telemetria direto no resultado de uma aplicação (usado pela Visão Geral)
window.cp_teleAbrirResultado = function (rowId) {
 const row = (cp_all_sessions || []).find(s => s && String(s.id) === String(rowId)); if (!row) return;
 const arq = CP_TELE_ARQUIVOS[row.tipo]; if (!arq || typeof window.abrirTelemetriaIframe !== 'function') return;
 window.abrirTelemetriaIframe(arq + '?id=' + encodeURIComponent(row.mentorado_id));
 cp_teleEstado.rowId = row.id; cp_teleEstado.menteeId = row.mentorado_id;
 cp_teleMostrar('resultado');
};

function cp_teleFoco(row) {
 const sess = cp_parseGenericSession(row); if (!sess) return null;
 let r = null; try { r = cp_resumoEstrategico(sess); } catch (e) {}
 if (!r) return null;
 const d = cp_parseDados(row.dados) || {};
 const doTipo = (cp_all_sessions || []).filter(s => s && s.tipo === row.tipo && String(s.mentorado_id) === String(row.mentorado_id))
 .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
 return { n: doTipo.length, ordem: doTipo.findIndex(s => String(s.id) === String(row.id)) + 1, t: new Date(row.created_at).getTime(), r, d, row, titulo: r.titulo,
 ehTelemetria: !!(d.telemetria && Array.isArray(d.telemetria.dominios)) };
}

function cp_teleRenderResultado(rowId) {
 const host = document.getElementById('tele-resultado'); if (!host) return;
 const row = rowId ? (cp_all_sessions || []).find(s => s && String(s.id) === String(rowId)) : null;
 const nomeTel = CP_TELE_NOMES[cp_teleEstado.tipo] ? 'Telemetria de ' + CP_TELE_NOMES[cp_teleEstado.tipo] : 'Telemetria';
 if (!row) {
 host.innerHTML = `<div class="ctr-vazio"><div class="ctr-vazio-t">${cp_esc(nomeTel)}</div>Preencha a aba <b>Aplicação</b> e clique em <b>Salvar e gerar análise</b>. O resultado por domínio, a análise do Agente Mentóra, os pontos de atenção, as perguntas para a próxima sessão e o PDI aparecem aqui.</div>`;
 return;
 }
 const mentee = (cp_mentees || []).find(m => String(m.id) === String(row.mentorado_id));
 if (!mentee) { host.innerHTML = '<div class="ctr-vazio">Este mentorado não está na sua lista.</div>'; return; }
 cp_teleEstado.rowId = row.id; cp_teleEstado.menteeId = mentee.id;
 cp_currentMentee = mentee;
 cp_vgFoco = row.id; cp_vgFocoMentee = mentee.id; cp_vgPdiEdicao = cp_vgPdiEdicao && String(cp_vgFocoMentee) === String(mentee.id) ? cp_vgPdiEdicao : null;
 const foco = cp_teleFoco(row);
 if (!foco) { host.innerHTML = '<div class="ctr-vazio">Não foi possível ler esta aplicação.</div>'; return; }
 const analises = cp_vgAnalises(row.id), an = analises[0] || null, sec = cp_vgSecoes(an);
 const acoesAgente = cp_vgAcoesAgente(foco, sec);
 const r = foco.r, id = cp_esc(row.id);
 const mat = r.maturidade;
 const corMat = v => v >= 61 ? '#10b981' : v >= 41 ? '#f59e0b' : '#ef4444';
 const barras = (mat ? mat.itens.map(i => ({ n: i.nome, v: i.maturidade, c: corMat(i.maturidade) })) : ((r.barras && r.barras.itens) || []).map(i => ({ n: i.name, v: Number(i.v) || 0, c: i.color })))
 .map(b => `<div class="cpa-bar"><div class="cpa-bar-top"><span>${cp_esc(b.n)}</span><b>${Math.round(b.v)}%</b></div><div class="cpa-trilho"><div style="width:${Math.max(0, Math.min(100, b.v))}%; background:${b.c};"></div></div></div>`).join('');
 const T = foco.d.telemetria || {};
 const respostas = (T.dominios || []).map(dm => `<div class="cpa-dom"><div class="cpa-dom-t">${cp_esc(dm.titulo)}</div>${(dm.indicadores || []).map(i => `<div class="cpa-resp"><span>${cp_esc(i.nome)}</span><b>${cp_esc(i.valor)}/100</b></div>`).join('')}${dm.obs ? `<div class="cpa-resp"><span><i>${cp_esc(dm.obs)}</i></span></div>` : ''}</div>`).join('');
 const extras = Object.assign({}, T.extras || {});
 const extrasHtml = Object.keys(extras).length ? `<div class="cpa-dom"><div class="cpa-dom-t">Destaques</div>${Object.keys(extras).map(k => `<div class="cpa-resp"><span>${cp_esc(k)}</span><b>${cp_esc(extras[k])}</b></div>`).join('')}</div>` : '';
 // Pontos de atenção = (1) indicadores em zona de atenção pelos números; (2) os pontos que o
 // Agente Mentóra apontou na análise; (3) se nada estiver abaixo do limite, os domínios mais baixos
 // desta aplicação, para o mentor sempre saber onde olhar primeiro.
 const alertas = (r.alertas || []);
 const daIA = (sec && Array.isArray(sec.atencao) ? sec.atencao : []).filter(Boolean).slice(0, 5);
 let atencao = '';
 if (alertas.length) {
 atencao += '<div class="ctr-sub-rot">Pelos números desta aplicação</div>' + alertas.map(a => `<div class="ctr-alerta ${a.nivel === 'Crítico' ? 'crit' : ''}"><b>${cp_esc(a.nivel || 'Atenção')}</b><span>${cp_esc(a.l)}${a.v != null ? ` · ${Math.round(a.v)}%` : ''}</span></div>`).join('');
 } else if (mat && mat.itens && mat.itens.length) {
 const baixos = mat.itens.slice().sort((x, y) => x.maturidade - y.maturidade).filter(i => i.maturidade < 70).slice(0, 3);
 atencao += '<div class="ctr-sub-rot">Pelos números desta aplicação</div>'
 + (baixos.length
 ? `<div class="cpv-vazio" style="margin-bottom:8px;">Nenhum domínio abaixo de 40%. Os que merecem mais atenção agora:</div>` + baixos.map(i => `<div class="ctr-alerta leve"><b>Observar</b><span>${cp_esc(i.nome)} · ${Math.round(i.maturidade)}%</span></div>`).join('')
 : '<div class="cpv-vazio">Todos os domínios estão em 70% ou mais nesta aplicação.</div>');
 }
 if (daIA.length) atencao += '<div class="ctr-sub-rot" style="margin-top:12px;">Apontados pelo Agente Mentóra</div>' + daIA.map(t => `<div class="ctr-alerta leve"><b>Agente</b><span>${cp_esc(t)}</span></div>`).join('');
 else if (!an) atencao += '<div class="cpv-vazio" style="margin-top:12px;">Os pontos de atenção do Agente Mentóra aparecem aqui depois que a análise for gerada.</div>';
 if (!atencao) atencao = '<div class="cpv-vazio">Nenhum ponto de atenção registrado nesta aplicação.</div>';
 const btnTxt = an ? 'Atualizar análise e PDI' : 'Gerar análise e PDI com Agente Mentóra';

 const acoesPagina = `<div class="ctr-acoes"><button type="button" class="ctr-btn-sec" onclick="cp_teleBaixarPDF()">Baixar PDF</button><button type="button" class="ctr-btn" onclick="cp_teleVoltarProntuario()">Salvar e voltar para o prontuário do mentorado</button></div>`;
 host.innerHTML = `
 <div class="ctr-pagina">
 <div class="ctr-topo-linha"><div class="ctr-trilha">${cp_esc(r.titulo)} › ${cp_esc(mentee.nome || 'Mentorado')}</div>${acoesPagina}</div>
 <div class="ctr-cab">
 <div><div class="ctr-tit">${cp_esc(r.titulo)}</div>
 <div class="ctr-sub">Aplicada em ${cp_esc(cp_vgData(foco.t))} · ${foco.ordem}ª aplicação${an ? ' · análise gerada em ' + cp_esc(cp_vgData(an.created_at, true)) : ''}</div></div>
 <div class="ctr-cab-dir">
 ${mat ? `<div class="ctr-mat"><b>${mat.media}%</b><span>maturidade geral · ${cp_esc(mat.geral && mat.geral.nome || '')}</span></div>` : ''}
 <button type="button" class="cpc-ia-btn cpv-btn-ia" id="cpt-btn-${id}" onclick="cp_gerarAnaliseTelemetria('${id}')">${btnTxt}</button>
 </div>
 </div>
 ${cp_vgAvisos(foco)}
 <div class="ctr-card"><div class="ctr-rot">Resultado por domínio</div><div class="cpa-barras">${barras}</div>
 ${respostas || extrasHtml ? `<details class="cpa-det"><summary>Ver todas as respostas</summary><div class="cpa-resp-grid">${respostas}${extrasHtml}</div></details>` : ''}</div>
 <div class="cp-panel cpv-painel" id="cpv-analise"></div>
 <div class="ctr-grid">
 <div class="cp-panel"><div class="cp-panel-title">Pontos de atenção</div>${atencao}</div>
 <div class="cp-panel mpdf-proxima" data-incluir="0"><div class="cp-panel-title mpdf-rot-linha"><span>Perguntas para a próxima sessão</span>${window.MentoraPDF ? MentoraPDF.botao() : ''}</div><div id="cp-insights-mentor"></div></div>
 </div>
 <div class="ctr-grid">
 <div class="cp-panel cpv-painel" id="cpv-pdi-agente"></div>
 <div class="cp-panel cpv-painel" id="cpv-pdi-mentor"></div>
 </div>
 <div class="ctr-rodape">${acoesPagina}</div>
 </div>`;
 cp_vgAnalise(foco, an, sec, analises.slice(1));
 cp_vgPdiAgente(foco, acoesAgente);
 cp_vgPdiMentor(foco, acoesAgente);
 cp_vgInsights(foco, sec);
}
window.cp_teleRenderResultado = cp_teleRenderResultado;

// "Salvar e voltar para o prontuário do mentorado": tudo da página já fica salvo no banco ao ser gerado;
// se o PDI do mentor estiver em edição, salva antes de sair. Depois abre a Visão Geral do mentorado.
window.cp_teleVoltarProntuario = async function () {
 const id = cp_teleEstado.menteeId || (cp_currentMentee && cp_currentMentee.id);
 // PDI do mentor em edição: se tem alguma ação escrita, salva antes de sair;
 // se está em branco, só descarta (o mentor nunca é obrigado a escrever para sair).
 if (cp_vgPdiEdicao) {
 const temAcao = (cp_vgPdiEdicao.acoes || []).some(x => String(x.acao || '').trim());
 if (temAcao && typeof window.cp_vgPdiSalvar === 'function') {
 await window.cp_vgPdiSalvar();
 if (cp_vgPdiEdicao) return; // a gravação falhou (o aviso já apareceu): fica na página
 } else {
 cp_vgPdiEdicao = null;
 }
 }
 cp_teleEstado.aba = 'aplicacao';
 const area = document.getElementById('area-telemetria-iframe'); if (area) area.style.display = 'none';
 if (typeof irParaGestaoMentorados === 'function') irParaGestaoMentorados();
 if (!id || !(cp_mentees || []).some(m => String(m.id) === String(id))) return;
 cp_openProfile(id);
 cp_switchTab('visao');
 window.scrollTo(0, 0);
};

// Baixar PDF da página de resultado (03/10/2026): documento próprio, compacto, em uma coluna.
// Não leva a lista "Ver todas as respostas", botões, campos nem análises anteriores.
// As perguntas para a próxima sessão só entram se o mentor clicar em "Incluir no PDF" (ou escolher no lembrete).
window.cp_teleBaixarPDF = async function () {
 const res = document.getElementById('tele-resultado'); if (!res || !res.innerHTML.trim()) return;
 if (!window.MentoraPDF) { alert('O gerador de PDF não carregou. Atualize a página e tente de novo.'); return; }
 const P = window.MentoraPDF;
 const escolha = await P.confirmar(res);
 if (!escolha) return;
 const incluir = escolha === 'incluir';
 const row = (cp_all_sessions || []).find(s => s && String(s.id) === String(cp_teleEstado.rowId));
 const mentee = row ? (cp_mentees || []).find(m => String(m.id) === String(row.mentorado_id)) : null;
 const pega = sel => res.querySelector(sel);
 const titulo = pega('.ctr-tit') ? pega('.ctr-tit').textContent.trim() : 'Telemetria';
 const sub = pega('.ctr-sub') ? pega('.ctr-sub').textContent.trim() : '';
 const mat = pega('.ctr-mat') ? [...pega('.ctr-mat').children].map(x => x.textContent.trim()).filter(Boolean).join(' ') : '';
 const limpo = el => el ? P.limparClone(el.cloneNode(true), incluir).innerHTML.trim() : '';
 const sec = (rot, html, longa) => html ? `<div class="pdf-sec${longa ? ' longa' : ''}">${rot ? `<div class="pdf-rot">${rot}</div>` : ''}${html}</div>` : '';
 // resultado por domínio: só as barras
 const barras = pega('.ctr-card .cpa-barras') ? pega('.ctr-card .cpa-barras').outerHTML : '';
 // análise do Agente (sem "Análises anteriores")
 const anEl = document.getElementById('cpv-analise');
 let analise = '';
 if (anEl) { const c = anEl.cloneNode(true); c.querySelectorAll('.cpv-cab').forEach(x => x.remove()); analise = P.limparClone(c, incluir).innerHTML.trim(); }
 // pontos de atenção e perguntas: o painel inteiro, sem o título (vira o rótulo da seção)
 const paineis = [...res.querySelectorAll('.ctr-grid .cp-panel')];
 const corpoPainel = p => { if (!p) return ''; const c = p.cloneNode(true); c.querySelectorAll('.cp-panel-title').forEach(x => x.remove()); return P.limparClone(c, true).innerHTML.trim(); };
 const pAtencao = paineis.find(p => !p.classList.contains('mpdf-proxima') && /Pontos de aten/i.test((p.querySelector('.cp-panel-title') || {}).textContent || ''));
 const pPerg = res.querySelector('.cp-panel.mpdf-proxima');
 const semCab = id => { const el = document.getElementById(id); if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('.cpv-cab, .cpv-acoes-bar, .cpv-anteriores, .cpv-ed-linha').forEach(x => x.remove()); c.querySelectorAll('.mcb-pdi-cab').forEach(x => x.remove()); return P.limparClone(c, incluir).innerHTML.trim(); };
 const temTexto = h => h && h.replace(/<[^>]+>/g, '').trim().length > 3;
 const pdiAg = semCab('cpv-pdi-agente'), pdiMe = semCab('cpv-pdi-mentor');
 const corpo = sec('Resultado por domínio' + (mat ? ' · ' + P.esc(mat) : ''), barras)
  + sec('Análise com Agente Mentóra', temTexto(analise) ? analise : '', true)
  + sec('Pontos de atenção', corpoPainel(pAtencao))
  + (incluir && pPerg ? sec('Perguntas para a próxima sessão', corpoPainel(pPerg)) : '')
  + sec('PDI do Agente Mentóra', temTexto(pdiAg) ? pdiAg : '', true)
  + sec('PDI do mentor', temTexto(pdiMe) && !/Monte o seu pr[oó]prio PDI/.test(pdiMe) ? pdiMe : '', true);
 const subt = [mentee && mentee.nome ? '<b>Mentorado:</b> ' + P.esc(mentee.nome) : '', P.esc(sub)].filter(Boolean).join(' · ');
 const tituloOrig = document.title;
 document.title = 'Mentora - ' + titulo + (mentee && mentee.nome ? ' - ' + mentee.nome : '') + ' - ' + new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
 P.imprimirDocumento(titulo, subt, corpo, document.title);
 setTimeout(() => { document.title = tituloOrig; }, 4000);
};

// Mapa de maturidade da aplicação: card de Maturidade Geral (nível 1 a 5) + Radar de maturidade
// com os domínios DESTA telemetria (cada nicho tem os seus domínios e respostas).
function cp_teleMapaMaturidade(mat, op) {
 op = op || {};
 const g = mat.geral || cp_nivelMaturidade(mat.media);
 const seg = [1, 2, 3, 4, 5].map(i => `<i class="${i <= (g.n || 0) ? 'on' : ''}"></i>`).join('');
 const itens = (mat.itens || []).slice(0, 10);
 let radar = '<div class="cpv-vazio">O radar precisa de pelo menos 3 domínios.</div>';
 if (itens.length >= 3) {
 const W = 560, H = 360, cx = 280, cy = 182, R = 112, n = itens.length;
 const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;
 const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
 const poli = r => itens.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
 const grade = [0.2, 0.4, 0.6, 0.8, 1].map(f => `<polygon points="${poli(R * f)}" fill="none" stroke="#E2E8F0" stroke-dasharray="4 4"></polygon>`).join('');
 const eixos = itens.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#EEF0F4"></line>`; }).join('');
 const valores = itens.map((it, i) => pt(i, R * Math.max(0, Math.min(100, it.maturidade)) / 100));
 const forma = `<polygon points="${valores.map(v => v.map(x => x.toFixed(1)).join(',')).join(' ')}" fill="rgba(91,45,163,.14)" stroke="#5B2DA3" stroke-width="2.4" stroke-linejoin="round"></polygon>`;
 const pontos = valores.map(([x, y], i) => {
 const [lx, ly] = pt(i, R * Math.max(0, Math.min(100, itens[i].maturidade)) / 100 + 17);
 return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" stroke="#5B2DA3" stroke-width="2.4"></circle><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#5B2DA3">${Math.round(itens[i].maturidade)}%</text>`;
 }).join('');
 const rotulos = itens.map((it, i) => {
 const [x, y] = pt(i, R + 34), c = Math.cos(ang(i));
 const anc = Math.abs(c) < 0.2 ? 'middle' : (c > 0 ? 'start' : 'end');
 const nome = String(it.nome || ''), palavras = nome.split(' ');
 let l1 = nome, l2 = '';
 if (nome.length > 22 && palavras.length > 1) {
 // quebra no espaço mais próximo do meio do nome
 let melhor = 1, dif = Infinity;
 for (let k = 1; k < palavras.length; k++) { const d = Math.abs(palavras.slice(0, k).join(' ').length - nome.length / 2); if (d < dif) { dif = d; melhor = k; } }
 l1 = palavras.slice(0, melhor).join(' '); l2 = palavras.slice(melhor).join(' ');
 }
 const y0 = y + (l2 ? -3 : 4) + (Math.sin(ang(i)) < -0.5 ? -8 : 0);
 return `<text x="${x.toFixed(1)}" y="${y0.toFixed(1)}" text-anchor="${anc}" font-size="12.5" fill="#64748B">${cp_esc(l1)}${l2 ? `<tspan x="${x.toFixed(1)}" dy="15">${cp_esc(l2)}</tspan>` : ''}</text>`;
 }).join('');
 radar = `<svg viewBox="0 0 ${W} ${H}" class="ctr-radar" role="img" aria-label="Radar de maturidade por domínio">${grade}${eixos}${forma}${pontos}${rotulos}</svg>`;
 }
 return `<div class="ctr-mapa">
 <div class="ctr-card ctr-mapa-card"><div class="ctr-mat-box">
 <div class="ctr-mat-rot">Maturidade geral</div>
 <div class="ctr-mat-num">${mat.media}<span>%</span></div>
 <div class="ctr-mat-pill">${cp_esc(g.nome || '')}</div>
 <div class="ctr-mat-seg">${seg}<small>Nível ${g.n || '-'} de 5</small></div>
 <div class="ctr-mat-desc">${cp_esc(g.desc ? g.desc.charAt(0).toUpperCase() + g.desc.slice(1) + (/[.!]$/.test(g.desc) ? '' : '.') : '')}</div>
 ${op.cardSub ? `<div class="ctr-mat-sub">${op.cardSub}</div>` : ''}
 </div></div>
 <div class="ctr-card ctr-mapa-card"><div class="ctr-rot" style="text-align:center;color:#94A3B8;">Radar de maturidade</div>${radar}${op.radarSub ? `<div class="ctr-mat-sub" style="text-align:center;">${op.radarSub}</div>` : ''}</div>
 </div>`;
}

function cp_teleInjetarEstilo() {
 if (document.getElementById('ctr-estilo')) return;
 const st = document.createElement('style'); st.id = 'ctr-estilo';
 st.textContent = `
 #tele-abas{display:flex;gap:6px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:6px;margin-bottom:10px;width:max-content;max-width:100%}
 #tele-abas button{border:none;background:transparent;padding:9px 18px;border-radius:9px;font-size:14px;font-weight:600;color:#64748B;cursor:pointer;font-family:inherit}
 #tele-abas button.ativa{background:#5B2DA3;color:#fff}
 #area-telemetria-iframe #telemetria-iframe{height:calc(100% - 64px) !important}
 #tele-resultado{display:none;padding:4px 2px 40px}
 .ctr-pagina{max-width:1180px}
 .ctr-trilha{font-size:12px;color:#94A3B8}
 .ctr-topo-linha{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
 .ctr-acoes{display:flex;gap:10px;flex-wrap:wrap}
 .ctr-btn{background:#5B2DA3;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
 .ctr-btn-sec{background:#fff;color:#5B2DA3;border:1.5px solid #5B2DA3;border-radius:10px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
 .ctr-rodape{display:flex;justify-content:flex-end;margin-top:4px}
 .ctr-mapa{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem;margin-bottom:1.5rem}
 .ctr-mapa .ctr-mapa-card{margin-bottom:0;display:flex;flex-direction:column;justify-content:center}
 .ctr-mat-box{background:#F7F4FE;border:1px solid #E4DDF7;border-radius:16px;padding:22px 20px;text-align:center}
 .ctr-mat-rot{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748B}
 .ctr-mat-num{font-size:72px;font-weight:800;color:#5B2DA3;line-height:1.05;margin-top:6px}
 .ctr-mat-num span{font-size:34px;font-weight:600;color:#64748B;margin-left:4px}
 .ctr-mat-pill{display:inline-block;margin-top:8px;padding:6px 20px;border-radius:999px;background:#EDE9FE;border:1px solid #DDD6FE;color:#1B2559;font-weight:700;font-size:16px}
 .ctr-mat-seg{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px}
 .ctr-mat-seg i{display:inline-block;width:28px;height:7px;border-radius:6px;background:#E4DDF7}
 .ctr-mat-seg i.on{background:#5B2DA3}
 .ctr-mat-seg small{font-size:13px;color:#94A3B8;margin-left:8px}
 .ctr-mat-desc{font-size:14.5px;color:#475569;margin-top:10px}
 .ctr-radar{width:100%;height:auto;display:block}
 .ctr-mat-sub{font-size:12.5px;color:#94A3B8;margin-top:8px;line-height:1.5}
 @media (max-width:760px){.ctr-mapa{grid-template-columns:1fr}}
 @media print{
 body.ctr-imprimindo *{visibility:hidden !important}
 body.ctr-imprimindo #tele-resultado,body.ctr-imprimindo #tele-resultado *{visibility:visible !important}
 body.ctr-imprimindo #tele-resultado{position:absolute;left:0;top:0;width:100%;display:block !important;padding:0}
 body.ctr-imprimindo #tele-resultado button,body.ctr-imprimindo .ctr-acoes,body.ctr-imprimindo .ctr-rodape,body.ctr-imprimindo .mcb-btn-dever{display:none !important}
 body.ctr-imprimindo .ctr-grid{grid-template-columns:1fr 1fr}
 body.ctr-imprimindo *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 }
 .ctr-cab{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 22px;margin-bottom:1.25rem}
 .ctr-tit{font-size:20px;font-weight:700;color:#1B2559}
 .ctr-sub{font-size:13px;color:#94A3B8;margin-top:3px}
 .ctr-cab-dir{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
 .ctr-mat{text-align:right}.ctr-mat b{display:block;font-size:26px;color:#5B2DA3;line-height:1}.ctr-mat span{font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.4px}
 .ctr-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 22px;margin-bottom:1.5rem}
 .ctr-rot{font-size:12px;font-weight:700;color:#5B2DA3;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px}
 .ctr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem;margin-bottom:1.5rem}
 .ctr-grid .cp-panel,.ctr-grid .cpv-painel{margin-bottom:0}
 .ctr-alerta{display:flex;gap:10px;align-items:baseline;padding:9px 12px;border-radius:10px;background:#FFFBEB;border:1px solid #FDE68A;margin-bottom:8px;font-size:13.5px;color:#334155}
 .ctr-alerta b{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#92400E;flex-shrink:0}
 .ctr-alerta.crit{background:#FEF2F2;border-color:#FECACA}.ctr-alerta.crit b{color:#B91C1C}
 .ctr-alerta.leve{background:#F8F6FE;border-color:#E9E3FF}.ctr-alerta.leve b{color:#5B2DA3}
 .ctr-sub-rot{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94A3B8;margin-bottom:8px}
 .ctr-grid{align-items:start}
 .ctr-vazio{background:#fff;border:1px dashed #CBD5E1;border-radius:16px;padding:40px 28px;text-align:center;color:#64748B;font-size:14px;line-height:1.6;max-width:760px}
 .ctr-vazio-t{font-size:18px;font-weight:700;color:#1B2559;margin-bottom:8px}
 @media (max-width:760px){.ctr-grid{grid-template-columns:1fr}}`;
 document.head.appendChild(st);
}

// ══════════════════════════════════════════════════════════════════════
// VISÃO GERAL = DASHBOARD DO CONJUNTO (02/10/2026)
// Sem PDI, sem dever de casa, sem seletor e sem lista repetida. A "Nota do Agente Mentóra"
// (Edge Function agente-visao-geral) é gerada sozinha ao abrir a Visão Geral SÓ quando há dado
// novo desde a última nota; sem novidade, mostra a nota salva e não gasta análise.
// ══════════════════════════════════════════════════════════════════════
const CP_VG_TIPOS_PROPRIOS = ['visao_geral_nota', 'visao_geral_nota_mentor', 'engajamento_pref', 'engajamento_alerta'];
const cp_vgNotaEstado = { gerando: {}, falhou: {} };
// A atualização AUTOMÁTICA da nota acontece no máximo 1 vez a cada 24 h por mentorado (protege a cota
// de análises do plano). Dentro desse prazo, o mentor pode atualizar na hora pelo botão "Atualizar agora".
const CP_VG_NOTA_INTERVALO_H = 24;

function cp_vgTelemetrias(menteeId) {
 const out = {};
 (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && CP_TELE_ARQUIVOS[s.tipo])
 .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(row => {
 const f = cp_teleFoco(row); if (!f || !f.r.maturidade) return;
 (out[row.tipo] = out[row.tipo] || []).push({ row, t: f.t, mat: f.r.maturidade.media, foco: f });
 });
 return out;
}

function cp_vgDadosParaIA(mentee) {
 const id = mentee.id;
 const tel = cp_vgTelemetrias(id);
 const fmt = t => new Date(t).toLocaleDateString('pt-BR');
 const partes = [`Mentorado: ${String(mentee.nome || '').trim().split(/\s+/)[0]} · método/nicho: ${mentee.metodo || 'Geral'}`];
 const tl = Object.keys(tel);
 partes.push('\nTELEMETRIAS (maturidade 0 a 100; nos domínios de carga, maior maturidade = menos carga):');
 if (!tl.length) partes.push('(nenhuma telemetria aplicada)');
 tl.forEach(tipo => {
 const apps = tel[tipo], ult = apps[apps.length - 1];
 const doms = (ult.foco.r.maturidade.itens || []).map(i => `${i.nome} ${Math.round(i.maturidade)}`).join('; ');
 const alert = (ult.foco.r.alertas || []).slice(0, 5).map(a => a.l).join('; ');
 partes.push(`- ${ult.foco.r.titulo}: ${apps.map(a => fmt(a.t) + ' = ' + a.mat).join(' → ')}. Domínios na última: ${doms}.${alert ? ' Em atenção: ' + alert + '.' : ''}`);
 const an = cp_vgAnalises(ult.row.id)[0];
 if (an) {
 const s = cp_vgSecoes(an) || {};
 partes.push(`  Análise do Agente (${fmt(an.created_at)}): ${String(s.leitura || '').slice(0, 500)} ${s.direcionamento ? 'Direcionamento: ' + String(s.direcionamento).slice(0, 250) : ''}`);
 }
 });
 const ferr = cp_vgAvaliacoes(id).filter(a => !a.ehTelemetria);
 partes.push('\nFERRAMENTAS:');
 partes.push(ferr.length ? ferr.map(a => `- ${a.titulo} (${fmt(a.t)}): ${String(a.r.resumo || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n') : '(nenhuma ferramenta aplicada)');
 // Análise do Mentor: registros manuais (teste manual com domínios + percepções), com peso alto na leitura
 const regs = cp_vgRegistrosMentor(id).slice(-6);
 partes.push('\nANÁLISE DO MENTOR (registros manuais feitos pelo próprio mentor na sessão; considere com peso alto e compare com as telemetrias):');
 partes.push(regs.length ? regs.map(r => {
  const doms = r.doms.length ? ' Domínios avaliados pelo mentor (0 a 100): ' + r.doms.map(d => `${d.nome} ${d.v}`).join('; ') + '.' : '';
  const tx = (rot, v) => v ? ` ${rot}: ${String(v).replace(/\s+/g, ' ').trim().slice(0, 500).replace(/[.!?]+$/, '')}.` : '';
  return `- [${fmt(r.t)}] Nicho: ${r.nichoNome || r.nicho || 'Geral'}.${doms}${tx('Percepções', r.percepcoes)}${tx('Anotações', r.anotacoes)}${tx('Caderno', r.caderno)}${tx('Plano de ação', r.plano)}${r.tags.length ? ' Marcadores: ' + r.tags.join(', ') + '.' : ''}`;
 }).join('\n') : '(nenhum registro manual)');
 // Bloco de notas do prontuário (última versão) e caderno
 const blocos = ['anotacao', 'caderno'].map(tp => { const u = cp_ultimaSessao(id, tp); const t = u ? String((cp_parseDados(u.dados) || {}).texto || '').replace(/\s+/g, ' ').trim() : ''; return t ? `- ${tp === 'anotacao' ? 'Bloco de notas' : 'Caderno'} (${fmt(u.created_at)}): ${t.slice(0, 900)}` : ''; }).filter(Boolean);
 partes.push('\nANOTAÇÕES DO MENTOR:');
 partes.push(blocos.length ? blocos.join('\n') : '(nenhuma anotação)');
 const nm = cp_ultimaSessao(id, 'visao_geral_nota_mentor');
 const nmTxt = nm ? String((cp_parseDados(nm.dados) || {}).texto || '').trim() : '';
 partes.push('\nNOTA DO MENTOR SOBRE O CONJUNTO:\n' + (nmTxt ? nmTxt.slice(0, 1200) : '(sem nota)'));
 try {
 const te = cp_engajTelemetria(id);
 partes.push(`\nENGAJAMENTO: ${te.nivel ? `índice de risco de abandono ${te.risco.pontos}/100 (${te.nivel.nome}); score ${te.hoje.score}; sinais: ${te.risco.sinais.slice(0, 3).map(x => x.texto).join('; ') || 'nenhum'}` : 'sem dados'}; sessões realizadas: ${(te.sessDias || []).length}.`);
 } catch (e) {}
 const linha = cp_filterTimelineSessions(cp_all_sessions, id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-20)
 .map(s => { let t = s.tipo; try { const i = cp_getTelemetryInfo(cp_parseGenericSession(s)); if (i && i.title) t = i.title; } catch (e) {} return `${fmt(s.created_at)} ${t}`; });
 partes.push('\nLINHA DO TEMPO (últimos registros): ' + (linha.length ? linha.join(' | ') : '(vazia)'));
 return partes.join('\n').slice(0, 11500);
}

function cp_vgQuando(s) {
 const d = cp_parseDados(s.dados) || {};
 return Math.max(new Date(s.created_at).getTime() || 0, new Date(d.atualizadoEm || 0).getTime() || 0, new Date(d.salvoEm || 0).getTime() || 0);
}
function cp_vgUltimoDadoRelevante(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && !CP_VG_TIPOS_PROPRIOS.includes(s.tipo))
 .reduce((m, s) => Math.max(m, cp_vgQuando(s)), 0);
}
// Último registro feito pelo mentor (Análise do Mentor, bloco de notas, caderno)
function cp_vgUltimoDoMentor(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && ['observacao_manual', 'anotacao', 'caderno'].includes(s.tipo))
 .reduce((m, s) => Math.max(m, cp_vgQuando(s)), 0);
}
// Registros manuais da aba Análise do Mentor, do mais antigo para o mais novo
function cp_vgRegistrosMentor(menteeId) {
 return (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === String(menteeId) && s.tipo === 'observacao_manual')
 .map(s => {
  const d = cp_parseDados(s.dados) || {};
  const cfg = (typeof CP_NICHOS_CONFIG !== 'undefined' && CP_NICHOS_CONFIG[d.nicho]) || null;
  const nomes = {}; (cfg ? cfg.dominios : []).forEach(x => { nomes[x.key] = x.name; });
  const domsObj = (d.domains && typeof d.domains === 'object') ? d.domains : ((d.scores && d.scores.domains) || {});
  const doms = Object.keys(domsObj).map(k => ({ nome: nomes[k] || k, v: Math.round(Number(domsObj[k]) || 0) }));
  const tags = Array.isArray(d.tags) ? d.tags.map(String).filter(Boolean) : [];
  return { row: s, t: cp_vgQuando(s), nicho: d.nicho, nichoNome: d.nichoNome || (cfg && cfg.nome) || '', doms,
   percepcoes: d.analiseMentor || d.mentorNotes || '', anotacoes: typeof d.anotacoes === 'string' ? d.anotacoes : '', caderno: typeof d.caderno === 'string' ? d.caderno : '',
   plano: typeof d.planoAcao === 'string' ? d.planoAcao : '', tags };
 }).map(r => { const igual = (a, b) => String(a || '').trim() && String(a || '').trim() === String(b || '').trim(); if (igual(r.anotacoes, r.percepcoes)) r.anotacoes = ''; if (igual(r.caderno, r.percepcoes) || igual(r.caderno, r.anotacoes)) r.caderno = ''; return r;
 }).sort((a, b) => a.t - b.t);
}

async function cp_vgGerarNota(mentee, base) {
 const id = String(mentee.id);
 if (cp_vgNotaEstado.gerando[id]) return;
 cp_vgNotaEstado.gerando[id] = true;
 try {
 const { data, error } = await window.supabaseClient.functions.invoke('agente-visao-geral', { body: { mentorado_id: id, nome: mentee.nome || '', dados: cp_vgDadosParaIA(mentee) } });
 if (error) {
 let msg = error.message || 'erro';
 try { const ctx = error.context && await error.context.json(); if (ctx && ctx.error) msg = ctx.error; } catch (e) {}
 throw new Error(msg);
 }
 const res = data && data.resultado;
 if (!res || !res.nota) throw new Error('O Agente Mentóra não retornou a nota.');
 const dados = Object.assign({}, res, { base, geradoEm: new Date().toISOString() });
 const { data: ins, error: ei } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{ mentorado_id: id, tipo: 'visao_geral_nota', dados }]).select();
 if (ei) throw new Error('a nota foi gerada, mas não pôde ser salva (' + ei.message + ')');
 cp_all_sessions.unshift((ins && ins[0]) || { mentorado_id: id, tipo: 'visao_geral_nota', dados, created_at: dados.geradoEm });
 delete cp_vgNotaEstado.falhou[id];
 } catch (e) {
 cp_vgNotaEstado.falhou[id] = { base, msg: e.message || String(e) };
 } finally {
 delete cp_vgNotaEstado.gerando[id];
 if (cp_currentMentee && String(cp_currentMentee.id) === id) cp_vgDashboard();
 }
}
window.cp_vgAtualizarNotaAgora = function () {
 if (!cp_currentMentee) return;
 const id = String(cp_currentMentee.id);
 if (cp_vgNotaEstado.gerando[id]) return;
 delete cp_vgNotaEstado.falhou[id];
 cp_vgGerarNota(cp_currentMentee, cp_vgUltimoDadoRelevante(id));
 cp_vgDashboard();
};
window.cp_vgTentarNotaDeNovo = function () {
 if (!cp_currentMentee) return;
 delete cp_vgNotaEstado.falhou[String(cp_currentMentee.id)];
 cp_vgDashboard();
};

window.cp_vgSalvarNotaMentor = async function () {
 if (!cp_currentMentee || !window.supabaseClient) return;
 const el = document.getElementById('cpvd-nota-mentor'), btn = document.getElementById('cpvd-nota-btn');
 const texto = el ? el.value.trim() : '';
 if (!texto) { alert('Escreva a sua nota antes de salvar.'); return; }
 if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
 const { data, error } = await window.supabaseClient.from('Sessoes_Mentoria').insert([{ mentorado_id: cp_currentMentee.id, tipo: 'visao_geral_nota_mentor', dados: { texto, salvoEm: new Date().toISOString() } }]).select();
 if (btn) { btn.disabled = false; btn.textContent = 'Salvar nota'; }
 if (error) { alert('Não foi possível salvar a nota. Tente novamente.\n\nDetalhe: ' + error.message); return; }
 cp_all_sessions.unshift((data && data[0]) || { mentorado_id: cp_currentMentee.id, tipo: 'visao_geral_nota_mentor', dados: { texto }, created_at: new Date().toISOString() });
 const ok = document.getElementById('cpvd-nota-ok'); if (ok) { ok.textContent = 'Nota salva. O Agente Mentóra considera esta nota na próxima atualização.'; }
};

function cp_vgDashboard() {
 const host = document.getElementById('cpvd'); if (!host || !cp_currentMentee) return;
 cp_vgDashEstilo();
 const m = cp_currentMentee, id = String(m.id);
 const tel = cp_vgTelemetrias(id);
 const tipos = Object.keys(tel);
 const ferr = cp_vgAvaliacoes(id).filter(a => !a.ehTelemetria);
 const fmt = t => new Date(t).toLocaleDateString('pt-BR');
 const sinal = v => v > 0 ? `+${v}` : `${v}`;

 // KPIs
 const ultimas = tipos.map(t => tel[t][tel[t].length - 1].mat);
 const consolidada = ultimas.length ? Math.round(ultimas.reduce((a, b) => a + b, 0) / ultimas.length) : null;
 const comEvol = tipos.filter(t => tel[t].length > 1);
 const evol = comEvol.length ? Math.round(comEvol.reduce((s, t) => s + (tel[t][tel[t].length - 1].mat - tel[t][0].mat), 0) / comEvol.length) : null;
 const registros = (cp_all_sessions || []).filter(s => s && String(s.mentorado_id) === id && ['anotacao', 'observacao_manual', 'caderno'].includes(s.tipo));
 const ultReg = registros.reduce((mx, s) => Math.max(mx, new Date(s.created_at).getTime() || 0), 0);
 const diasReg = ultReg ? Math.max(0, Math.round((Date.now() - ultReg) / 86400000)) : null;

 // Nota do Agente: automática quando há dado novo
 const notaRow = cp_ultimaSessao(id, 'visao_geral_nota');
 const nota = notaRow ? (cp_parseDados(notaRow.dados) || {}) : null;
 const base = cp_vgUltimoDadoRelevante(id);
 const regsMentor = cp_vgRegistrosMentor(id);
 const temAvaliacao = tipos.length + ferr.length + regsMentor.length > 0;
 const desatualizada = !nota || (Number(nota.base) || 0) < base;
 const falha = cp_vgNotaEstado.falhou[id];
 const gerando = !!cp_vgNotaEstado.gerando[id];
 // Só gera quando a Visão Geral está de fato na tela (abrir a ficha em outra aba não gasta análise)
 const abaVG = document.getElementById('cp-tab-content-visao');
 const vgNaTela = !!(abaVG && abaVG.offsetParent !== null && getComputedStyle(abaVG).display !== 'none');
 const geradaEm = nota && nota.geradoEm ? new Date(nota.geradoEm).getTime() : 0;
 const proximaAuto = geradaEm ? geradaEm + CP_VG_NOTA_INTERVALO_H * 3600000 : 0;
 const dentroDoIntervalo = !!nota && Date.now() < proximaAuto;
 // Registro novo do próprio mentor (Análise do Mentor, bloco de notas, caderno) atualiza a nota ao abrir a
 // Visão Geral, sem esperar as 24 h: o mentor quer ver as suas percepções consideradas na leitura.
 const novoDoMentor = !!nota && cp_vgUltimoDoMentor(id) > (Number(nota.base) || 0);
 if (vgNaTela && temAvaliacao && desatualizada && (!dentroDoIntervalo || novoDoMentor) && !gerando && !(falha && falha.base >= base) && window.supabaseClient) {
 cp_vgGerarNota(m, base);
 }
 const gerandoAgora = !!cp_vgNotaEstado.gerando[id];
 const coer = nota && nota.coerencia ? nota.coerencia : '—';
 const nDiv = nota && Array.isArray(nota.divergencias) ? nota.divergencias.length : 0;

 const kpi = (rot, val, sub, cls) => `<div class="cpvd-kpi"><span>${rot}</span><b>${val}</b><small class="${cls || ''}">${sub}</small></div>`;
 // Mapa de maturidade do conjunto (Maturidade geral + Radar), gerado pelas respostas de cada telemetria
 cp_teleInjetarEstilo();
 let mapaHtml;
 if (consolidada == null) {
 mapaHtml = '<div class="cpvd-card"><div class="cpvd-rot">Mapa de maturidade das telemetrias</div><div class="cpvd-vazio">' + (regsMentor.length ? 'O mapa das telemetrias aparece quando a primeira for aplicada. O mapa da Análise do Mentor está logo abaixo, com o radar dos domínios que você avaliou.' : 'O mapa de maturidade aparece assim que a primeira telemetria for aplicada com este mentorado.') + '</div></div>';
 } else {
 const evolTxt = evol == null ? 'Linha de base: evolução aparece a partir da 2ª aplicação de uma telemetria.' : `<span class="${evol > 0 ? 'up' : (evol < 0 ? 'dn' : '')}">${sinal(evol)} pontos</span> desde a 1ª aplicação.`;
 let itens, radarSub;
 if (tipos.length >= 3) {
 itens = CP_TELE_ORDEM.filter(t => tel[t]).map(t => ({ nome: CP_TELE_NOMES[t], maturidade: tel[t][tel[t].length - 1].mat }));
 radarSub = 'Cada ponta é uma telemetria aplicada (resultado da última aplicação).';
 } else {
 const maisRecente = tipos.map(t => tel[t][tel[t].length - 1]).sort((a, b) => b.t - a.t)[0];
 itens = (maisRecente.foco.r.maturidade.itens || []).map(i => ({ nome: i.nome, maturidade: i.maturidade }));
 radarSub = `Domínios da ${cp_esc(maisRecente.foco.r.titulo)}. Com 3 ou mais telemetrias aplicadas, o radar passa a comparar as telemetrias.`;
 }
 mapaHtml = '<div class="cpvd-mapa">' + cp_teleMapaMaturidade({ media: consolidada, geral: cp_nivelMaturidade(consolidada), itens }, { cardSub: `Média das telemetrias aplicadas. ${evolTxt}`, radarSub }) + '</div>';
 }
 const kpis = kpi('Avaliações aplicadas', `${tipos.length + ferr.length} de 13`, `${tipos.length} ${tipos.length === 1 ? 'telemetria' : 'telemetrias'}, ${ferr.length} ${ferr.length === 1 ? 'ferramenta' : 'ferramentas'}`)
 + kpi('Registros do mentor', String(registros.length), diasReg == null ? 'nenhum registro ainda' : (diasReg === 0 ? 'último hoje' : `último há ${diasReg} ${diasReg === 1 ? 'dia' : 'dias'}`))
 + kpi('Coerência dos dados', coer, nota ? (nDiv ? `${nDiv} ${nDiv === 1 ? 'divergência' : 'divergências'}` : 'sem divergências') : 'avaliada pelo Agente');

 // Nota do Agente Mentóra
 let notaHtml;
 if (!temAvaliacao) notaHtml = '<div class="cpvd-nota-txt cpvd-cinza">A nota aparece sozinha assim que a primeira telemetria, ferramenta ou Análise do Mentor for registrada com este mentorado.</div>';
 else if (!nota && gerandoAgora) notaHtml = '<div class="cpvd-nota-txt">O Agente Mentóra está lendo todas as avaliações, as anotações e a linha do tempo…</div>';
 else if (!nota) notaHtml = `<div class="cpvd-nota-txt cpvd-cinza">Não foi possível gerar a nota agora${falha ? ': ' + cp_esc(falha.msg) : '.'}</div><button type="button" class="cpvd-lnk" onclick="cp_vgTentarNotaDeNovo()">Tentar de novo</button>`;
 else {
 notaHtml = `<div class="cpvd-nota-txt">${cp_esc(nota.nota)}</div>`
 + (nota.hipotese ? `<div class="cpvd-hip"><b>Hipótese central:</b> ${cp_esc(nota.hipotese)}</div>` : '')
 + `<div class="cpvd-pills">${nota.foco ? `<span class="cpvd-pill">Foco do ciclo: ${cp_esc(nota.foco)}</span>` : ''}${nota.nao_priorizar ? `<span class="cpvd-pill cinza">Não priorizar: ${cp_esc(nota.nao_priorizar)}</span>` : ''}</div>`
 + (gerandoAgora ? '<div class="cpvd-mini">Atualizando com os dados novos…</div>' : '')
 + (!gerandoAgora && desatualizada && dentroDoIntervalo ? `<div class="cpvd-aviso">Há registros novos desde esta nota. Ela se atualiza sozinha a partir de ${new Date(proximaAuto).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. <button type="button" class="cpvd-lnk" onclick="cp_vgAtualizarNotaAgora()">Atualizar agora (usa 1 análise)</button></div>` : '')
 + (!gerandoAgora && falha && desatualizada ? `<div class="cpvd-mini">Há dados novos, mas a nota não pôde ser atualizada: ${cp_esc(falha.msg)} <button type="button" class="cpvd-lnk" onclick="cp_vgTentarNotaDeNovo()">Tentar de novo</button></div>` : '');
 }
 const quandoNota = nota && nota.geradoEm ? `atualizada em ${new Date(nota.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : '';

 // Maturidade por avaliação (as 8 telemetrias; as não aplicadas em cinza)
 const linhasTel = CP_TELE_ORDEM.map(t => {
 const apps = tel[t];
 if (!apps) return `<div class="cpvd-row cpvd-cinza"><span>${CP_TELE_NOMES[t]}</span><div class="cpvd-tr"></div><b>—</b><small>não aplicada</small></div>`;
 const u = apps[apps.length - 1], d = apps.length > 1 ? u.mat - apps[apps.length - 2].mat : null;
 return `<div class="cpvd-row cpvd-clic" onclick="cp_teleAbrirResultado('${cp_esc(u.row.id)}')" title="Abrir resultado e análise"><span>${CP_TELE_NOMES[t]}</span><div class="cpvd-tr"><i style="width:${u.mat}%"></i></div><b>${u.mat}%</b><small class="${d > 0 ? 'up' : (d < 0 ? 'dn' : '')}">${d == null ? '1ª aplicação' : sinal(d)}</small></div>`;
 }).join('');
 const linhasFerr = ferr.length ? `<div class="cpvd-sub-t">Ferramentas aplicadas</div>${ferr.map(a => `<div class="cpvd-ferr"><span>${cp_esc(a.titulo)}</span><small>${fmt(a.t)}</small></div>`).join('')}` : '';

 // Evolução no tempo: maturidade consolidada a cada aplicação de telemetria
 const eventos = [];
 tipos.forEach(t => tel[t].forEach(a => eventos.push({ t: a.t, tipo: t, mat: a.mat })));
 eventos.sort((a, b) => a.t - b.t);
 const atual = {}, pontos = [];
 eventos.forEach(e => { atual[e.tipo] = e.mat; const v = Object.values(atual); pontos.push({ t: e.t, v: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }); });
 let grafico;
 if (pontos.length < 2) grafico = `<div class="cpvd-vazio">A curva aparece a partir da 2ª aplicação de telemetria.${pontos.length ? ` Hoje: ${pontos[0].v}% (${fmt(pontos[0].t)}).` : ''}</div>`;
 else {
 const W = 340, H = 150, L = 28, R = 12, T = 12, B = 26;
 const x = i => L + i * (W - L - R) / (pontos.length - 1), y = v => T + (1 - v / 100) * (H - T - B);
 grafico = `<svg viewBox="0 0 ${W} ${H}" class="cpvd-svg" role="img" aria-label="Maturidade consolidada ao longo do tempo">
 ${[0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#EEF0F4"></line><text x="${L - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#94A3B8">${v}</text>`).join('')}
 <polyline points="${pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="#5B2DA3" stroke-width="2.2"></polyline>
 ${pontos.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="#5B2DA3"><title>${fmt(p.t)}: ${p.v}%</title></circle>`).join('')}
 <text x="${L}" y="${H - 6}" font-size="10" fill="#94A3B8">${fmt(pontos[0].t).slice(0, 5)}</text>
 <text x="${W - R}" y="${H - 6}" font-size="10" text-anchor="end" fill="#94A3B8">${fmt(pontos[pontos.length - 1].t).slice(0, 5)}</text></svg>`;
 }

 const agente = '<div class="cpvd-vazio">Aparece com a Nota do Agente Mentóra.</div>';
 const padroes = nota && nota.padroes && nota.padroes.length ? nota.padroes.map(p => `<div class="cpvd-li">${cp_esc(p.texto)}${p.onde ? ` <small>· ${cp_esc(p.onde)}</small>` : ''}</div>`).join('') : (nota ? '<div class="cpvd-vazio">Nenhum padrão se repete entre as avaliações por enquanto.</div>' : agente);
 const forRis = nota && ((nota.forcas || []).length || (nota.riscos || []).length)
 ? (nota.forcas || []).map(f => `<div class="cpvd-li"><i class="cpvd-dot up"></i>${cp_esc(f)}</div>`).join('') + (nota.riscos || []).map(f => `<div class="cpvd-li"><i class="cpvd-dot dn"></i>${cp_esc(f)}</div>`).join('')
 : (nota ? '<div class="cpvd-vazio">Sem base suficiente nos dados ainda.</div>' : agente);
 const diverg = nota ? ((nota.divergencias || []).length ? nota.divergencias.map(d => `<div class="cpvd-li">${cp_esc(d)}</div>`).join('') + '<div class="cpvd-mini">Vale confirmar na próxima sessão.</div>' : '<div class="cpvd-vazio">Nenhuma divergência: as avaliações e as anotações contam a mesma história.</div>') : agente;

 const nm = cp_ultimaSessao(id, 'visao_geral_nota_mentor');
 const nmTxt = nm ? String((cp_parseDados(nm.dados) || {}).texto || '') : '';
 const nmQuando = nm ? `Última nota salva em ${new Date(nm.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : '';
 const ativo = document.activeElement && document.activeElement.id === 'cpvd-nota-mentor';
 const rascunho = ativo ? document.activeElement.value : null;

 host.innerHTML = `
 <div class="cpvd-kpis">${kpis}</div>
 ${mapaHtml}
 <div class="cpvd-card cpvd-nota"><div class="cpvd-cab"><div class="cpvd-rot">Nota do Agente Mentóra</div><span class="cpvd-mini">${quandoNota}</span></div>${notaHtml}
 <div class="cpvd-mini" style="margin-top:8px;">Leitura de todas as avaliações, das análises do Agente, da Análise do Mentor (registros manuais e anotações) e da linha do tempo. Atualiza sozinha quando há dados novos: na hora quando o registro novo é seu; para os demais dados, no máximo 1 vez por dia.</div></div>
 ${cp_vgCardMentor(id, regsMentor)}
 <div class="cpvd-g2">
 <div class="cpvd-card"><div class="cpvd-rot">Maturidade por avaliação</div>${linhasTel}<div class="cpvd-mini" style="margin-top:6px;">Clique em uma telemetria aplicada para abrir o resultado e a análise. As não aplicadas aparecem em cinza.</div>${linhasFerr}</div>
 <div class="cpvd-card"><div class="cpvd-rot">Evolução no tempo</div>${grafico}<div class="cpvd-mini">Maturidade consolidada (média das telemetrias) a cada nova aplicação.</div></div>
 </div>
 <div class="cpvd-g2">
 <div class="cpvd-card"><div class="cpvd-rot">Padrões que se repetem</div>${padroes}</div>
 <div class="cpvd-card"><div class="cpvd-rot">Forças e riscos do conjunto</div>${forRis}</div>
 </div>
 <div class="cpvd-card"><div class="cpvd-rot">Divergências detectadas</div>${diverg}</div>
 <div class="cpvd-card"><div class="cpvd-rot">Nota do mentor</div>
 <textarea id="cpvd-nota-mentor" placeholder="Escreva aqui a sua leitura do conjunto. O Agente Mentóra considera esta nota na próxima atualização.">${cp_esc(rascunho != null ? rascunho : nmTxt)}</textarea>
 <div class="cpvd-nota-rodape"><span class="cpvd-mini" id="cpvd-nota-ok">${nmQuando}</span><button type="button" class="cpvd-btn" id="cpvd-nota-btn" onclick="cp_vgSalvarNotaMentor()">Salvar nota</button></div></div>`;
 if (ativo) { const t = document.getElementById('cpvd-nota-mentor'); if (t) { t.focus(); t.selectionStart = t.selectionEnd = t.value.length; } }
}
window.cp_vgDashboard = cp_vgDashboard;

function cp_vgDashEstilo() {
 if (document.getElementById('cpvd-estilo')) return;
 const st = document.createElement('style'); st.id = 'cpvd-estilo';
 st.textContent = `
 #cpvd .cpvd-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:1.25rem}
 #cpvd .cpvd-mapa .ctr-mapa{margin-bottom:1.25rem}
 #cpvd .cpvd-kpi{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px 16px}
 #cpvd .cpvd-kpi span{display:block;font-size:12px;color:#64748B}
 #cpvd .cpvd-kpi b{display:block;font-size:26px;color:#1B2559;margin:4px 0 2px;line-height:1.1}
 #cpvd .cpvd-kpi small{font-size:12px;color:#94A3B8}
 #cpvd .up{color:#15803D !important}#cpvd .dn{color:#B91C1C !important}
 #cpvd .cpvd-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 22px;margin-bottom:1.25rem}
 #cpvd .cpvd-g2{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:1.25rem}
 #cpvd .cpvd-g2 .cpvd-card{margin-bottom:1.25rem}
 #cpvd .cpvd-cab{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
 #cpvd .cpvd-rot{font-size:12px;font-weight:700;color:#5B2DA3;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
 #cpvd .cpvd-nota{background:#F5F3FF;border-color:#DDD6FE}
 #cpvd .cpvd-nota .cpvd-rot{color:#3C3489}
 #cpvd .cpvd-nota-txt{font-size:15px;line-height:1.7;color:#26215C}
 #cpvd .cpvd-hip{font-size:14px;color:#3C3489;margin-top:10px;line-height:1.6}
 #cpvd .cpvd-pills{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px}
 #cpvd .cpvd-pill{font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:999px;background:#EDE9FE;color:#4C1D95}
 #cpvd .cpvd-pill.cinza{background:#F1F5F9;color:#475569}
 #cpvd .cpvd-mini{font-size:12px;color:#94A3B8;line-height:1.5}
 #cpvd .cpvd-cinza{color:#94A3B8 !important}
 #cpvd .cpvd-aviso{margin-top:10px;font-size:12.5px;color:#4C1D95;background:#EDE9FE;border-radius:8px;padding:8px 12px;line-height:1.5}
 #cpvd .cpvd-row{display:grid;grid-template-columns:150px 1fr 46px 82px;gap:10px;align-items:center;font-size:13.5px;color:#334155;padding:5px 6px;border-radius:8px}
 #cpvd .cpvd-row small{font-size:12px;color:#94A3B8;text-align:right}
 #cpvd .cpvd-clic{cursor:pointer}#cpvd .cpvd-clic:hover{background:#F8F6FE}
 #cpvd .cpvd-tr{height:8px;background:#EEF0F4;border-radius:6px;overflow:hidden}#cpvd .cpvd-tr i{display:block;height:100%;background:#7F77DD;border-radius:6px}
 #cpvd .cpvd-sub-t{font-size:12px;font-weight:700;color:#475569;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.4px}
 #cpvd .cpvd-ferr{display:flex;justify-content:space-between;font-size:13.5px;color:#334155;padding:4px 6px}#cpvd .cpvd-ferr small{color:#94A3B8}
 #cpvd .cpvd-svg{width:100%;height:auto;display:block}
 #cpvd .cpvd-li{font-size:14px;color:#334155;line-height:1.6;padding:3px 0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
 #cpvd .cpvd-li small{color:#94A3B8;font-size:12.5px}
 #cpvd .cpvd-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex-shrink:0}#cpvd .cpvd-dot.up{background:#16A34A}#cpvd .cpvd-dot.dn{background:#DC2626}
 #cpvd .cpvd-vazio{font-size:13px;color:#94A3B8;line-height:1.55}
 #cpvd textarea{width:100%;min-height:96px;border:1px solid #CBD5E1;border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;line-height:1.6;resize:vertical;box-sizing:border-box}
 #cpvd .cpvd-nota-rodape{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
 #cpvd .cpvd-btn{background:#5B2DA3;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}
 #cpvd .cpvd-btn:disabled{opacity:.7}
 #cpvd .cpvd-lnk{border:none;background:none;color:#5B2DA3;font-weight:600;cursor:pointer;padding:0;font-size:12.5px;text-decoration:underline}
 @media (max-width:900px){#cpvd .cpvd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#cpvd .cpvd-g2{grid-template-columns:1fr}}
 @media (max-width:520px){#cpvd .cpvd-row{grid-template-columns:110px 1fr 40px}#cpvd .cpvd-row small{display:none}}`;
 document.head.appendChild(st);
}

// ══════════════════════════════════════════════════════════════════════
// LINHA DO TEMPO: análise do Agente Mentóra e PDI do mentor de cada aplicação (03/10/2026)
// A análise de cada telemetria fica salva à parte ('analise_telemetria', ligada pelo sessao_id).
// ══════════════════════════════════════════════════════════════════════
function cp_histAgenteHtml(sess, info) {
 const bloco = (rot, html) => html ? `<div style="margin-bottom:14px;"><div style="font-size:11px; font-weight:700; color:#334155; letter-spacing:.6px; text-transform:uppercase; margin-bottom:4px;">${rot}</div>${html}</div>` : '';
 const par = t => t ? `<p style="margin:0; font-size:14px; color:#334155; line-height:1.6;">${cp_esc(t)}</p>` : '';
 const lista = it => (it && it.length) ? `<ul style="margin:0; padding-left:18px; font-size:14px; color:#334155; line-height:1.6;">${it.map(i => `<li>${cp_esc(i)}</li>`).join('')}</ul>` : '';
 const ehTele = typeof CP_TELE_ARQUIVOS !== 'undefined' && !!CP_TELE_ARQUIVOS[sess.sessType];
 const analises = sess.rowId && typeof cp_vgAnalises === 'function' ? cp_vgAnalises(sess.rowId) : [];
 const an = analises[0], sec = an ? cp_vgSecoes(an) : null;
 if (sec) {
  const quando = new Date(an.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const pdi = window.MentoraCerebros ? (sec.pdi || []).map(MentoraCerebros.partesAcao) : [];
  const pdiHtml = pdi.length ? `<ol style="margin:0; padding-left:20px; font-size:14px; color:#334155; line-height:1.6;">${pdi.map(a => `<li><b>${cp_esc(a.acao)}</b>${a.como ? ` — ${cp_esc(a.como)}` : ''}${a.prazo ? ` <span style="color:#64748b;">(prazo: ${cp_esc(a.prazo)})</span>` : ''}</li>`).join('')}</ol>` : '';
  return `<div style="font-size:12px; color:#64748b; margin-bottom:12px;">Gerada em ${cp_esc(quando)}${analises.length > 1 ? ` · ${analises.length - 1} versão(ões) anterior(es) guardada(s)` : ''}</div>`
   + bloco('Leitura', par(sec.leitura))
   + bloco('Pontos de avanço', lista(sec.avancos))
   + bloco('Pontos de atenção', lista(sec.atencao))
   + (sec.especificas || []).map(e => bloco(cp_esc(e.titulo.charAt(0) + e.titulo.slice(1).toLowerCase()), `<p style="margin:0; font-size:14px; color:#334155; line-height:1.6; white-space:pre-line;">${cp_esc(e.linhas.join('\n'))}</p>`)).join('')
   + bloco('Evolução e execução', par(sec.evolucao))
   + bloco('Direcionamento', par(sec.direcionamento))
   + bloco('PDI do Agente Mentóra', pdiHtml)
   + bloco('Para a próxima sessão', lista(sec.proxima))
   + (ehTele ? `<button type="button" onclick="cp_teleAbrirResultado('${cp_esc(sess.rowId)}')" style="margin-top:4px; background:#fff; border:1px solid #C4B5FD; color:#5B2DA3; border-radius:100px; padding:7px 16px; font-size:13px; font-weight:700; cursor:pointer;">Abrir página de resultado</button>` : '');
 }
 // Ferramentas que guardam a análise no próprio registro (Roda da Vida, SMART, SWOT, DISC...)
 const txt = String(sess.aiAnalysis || '').trim();
 const ehNotaManual = /^(Observação Manual|Registro do Mentor)/i.test(txt);
 if (txt && !ehNotaManual && txt !== String(sess.mentorNotes || '').trim()) {
  return txt.split('\n').map(p => p.trim() ? `<p style="margin-bottom:1rem; font-size:14px; color:#334155; line-height:1.6;">${cp_esc(p)}</p>` : '').join('');
 }
 if (ehTele) {
  return `<div style="font-size:14px; color:#64748b; line-height:1.6;">Esta aplicação ainda não foi analisada pelo Agente Mentóra. A análise é gerada na página de resultado da telemetria e aparece aqui automaticamente.</div>
   <button type="button" onclick="cp_teleAbrirResultado('${cp_esc(sess.rowId)}')" style="margin-top:12px; background:#5B2DA3; border:none; color:#fff; border-radius:100px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer;">Abrir resultado e gerar análise</button>`;
 }
 return '<div style="font-size:14px; color:#64748b; font-style:italic;">Nenhuma análise do Agente Mentóra registrada nesta atividade.</div>';
}
function cp_histPdiMentorHtml(sess) {
 if (!sess || !sess.rowId || typeof cp_vgPdisMentor !== 'function') return '';
 const v = cp_vgPdisMentor(sess.rowId)[0]; if (!v) return '';
 const acoes = (cp_parseDados(v.dados) || {}).acoes || []; if (!acoes.length) return '';
 return `<div style="margin-top:10px;"><div style="font-size:11px; font-weight:700; color:#334155; letter-spacing:.6px; text-transform:uppercase; margin-bottom:4px;">PDI do mentor · salvo em ${cp_esc(new Date(v.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</div>
  <ol style="margin:0; padding-left:20px; font-size:14px; color:#334155; line-height:1.6;">${acoes.map(a => `<li><b>${cp_esc(a.acao)}</b>${a.como ? ` — ${cp_esc(a.como)}` : ''}${a.prazo ? ` <span style="color:#64748b;">(prazo: ${cp_esc(a.prazo)})</span>` : ''}</li>`).join('')}</ol></div>`;
}


// Abordagens do mentorado (campo "metodo"): valor do formulário → nome salvo
const CP_METODOS = { geral: 'Geral', clinico: 'Clínico', lideranca: 'Liderança', comportamental: 'Comportamental', emocional: 'Emocional', vendas: 'Vendas', comunicacao: 'Comunicação', transicao: 'Transição de Carreira', outros: 'Outros' };
function cp_metodoParaValor(metodo) {
 const m = String(metodo || '').toLowerCase();
 if (m.includes('lider')) return 'lideranca';
 if (m.includes('clín') || m.includes('clin')) return 'clinico';
 if (m.includes('comporta')) return 'comportamental';
 if (m.includes('emoc')) return 'emocional';
 if (m.includes('venda')) return 'vendas';
 if (m.includes('comunica')) return 'comunicacao';
 if (m.includes('transi')) return 'transicao';
 if (m.includes('outro')) return 'outros';
 return 'geral';
}


// Bloco "Análise do Mentor" na Visão Geral: o mesmo painel do Histórico (métricas, mapa de maturidade com
// radar, mapeamento dos domínios, marcadores, respostas do mentorado, bloco de notas e anotações do mentor).
const cp_vgRegEscolhido = {};
window.cp_vgEscolherRegistro = function (menteeId, rowId) { cp_vgRegEscolhido[menteeId] = rowId; cp_vgDashboard(); };
function cp_vgCardMentor(id, regs) {
 const fmt = t => new Date(t).toLocaleDateString('pt-BR');
 const fmtH = t => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
 const bloco = cp_ultimaSessao(id, 'anotacao');
 const blocoTxt = bloco ? String((cp_parseDados(bloco.dados) || {}).texto || '').trim() : '';
 const rot = (t, cor) => `<strong style="font-size:11px; font-weight:700; color:${cor || '#4F46E5'}; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">${t}</strong>`;
 const caixa = (t, txt, cor, fundo, borda) => txt ? `<div style="margin-bottom:1rem; padding:12px 14px; background:${fundo || '#F8FAFC'}; border:1px solid ${borda || '#E2E8F0'}; border-radius:10px;">${rot(t, cor)}<div style="font-size:14px; color:#334155; line-height:1.6; white-space:pre-wrap;">${cp_esc(String(txt).trim())}</div></div>` : '';
 if (!regs || !regs.length) {
  return `<div class="cpvd-card"><div class="cpvd-rot">Análise do Mentor</div><div class="cpvd-vazio">Nenhum registro do mentor ainda. Na aba Análise do Mentor você registra as suas percepções e avalia os domínios; o registro aparece aqui completo e entra na Nota do Agente Mentóra.</div>${caixa('Bloco de notas do prontuário' + (bloco ? ' · ' + fmt(bloco.created_at) : ''), blocoTxt, '#B8873A', '#FFFDF5', '#F1E7C8')}</div>`;
 }
 const escolhido = regs.find(r => String(r.row.id) === String(cp_vgRegEscolhido[id])) || regs[regs.length - 1];
 const pos = regs.indexOf(escolhido);
 const sess = cp_parseGenericSession(escolhido.row);
 let P = { metricsHtml: '', domsHtml: '', tagsHtml: '', menteeRespHtml: '', d: {} };
 try { P = cp_partesAnaliseMentor(sess, id, 'observacao_manual'); } catch (e) { console.warn('Visão Geral - Análise do Mentor:', e); }
 // Mapa de maturidade + radar dos domínios avaliados pelo mentor
 let mapa = '';
 if (escolhido.doms.length) {
  const media = Math.round(escolhido.doms.reduce((a, d) => a + d.v, 0) / escolhido.doms.length);
  const ant = pos > 0 ? regs[pos - 1] : null;
  let evolTxt = ' Primeiro registro manual deste nicho.';
  if (ant && ant.doms.length) { const mAnt = Math.round(ant.doms.reduce((a, d) => a + d.v, 0) / ant.doms.length); const df = media - mAnt; evolTxt = ` ${df > 0 ? '+' : ''}${df} pontos desde o registro de ${fmt(ant.t)}.`; }
  try {
   cp_teleInjetarEstilo();
   mapa = '<div class="cpvd-mapa">' + cp_teleMapaMaturidade({ media, geral: cp_nivelMaturidade(media), itens: escolhido.doms.map(d => ({ nome: d.nome, maturidade: d.v })) },
    { cardSub: `Média dos domínios avaliados pelo mentor.${evolTxt}`, radarSub: `Domínios do nicho ${cp_esc(escolhido.nichoNome || 'Geral')}, avaliados pelo mentor.` }) + '</div>';
  } catch (e) { mapa = ''; }
 }
 const seletor = regs.length > 1 ? `<select class="cpvd-sel" onchange="cp_vgEscolherRegistro('${cp_esc(id)}', this.value)" aria-label="Escolher o registro">${regs.slice().reverse().map(r => `<option value="${cp_esc(r.row.id)}"${r === escolhido ? ' selected' : ''}>${cp_esc(fmtH(r.t))} · ${cp_esc(r.nichoNome || 'Geral')}</option>`).join('')}</select>` : '';
 const notasMentor = sess.mentorNotes || P.d.anotacoes || '';
 return `<div class="cpvd-card cpvd-mentor">
  <div class="cpvd-cab"><div><div class="cpvd-rot">Análise do Mentor</div><div class="cpvd-mini">Registro de ${cp_esc(fmtH(escolhido.t))} · Nicho: <b>${cp_esc(escolhido.nichoNome || 'Geral')}</b> · ${regs.length} ${regs.length === 1 ? 'registro' : 'registros'} no total</div></div>${seletor}</div>
  ${P.metricsHtml}
  ${mapa}
  ${P.domsHtml}
  ${P.tagsHtml}
  ${P.menteeRespHtml}
  ${caixa('Bloco de notas da sessão', P.d.caderno, '#B8873A', '#FFFDF5', '#F1E7C8')}
  ${caixa('Anotações do mentor', notasMentor)}
  ${caixa('Plano de ação', typeof P.d.planoAcao === 'string' ? P.d.planoAcao : '')}
  ${blocoTxt ? caixa('Bloco de notas do prontuário · ' + fmt(bloco.created_at), blocoTxt, '#B8873A', '#FFFDF5', '#F1E7C8') : ''}
  <button type="button" class="cpvd-lnk" onclick="cp_switchTab('historico')">Ver a linha do tempo no Histórico</button></div>`;
}


// Partes do registro da Análise do Mentor (métricas, domínios, marcadores, respostas do mentorado).
// Usadas na linha do tempo (Histórico) e na Visão Geral, para as duas mostrarem a mesma informação.
function cp_partesAnaliseMentor(sess, menteeId, currentSessType) {
 const d = sess.dadosDirect || {};
 const domsObj = d.domains || (sess.scores && sess.scores.domains) || {};
 const tagList = Array.isArray(d.tags) ? d.tags : [];
 const sT = sess.scores || {};

 // Mentee Responses (Onboarding & Checklist)
 let menteeRespHtml = '';
 const obData = (currentSessType === 'onboarding' && sess.dadosDirect && Array.isArray(sess.dadosDirect.respostas))
 ? sess.dadosDirect
 : cp_getOnboardingResp(menteeId);
 if (obData && Array.isArray(obData.respostas) && obData.respostas.length > 0) {
 menteeRespHtml += `
 <div style="margin-bottom:1rem; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">RESPOSTAS DO MENTORADO (ONBOARDING)</strong>
 <div style="font-size:12px; color:#475569; display:grid; gap:6px; line-height:1.4;">${obData.respostas.map(r => `<div><strong>${cp_esc(r.pergunta)}</strong><br>${cp_esc(r.resposta || '—')}</div>`).join('')}</div>
 </div>
 `;
 } else if (obData) {
 menteeRespHtml += `
 <div style="margin-bottom:1rem; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">RESPOSTAS DO MENTORADO (ONBOARDING)</strong>
 <div style="font-size:12px; color:#475569; display:grid; gap:4px; line-height:1.4;"><div><strong>Momento:</strong> ${cp_esc(obData.momento || '—')}</div>
 <div><strong>Dor / Estopim:</strong> ${cp_esc(obData.estopimTempo || '—')}</div>
 <div><strong>Rota de Escape:</strong> ${cp_esc(obData.rotaEscape || '—')}</div>
 <div><strong>Expectativa Final:</strong> ${cp_esc(obData.expectativaFinal || '—')}</div>
 <div><strong>Prioridade 1ª Sessão:</strong> ${cp_esc(obData.prioridade || '—')}</div>
 </div>
 </div>
 `;
 }

 const dcTasks = cp_dcGetTarefas(menteeId);
 const dcResp = cp_dcGetResposta(menteeId);
 if (dcTasks.length> 0) {
 menteeRespHtml += `
 <div style="margin-bottom:1rem; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">CHECKLIST: DEVER DE CASA RESPONDIDO</strong>
 <div style="display:flex; flex-direction:column; gap:4px;">`;
 dcTasks.forEach((t, idx) => {
 const r = dcResp.find(x => x.taskText === t) || dcResp.find(x => x.taskIndex === idx) || {};
 const isDone = r.completed === true;
 const just = r.justification || '';
 const stBadge = isDone 
 ? '<span style="color:#059669; font-weight:700; font-size:11px;">[Concluída]</span>' 
 : (r.completed !== undefined ? '<span style="color:#DC2626; font-weight:700; font-size:11px;">[Não Concluída]</span>' : '<span style="color:#64748B; font-size:11px;">[Pendente]</span>');
 menteeRespHtml += `
 <div style="font-size:12px; color:#334155; padding:6px 8px; background:#FFF; border:1px solid #E2E8F0; border-radius:6px;"><div><strong>${idx + 1}.</strong> ${cp_esc(t)} ${stBadge}</div>
 ${just ? `<div style="font-size:11px; color:#92400E; margin-top:2px; background:#FFFBEB; padding:4px 6px; border-radius:4px;"><em>Justificativa:</em> "${cp_esc(just)}"</div>` : ''}
 </div>
 `;
 });
 menteeRespHtml += `</div></div>`;
 }

 // Mapeamento Rápido dos Domínios
 let domsHtml = '';
 if (Object.keys(domsObj).length> 0) {
 domsHtml = `
 <div style="margin-bottom:1rem;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">MAPEAMENTO RÁPIDO DOS DOMÍNIOS</strong>
 <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:8px;">`;
 const nomeDom = k => cp_nomeDominio(k, d.nicho);
 for (let k in domsObj) {
 const val = domsObj[k];
 const labelScale = val>= 70 ? 'Alto' : val>= 40 ? 'Médio' : 'Baixo';
 const badgeColor = val>= 70 ? '#10B981' : val>= 40 ? '#F59E0B' : '#EF4444';
 domsHtml += `
 <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:8px 10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px; font-weight:600; color:#334155;">${cp_esc(nomeDom(k))}</span>
 <span style="font-size:11px; font-weight:700; color:#FFF; background:${badgeColor}; padding:2px 6px; border-radius:4px;">${labelScale} (${cp_esc(val)}%)</span>
 </div>
 `;
 }
 domsHtml += `</div>`;
 // valores anteriores do mesmo dia: só como índice, sem destaque
 if (Array.isArray(d.historicoDomains) && d.historicoDomains.length) {
  domsHtml += `<div style="margin-top:8px; font-size:11px; color:#94A3B8; line-height:1.6;">${d.historicoDomains.slice().reverse().map(h => `Antes (${cp_esc(new Date(h.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}): ${Object.keys(h.domains || {}).map(k => `${cp_esc(nomeDom(k))} ${cp_esc(h.domains[k])}%`).join(' · ')}`).join('<br>')}</div>`;
 }
 domsHtml += `</div>`;
 }

 // Tags / Gatilhos
 let tagsHtml = '';
 if (tagList.length> 0) {
 tagsHtml = `
 <div style="margin-bottom:1rem;"><strong style="font-size:11px; font-weight:700; color:#B8873A; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">TAGS / GATILHOS IDENTIFICADOS</strong>
 <div style="display:flex; flex-wrap:wrap; gap:6px;">${tagList.map(t => `<span style="background:rgba(184,135,58,0.12); color:#B8873A; border:1px solid rgba(184,135,58,0.3); font-weight:600; padding:3px 10px; border-radius:100px; font-size:12px;"># ${cp_esc(t)}</span>`).join('')}
 </div>
 </div>
 `;
 }

 // Métricas da página
 let metricsHtml = `
 <div style="margin-bottom:1rem; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:12px;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">MÉTRICAS DA PÁGINA</strong>
 <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px;"><div style="background:#FFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px; text-align:center;"><div style="font-size:10px; color:#64748B; font-weight:600;">Confiança</div>
 <div style="font-size:16px; font-weight:700; color:#4F46E5;">${sT.trustIdx !== undefined ? cp_esc(sT.trustIdx) : '--'}</div>
 </div>
 <div style="background:#FFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px; text-align:center;"><div style="font-size:10px; color:#64748B; font-weight:600;">Carga Traumática</div>
 <div style="font-size:16px; font-weight:700; color:#EF4444;">${sT.traumaAvg !== undefined ? cp_esc(sT.traumaAvg) + '%' : '--'}</div>
 </div>
 <div style="background:#FFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px; text-align:center;"><div style="font-size:10px; color:#64748B; font-weight:600;">Regulação</div>
 <div style="font-size:16px; font-weight:700; color:#10B981;">${sT.regScore !== undefined ? cp_esc(sT.regScore) + '%' : '--'}</div>
 </div>
 <div style="background:#FFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px; text-align:center;"><div style="font-size:10px; color:#64748B; font-weight:600;">Autoestima</div>
 <div style="font-size:16px; font-weight:700; color:#8B5CF6;">${sT.selfScore !== undefined ? cp_esc(sT.selfScore) + '%' : '--'}</div>
 </div>
 </div>
 </div>
 `;
 // Nichos que não são clínicos (Liderança, Vendas, Carreira...): as métricas vêm dos domínios avaliados
 const chavesClinicas = ['confianca', 'trauma', 'regulacao', 'autoestima'];
 const valsDom = Object.keys(domsObj).map(k => ({ k, v: Number(domsObj[k]) })).filter(x => !isNaN(x.v));
 if (valsDom.length && !valsDom.some(x => chavesClinicas.includes(x.k))) {
  const nomeD = k => cp_nomeDominio(k, d.nicho);
  const media = Math.round(valsDom.reduce((a, x) => a + x.v, 0) / valsDom.length);
  const ord = valsDom.slice().sort((a, b) => b.v - a.v);
  const cx = (rot, val, sub, cor) => `<div style="background:#FFF; border:1px solid #E2E8F0; padding:8px; border-radius:6px; text-align:center;"><div style="font-size:10px; color:#64748B; font-weight:600;">${rot}</div><div style="font-size:16px; font-weight:700; color:${cor};">${val}</div>${sub ? `<div style="font-size:10px; color:#94A3B8;">${sub}</div>` : ''}</div>`;
  metricsHtml = `<div style="margin-bottom:1rem; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:12px;"><strong style="font-size:11px; font-weight:700; color:#4F46E5; letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">MÉTRICAS DA PÁGINA</strong>
   <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px;">
   ${cx('Índice geral', media + '%', 'média dos domínios', '#4F46E5')}
   ${cx('Maior força', ord[0].v + '%', cp_esc(nomeD(ord[0].k)), '#10B981')}
   ${cx('Maior atenção', ord[ord.length - 1].v + '%', cp_esc(nomeD(ord[ord.length - 1].k)), '#EF4444')}
   ${cx('Domínios avaliados', valsDom.length, 'nesta sessão', '#8B5CF6')}
   </div></div>`;
 }

 return { metricsHtml, domsHtml, tagsHtml, menteeRespHtml, d };
}

// Nome do domínio pelo nicho do registro (a mesma chave, ex. "clareza", existe em nichos diferentes)
function cp_nomeDominio(k, nicho) {
 const cfg = CP_NICHOS_CONFIG[nicho];
 const f = cfg && (cfg.dominios || []).find(x => x.key === k);
 if (f) return f.name;
 for (const n in CP_NICHOS_CONFIG) { const g = (CP_NICHOS_CONFIG[n].dominios || []).find(x => x.key === k); if (g) return g.name; }
 return k;
}
